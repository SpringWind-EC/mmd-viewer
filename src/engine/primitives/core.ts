import { Bones } from "../RigCalibration";
import type { BoneMap, MotionPrimitive, PositionMap } from "./types";
import { lerpPosition, neutral, nlerp } from "./math";

export function mergeBones(...maps: BoneMap[]): BoneMap {
  return Object.assign({}, ...maps);
}

export function mergePositions(...maps: PositionMap[]): PositionMap {
  return Object.assign({}, ...maps);
}

export function basePose(): BoneMap {
  return {
    [Bones.waist]: [...neutral],
    [Bones.lowerBody]: [...neutral],
    [Bones.upperBody]: [...neutral],
    [Bones.upperBody1]: [...neutral],
    [Bones.upperBody2]: [...neutral],
    [Bones.neck]: [...neutral],
    [Bones.head]: [...neutral],

    [Bones.rightShoulder]: [...neutral],
    [Bones.rightArm]: [...neutral],
    [Bones.rightArmTwist]: [...neutral],
    [Bones.rightElbow]: [...neutral],
    [Bones.rightHandTwist]: [...neutral],
    [Bones.rightWrist]: [...neutral],
    [Bones.rightHandTip]: [...neutral],
    [Bones.rightThumb0]: [...neutral],
    [Bones.rightThumb1]: [...neutral],
    [Bones.rightThumb2]: [...neutral],
    [Bones.rightIndex1]: [...neutral],
    [Bones.rightIndex2]: [...neutral],
    [Bones.rightIndex3]: [...neutral],
    [Bones.rightMiddle1]: [...neutral],
    [Bones.rightMiddle2]: [...neutral],
    [Bones.rightMiddle3]: [...neutral],
    [Bones.rightRing1]: [...neutral],
    [Bones.rightRing2]: [...neutral],
    [Bones.rightRing3]: [...neutral],
    [Bones.rightPinky1]: [...neutral],
    [Bones.rightPinky2]: [...neutral],
    [Bones.rightPinky3]: [...neutral],

    [Bones.leftShoulder]: [...neutral],
    [Bones.leftArm]: [...neutral],
    [Bones.leftArmTwist]: [...neutral],
    [Bones.leftElbow]: [...neutral],
    [Bones.leftHandTwist]: [...neutral],
    [Bones.leftWrist]: [...neutral],
    [Bones.leftHandTip]: [...neutral],
    [Bones.leftThumb0]: [...neutral],
    [Bones.leftThumb1]: [...neutral],
    [Bones.leftThumb2]: [...neutral],
    [Bones.leftIndex1]: [...neutral],
    [Bones.leftIndex2]: [...neutral],
    [Bones.leftIndex3]: [...neutral],
    [Bones.leftMiddle1]: [...neutral],
    [Bones.leftMiddle2]: [...neutral],
    [Bones.leftMiddle3]: [...neutral],
    [Bones.leftRing1]: [...neutral],
    [Bones.leftRing2]: [...neutral],
    [Bones.leftRing3]: [...neutral],
    [Bones.leftPinky1]: [...neutral],
    [Bones.leftPinky2]: [...neutral],
    [Bones.leftPinky3]: [...neutral],

    [Bones.rightFootIk]: [...neutral],
    [Bones.rightToeIk]: [...neutral],
    [Bones.rightLeg]: [...neutral],
    [Bones.rightKnee]: [...neutral],
    [Bones.rightAnkle]: [...neutral],
    [Bones.rightToe]: [...neutral],
    [Bones.rightLegD]: [...neutral],
    [Bones.rightKneeD]: [...neutral],
    [Bones.rightAnkleD]: [...neutral],
    [Bones.rightFootEx]: [...neutral],
    [Bones.leftFootIk]: [...neutral],
    [Bones.leftToeIk]: [...neutral],
    [Bones.leftLeg]: [...neutral],
    [Bones.leftKnee]: [...neutral],
    [Bones.leftAnkle]: [...neutral],
    [Bones.leftToe]: [...neutral],
    [Bones.leftLegD]: [...neutral],
    [Bones.leftKneeD]: [...neutral],
    [Bones.leftAnkleD]: [...neutral],
    [Bones.leftFootEx]: [...neutral],
  };
}

export function neutralArms(): BoneMap {
  return {
    [Bones.rightShoulder]: [...neutral],
    [Bones.rightArm]: [...neutral],
    [Bones.rightArmTwist]: [...neutral],
    [Bones.rightElbow]: [...neutral],
    [Bones.rightHandTwist]: [...neutral],
    [Bones.rightWrist]: [...neutral],
    [Bones.leftShoulder]: [...neutral],
    [Bones.leftArm]: [...neutral],
    [Bones.leftArmTwist]: [...neutral],
    [Bones.leftElbow]: [...neutral],
    [Bones.leftHandTwist]: [...neutral],
    [Bones.leftWrist]: [...neutral],
  };
}

export function neutralTorso(): BoneMap {
  return {
    [Bones.waist]: [...neutral],
    [Bones.lowerBody]: [...neutral],
    [Bones.upperBody]: [...neutral],
    [Bones.upperBody1]: [...neutral],
    [Bones.upperBody2]: [...neutral],
  };
}

export function posePrimitive(
  pose: BoneMap,
  holdFinalPose = true,
  positions?: PositionMap
): MotionPrimitive {
  return {
    holdFinalPose,
    frames: [
      { progress: 0, bones: {} },
      { progress: 0.65, bones: pose, positions },
      { progress: 1, bones: pose, positions },
    ],
  };
}

export function heldPosePrimitive(pose: BoneMap, positions?: PositionMap): MotionPrimitive {
  return {
    holdFinalPose: true,
    frames: [
      { progress: 0, bones: pose, positions },
      { progress: 1, bones: pose, positions },
    ],
  };
}

export function samplePrimitive(
  primitive: MotionPrimitive,
  progress: number
): { bones: BoneMap; positions: PositionMap } {
  const frames = primitive.frames;
  const clamped = Math.max(0, Math.min(1, progress));
  let previous = frames[0];
  let next = frames[frames.length - 1];

  for (let index = 0; index < frames.length - 1; index += 1) {
    const a = frames[index];
    const b = frames[index + 1];

    if (clamped >= a.progress && clamped <= b.progress) {
      previous = a;
      next = b;
      break;
    }
  }

  const span = next.progress - previous.progress;
  const localT = span <= 0 ? 0 : (clamped - previous.progress) / span;
  const boneNames = new Set([
    ...Object.keys(previous.bones),
    ...Object.keys(next.bones),
  ]);
  const pose: BoneMap = {};
  const positions: PositionMap = {};

  boneNames.forEach((boneName) => {
    pose[boneName] = nlerp(
      previous.bones[boneName] ?? neutral,
      next.bones[boneName] ?? neutral,
      localT
    );
  });

  const positionNames = new Set([
    ...Object.keys(previous.positions ?? {}),
    ...Object.keys(next.positions ?? {}),
  ]);

  positionNames.forEach((boneName) => {
    positions[boneName] = lerpPosition(
      previous.positions?.[boneName] ?? [0, 0, 0],
      next.positions?.[boneName] ?? [0, 0, 0],
      localT
    );
  });

  return { bones: pose, positions };
}
