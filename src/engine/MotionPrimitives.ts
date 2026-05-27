import type { MotionAction } from "./MotionPlan";
import {
  Bones,
  RigCalibration,
  type Intensity,
  type PositionArray,
  type QuaternionArray,
} from "./RigCalibration";

export type BoneMap = Record<string, QuaternionArray>;
export type PositionMap = Record<string, PositionArray>;

export type PrimitiveFrame = {
  progress: number;
  bones: BoneMap;
  positions?: PositionMap;
};

export type MotionPrimitive = {
  frames: PrimitiveFrame[];
  loop?: boolean;
  holdFinalPose?: boolean;
  holdProgress?: number;
};

const neutral = RigCalibration.neutral;
type Side = "right" | "left";
type FingerName = "thumb" | "index" | "middle" | "ring" | "pinky";
type FingerJointName = "base" | "middle" | "tip";

function q(values: readonly number[]): QuaternionArray {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1];
}

function nlerp(
  a: QuaternionArray,
  b: QuaternionArray,
  t: number
): QuaternionArray {
  let bx = b[0];
  let by = b[1];
  let bz = b[2];
  let bw = b[3];

  const dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;

  if (dot < 0) {
    bx *= -1;
    by *= -1;
    bz *= -1;
    bw *= -1;
  }

  const x = a[0] + (bx - a[0]) * t;
  const y = a[1] + (by - a[1]) * t;
  const z = a[2] + (bz - a[2]) * t;
  const w = a[3] + (bw - a[3]) * t;
  const length = Math.hypot(x, y, z, w) || 1;

  return [x / length, y / length, z / length, w / length];
}

function normalizeQuat(values: QuaternionArray): QuaternionArray {
  const length = Math.hypot(values[0], values[1], values[2], values[3]) || 1;

  return [
    values[0] / length,
    values[1] / length,
    values[2] / length,
    values[3] / length,
  ];
}

function multiplyQuat(
  a: QuaternionArray,
  b: QuaternionArray
): QuaternionArray {
  return normalizeQuat([
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ]);
}

export function mergeBones(...maps: BoneMap[]): BoneMap {
  return Object.assign({}, ...maps);
}

export function mergePositions(...maps: PositionMap[]): PositionMap {
  return Object.assign({}, ...maps);
}

function lerpPosition(
  a: PositionArray,
  b: PositionArray,
  t: number
): PositionArray {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
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

function posePrimitive(
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

function heldPosePrimitive(pose: BoneMap, positions?: PositionMap): MotionPrimitive {
  return {
    holdFinalPose: true,
    frames: [
      { progress: 0, bones: pose, positions },
      { progress: 1, bones: pose, positions },
    ],
  };
}

function rightArmForwardPose(intensity: Intensity): BoneMap {
  return {
    [Bones.rightShoulder]: q(RigCalibration.shoulder.supportForward[intensity]),
    [Bones.rightArm]: q(RigCalibration.rightArm.forward[intensity]),
    [Bones.rightElbow]: q(RigCalibration.elbow.bend[intensity]),
    [Bones.rightWrist]: q(RigCalibration.wrist.relaxedRight),
  };
}

function leftArmForwardPose(intensity: Intensity): BoneMap {
  return {
    [Bones.leftShoulder]: q(RigCalibration.shoulder.supportForward[intensity]),
    [Bones.leftArm]: q(RigCalibration.leftArm.forward[intensity]),
    [Bones.leftElbow]: q(RigCalibration.elbow.bend[intensity]),
    [Bones.leftWrist]: q(RigCalibration.wrist.relaxedLeft),
  };
}

function handPose(
  side: "right" | "left",
  shape: "relaxed" | "open" | "guard" | "fist"
): BoneMap {
  const isRight = side === "right";
  const prefix = isRight ? "right" : "left";
  const thumb0 =
    shape === "open"
      ? isRight
        ? RigCalibration.hand.thumbOpenRight0
        : RigCalibration.hand.thumbOpenLeft0
      : shape === "fist"
        ? isRight
          ? RigCalibration.hand.thumbFistRight0
          : RigCalibration.hand.thumbFistLeft0
        : isRight
          ? RigCalibration.hand.thumbGuardRight0
          : RigCalibration.hand.thumbGuardLeft0;
  const thumb1 =
    shape === "open"
      ? isRight
        ? RigCalibration.hand.thumbOpenRight1
        : RigCalibration.hand.thumbOpenLeft1
      : shape === "fist"
        ? isRight
          ? RigCalibration.hand.thumbFistRight1
          : RigCalibration.hand.thumbFistLeft1
        : isRight
          ? RigCalibration.hand.thumbGuardRight1
          : RigCalibration.hand.thumbGuardLeft1;
  const thumb2 =
    shape === "open"
      ? isRight
        ? RigCalibration.hand.thumbOpenRight2
        : RigCalibration.hand.thumbOpenLeft2
      : shape === "fist"
        ? isRight
          ? RigCalibration.hand.thumbFistRight2
          : RigCalibration.hand.thumbFistLeft2
        : isRight
          ? RigCalibration.hand.thumbGuardRight2
          : RigCalibration.hand.thumbGuardLeft2;

  const finger1 =
    shape === "open"
      ? RigCalibration.hand.openFinger[side]
      : shape === "fist"
        ? RigCalibration.hand.fistFinger1[side]
        : shape === "guard"
          ? RigCalibration.hand.guardFinger1[side]
          : RigCalibration.hand.relaxedFinger1[side];
  const finger2 =
    shape === "open"
      ? RigCalibration.hand.openFinger[side]
      : shape === "fist"
        ? RigCalibration.hand.fistFinger2[side]
        : shape === "guard"
          ? RigCalibration.hand.guardFinger2[side]
          : RigCalibration.hand.relaxedFinger2[side];
  const finger3 =
    shape === "open"
      ? RigCalibration.hand.openFinger[side]
      : shape === "fist"
        ? RigCalibration.hand.fistFinger3[side]
        : shape === "guard"
          ? RigCalibration.hand.guardFinger3[side]
          : RigCalibration.hand.relaxedFinger3[side];

  const bone = (name: string) =>
    Bones[`${prefix}${name}` as keyof typeof Bones];

  return {
    [bone("Thumb0")]: q(thumb0),
    [bone("Thumb1")]: q(thumb1),
    [bone("Thumb2")]: q(thumb2),
    [bone("Index1")]: q(finger1),
    [bone("Index2")]: q(finger2),
    [bone("Index3")]: q(finger3),
    [bone("Middle1")]: q(finger1),
    [bone("Middle2")]: q(finger2),
    [bone("Middle3")]: q(finger3),
    [bone("Ring1")]: q(finger1),
    [bone("Ring2")]: q(finger2),
    [bone("Ring3")]: q(finger3),
    [bone("Pinky1")]: q(finger1),
    [bone("Pinky2")]: q(finger2),
    [bone("Pinky3")]: q(finger3),
  };
}

function bothHandsPose(shape: "relaxed" | "open" | "guard" | "fist"): BoneMap {
  return mergeBones(handPose("right", shape), handPose("left", shape));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function jointValue(
  action: MotionAction,
  joint: FingerJointName,
  index: number
) {
  const fallback = clamp(action.curl ?? 1, 0, 1);

  if (Array.isArray(action.joints)) {
    return clamp(action.joints[index] ?? fallback, 0, 1);
  }

  if (action.joints && typeof action.joints === "object") {
    return clamp(action.joints[joint] ?? fallback, 0, 1);
  }

  return fallback;
}

function fingerBones(side: Side, finger: FingerName) {
  const isRight = side === "right";

  if (finger === "thumb") {
    return isRight
      ? [Bones.rightThumb0, Bones.rightThumb1, Bones.rightThumb2]
      : [Bones.leftThumb0, Bones.leftThumb1, Bones.leftThumb2];
  }

  if (finger === "index") {
    return isRight
      ? [Bones.rightIndex1, Bones.rightIndex2, Bones.rightIndex3]
      : [Bones.leftIndex1, Bones.leftIndex2, Bones.leftIndex3];
  }

  if (finger === "middle") {
    return isRight
      ? [Bones.rightMiddle1, Bones.rightMiddle2, Bones.rightMiddle3]
      : [Bones.leftMiddle1, Bones.leftMiddle2, Bones.leftMiddle3];
  }

  if (finger === "ring") {
    return isRight
      ? [Bones.rightRing1, Bones.rightRing2, Bones.rightRing3]
      : [Bones.leftRing1, Bones.leftRing2, Bones.leftRing3];
  }

  return isRight
    ? [Bones.rightPinky1, Bones.rightPinky2, Bones.rightPinky3]
    : [Bones.leftPinky1, Bones.leftPinky2, Bones.leftPinky3];
}

function fingerCurlTarget(
  side: Side,
  finger: FingerName,
  jointIndex: number
): QuaternionArray {
  const isRight = side === "right";

  if (finger === "thumb") {
    if (jointIndex === 0) {
      return q(isRight ? RigCalibration.hand.thumbFistRight0 : RigCalibration.hand.thumbFistLeft0);
    }

    if (jointIndex === 1) {
      return q(isRight ? RigCalibration.hand.thumbFistRight1 : RigCalibration.hand.thumbFistLeft1);
    }

    return q(isRight ? RigCalibration.hand.thumbFistRight2 : RigCalibration.hand.thumbFistLeft2);
  }

  if (jointIndex === 0) {
    return q(RigCalibration.hand.fistFinger1[side]);
  }

  if (jointIndex === 1) {
    return q(RigCalibration.hand.fistFinger2[side]);
  }

  return q(RigCalibration.hand.fistFinger3[side]);
}

function fingerSpreadDirection(finger: FingerName) {
  switch (finger) {
    case "thumb":
      return 1.4;
    case "index":
      return 1;
    case "middle":
      return 0;
    case "ring":
      return -0.65;
    case "pinky":
      return -1;
    default:
      return 0;
  }
}

function fingerJointRotation(
  side: Side,
  finger: FingerName,
  jointIndex: number,
  curl: number,
  spread: number,
  twist: number
): QuaternionArray {
  const sign = side === "right" ? 1 : -1;
  const curlRotation = nlerp(neutral, fingerCurlTarget(side, finger, jointIndex), curl);
  const spreadRotation =
    jointIndex === 0
      ? axisQuat(0, sign * spread * 0.08, sign * fingerSpreadDirection(finger) * spread * 0.16)
      : q(neutral);
  const twistRotation = axisQuat(
    0,
    sign * twist * (jointIndex === 0 ? 0.08 : 0.035),
    sign * twist * (jointIndex === 0 ? 0.08 : 0.025)
  );

  return multiplyQuat(multiplyQuat(curlRotation, spreadRotation), twistRotation);
}

function fingerControlPose(action: MotionAction): BoneMap {
  const sides: Side[] =
    action.side === "both"
      ? ["right", "left"]
      : [action.side === "left" ? "left" : "right"];
  const fingers: FingerName[] =
    action.finger === "all"
      ? ["thumb", "index", "middle", "ring", "pinky"]
      : [action.finger ?? "index"];
  const spread = clamp(action.spread ?? 0, -1, 1);
  const twist = clamp(action.twist ?? 0, -1, 1);
  const jointNames: FingerJointName[] = ["base", "middle", "tip"];
  const pose: BoneMap = {};

  sides.forEach((side) => {
    fingers.forEach((finger) => {
      const bones = fingerBones(side, finger);

      bones.forEach((boneName, index) => {
        pose[boneName] = fingerJointRotation(
          side,
          finger,
          index,
          jointValue(action, jointNames[index], index),
          spread,
          twist
        );
      });
    });
  });

  return pose;
}

export function rightArmForward(intensity: Intensity = "medium"): BoneMap {
  return rightArmForwardPose(intensity);
}

export function leftArmForward(intensity: Intensity = "medium"): BoneMap {
  return leftArmForwardPose(intensity);
}

export function twoArmsForward(intensity: Intensity = "medium"): BoneMap {
  return mergeBones(
    rightArmForwardPose(intensity),
    leftArmForwardPose(intensity),
    bothHandsPose("open")
  );
}

export function bodyLeanForward(intensity: Intensity = "medium"): BoneMap {
  return {
    [Bones.upperBody]: q(RigCalibration.torso.forward[intensity]),
    [Bones.upperBody1]: q(RigCalibration.torso.forwardUpper[intensity]),
    [Bones.upperBody2]: q(RigCalibration.torso.forwardUpper[intensity]),
  };
}

function bodyLeanBackward(intensity: Intensity): BoneMap {
  return {
    [Bones.upperBody]: q(RigCalibration.torso.backward[intensity]),
    [Bones.upperBody1]: q(RigCalibration.torso.backward[intensity]),
  };
}

function kneeBendPose(intensity: Intensity): BoneMap {
  return {
    [Bones.rightFootIk]: [...neutral],
    [Bones.rightToeIk]: q(RigCalibration.leg.toeGrip[intensity]),
    [Bones.rightAnkle]: q(RigCalibration.leg.heelCounter[intensity]),
    [Bones.rightToe]: q(RigCalibration.leg.toeGrip[intensity]),
    [Bones.rightLegD]: q(RigCalibration.leg.bendThigh[intensity]),
    [Bones.rightKneeD]: q(RigCalibration.leg.bendKnee[intensity]),
    [Bones.rightAnkleD]: q(RigCalibration.leg.ankleCounter[intensity]),
    [Bones.rightFootEx]: q(RigCalibration.leg.toeGrip[intensity]),
    [Bones.leftFootIk]: [...neutral],
    [Bones.leftToeIk]: q(RigCalibration.leg.toeGrip[intensity]),
    [Bones.leftAnkle]: q(RigCalibration.leg.heelCounter[intensity]),
    [Bones.leftToe]: q(RigCalibration.leg.toeGrip[intensity]),
    [Bones.leftLegD]: q(RigCalibration.leg.bendThigh[intensity]),
    [Bones.leftKneeD]: q(RigCalibration.leg.bendKnee[intensity]),
    [Bones.leftAnkleD]: q(RigCalibration.leg.ankleCounter[intensity]),
    [Bones.leftFootEx]: q(RigCalibration.leg.toeGrip[intensity]),
  };
}

function footBracePositions(intensity: Intensity): PositionMap {
  return {
    [Bones.rightFootIk]: [...RigCalibration.position.rightFootBrace[intensity]],
    [Bones.rightToeIk]: [...RigCalibration.position.rightFootBrace[intensity]],
    [Bones.leftFootIk]: [...RigCalibration.position.leftFootBrace[intensity]],
    [Bones.leftToeIk]: [...RigCalibration.position.leftFootBrace[intensity]],
  };
}

function guardPose(intensity: Intensity): BoneMap {
  return mergeBones(
    {
      [Bones.rightShoulder]: q(RigCalibration.shoulder.lift[intensity]),
      [Bones.leftShoulder]: q(RigCalibration.shoulder.lift[intensity]),
      [Bones.rightArm]: q(RigCalibration.rightArm.guard[intensity]),
      [Bones.leftArm]: q(RigCalibration.leftArm.guard[intensity]),
      [Bones.rightElbow]: q(RigCalibration.elbow.bend[intensity]),
      [Bones.leftElbow]: q(RigCalibration.elbow.bend[intensity]),
      [Bones.rightWrist]: q(RigCalibration.wrist.relaxedRight),
      [Bones.leftWrist]: q(RigCalibration.wrist.relaxedLeft),
    },
    bodyLeanForward(intensity),
    bothHandsPose("fist")
  );
}

function fightingStancePose(intensity: Intensity): BoneMap {
  const legIntensity = intensity === "strong" ? "medium" : intensity;
  const armIntensity = intensity === "mild" ? "mild" : "medium";

  return mergeBones(
    guardPose(armIntensity),
    kneeBendPose(legIntensity),
    {
      [Bones.lowerBody]: q(RigCalibration.torso.twistRight),
      [Bones.upperBody2]: q(RigCalibration.torso.twistLeft),
      [Bones.head]: [0, -0.08, 0, 0.9968],
    }
  );
}

function fightingStancePositions(intensity: Intensity): PositionMap {
  const dropIntensity = intensity === "strong" ? "medium" : intensity;

  return mergePositions(
    {
      [Bones.center]: [...RigCalibration.position.centerForward[dropIntensity]],
    },
    footBracePositions(dropIntensity)
  );
}

function crouchPose(intensity: Intensity): BoneMap {
  return mergeBones(kneeBendPose(intensity), bodyLeanForward(intensity));
}

function crouchPositions(intensity: Intensity): PositionMap {
  return mergePositions(
    {
      [Bones.center]: [...RigCalibration.position.centerDrop[intensity]],
    },
    footBracePositions(intensity)
  );
}

function headPose(type: MotionAction["type"]): BoneMap {
  switch (type) {
    case "look_left":
      return { [Bones.head]: q(RigCalibration.head.lookLeft) };
    case "look_right":
      return { [Bones.head]: q(RigCalibration.head.lookRight) };
    case "look_up":
      return { [Bones.head]: q(RigCalibration.head.lookUp) };
    case "look_down":
      return { [Bones.head]: q(RigCalibration.head.lookDown) };
    default:
      return {};
  }
}

type PunchStyle = "straight" | "jab" | "cross" | "hook" | "uppercut";

function axisQuat(x: number, y: number, z: number): QuaternionArray {
  const w = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z));
  return [x, y, z, w];
}

function sideSign(side: Side) {
  return side === "right" ? 1 : -1;
}

function punchTorsoPose(
  side: Side,
  intensity: Intensity,
  style: PunchStyle,
  phase: "chamber" | "impact"
): BoneMap {
  const sign = sideSign(side);
  const base = intensity === "strong" ? 0.16 : intensity === "mild" ? 0.08 : 0.12;
  const styleScale =
    style === "cross" ? 1.2 : style === "hook" ? 1.35 : style === "jab" ? 0.65 : 1;
  const phaseScale = phase === "impact" ? 1 : -0.45;
  const twist = base * styleScale * phaseScale;
  const forward =
    phase === "impact"
      ? intensity === "strong"
        ? 0.1
        : intensity === "mild"
          ? 0.04
          : 0.07
      : 0.02;

  return {
    [Bones.lowerBody]: axisQuat(0, -sign * twist * 0.55, 0),
    [Bones.upperBody]: axisQuat(forward, sign * twist * 0.55, 0),
    [Bones.upperBody1]: axisQuat(forward * 0.8, sign * twist * 0.75, 0),
    [Bones.upperBody2]: axisQuat(forward * 0.55, sign * twist, 0),
  };
}

function punchPositions(
  side: Side,
  intensity: Intensity,
  phase: "chamber" | "impact"
): PositionMap {
  const sign = sideSign(side);
  const forward =
    intensity === "strong" ? 0.28 : intensity === "mild" ? 0.12 : 0.2;
  const drop = intensity === "strong" ? 0.16 : intensity === "mild" ? 0.05 : 0.1;
  const lateral = intensity === "strong" ? 0.06 : intensity === "mild" ? 0.02 : 0.04;

  if (phase === "chamber") {
    return {
      [Bones.center]: [-sign * lateral * 0.5, -drop * 0.4, forward * 0.2],
    };
  }

  return mergePositions(
    {
      [Bones.center]: [sign * lateral, -drop, -forward],
    },
    footBracePositions(intensity)
  );
}

function punchingArmPose(
  side: Side,
  intensity: Intensity,
  style: PunchStyle,
  phase: "chamber" | "impact"
): BoneMap {
  const isRight = side === "right";
  const sign = sideSign(side);
  const armBone = isRight ? Bones.rightArm : Bones.leftArm;
  const shoulderBone = isRight ? Bones.rightShoulder : Bones.leftShoulder;
  const elbowBone = isRight ? Bones.rightElbow : Bones.leftElbow;
  const wristBone = isRight ? Bones.rightWrist : Bones.leftWrist;
  const handTwistBone = isRight ? Bones.rightHandTwist : Bones.leftHandTwist;
  if (phase === "chamber") {
    return {
      [shoulderBone]: q(RigCalibration.shoulder.lift[intensity]),
      [armBone]: axisQuat(-0.22, -sign * 0.2, -sign * 0.16),
      [elbowBone]: q(RigCalibration.elbow.bend[intensity]),
      [wristBone]: isRight
        ? q(RigCalibration.wrist.relaxedRight)
        : q(RigCalibration.wrist.relaxedLeft),
      [handTwistBone]: axisQuat(0, sign * 0.06, sign * 0.04),
      ...handPose(side, "fist"),
    };
  }

  const straightArm = isRight
    ? RigCalibration.rightArm.punch[intensity]
    : RigCalibration.leftArm.punch[intensity];

  const arm =
    style === "hook"
      ? axisQuat(-0.22, sign * 0.58, sign * 0.36)
      : style === "uppercut"
        ? axisQuat(-0.5, sign * 0.22, sign * 0.32)
        : style === "jab"
          ? q(straightArm)
          : axisQuat(straightArm[0] * 1.05, straightArm[1] * 1.06, straightArm[2]);

  const elbow =
    style === "hook" || style === "uppercut"
      ? q(RigCalibration.elbow.bend[intensity])
      : q(RigCalibration.elbow.nearlyStraight[intensity]);

  const wrist =
    style === "hook"
      ? axisQuat(0, sign * 0.05, sign * 0.12)
      : style === "uppercut"
        ? axisQuat(-0.05, sign * 0.03, 0)
        : axisQuat(0, sign * 0.02, 0);

  return {
    [shoulderBone]: q(RigCalibration.shoulder.supportForward[intensity]),
    [armBone]: arm,
    [elbowBone]: elbow,
    [wristBone]: wrist,
    [handTwistBone]: style === "hook"
      ? axisQuat(0, sign * 0.12, sign * 0.08)
      : axisQuat(0, sign * 0.04, 0),
    ...handPose(side, "fist"),
  };
}

function punchPose(
  side: Side,
  intensity: Intensity,
  style: PunchStyle,
  phase: "chamber" | "impact"
): BoneMap {
  const otherSide = side === "right" ? "left" : "right";

  return mergeBones(
    guardPose(intensity),
    punchTorsoPose(side, intensity, style, phase),
    handPose(otherSide, "fist"),
    punchingArmPose(side, intensity, style, phase)
  );
}

function punchPrimitive(
  side: Side,
  intensity: Intensity,
  style: PunchStyle = "straight"
): MotionPrimitive {
  const guard = mergeBones(guardPose(intensity), bothHandsPose("fist"));
  const chamber = punchPose(side, intensity, style, "chamber");
  const impact = punchPose(side, intensity, style, "impact");
  const impactStart =
    style === "jab" ? 0.32 : style === "hook" || style === "uppercut" ? 0.48 : 0.42;
  const impactEnd =
    style === "jab" ? 0.46 : style === "hook" || style === "uppercut" ? 0.64 : 0.58;
  const recoil = style === "jab" ? 0.72 : 0.82;

  return {
    holdFinalPose: false,
    holdProgress: (impactStart + impactEnd) / 2,
    frames: [
      { progress: 0, bones: guard, positions: punchPositions(side, intensity, "chamber") },
      { progress: 0.18, bones: chamber, positions: punchPositions(side, intensity, "chamber") },
      { progress: impactStart, bones: impact, positions: punchPositions(side, intensity, "impact") },
      { progress: impactEnd, bones: impact, positions: punchPositions(side, intensity, "impact") },
      { progress: recoil, bones: chamber, positions: punchPositions(side, intensity, "chamber") },
      { progress: 1, bones: guard, positions: punchPositions(side, intensity, "chamber") },
    ],
  };
}

function wavePrimitive(
  side: "right" | "left",
  intensity: Intensity
): MotionPrimitive {
  const isRight = side === "right";
  const arm = isRight
    ? RigCalibration.rightArm.waveUp[intensity]
    : RigCalibration.leftArm.waveUp[intensity];
  const wristA = isRight
    ? RigCalibration.wrist.waveRightA
    : RigCalibration.wrist.waveLeftA;
  const wristB = isRight
    ? RigCalibration.wrist.waveRightB
    : RigCalibration.wrist.waveLeftB;

  const raised = {
    [isRight ? Bones.rightShoulder : Bones.leftShoulder]: q(
      RigCalibration.shoulder.lift[intensity]
    ),
    [isRight ? Bones.rightArm : Bones.leftArm]: q(arm),
    [isRight ? Bones.rightElbow : Bones.leftElbow]: q(
      RigCalibration.elbow.bend[intensity]
    ),
    ...handPose(side, "open"),
  };

  return {
    holdFinalPose: false,
    frames: [
      { progress: 0, bones: {} },
      { progress: 0.2, bones: raised },
      {
        progress: 0.4,
        bones: mergeBones(raised, {
          [isRight ? Bones.rightWrist : Bones.leftWrist]: q(wristA),
        }),
      },
      {
        progress: 0.6,
        bones: mergeBones(raised, {
          [isRight ? Bones.rightWrist : Bones.leftWrist]: q(wristB),
        }),
      },
      {
        progress: 0.8,
        bones: mergeBones(raised, {
          [isRight ? Bones.rightWrist : Bones.leftWrist]: q(wristA),
        }),
      },
      { progress: 1, bones: {} },
    ],
  };
}

function nodPrimitive(): MotionPrimitive {
  return {
    holdFinalPose: false,
    frames: [
      { progress: 0, bones: {} },
      { progress: 0.3, bones: { [Bones.head]: q(RigCalibration.head.nodDown) } },
      { progress: 0.6, bones: { [Bones.head]: q(RigCalibration.head.nodUp) } },
      { progress: 1, bones: {} },
    ],
  };
}

function shakeHeadPrimitive(): MotionPrimitive {
  return {
    holdFinalPose: false,
    frames: [
      { progress: 0, bones: {} },
      { progress: 0.25, bones: { [Bones.head]: q(RigCalibration.head.lookLeft) } },
      { progress: 0.5, bones: { [Bones.head]: q(RigCalibration.head.lookRight) } },
      { progress: 0.75, bones: { [Bones.head]: q(RigCalibration.head.lookLeft) } },
      { progress: 1, bones: {} },
    ],
  };
}

function danceSwayPrimitive(): MotionPrimitive {
  return {
    loop: true,
    holdFinalPose: false,
    frames: [
      { progress: 0, bones: {} },
      {
        progress: 0.25,
        bones: {
          [Bones.upperBody]: q(RigCalibration.torso.swayLeft),
          [Bones.lowerBody]: q(RigCalibration.torso.twistRight),
        },
      },
      { progress: 0.5, bones: {} },
      {
        progress: 0.75,
        bones: {
          [Bones.upperBody]: q(RigCalibration.torso.swayRight),
          [Bones.lowerBody]: q(RigCalibration.torso.twistLeft),
        },
      },
      { progress: 1, bones: {} },
    ],
  };
}

function idleBreathingPrimitive(): MotionPrimitive {
  return {
    loop: true,
    holdFinalPose: false,
    frames: [
      { progress: 0, bones: {} },
      {
        progress: 0.5,
        bones: {
          [Bones.upperBody1]: [0.018, 0, 0, 0.9998],
          [Bones.upperBody2]: [0.012, 0, 0, 0.9999],
        },
      },
      { progress: 1, bones: {} },
    ],
  };
}

function runAmount(intensity: Intensity) {
  return intensity === "strong" ? 1.25 : intensity === "mild" ? 0.7 : 1;
}

function runArmSwingPose(
  rightForward: boolean,
  intensity: Intensity
): BoneMap {
  const amount = runAmount(intensity);
  const forward = -0.34 * amount;
  const back = 0.18 * amount;
  const side = 0.13 * amount;
  const elbow = intensity === "strong" ? "strong" : "medium";

  return {
    [Bones.rightShoulder]: axisQuat(0.02, 0, rightForward ? 0.04 : -0.03),
    [Bones.leftShoulder]: axisQuat(0.02, 0, rightForward ? 0.03 : -0.04),
    [Bones.rightArm]: axisQuat(
      rightForward ? forward : back,
      rightForward ? side : -side * 0.45,
      rightForward ? side * 0.5 : -side * 0.25
    ),
    [Bones.leftArm]: axisQuat(
      rightForward ? back : forward,
      rightForward ? side * 0.45 : -side,
      rightForward ? side * 0.25 : -side * 0.5
    ),
    [Bones.rightElbow]: q(RigCalibration.elbow.bend[elbow]),
    [Bones.leftElbow]: q(RigCalibration.elbow.bend[elbow]),
    [Bones.rightWrist]: q(RigCalibration.wrist.relaxedRight),
    [Bones.leftWrist]: q(RigCalibration.wrist.relaxedLeft),
    ...handPose("right", "fist"),
    ...handPose("left", "fist"),
  };
}

function runLegPose(
  rightForward: boolean,
  intensity: Intensity
): BoneMap {
  const amount = runAmount(intensity);
  const forwardThigh = -0.34 * amount;
  const backThigh = 0.2 * amount;
  const liftKnee = 0.44 * amount;
  const pushKnee = 0.18 * amount;
  const ankle = 0.16 * amount;
  const toe = 0.14 * amount;

  return {
    [Bones.rightLegD]: axisQuat(
      rightForward ? forwardThigh : backThigh,
      rightForward ? -0.04 : 0.03,
      rightForward ? -0.03 : 0.02
    ),
    [Bones.leftLegD]: axisQuat(
      rightForward ? backThigh : forwardThigh,
      rightForward ? -0.03 : 0.04,
      rightForward ? -0.02 : 0.03
    ),
    [Bones.rightKneeD]: axisQuat(rightForward ? liftKnee : pushKnee, 0, 0),
    [Bones.leftKneeD]: axisQuat(rightForward ? pushKnee : liftKnee, 0, 0),
    [Bones.rightAnkleD]: axisQuat(rightForward ? -ankle * 0.7 : ankle, 0, 0),
    [Bones.leftAnkleD]: axisQuat(rightForward ? ankle : -ankle * 0.7, 0, 0),
    [Bones.rightToe]: axisQuat(rightForward ? toe * 0.4 : toe, 0, 0),
    [Bones.leftToe]: axisQuat(rightForward ? toe : toe * 0.4, 0, 0),
    [Bones.rightFootEx]: axisQuat(rightForward ? toe * 0.35 : toe, 0, 0),
    [Bones.leftFootEx]: axisQuat(rightForward ? toe : toe * 0.35, 0, 0),
  };
}

function runPose(
  rightLegForward: boolean,
  intensity: Intensity
): BoneMap {
  const amount = runAmount(intensity);

  return mergeBones(
    {
      [Bones.lowerBody]: axisQuat(0, rightLegForward ? -0.04 : 0.04, 0),
      [Bones.upperBody]: axisQuat(0.09 * amount, rightLegForward ? 0.04 : -0.04, 0),
      [Bones.upperBody1]: axisQuat(0.07 * amount, rightLegForward ? 0.05 : -0.05, 0),
      [Bones.upperBody2]: axisQuat(0.04 * amount, rightLegForward ? 0.06 : -0.06, 0),
      [Bones.head]: axisQuat(-0.03 * amount, rightLegForward ? -0.015 : 0.015, 0),
    },
    runArmSwingPose(!rightLegForward, intensity),
    runLegPose(rightLegForward, intensity)
  );
}

function runPositions(
  rightLegForward: boolean,
  intensity: Intensity,
  airborne = false
): PositionMap {
  const amount = runAmount(intensity);
  const stride = 0.32 * amount;
  const lateral = 0.07 * amount;
  const lift = airborne ? 0.1 * amount : 0;
  const drop = airborne ? 0.08 * amount : 0.16 * amount;

  return {
    [Bones.center]: [
      rightLegForward ? -lateral * 0.35 : lateral * 0.35,
      -drop,
      -0.18 * amount,
    ],
    [Bones.rightFootIk]: [
      rightLegForward ? 0.08 : 0.02,
      lift,
      rightLegForward ? -stride : stride * 0.75,
    ],
    [Bones.rightToeIk]: [
      rightLegForward ? 0.08 : 0.02,
      lift,
      rightLegForward ? -stride : stride * 0.75,
    ],
    [Bones.leftFootIk]: [
      rightLegForward ? -0.02 : -0.08,
      lift,
      rightLegForward ? stride * 0.75 : -stride,
    ],
    [Bones.leftToeIk]: [
      rightLegForward ? -0.02 : -0.08,
      lift,
      rightLegForward ? stride * 0.75 : -stride,
    ],
  };
}

function runForwardPrimitive(intensity: Intensity): MotionPrimitive {
  const rightStride = runPose(true, intensity);
  const leftStride = runPose(false, intensity);
  const airborneRight = mergeBones(rightStride, {
    [Bones.rightKneeD]: axisQuat(0.5 * runAmount(intensity), 0, 0),
    [Bones.leftKneeD]: axisQuat(0.32 * runAmount(intensity), 0, 0),
  });
  const airborneLeft = mergeBones(leftStride, {
    [Bones.rightKneeD]: axisQuat(0.32 * runAmount(intensity), 0, 0),
    [Bones.leftKneeD]: axisQuat(0.5 * runAmount(intensity), 0, 0),
  });

  return {
    loop: true,
    holdFinalPose: false,
    frames: [
      {
        progress: 0,
        bones: rightStride,
        positions: runPositions(true, intensity),
      },
      {
        progress: 0.25,
        bones: airborneRight,
        positions: runPositions(true, intensity, true),
      },
      {
        progress: 0.5,
        bones: leftStride,
        positions: runPositions(false, intensity),
      },
      {
        progress: 0.75,
        bones: airborneLeft,
        positions: runPositions(false, intensity, true),
      },
      {
        progress: 1,
        bones: rightStride,
        positions: runPositions(true, intensity),
      },
    ],
  };
}

function stepPose(type: MotionAction["type"], intensity: Intensity): BoneMap {
  const bend = intensity === "mild" ? "mild" : "medium";

  if (type === "step_back") {
    return mergeBones(kneeBendPose(bend), {
      [Bones.rightLegD]: q(RigCalibration.leg.rightStepBack),
      [Bones.leftLegD]: q(RigCalibration.leg.leftStepBack),
      [Bones.rightToe]: q(RigCalibration.leg.toeGrip[bend]),
      [Bones.leftToe]: q(RigCalibration.leg.toeGrip[bend]),
    });
  }

  if (type === "step_left") {
    return mergeBones(kneeBendPose(bend), {
      [Bones.rightLegD]: [-0.12, 0, -0.1, 0.988],
      [Bones.leftLegD]: [-0.08, 0, 0.12, 0.99],
      [Bones.rightFootEx]: [0.08, 0, -0.03, 0.996],
      [Bones.leftFootEx]: [0.08, 0, 0.03, 0.996],
    });
  }

  if (type === "step_right") {
    return mergeBones(kneeBendPose(bend), {
      [Bones.rightLegD]: [-0.08, 0, -0.12, 0.99],
      [Bones.leftLegD]: [-0.12, 0, 0.1, 0.988],
      [Bones.rightFootEx]: [0.08, 0, -0.03, 0.996],
      [Bones.leftFootEx]: [0.08, 0, 0.03, 0.996],
    });
  }

  return mergeBones(kneeBendPose(bend), {
    [Bones.rightLegD]: q(RigCalibration.leg.rightStepForward),
    [Bones.leftLegD]: q(RigCalibration.leg.leftStepForward),
    [Bones.rightToe]: q(RigCalibration.leg.toeGrip[bend]),
    [Bones.leftToe]: q(RigCalibration.leg.toeGrip[bend]),
  });
}

function stepPositions(
  type: MotionAction["type"],
  intensity: Intensity
): PositionMap {
  const amount = intensity === "strong" ? 0.35 : intensity === "mild" ? 0.14 : 0.24;

  if (type === "step_back") {
    return {
      [Bones.rightFootIk]: [0.08, 0, amount],
      [Bones.rightToeIk]: [0.08, 0, amount],
      [Bones.leftFootIk]: [-0.08, 0, -amount * 0.4],
      [Bones.leftToeIk]: [-0.08, 0, -amount * 0.4],
    };
  }

  if (type === "step_left") {
    return {
      [Bones.rightFootIk]: [amount * 0.3, 0, 0],
      [Bones.rightToeIk]: [amount * 0.3, 0, 0],
      [Bones.leftFootIk]: [-amount, 0, 0],
      [Bones.leftToeIk]: [-amount, 0, 0],
    };
  }

  if (type === "step_right") {
    return {
      [Bones.rightFootIk]: [amount, 0, 0],
      [Bones.rightToeIk]: [amount, 0, 0],
      [Bones.leftFootIk]: [-amount * 0.3, 0, 0],
      [Bones.leftToeIk]: [-amount * 0.3, 0, 0],
    };
  }

  return {
    [Bones.rightFootIk]: [0.08, 0, -amount],
    [Bones.rightToeIk]: [0.08, 0, -amount],
    [Bones.leftFootIk]: [-0.08, 0, amount * 0.4],
    [Bones.leftToeIk]: [-0.08, 0, amount * 0.4],
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

export function primitiveForAction(action: MotionAction): MotionPrimitive {
  const intensity = action.intensity ?? "medium";

  switch (action.type) {
    case "neutral":
      return posePrimitive({});
    case "two_arms_forward":
    case "reach_forward":
      return posePrimitive(twoArmsForward(intensity));
    case "right_arm_forward":
      return posePrimitive(
        mergeBones(rightArmForwardPose(intensity), handPose("right", "open"))
      );
    case "left_arm_forward":
      return posePrimitive(
        mergeBones(leftArmForwardPose(intensity), handPose("left", "open"))
      );
    case "right_punch":
      return punchPrimitive("right", intensity, "cross");
    case "left_punch":
      return punchPrimitive("left", intensity, "cross");
    case "right_jab":
      return punchPrimitive("right", intensity, "jab");
    case "left_jab":
      return punchPrimitive("left", intensity, "jab");
    case "right_cross":
      return punchPrimitive("right", intensity, "cross");
    case "left_cross":
      return punchPrimitive("left", intensity, "cross");
    case "right_hook":
      return punchPrimitive("right", intensity, "hook");
    case "left_hook":
      return punchPrimitive("left", intensity, "hook");
    case "right_uppercut":
      return punchPrimitive("right", intensity, "uppercut");
    case "left_uppercut":
      return punchPrimitive("left", intensity, "uppercut");
    case "right_fist":
      return heldPosePrimitive(handPose("right", "fist"));
    case "left_fist":
      return heldPosePrimitive(handPose("left", "fist"));
    case "both_fists":
      return heldPosePrimitive(bothHandsPose("fist"));
    case "finger_control":
      return posePrimitive(fingerControlPose(action));
    case "guard":
      return posePrimitive(guardPose(intensity));
    case "fighting_stance":
      return posePrimitive(
        fightingStancePose(intensity),
        true,
        fightingStancePositions(intensity)
      );
    case "bend_knees":
      return posePrimitive(kneeBendPose(intensity), true, crouchPositions(intensity));
    case "crouch":
      return posePrimitive(
        crouchPose(intensity),
        true,
        crouchPositions(intensity)
      );
    case "body_lean_forward":
      return posePrimitive(bodyLeanForward(intensity));
    case "body_lean_backward":
      return posePrimitive(bodyLeanBackward(intensity));
    case "bow":
      return posePrimitive(
        mergeBones(bodyLeanForward("strong"), kneeBendPose("mild")),
        true,
        crouchPositions("mild")
      );
    case "look_left":
    case "look_right":
    case "look_up":
    case "look_down":
      return posePrimitive(headPose(action.type));
    case "nod":
      return nodPrimitive();
    case "shake_head":
      return shakeHeadPrimitive();
    case "wave_right":
      return wavePrimitive("right", intensity);
    case "wave_left":
      return wavePrimitive("left", intensity);
    case "happy_greeting":
      return {
        holdFinalPose: false,
        frames: wavePrimitive("right", intensity).frames.map((frame) => ({
          progress: frame.progress,
          bones: mergeBones(frame.bones, bodyLeanForward("mild")),
          positions: frame.positions,
        })),
      };
    case "dance_sway":
      return danceSwayPrimitive();
    case "idle_breathing":
      return idleBreathingPrimitive();
    case "run_forward":
      return runForwardPrimitive(intensity);
    case "step_forward":
    case "step_back":
    case "step_left":
    case "step_right":
      return posePrimitive(
        stepPose(action.type, intensity),
        true,
        stepPositions(action.type, intensity)
      );
    default:
      return posePrimitive({});
  }
}
