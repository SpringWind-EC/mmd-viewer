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

// Output shape produced by this compiler.
//
// MotionPlayer consumes these keyframes directly: each keyframe says "at this
// time, apply these bone rotations, optional bone positions, and optional
// per-bone rotation modes."
type Keyframe = {
  time: number;
  bones: Record<string, number[]>;
  positions?: Record<string, number[]>;
  rotationModes?: RotationModeMap;
};

// Internal timeline shape used while compiling.
//
// The compiler first converts actions/operators into clips, then samples those
// clips into output keyframes. A clip is one primitive scheduled over a time
// range with a priority for resolving bone conflicts.
type ActionClip = {
  primitive: MotionPrimitive;
  priority: number;
  startTime: number;
  endTime: number;
  nextStartTime?: number;
};

const DEFAULT_DURATION = 2.5;
const MAX_DURATION = 5;

// Basic timing helpers.
//
// AI-generated plans can contain missing, long, or slightly noisy timings.
// These helpers keep the compiler output stable and deterministic.
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function uniqueSortedTimes(times: number[]) {
  return [...new Set(times.map((time) => Number(time.toFixed(4))))].sort(
    (a, b) => a - b
  );
}

// Convert a high-level MotionAction into a scheduled primitive clip.
//
// Used for the older/simple plan format:
// { duration, actions: [{ type: "wave_right", startTime, endTime }] }
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

// Convert a composable MotionOperator into a scheduled primitive clip.
//
// Used for the newer/operator plan format:
// { duration, operators: [{ type: "move_effector", effector, region }] }
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

// Add timeline awareness to clips.
//
// Without this, a finished clip that holds its final pose could keep affecting
// the body even after another gesture begins. nextStartTime tells sampling when
// it is time to stop holding that pose.
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

// Build the list of output keyframe times.
//
// This includes the motion start/end, every clip start/end, and every internal
// primitive beat converted from normalized progress to real seconds.
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

// Sample one clip at one absolute time.
//
// Returns empty maps when the clip is not active. If the clip ended and the
// motion should hold, this returns the held pose until another later clip starts.
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

// Sample a primitive and attach rotation-mode metadata for all bones it affects.
//
// The primitive sampler only gives pose data; this wrapper preserves whether the
// pose should be interpreted as absolute or as a delta from the model rest pose.
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

// Plan-shape helpers.
//
// MotionPlan uses named actions. MotionProgram uses lower-level operators. Both
// compile to the same ActionClip/keyframe pipeline, but operators may need extra
// context about other operators in the same program.
function isMotionProgram(plan: MotionPlan | MotionProgram): plan is MotionProgram {
  return Array.isArray((plan as MotionProgram).operators);
}

function hasDownShift(
  operator: MotionOperator
): operator is MotionOperator & { type: "shift_weight" } {
  return operator.type === "shift_weight" && operator.direction === "down";
}

// Return a normalized time range for an operator.
//
// The minimum 0.1 second span prevents zero-length clips, which are hard to
// sample and can disappear from interpolation.
function operatorTime(
  operator: MotionOperator,
  duration: number
): { startTime: number; endTime: number } {
  const startTime = clamp(operator.startTime ?? 0, 0, duration);
  const requestedEnd = operator.endTime ?? duration;
  const endTime = clamp(Math.max(requestedEnd, startTime + 0.1), 0, duration);

  return { startTime, endTime };
}

// Detect operators where a hand is intended to contact a knee.
//
// This is used to coordinate hand-on-knee poses with crouching/down-shift body
// motion so the hand does not visibly detach while the center bone moves.
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

// Detect matching front-chest guard/reach operators.
//
// When both hands target the chest at the same time, the operator compiler has a
// specialized two-hand primitive that looks better than two independent arms.
function isGuardFrontChestOperator(
  operator: MotionOperator
): operator is MotionOperator & { type: "move_effector" } {
  return (
    operator.type === "move_effector" &&
    (operator.effector === "right_hand" || operator.effector === "left_hand") &&
    (operator.region === "front_of_chest" || operator.region === "chest_center")
  );
}

// Collapse several hand-contact sides into the single side value expected by
// lower-body primitives.
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

// Build context that helps related operators compile as one coordinated motion.
//
// This does not emit keyframes itself. It prepares callbacks/flags that
// MotionOperatorCompiler can ask while compiling individual operators.
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
  const guardFrontChestDrivers = new Set<MotionOperator>();
  const guardFrontChestSuppressed = new Set<MotionOperator>();
  const guardFrontChestOperators = plan.operators.filter(isGuardFrontChestOperator);

  guardFrontChestOperators
    .filter((operator) => operator.effector === "right_hand")
    .forEach((rightOperator) => {
      const rightTime = operatorTime(rightOperator, duration);
      const leftOperator = guardFrontChestOperators.find((operator) => {
        if (operator.effector !== "left_hand") {
          return false;
        }

        if (operator.region !== rightOperator.region) {
          return false;
        }

        const leftTime = operatorTime(operator, duration);

        return (
          Math.abs(leftTime.startTime - rightTime.startTime) <= epsilon &&
          Math.abs(leftTime.endTime - rightTime.endTime) <= epsilon
        );
      });

      if (leftOperator) {
        guardFrontChestDrivers.add(rightOperator);
        guardFrontChestSuppressed.add(leftOperator);
      }
    });

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
    guardFrontChestRoleForOperator: (operator) => {
      if (guardFrontChestDrivers.has(operator)) {
        return "driver";
      }

      if (guardFrontChestSuppressed.has(operator)) {
        return "suppressed";
      }

      return undefined;
    },
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

// Merge all sampled clips into one pose for a single keyframe.
//
// Each sampled clip may affect overlapping bones. Sorting by priority lets
// broad body motions apply first, then more specific poses such as hands/fingers
// overwrite only the bones they control.
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

// Main compiler entry point.
//
// Input:
// - MotionPlan: semantic action list from the simpler AI/manual format.
// - MotionProgram: operator list from the more composable AI/manual format.
//
// Output:
// - MotionData-like object that MotionPlayer can play and VMDExporter can save.
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

// Alias kept for callers that already know they are compiling an operator-based
// MotionProgram. It shares the same implementation as compileMotionPlan.
export function compileMotionProgram(program: MotionProgram) {
  return compileMotionPlan(program);
}
