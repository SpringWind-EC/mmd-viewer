import type { MotionAction } from "../MotionPlan";
import { Bones, RigCalibration, type QuaternionArray } from "../RigCalibration";
import type { BoneMap, FingerJointName, FingerName, Side } from "./types";
import { axisQuat, multiplyQuat, neutral, nlerp, q } from "./math";
import { mergeBones } from "./core";

export function handPose(
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

export function bothHandsPose(shape: "relaxed" | "open" | "guard" | "fist"): BoneMap {
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

export function fingerControlPose(action: MotionAction): BoneMap {
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
