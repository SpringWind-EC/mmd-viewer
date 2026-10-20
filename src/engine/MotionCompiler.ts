import type { MotionAction, MotionPlan } from "./MotionPlan";
import { Quaternion, type SkinnedMesh } from "three";
import { compileMotionOperator, type MotionOperatorContext } from "./MotionOperatorCompiler";
import type { MotionOperator, MotionProgram, MotionSequence } from "./MotionProgram";
import { Bones } from "./RigCalibration";
import { resolveReach } from "./RigMotionResolver";
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
  context: MotionOperatorContext,
  mesh?: SkinnedMesh
): ActionClip {
  const startTime = clamp(operator.startTime ?? 0, 0, duration);
  const requestedEnd = operator.endTime ?? duration;
  const endTime = clamp(Math.max(requestedEnd, startTime + 0.1), 0, duration);
  if (operator.type === "reach" && !mesh) {
    throw new Error("Reach plans require a loaded model.");
  }
  const handRegion = operator.type === "move_effector" &&
    (operator.effector === "right_hand" || operator.effector === "left_hand") &&
    (operator.region === "front_of_face" || operator.region === "front_of_chest" || operator.region === "chest_center") &&
    !context.guardFrontChestRoleForOperator?.(operator);
  const side = operator.type === "move_effector" && operator.effector === "left_hand" ? -1 : 1;
  const compiled = operator.type === "reach"
    ? { primitive: resolveReach(mesh!, operator), priority: 20 }
    : handRegion && mesh && operator.type === "move_effector"
      ? {
          primitive: resolveReach(mesh, {
            type: "reach",
            effector: operator.effector as "right_hand" | "left_hand",
            anchor: operator.region === "front_of_face" ? "head" : "chest",
            offset: operator.region === "front_of_face"
              ? { right: side * 0.25, up: -0.08, forward: 0.24 }
              : { right: side * (operator.region === "chest_center" ? 0.12 : 0.22), up: 0.04, forward: 0.36 },
          }),
          priority: 20,
        }
      : compileMotionOperator(operator, context);

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
// Wrist turns can change direction within a few video frames. Keep their
// minimum span short while retaining a nonzero interval for interpolation.
function operatorTime(
  operator: MotionOperator,
  duration: number
): { startTime: number; endTime: number } {
  const startTime = clamp(operator.startTime ?? 0, 0, duration);
  const requestedEnd = operator.endTime ?? duration;
  const minSpan = operator.type === "pose_wrist" ? 0.06 : 0.1;
  // Decimal timeline markers such as 1.3–1.4 are exactly a tenth in authored
  // time, even though their binary subtraction may be a hair below 0.1.
  const endTime = clamp(requestedEnd + 1e-9 >= startTime + minSpan
    ? requestedEnd : startTime + minSpan, 0, duration);

  return { startTime, endTime };
}

function assertCompatibleOperators(program: MotionProgram, duration: number) {
  program.operators.forEach((operator, index) => {
    if (operator.type === "pose_forearm" && Math.abs(operator.roll) > 40 && !program.continuePrevious) {
      throw new Error("Forearm rolls above 40 degrees require a continuing segment with a held pose.");
    }
    if (operator.type === "pose_wrist" && Math.abs(operator.tilt ?? 0) > 35 && !program.continuePrevious) {
      throw new Error("Wrist tilts above 35 degrees require a continuing segment with a held pose.");
    }
    if (operator.type === "pose_wrist" && !program.continuePrevious &&
        (Math.abs(operator.twist ?? 0) > 40 || Math.abs(operator.from?.twist ?? 0) > 40)) {
      throw new Error("Wrist twists above 40 degrees require a continuing segment with a held pose.");
    }
    if (operator.type === "pose_palm" && Math.abs(operator.turn) > 65 && !program.continuePrevious) {
      throw new Error("Palm turns above 65 degrees require a continuing segment with a held pose.");
    }
    if (operator.type === "pose_palm" && Math.abs(operator.tilt ?? 0) > 35 && !program.continuePrevious) {
      throw new Error("Palm tilts above 35 degrees require a continuing segment with a held pose.");
    }
    if ((operator.type === "bend_elbow" || operator.type === "pose_arm") &&
        (operator.flex ?? 0) < 0 && !program.continuePrevious) {
      throw new Error("Negative elbow flex can only extend a held bend in a continuing segment.");
    }
    if (operator.type === "finger" && (operator.curl ?? 0) < 0 && !program.continuePrevious) {
      throw new Error("Negative finger curl can only release a held pose in a continuing segment.");
    }
    if (operator.type === "place_foot") {
      const travel = Math.hypot(operator.offset.right, operator.offset.forward);
      const forward = Math.abs(operator.offset.forward);
      const requiredLift = forward > 3 ? 1.2 : forward > 2 ? 0.7 : 0;
      const unsafeInitialPlacement = !program.continuePrevious && (
        Math.abs(operator.offset.right) > 1.5 || operator.offset.up < requiredLift
      );
      if (operator.extendedReach && !program.continuePrevious) {
        throw new Error("Extended foot reach requires a continuing segment with an already lifted foot.");
      }
      if (travel > (operator.extendedReach && program.continuePrevious ? 6.2 : 4.1) || unsafeInitialPlacement) {
        throw new Error("A foot placement must stay within 4.1 horizontal units, or 6.2 for an extended lifted continuation. Wider side sweeps or lowering a raised foot require a continuing segment.");
      }
    }
    if (operator.type === "pose_arm") {
      if (!program.continuePrevious && (
          Math.abs(operator.shoulderYaw ?? 0) > 25 || Math.abs(operator.from?.shoulderYaw ?? 0) > 25 ||
          Math.abs(operator.upperArmRoll ?? 0) > 60 || Math.abs(operator.from?.upperArmRoll ?? 0) > 60)) {
        throw new Error("Large shoulder yaw or upper-arm roll requires a continuing segment with a held pose.");
      }
      if (((operator.forward ?? 0) < -30 || (operator.outward ?? 0) < -25) && !program.continuePrevious) {
        throw new Error("A large downward or backward arm sweep requires a continuing segment; use it to lower a held raised arm.");
      }
      const lift = Math.max(0, operator.forward ?? 0) + Math.max(0, operator.outward ?? 0);
      const overhead = operator.overhead === true && (operator.shoulderShare ?? 0.12) >= 0.1;
      if (lift > (overhead ? 130 : 85) || (lift > 60 && (operator.flex ?? 0) > 75)) {
        throw new Error("Combined arm lift must stay within 85 degrees, or 130 with overhead and shoulderShare at least 0.1; above 60 degrees, elbow flex is limited to 75 degrees.");
      }
    }
    if (operator.type !== "bend_elbow" && operator.type !== "pose_arm" && operator.type !== "pose_forearm" &&
        operator.type !== "pose_wrist" && operator.type !== "pose_palm" && operator.type !== "pose_head" && operator.type !== "pose_neck" &&
        operator.type !== "pose_pelvis" && operator.type !== "pose_spine" &&
        operator.type !== "pose_ankle" && operator.type !== "pose_toe") return;
    const time = operatorTime(operator, duration);
    const conflict = program.operators.find((other, otherIndex) => {
      if (otherIndex === index) return false;
      const otherTime = operatorTime(other, duration);
      if (Math.max(time.startTime, otherTime.startTime) >= Math.min(time.endTime, otherTime.endTime)) return false;
      if (operator.type === "bend_elbow" || operator.type === "pose_arm") {
        return ((other.type === "reach" || other.type === "move_effector") &&
          other.effector === `${operator.side}_hand`) ||
          ((other.type === "bend_elbow" || other.type === "pose_arm") && other.side === operator.side);
      }
      if (operator.type === "pose_forearm") {
        return (other.type === "pose_forearm" || other.type === "pose_palm") && other.side === operator.side;
      }
      if (operator.type === "pose_wrist") {
        return ((other.type === "orient_effector" || other.type === "oscillate") &&
          other.effector === `${operator.side}_hand`) ||
          ((other.type === "pose_wrist" || other.type === "pose_palm") && other.side === operator.side);
      }
      if (operator.type === "pose_palm") {
        return ((other.type === "orient_effector" || other.type === "oscillate") &&
          other.effector === `${operator.side}_hand`) ||
          ((other.type === "pose_forearm" || other.type === "pose_wrist" || other.type === "pose_palm") &&
            other.side === operator.side);
      }
      if (operator.type === "pose_pelvis") return other.type === "pose_pelvis";
      if (operator.type === "pose_spine") return other.type === "pose_torso" ||
        (other.type === "pose_spine" && other.segment === operator.segment);
      if (operator.type === "pose_ankle" || operator.type === "pose_toe") {
        return (other.type === "pose_ankle" || other.type === "pose_toe") &&
          other.type === operator.type && other.side === operator.side;
      }
      if (operator.type === "pose_neck") return other.type === "pose_neck" ||
        (other.type === "pose_head" && (other.neckShare ?? 0.3) > 0) ||
        other.type === "look" ||
        (other.type === "orient_effector" && (other.effector === "head" || other.effector === "gaze"));
      if (operator.type === "pose_head" && other.type === "pose_neck") return (operator.neckShare ?? 0.3) > 0;
      return other.type === "look" ||
        (other.type === "orient_effector" && (other.effector === "head" || other.effector === "gaze"));
    });
    if (conflict) {
      throw new Error(operator.type === "pose_head" || operator.type === "pose_neck"
        ? "pose_head cannot overlap look or head orientation; combine the angles in pose_head."
        : operator.type === "pose_palm"
          ? `pose_palm on ${operator.side} cannot overlap forearm, wrist, or hand orientation.`
          : operator.type === "pose_wrist"
            ? `pose_wrist on ${operator.side} cannot overlap pose_palm or another hand orientation.`
          : operator.type === "pose_pelvis" || operator.type === "pose_spine" ||
              operator.type === "pose_ankle" || operator.type === "pose_toe"
            ? "Two operators cannot drive the same body joint at the same time."
            : `Arm pose on ${operator.side} cannot overlap another arm pose or hand target.`);
    }
  });
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
    continuingSegment: plan.continuePrevious === true,
    bodyHasKneeSeedForFoot: (operator) => {
      const footTime = operatorTime(operator, duration);
      return plan.operators.some((candidate) => {
        if (candidate.type !== "place_body" || candidate.offset.up >= 0) return false;
        const bodyTime = operatorTime(candidate, duration);
        return Math.max(footTime.startTime, bodyTime.startTime) < Math.min(footTime.endTime, bodyTime.endTime);
      });
    },
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
    handOscillationHasDrivenElbow: (operator) => {
      const time = operatorTime(operator, duration);
      return plan.operators.some((candidate) => {
        if (candidate === operator) return false;
        if (candidate.type !== "reach" && candidate.type !== "move_effector") return false;
        if (candidate.effector !== operator.effector) return false;
        const candidateTime = operatorTime(candidate, duration);
        if (Math.max(time.startTime, candidateTime.startTime) >= Math.min(time.endTime, candidateTime.endTime) - epsilon) return false;
        if (candidate.type === "reach") return true;
        return [
          "forward", "front_of_face", "front_of_chest", "chest_center", "right_knee", "left_knee", "knees",
        ].includes(candidate.region);
      });
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

// For simple target poses, begin a later command at the pose the earlier
// operators already reached. This keeps sequences such as look-left then
// look-up, or reach then bend-elbow, continuous at their boundary.
function seedOperatorTransitions(clips: ActionClip[], holdAfterEnd: boolean) {
  const ordered = [...clips].sort((a, b) => a.startTime - b.startTime);
  const seeded: ActionClip[] = [];
  for (const clip of ordered) {
    const frames = clip.primitive.frames;
    if (clip.startTime <= 0 || frames.length !== 3 || frames[0].progress !== 0 ||
        Object.keys(frames[0].bones).length > 0 || frames[0].positions ||
        JSON.stringify(frames[1].bones) !== JSON.stringify(frames[2].bones) ||
        JSON.stringify(frames[1].positions) !== JSON.stringify(frames[2].positions)) {
      seeded.push(clip);
      continue;
    }
    const prior = composeSamples(seeded.map((previous) => ({
      ...sampleClipAtTime(previous, clip.startTime, holdAfterEnd),
      priority: previous.priority,
    })));
    const final = frames[2];
    const bones = Object.fromEntries(Object.keys(final.bones)
      .filter((name) => prior.bones[name])
      .map((name) => [name, prior.bones[name]])) as BoneMap;
    const positions = Object.fromEntries(Object.keys(final.positions ?? {})
      .filter((name) => prior.positions[name])
      .map((name) => [name, prior.positions[name]])) as PositionMap;
    seeded.push(Object.keys(bones).length || Object.keys(positions).length
      ? { ...clip, primitive: {
          ...clip.primitive,
          frames: [{ ...frames[0], bones, positions: Object.keys(positions).length ? positions : undefined }, ...frames.slice(1)],
        } }
      : clip);
  }
  return seeded;
}

// Main compiler entry point.
//
// Input:
// - MotionPlan: semantic action list from the simpler AI/manual format.
// - MotionProgram: operator list from the more composable AI/manual format.
//
// Output:
// - MotionData-like object that MotionPlayer can play and VMDExporter can save.
export function compileMotionPlan(plan: MotionPlan | MotionProgram, mesh?: SkinnedMesh) {
  const duration = clamp(
    plan.duration && plan.duration > 0 ? plan.duration : DEFAULT_DURATION,
    isMotionProgram(plan) && plan.continuePrevious ? 0.25 : 0.5,
    MAX_DURATION
  );
  if (isMotionProgram(plan)) assertCompatibleOperators(plan, duration);
  const context = operatorContext(plan, duration);
  const holdAfterEnd = plan.holdFinalPose !== false;

  // Operators address independent body parts. A later hand gesture must not
  // cancel an earlier held pelvis, foot, or torso pose. New operators affecting
  // the same bone still take precedence through composition order.
  const clips = isMotionProgram(plan)
    ? seedOperatorTransitions(
        plan.operators.map((operator) => buildOperatorClip(operator, duration, context, mesh)),
        holdAfterEnd
      )
    : linkClipTimeline((plan.actions && plan.actions.length > 0
        ? plan.actions
        : [{ type: "neutral" as const }]
      ).map((action) => buildClip(action, duration)));
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

// A follow-up program describes changes from the last pose, rather than a
// replacement pose measured from the model's rest position. Keep every joint
// that the follow-up does not mention and shift its keys onto the old timeline.
export function appendMotionProgram(
  previous: ReturnType<typeof compileMotionPlan> | null,
  program: MotionProgram,
  mesh?: SkinnedMesh
) {
  if (!previous) throw new Error("A continuing motion needs a previous motion plan.");
  if (previous.loop || previous.holdFinalPose === false || previous.rotationMode !== "delta" || previous.positionMode !== "offset") {
    throw new Error("Only a held operator motion can be continued.");
  }
  if (program.loop || program.holdFinalPose === false) {
    throw new Error("A continuing segment must hold its final pose and cannot loop.");
  }
  const relativeControls = new Set([
    "place_body", "place_foot", "pose_pelvis", "pose_spine", "pose_ankle", "pose_toe",
    "pose_torso", "pose_waist", "pose_head", "pose_neck", "bend_elbow", "pose_arm", "pose_forearm", "pose_wrist", "pose_palm", "finger",
  ]);
  if (program.operators.some((operator) => !relativeControls.has(operator.type))) {
    throw new Error("Continuing segments require numeric pose and placement operators; semantic targets need a new full plan.");
  }
  const segment = compileMotionPlan(program, mesh);
  const base = previous.keyframes.at(-1);
  const initial = segment.keyframes[0];
  if (!base || !initial) throw new Error("The previous motion has no final pose.");
  const hasAbsoluteBones = [base, ...segment.keyframes].some((frame) =>
    Object.values(frame.rotationModes ?? {}).includes("absolute"));
  if (hasAbsoluteBones) throw new Error("Continuing segments require relative bone rotations.");

  const shifted = segment.keyframes.slice(1).map((frame) => {
    const bones: BoneMap = {};
    for (const name of new Set([...Object.keys(base.bones), ...Object.keys(frame.bones)])) {
      const old = base.bones[name] ?? [0, 0, 0, 1];
      const start = initial.bones[name] ?? [0, 0, 0, 1];
      const current = frame.bones[name] ?? [0, 0, 0, 1];
      const change = new Quaternion(...start).invert().multiply(new Quaternion(...current));
      const result = new Quaternion(...old).multiply(change).normalize();
      bones[name] = [result.x, result.y, result.z, result.w];
    }
    const positions: PositionMap = {};
    for (const name of new Set([...Object.keys(base.positions ?? {}), ...Object.keys(frame.positions ?? {})])) {
      const old = base.positions?.[name] ?? [0, 0, 0];
      const start = initial.positions?.[name] ?? [0, 0, 0];
      const current = frame.positions?.[name] ?? [0, 0, 0];
      positions[name] = [
        old[0] + current[0] - start[0],
        old[1] + current[1] - start[1],
        old[2] + current[2] - start[2],
      ];
    }
    return {
      time: Number((previous.duration + frame.time).toFixed(4)),
      bones,
      positions: Object.keys(positions).length ? positions : undefined,
      rotationModes: { ...base.rotationModes, ...frame.rotationModes },
    };
  });
  const finalPositions = shifted.at(-1)?.positions ?? base.positions ?? {};
  for (const name of [Bones.rightFootIk, Bones.leftFootIk]) {
    const [right, up, forward] = finalPositions[name] ?? [0, 0, 0];
    const horizontalReach = Math.hypot(right, forward);
    const requiredLift = Math.abs(forward) > 3 ? 1.2 : Math.abs(forward) > 2 ? 0.7 : 0;
    const previousFoot = base.positions?.[name] ?? [0, 0, 0];
    // A held extended foot keeps its range while the next segment poses only
    // arms or torso; it should not require a zero-distance place_foot operator.
    const alreadyExtended = Math.hypot(previousFoot[0], previousFoot[2]) > 4.1;
    const extendedReach = alreadyExtended || program.operators.some((operator) => operator.type === "place_foot" &&
      operator.extendedReach && name === (operator.side === "right" ? Bones.rightFootIk : Bones.leftFootIk));
    const extendedLift = extendedReach && horizontalReach > 4.1 ? 0.7 : 0;
    if (horizontalReach > (extendedReach ? 6.2 : 4.1) || up < Math.max(requiredLift, extendedLift)) {
      throw new Error("A continuing foot reach exceeds the supported IK range or needs more lift.");
    }
  }
  return {
    ...previous,
    duration: previous.duration + segment.duration,
    loop: false,
    holdFinalPose: true,
    keyframes: [...previous.keyframes, ...shifted],
  };
}

// Compile a complete manual sequence in one pass. Each following segment is
// relative to the preceding final pose, exactly as when applied separately.
export function compileMotionSequence(sequence: MotionSequence, mesh?: SkinnedMesh) {
  if (!Array.isArray(sequence.segments) || sequence.segments.length < 2 || sequence.segments.length > 64) {
    throw new Error("A motion sequence needs between 2 and 64 segments.");
  }
  let motion: ReturnType<typeof compileMotionPlan> | null = null;
  sequence.segments.forEach((segment, index) => {
    if (!segment || !Array.isArray(segment.operators) || segment.operators.length === 0 ||
        !Number.isFinite(segment.duration) || segment.duration < 0.25 || segment.duration > 5) {
      throw new Error(`Segment ${index + 1} needs operators and a duration from 0.25 to 5 seconds.`);
    }
    if (Boolean(segment.continuePrevious) !== (index > 0)) {
      throw new Error(index === 0
        ? "The first segment must start a new motion."
        : `Segment ${index + 1} must set continuePrevious to true.`);
    }
    motion = index === 0
      ? compileMotionPlan(segment, mesh)
      : appendMotionProgram(motion, segment, mesh);
  });
  return motion!;
}
