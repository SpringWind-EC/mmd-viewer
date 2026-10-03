import { Bones, RigCalibration, type Intensity, type QuaternionArray } from "../RigCalibration";
import type { BoneMap, MotionPrimitive, Side } from "./types";
import { axisQuat, neutral, nlerp, q } from "./math";
import { mergeBones } from "./core";
import { handPose, peaceSignPose } from "./hands";
import { headMotionScale, headPose } from "./upperBody";

const raisedArm = {
  shoulder: [0.02, 0.03, 0, 0.99935],
  wave: {
    arm: [-0.20934, 0.24714, -0.54524, 0.77318],
    elbow: [-0.11233, 0.13712, -0.4774, 0.86062],
  },
  photo: {
    arm: [-0.22085, 0.25634, -0.44284, 0.83031],
    elbow: [-0.1951, 0.24073, -0.58251, 0.75144],
  },
} satisfies { shoulder: QuaternionArray; wave: { arm: QuaternionArray; elbow: QuaternionArray }; photo: { arm: QuaternionArray; elbow: QuaternionArray } };

// The photo pose holds its palm beside the face and toward the camera.
const photoWrist: Record<Intensity, QuaternionArray> = {
  mild: [-0.1463, -0.16402, -0.24333, 0.94471],
  medium: [-0.05414, -0.2147, -0.13208, 0.96619],
  strong: [0.02025, -0.24984, -0.03928, 0.96728],
};

function raisedArmPose(side: Side, intensity: Intensity, kind: "wave" | "photo"): BoneMap {
  const right = side === "right";
  const amount = intensity === "strong" ? 1 : intensity === "medium" ? 0.9 : 0.78;
  const mirror = (values: QuaternionArray): QuaternionArray => right
    ? [...values]
    : [values[0], -values[1], -values[2], values[3]];
  return {
    [right ? Bones.rightShoulder : Bones.leftShoulder]: nlerp(neutral, mirror(raisedArm.shoulder), amount),
    [right ? Bones.rightArm : Bones.leftArm]: nlerp(neutral, mirror(raisedArm[kind].arm), amount),
    [right ? Bones.rightElbow : Bones.leftElbow]: nlerp(neutral, mirror(raisedArm[kind].elbow), amount),
  };
}

export function wavePrimitive(
  side: "right" | "left",
  intensity: Intensity
): MotionPrimitive {
  const isRight = side === "right";
  const wristA = isRight
    ? RigCalibration.wrist.waveRightA
    : RigCalibration.wrist.waveLeftA;
  const wristB = isRight
    ? RigCalibration.wrist.waveRightB
    : RigCalibration.wrist.waveLeftB;

  const raised = mergeBones(raisedArmPose(side, intensity, "wave"), handPose(side, "open"));

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

export function photoPeacePrimitive(
  side: "right" | "left",
  intensity: Intensity
): MotionPrimitive {
  const isRight = side === "right";
  const wrist = isRight
    ? photoWrist[intensity]
    : [photoWrist[intensity][0], -photoWrist[intensity][1], -photoWrist[intensity][2], photoWrist[intensity][3]] as QuaternionArray;
  const sign = isRight ? 1 : -1;

  const raisedPeace = mergeBones(
    {
      [isRight ? Bones.rightWrist : Bones.leftWrist]: q(wrist),
      [Bones.head]: q(isRight ? RigCalibration.head.lookLeft : RigCalibration.head.lookRight),
    },
    raisedArmPose(side, intensity, "photo"),
    peaceSignPose(side),
    {
      [isRight ? Bones.rightIndex1 : Bones.leftIndex1]: axisQuat(-0.22, sign * 0.19, sign * 0.08),
      [isRight ? Bones.rightMiddle1 : Bones.leftMiddle1]: axisQuat(0.22, -sign * 0.18, -sign * 0.04),
    }
  );

  return {
    holdFinalPose: true,
    holdProgress: 1,
    frames: [
      { progress: 0, bones: {} },
      { progress: 0.35, bones: raisedPeace },
      { progress: 1, bones: raisedPeace },
    ],
  };
}

export function nodPrimitive(intensity: Intensity = "medium"): MotionPrimitive {
  const amount = headMotionScale(intensity);
  return {
    holdFinalPose: false,
    frames: [
      { progress: 0, bones: {} },
      { progress: 0.3, bones: { [Bones.head]: nlerp(neutral, q(RigCalibration.head.nodDown), amount) } },
      { progress: 0.6, bones: { [Bones.head]: nlerp(neutral, q(RigCalibration.head.nodUp), amount) } },
      { progress: 1, bones: {} },
    ],
  };
}

export function shakeHeadPrimitive(intensity: Intensity = "medium"): MotionPrimitive {
  return {
    holdFinalPose: false,
    frames: [
      { progress: 0, bones: {} },
      { progress: 0.25, bones: headPose("look_left", intensity) },
      { progress: 0.5, bones: headPose("look_right", intensity) },
      { progress: 0.75, bones: headPose("look_left", intensity) },
      { progress: 1, bones: {} },
    ],
  };
}

export function danceSwayPrimitive(intensity: Intensity = "medium"): MotionPrimitive {
  const amplitude = intensity === "strong" ? 1 : intensity === "mild" ? 0.55 : 0.8;
  const sway = (rotation: QuaternionArray) => nlerp(neutral, q(rotation), amplitude);
  const travel = 0.24 * amplitude;
  return {
    loop: true,
    holdFinalPose: false,
    frames: [
      { progress: 0, bones: {} },
      {
        progress: 0.25,
        bones: {
          [Bones.upperBody]: sway(RigCalibration.torso.swayRight),
          [Bones.lowerBody]: sway(RigCalibration.torso.twistRight),
        },
        positions: { [Bones.center]: [travel, 0, 0] },
      },
      { progress: 0.5, bones: {} },
      {
        progress: 0.75,
        bones: {
          [Bones.upperBody]: sway(RigCalibration.torso.swayLeft),
          [Bones.lowerBody]: sway(RigCalibration.torso.twistLeft),
        },
        positions: { [Bones.center]: [-travel, 0, 0] },
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
