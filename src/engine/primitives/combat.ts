import { Bones, RigCalibration, type Intensity, type QuaternionArray } from "../RigCalibration";
import type { BoneMap, MotionPrimitive, PositionMap, PunchStyle, Side } from "./types";
import { axisQuat, nlerp, q } from "./math";
import { mergeBones } from "./core";
import { bothHandsPose, handPose } from "./hands";
import { bodyLeanForward } from "./upperBody";
import { kneeBendPose } from "./lowerBody";

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
  const armIntensity = intensity === "mild" ? "mild" : "medium";
  const legIntensity = intensity === "strong" ? "medium" : intensity;

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
  const scale = intensity === "strong" ? 1 : intensity === "mild" ? 0.45 : 0.7;
  return {
    [Bones.center]: [0, -0.31 * scale, -0.1 * scale],
    [Bones.rightFootIk]: [-0.55 * scale, 0, -0.5 * scale],
    [Bones.leftFootIk]: [0.45 * scale, 0, 0.35 * scale],
  };
}

export function fightingStancePrimitive(intensity: Intensity): MotionPrimitive {
  const pose = fightingStancePose(intensity);
  const final = fightingStancePositions(intensity);
  const scale = intensity === "strong" ? 1 : intensity === "mild" ? 0.45 : 0.7;
  const right = final[Bones.rightFootIk];
  const left = final[Bones.leftFootIk];
  const center = final[Bones.center];

  return {
    holdFinalPose: true,
    frames: [
      { progress: 0, bones: {}, positions: {} },
      { progress: 0.18, bones: pose, positions: { [Bones.center]: [0.12 * scale, -0.17 * scale, 0] } },
      { progress: 0.32, bones: pose, positions: {
        [Bones.center]: [0.12 * scale, -0.2 * scale, 0],
        [Bones.rightFootIk]: [right[0] * 0.55, 0.27 * scale, right[2] * 0.55],
      } },
      { progress: 0.48, bones: pose, positions: {
        [Bones.center]: [-0.08 * scale, -0.25 * scale, -0.06 * scale],
        [Bones.rightFootIk]: [...right],
      } },
      { progress: 0.62, bones: pose, positions: {
        [Bones.center]: [-0.08 * scale, -0.25 * scale, -0.06 * scale],
        [Bones.rightFootIk]: [...right],
        [Bones.leftFootIk]: [left[0] * 0.55, 0.27 * scale, left[2] * 0.55],
      } },
      { progress: 0.82, bones: pose, positions: final },
      { progress: 1, bones: pose, positions: { [Bones.center]: [...center], [Bones.rightFootIk]: [...right], [Bones.leftFootIk]: [...left] } },
    ],
  };
}

function sideSign(side: Side) {
  return side === "right" ? 1 : -1;
}

type ArmAngles = { arm: QuaternionArray; elbow: QuaternionArray };

// Solved against the Cyrene PMX shoulder, elbow and wrist lengths. The guard
// keeps the wrist in front of the same-side shoulder; each impact has its own
// reach and elbow bend instead of sharing the cross pose.
const punchAngles: { chamber: ArmAngles; uppercutChamber: ArmAngles; impact: Record<PunchStyle, ArmAngles> } = {
  chamber: { arm: [-0.26412, 0.29265, -0.11014, 0.9124], elbow: [-0.50582, 0.63687, -0.29155, 0.50353] },
  uppercutChamber: { arm: [-0.20897, 0.23765, -0.27143, 0.90894], elbow: [-0.43683, 0.54652, 0.4716, 0.53673] },
  impact: {
    straight: { arm: [-0.18357, 0.21382, -0.39067, 0.87633], elbow: [-0.19058, 0.23658, -0.08336, 0.94909] },
    jab: { arm: [-0.33603, 0.37941, -0.35363, 0.78618], elbow: [-0.05391, 0.06871, 0.01339, 0.99609] },
    cross: { arm: [-0.21191, 0.24529, -0.40485, 0.855], elbow: [-0.14322, 0.17945, -0.02848, 0.97287] },
    hook: { arm: [-0.05477, 0.07232, -0.37361, 0.92314], elbow: [-0.46434, 0.48291, -0.26344, 0.69411] },
    uppercut: { arm: [-0.12106, 0.14596, -0.40685, 0.8936], elbow: [-0.37188, 0.45204, -0.36101, 0.72597] },
  },
};

function punchMirror(side: Side, angles: QuaternionArray): QuaternionArray {
  return side === "right" ? [...angles] : [angles[0], -angles[1], -angles[2], angles[3]];
}

function punchGuardArm(side: Side, intensity: Intensity): BoneMap {
  const right = side === "right";
  return {
    [right ? Bones.rightShoulder : Bones.leftShoulder]: punchMirror(side, q(RigCalibration.shoulder.lift[intensity])),
    [right ? Bones.rightArm : Bones.leftArm]: punchMirror(side, punchAngles.chamber.arm),
    [right ? Bones.rightElbow : Bones.leftElbow]: punchMirror(side, punchAngles.chamber.elbow),
    [right ? Bones.rightWrist : Bones.leftWrist]: right
      ? q(RigCalibration.wrist.relaxedRight)
      : q(RigCalibration.wrist.relaxedLeft),
    [right ? Bones.rightHandTwist : Bones.leftHandTwist]: [0, 0, 0, 1],
  };
}

function punchGuardPose(intensity: Intensity): BoneMap {
  return mergeBones(punchGuardArm("right", intensity), punchGuardArm("left", intensity));
}

function punchFistPose(side: Side): BoneMap {
  const right = side === "right";
  const curls: QuaternionArray[] = [
    [0, 0, 0.62, 0.785],
    [0, 0, 0.7, 0.714],
    [0, 0, 0.52, 0.854],
  ];
  const fingers = right
    ? [
        [Bones.rightIndex1, Bones.rightIndex2, Bones.rightIndex3],
        [Bones.rightMiddle1, Bones.rightMiddle2, Bones.rightMiddle3],
        [Bones.rightRing1, Bones.rightRing2, Bones.rightRing3],
        [Bones.rightPinky1, Bones.rightPinky2, Bones.rightPinky3],
      ]
    : [
        [Bones.leftIndex1, Bones.leftIndex2, Bones.leftIndex3],
        [Bones.leftMiddle1, Bones.leftMiddle2, Bones.leftMiddle3],
        [Bones.leftRing1, Bones.leftRing2, Bones.leftRing3],
        [Bones.leftPinky1, Bones.leftPinky2, Bones.leftPinky3],
      ];
  const pose = handPose(side, "fist");
  for (const joints of fingers) {
    joints.forEach((name, index) => { pose[name] = punchMirror(side, curls[index]); });
  }
  return pose;
}

function bothPunchFistsPose(): BoneMap {
  return mergeBones(punchFistPose("right"), punchFistPose("left"));
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

  return { [Bones.center]: [sign * lateral, -drop, -forward] };
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
  const chamber = style === "uppercut" ? punchAngles.uppercutChamber : punchAngles.chamber;
  if (phase === "chamber") {
    return {
      [shoulderBone]: punchMirror(side, q(RigCalibration.shoulder.lift[intensity])),
      [armBone]: punchMirror(side, chamber.arm),
      [elbowBone]: punchMirror(side, chamber.elbow),
      [wristBone]: isRight
        ? q(RigCalibration.wrist.relaxedRight)
        : q(RigCalibration.wrist.relaxedLeft),
      [handTwistBone]: [0, 0, 0, 1],
      ...punchFistPose(side),
    };
  }

  const reach = intensity === "strong" ? 1 : intensity === "medium" ? 0.83 : 0.67;
  const arm = nlerp(chamber.arm, punchAngles.impact[style].arm, reach);
  const elbow = nlerp(chamber.elbow, punchAngles.impact[style].elbow, reach);

  const wrist =
    style === "hook"
      ? axisQuat(0, sign * 0.05, sign * 0.12)
      : style === "uppercut"
        ? axisQuat(-0.05, sign * 0.03, 0)
        : axisQuat(0, sign * 0.02, 0);

  return {
    [shoulderBone]: q(RigCalibration.shoulder.supportForward[intensity]),
    [armBone]: punchMirror(side, arm),
    [elbowBone]: punchMirror(side, elbow),
    [wristBone]: wrist,
    [handTwistBone]: style === "hook"
      ? axisQuat(0, sign * 0.12, sign * 0.08)
      : axisQuat(0, sign * 0.04, 0),
    ...punchFistPose(side),
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
    punchGuardPose(intensity),
    punchTorsoPose(side, intensity, style, phase),
    punchFistPose(otherSide),
    punchingArmPose(side, intensity, style, phase)
  );
}

export function punchPrimitive(
  side: Side,
  intensity: Intensity,
  style: PunchStyle = "straight"
): MotionPrimitive {
  const guard = mergeBones(guardPose(intensity), punchGuardPose(intensity), bothPunchFistsPose());
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
