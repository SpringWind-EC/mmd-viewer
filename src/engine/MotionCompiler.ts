import type { MotionAction, MotionPlan } from "./MotionPlan";
import {
  basePose,
  mergeBones,
  mergePositions,
  primitiveForAction,
  samplePrimitive,
  type BoneMap,
  type MotionPrimitive,
  type PositionMap,
} from "./primitives";

type Keyframe = {
  time: number;
  bones: Record<string, number[]>;
  positions?: Record<string, number[]>;
};

type ActionClip = {
  action: MotionAction;
  primitive: MotionPrimitive;
  startTime: number;
  endTime: number;
  nextStartTime?: number;
};

const DEFAULT_DURATION = 2.5;
const MAX_DURATION = 5;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function uniqueSortedTimes(times: number[]) {
  return [...new Set(times.map((time) => Number(time.toFixed(4))))].sort(
    (a, b) => a - b
  );
}

function buildClip(
  action: MotionAction,
  duration: number
): ActionClip {
  const startTime = clamp(action.startTime ?? 0, 0, duration);
  const requestedEnd = action.endTime ?? duration;
  const endTime = clamp(Math.max(requestedEnd, startTime + 0.1), 0, duration);

  return {
    action,
    primitive: primitiveForAction(action),
    startTime,
    endTime,
  };
}

function linkClipTimeline(clips: ActionClip[]) {
  return clips.map((clip, index) => {
    const nextStartTime = clips
      .slice(index + 1)
      .reduce<number | undefined>((nextStart, nextClip) => {
        if (nextStart === undefined) {
          return nextClip.startTime;
        }

        return Math.min(nextStart, nextClip.startTime);
      }, undefined);

    return {
      ...clip,
      nextStartTime,
    };
  });
}

function collectKeyTimes(clips: ActionClip[], duration: number) {
  const times = [0, duration];

  clips.forEach((clip) => {
    times.push(clip.startTime, clip.endTime);

    clip.primitive.frames.forEach((frame) => {
      const span = clip.endTime - clip.startTime;
      times.push(clip.startTime + frame.progress * span);
    });
  });

  return uniqueSortedTimes(times).filter(
    (time) => time >= 0 && time <= duration
  );
}

function sampleClipAtTime(
  clip: ActionClip,
  time: number,
  holdAfterEnd: boolean
): { bones: BoneMap; positions: PositionMap } {
  if (time < clip.startTime) {
    return { bones: {}, positions: {} };
  }

  if (time >= clip.endTime) {
    if (
      clip.nextStartTime !== undefined &&
      time >= clip.nextStartTime
    ) {
      return { bones: {}, positions: {} };
    }

    if (holdAfterEnd) {
      return samplePrimitive(
        clip.primitive,
        clip.primitive.holdProgress ?? 1
      );
    }

    return time > clip.endTime
      ? { bones: {}, positions: {} }
      : samplePrimitive(clip.primitive, 1);
  }

  const span = clip.endTime - clip.startTime;
  const progress = span <= 0 ? 1 : (time - clip.startTime) / span;

  return samplePrimitive(clip.primitive, progress);
}

export function compileMotionPlan(plan: MotionPlan) {
  const duration = clamp(
    plan.duration && plan.duration > 0 ? plan.duration : DEFAULT_DURATION,
    0.5,
    MAX_DURATION
  );

  const actions =
    plan.actions && plan.actions.length > 0
      ? plan.actions
      : [{ type: "neutral" as const }];

  const clips = linkClipTimeline(
    actions.map((action) => buildClip(action, duration))
  );
  const holdAfterEnd = plan.holdFinalPose !== false;
  const keyTimes = collectKeyTimes(clips, duration);
  const shouldLoop =
    plan.loop === true || clips.some((clip) => clip.primitive.loop === true);

  const keyframes: Keyframe[] = keyTimes.map((time) => {
    const sampled = clips.map((clip) =>
      sampleClipAtTime(clip, time, holdAfterEnd)
    );

    const actionPose = sampled.reduce(
      (pose, sample) => mergeBones(pose, sample.bones),
      {} as BoneMap
    );

    const actionPositions = sampled.reduce(
      (positions, sample) => mergePositions(positions, sample.positions),
      {} as PositionMap
    );

    return {
      time,
      bones: mergeBones(basePose(), actionPose),
      positions:
        Object.keys(actionPositions).length > 0 ? actionPositions : undefined,
    };
  });

  return {
    duration,
    loop: shouldLoop,
    holdFinalPose: holdAfterEnd,
    rotationMode: "delta" as const,
    keyframes,
  };
}
