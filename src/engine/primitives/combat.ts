import { Bones, RigCalibration, type Intensity } from "../RigCalibration";
import type { BoneMap, MotionPrimitive, PositionMap, PunchStyle, Side } from "./types";
import { axisQuat, q } from "./math";
import { mergeBones, mergePositions } from "./core";
import { bothHandsPose, handPose } from "./hands";
import { bodyLeanForward } from "./upperBody";
import { footBracePositions, kneeBendPose } from "./lowerBody";

export function guardPose(intensity: Intensity): BoneMap {
  return mergeBones(
    {
      [Bones.rightShoulder]: q(RigCalibration.shoulder.lift[intensity]),
      [Bones.leftShoulder]: q(RigCalibration.shoulder.lift[intensity]),
      [Bones.rightArm]: q(RigCalibration.rightArm.guard[intensity]),
      [Bones.leftArm]: q(RigCalibration.leftArm.guard[intensity]),
      [Bones.rightElbow]: q(RigCalibration.elbow.guard.right[intensity]),
      [Bones.leftElbow]: q(RigCalibration.elbow.guard.left[intensity]),
      [Bones.rightWrist]: q(RigCalibration.wrist.relaxedRight),
      [Bones.leftWrist]: q(RigCalibration.wrist.relaxedLeft),
    },
    bodyLeanForward(intensity),
    bothHandsPose("fist")
  );
}

export function fightingStancePose(intensity: Intensity): BoneMap {
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

export function fightingStancePositions(intensity: Intensity): PositionMap {
  const dropIntensity = intensity === "strong" ? "medium" : intensity;

  return mergePositions(
    {
      [Bones.center]: [...RigCalibration.position.centerForward[dropIntensity]],
    },
    footBracePositions(dropIntensity)
  );
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
  const elbowCalibration = isRight
    ? RigCalibration.elbow.bend.right
    : RigCalibration.elbow.bend.left;
  const nearlyStraightElbowCalibration = isRight
    ? RigCalibration.elbow.nearlyStraight.right
    : RigCalibration.elbow.nearlyStraight.left;
  const wristBone = isRight ? Bones.rightWrist : Bones.leftWrist;
  const handTwistBone = isRight ? Bones.rightHandTwist : Bones.leftHandTwist;
  if (phase === "chamber") {
    return {
      [shoulderBone]: q(RigCalibration.shoulder.lift[intensity]),
      [armBone]: axisQuat(-0.22, -sign * 0.2, -sign * 0.16),
      [elbowBone]: q(elbowCalibration[intensity]),
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
      ? q(elbowCalibration[intensity])
      : q(nearlyStraightElbowCalibration[intensity]);

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

export function punchPrimitive(
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
