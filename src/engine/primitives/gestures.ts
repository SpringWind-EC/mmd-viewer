import { Bones, RigCalibration, type Intensity } from "../RigCalibration";
import type { MotionPrimitive } from "./types";
import { q } from "./math";
import { mergeBones } from "./core";
import { handPose } from "./hands";

export function wavePrimitive(
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
      isRight
        ? RigCalibration.elbow.bend.right[intensity]
        : RigCalibration.elbow.bend.left[intensity]
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

export function nodPrimitive(): MotionPrimitive {
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

export function shakeHeadPrimitive(): MotionPrimitive {
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

export function danceSwayPrimitive(): MotionPrimitive {
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

export function idleBreathingPrimitive(): MotionPrimitive {
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
