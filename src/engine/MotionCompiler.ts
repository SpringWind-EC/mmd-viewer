import type { MotionAction, MotionPlan } from "./MotionPlan";
import { compileMotionOperator, type MotionOperatorContext } from "./MotionOperatorCompiler";
import type { MotionOperator, MotionProgram } from "./MotionProgram";
import {
  mergeBones,
  mergePositions,
  primitiveForAction,
  samplePrimitive,
  type BoneMap,
  type MotionPrimitive,
  type PositionMap,
  type RotationModeMap,
} from "./primitives";

type Keyframe = {
  time: number;
  bones: Record<string, number[]>;
  positions?: Record<string, number[]>;
  rotationModes?: RotationModeMap;
};

type ActionClip = {
  primitive: MotionPrimitive;
  priority: number;
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
    primitive: primitiveForAction(action),
    priority: 20,
    startTime,
    endTime,
  };
}

function buildOperatorClip(
  operator: MotionOperator,
  duration: number,
  context: MotionOperatorContext
): ActionClip {
  const startTime = clamp(operator.startTime ?? 0, 0, duration);
  const requestedEnd = operator.endTime ?? duration;
  const endTime = clamp(Math.max(requestedEnd, startTime + 0.1), 0, duration);
  const compiled = compileMotionOperator(operator, context);

  return {
    primitive: compiled.primitive,
    priority: compiled.priority,
    startTime,
    endTime,
  };
}

function linkClipTimeline(clips: ActionClip[]) {
  return clips.map((clip, index) => {
    const nextStartTime = clips
      .slice(index + 1)
      .reduce<number | undefined>((nextStart, nextClip) => {
        if (nextClip.startTime <= clip.startTime) {
          return nextStart;
        }

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
): { bones: BoneMap; positions: PositionMap; rotationModes: RotationModeMap } {
  if (time < clip.startTime) {
    return { bones: {}, positions: {}, rotationModes: {} };
  }

  if (time >= clip.endTime) {
    if (
      clip.nextStartTime !== undefined &&
      time >= clip.nextStartTime
    ) {
      return { bones: {}, positions: {}, rotationModes: {} };
    }

    if (holdAfterEnd) {
      return sampleClipPrimitive(
        clip,
        clip.primitive,
        clip.primitive.holdProgress ?? 1
      );
    }

    return time > clip.endTime
      ? { bones: {}, positions: {}, rotationModes: {} }
      : sampleClipPrimitive(clip, clip.primitive, 1);
  }

  const span = clip.endTime - clip.startTime;
  const progress = span <= 0 ? 1 : (time - clip.startTime) / span;

  return sampleClipPrimitive(clip, clip.primitive, progress);
}

function sampleClipPrimitive(
  clip: ActionClip,
  primitive: MotionPrimitive,
  progress: number
): { bones: BoneMap; positions: PositionMap; rotationModes: RotationModeMap } {
  const sampled = samplePrimitive(primitive, progress);
  const rotationModes: RotationModeMap = {};

  if (clip.primitive.rotationMode) {
    Object.keys(sampled.bones).forEach((boneName) => {
      rotationModes[boneName] = clip.primitive.rotationMode!;
    });
  }

  return {
    ...sampled,
    rotationModes,
  };
}

function isMotionProgram(plan: MotionPlan | MotionProgram): plan is MotionProgram {
  return Array.isArray((plan as MotionProgram).operators);
}

function hasDownShift(
  operator: MotionOperator
): operator is MotionOperator & { type: "shift_weight" } {
  return operator.type === "shift_weight" && operator.direction === "down";
}

function operatorTime(
  operator: MotionOperator,
  duration: number
): { startTime: number; endTime: number } {
  const startTime = clamp(operator.startTime ?? 0, 0, duration);
  const requestedEnd = operator.endTime ?? duration;
  const endTime = clamp(Math.max(requestedEnd, startTime + 0.1), 0, duration);

  return { startTime, endTime };
}

function handKneeSide(
  operator: MotionOperator
): "right" | "left" | "both" | null {
  if (operator.type !== "move_effector") {
    return null;
  }

  if (
    operator.effector === "right_hand" &&
    (operator.region === "right_knee" || operator.region === "knees")
  ) {
    return operator.region === "knees" ? "both" : "right";
  }

  if (
    operator.effector === "left_hand" &&
    (operator.region === "left_knee" || operator.region === "knees")
  ) {
    return operator.region === "knees" ? "both" : "left";
  }

  return null;
}

function combineContactSides(sides: Array<"right" | "left" | "both">) {
  if (sides.includes("both")) {
    return "both" as const;
  }

  const hasRight = sides.includes("right");
  const hasLeft = sides.includes("left");

  if (hasRight && hasLeft) {
    return "both" as const;
  }

  if (hasRight) {
    return "right" as const;
  }

  if (hasLeft) {
    return "left" as const;
  }

  return undefined;
}

function operatorContext(
  plan: MotionPlan | MotionProgram,
  duration: number
): MotionOperatorContext {
  if (!isMotionProgram(plan)) {
    return {};
  }

  const downShift = plan.operators.find(hasDownShift);
  const downTime = downShift ? operatorTime(downShift, duration) : null;
  const epsilon = 0.001;
  const contactHoldSides = downTime
    ? plan.operators
        .filter((operator) => handKneeSide(operator) !== null)
        .filter((operator) => {
          const time = operatorTime(operator, duration);

          return time.endTime <= downTime.startTime + epsilon;
        })
        .map((operator) => handKneeSide(operator)!)
    : [];

  return {
    crouchIntensity: downShift?.intensity,
    crouchContactHoldSide: combineContactSides(contactHoldSides),
    handKneeModeForOperator: (operator) => {
      if (!downTime) {
        return "standing";
      }

      const time = operatorTime(operator, duration);

      if (Math.abs(time.startTime - downTime.startTime) <= epsilon) {
        return "combined";
      }

      if (time.startTime >= downTime.endTime - epsilon) {
        return "crouched";
      }

      return "standing";
    },
  };
}

function composeSamples(
  sampled: Array<{
    bones: BoneMap;
    positions: PositionMap;
    rotationModes: RotationModeMap;
    priority: number;
  }>
) {
  return sampled
    .sort((a, b) => a.priority - b.priority)
    .reduce(
      (pose, sample) => ({
        bones: mergeBones(pose.bones, sample.bones),
        positions: mergePositions(pose.positions, sample.positions),
        rotationModes: {
          ...pose.rotationModes,
          ...sample.rotationModes,
        },
      }),
      {
        bones: {} as BoneMap,
        positions: {} as PositionMap,
        rotationModes: {} as RotationModeMap,
      }
    );
}

export function compileMotionPlan(plan: MotionPlan | MotionProgram) {
  const duration = clamp(
    plan.duration && plan.duration > 0 ? plan.duration : DEFAULT_DURATION,
    0.5,
    MAX_DURATION
  );
  const context = operatorContext(plan, duration);

  const clips = linkClipTimeline(
    isMotionProgram(plan)
      ? plan.operators.map((operator) =>
          buildOperatorClip(operator, duration, context)
        )
      : (plan.actions && plan.actions.length > 0
          ? plan.actions
          : [{ type: "neutral" as const }]
        ).map((action) => buildClip(action, duration))
  );
  const holdAfterEnd = plan.holdFinalPose !== false;
  const keyTimes = collectKeyTimes(clips, duration);
  const shouldLoop =
    plan.loop === true || clips.some((clip) => clip.primitive.loop === true);

  const keyframes: Keyframe[] = keyTimes.map((time) => {
    const sampled = clips.map((clip) => ({
      ...sampleClipAtTime(clip, time, holdAfterEnd),
      priority: clip.priority,
    }));
    const composed = composeSamples(sampled);

    return {
      time,
      bones: composed.bones,
      positions:
        Object.keys(composed.positions).length > 0
          ? composed.positions
          : undefined,
      rotationModes:
        Object.keys(composed.rotationModes).length > 0
          ? composed.rotationModes
          : undefined,
    };
  });

  return {
    duration,
    loop: shouldLoop,
    holdFinalPose: holdAfterEnd,
    rotationMode: "delta" as const,
    positionMode: "offset" as const,
    keyframes,
  };
}

export function compileMotionProgram(program: MotionProgram) {
  return compileMotionPlan(program);
}
