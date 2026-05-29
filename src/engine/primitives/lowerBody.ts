import type { MotionAction } from "../MotionPlan";
import { Bones, RigCalibration, type Intensity } from "../RigCalibration";
import type { BoneMap, MotionPrimitive, PositionMap } from "./types";
import { axisQuat, neutral, q } from "./math";
import { mergeBones, mergePositions } from "./core";
import { handPose } from "./hands";
import { bodyLeanForward } from "./upperBody";

export function kneeBendPose(intensity: Intensity): BoneMap {
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

export function footBracePositions(intensity: Intensity): PositionMap {
  return {
    [Bones.rightFootIk]: [...RigCalibration.position.rightFootBrace[intensity]],
    [Bones.rightToeIk]: [...RigCalibration.position.rightFootBrace[intensity]],
    [Bones.leftFootIk]: [...RigCalibration.position.leftFootBrace[intensity]],
    [Bones.leftToeIk]: [...RigCalibration.position.leftFootBrace[intensity]],
  };
}

function crouchLevel(intensity: Intensity) {
  return intensity === "strong" ? 1.25 : intensity === "mild" ? 0.72 : 1;
}

export function crouchPose(intensity: Intensity): BoneMap {
  const amount = crouchLevel(intensity);
  const armIntensity = intensity === "strong" ? "medium" : "mild";

  return mergeBones(
    {
      [Bones.lowerBody]: axisQuat(0.04 * amount, 0, 0),
      [Bones.upperBody]: axisQuat(0.1 * amount, 0, 0),
      [Bones.upperBody1]: axisQuat(0.07 * amount, 0, 0),
      [Bones.upperBody2]: axisQuat(0.04 * amount, 0, 0),
      [Bones.head]: axisQuat(-0.05 * amount, 0, 0),

      [Bones.rightLegD]: axisQuat(-0.24 * amount, -0.03, -0.02),
      [Bones.leftLegD]: axisQuat(-0.24 * amount, 0.03, 0.02),
      [Bones.rightKneeD]: axisQuat(0.58 * amount, 0, 0),
      [Bones.leftKneeD]: axisQuat(0.58 * amount, 0, 0),
      [Bones.rightAnkleD]: axisQuat(0.24 * amount, 0, 0),
      [Bones.leftAnkleD]: axisQuat(0.24 * amount, 0, 0),
      [Bones.rightToe]: axisQuat(0.12 * amount, 0, 0),
      [Bones.leftToe]: axisQuat(0.12 * amount, 0, 0),
      [Bones.rightFootEx]: axisQuat(0.1 * amount, 0, 0),
      [Bones.leftFootEx]: axisQuat(0.1 * amount, 0, 0),

      [Bones.rightShoulder]: q(RigCalibration.shoulder.supportForward[armIntensity]),
      [Bones.leftShoulder]: q(RigCalibration.shoulder.supportForward[armIntensity]),
      [Bones.rightArm]: axisQuat(-0.18 * amount, 0.08, 0.04),
      [Bones.leftArm]: axisQuat(-0.18 * amount, -0.08, -0.04),
      [Bones.rightElbow]: q(RigCalibration.elbow.bend.right.mild),
      [Bones.leftElbow]: q(RigCalibration.elbow.bend.left.mild),
      [Bones.rightWrist]: q(RigCalibration.wrist.relaxedRight),
      [Bones.leftWrist]: q(RigCalibration.wrist.relaxedLeft),
    },
    bodyLeanForward(intensity),
    handPose("right", "open"),
    handPose("left", "open")
  );
}

export function crouchPositions(intensity: Intensity): PositionMap {
  const amount = crouchLevel(intensity);

  return mergePositions(
    {
      [Bones.center]: [0, -0.72 * amount, -0.08 * amount],
    },
    {
      [Bones.rightFootIk]: [0.12 * amount, 0, -0.03 * amount],
      [Bones.rightToeIk]: [0.12 * amount, 0, -0.03 * amount],
      [Bones.leftFootIk]: [-0.12 * amount, 0, -0.03 * amount],
      [Bones.leftToeIk]: [-0.12 * amount, 0, -0.03 * amount],
    }
  );
}

function runAmount(intensity: Intensity) {
  return intensity === "strong" ? 1.25 : intensity === "mild" ? 0.85 : 1;
}

function runArmSwingPose(
  rightForward: boolean,
  intensity: Intensity,
  swingScale = 1
): BoneMap {
  const amount = runAmount(intensity);
  const forward = -0.36 * amount * swingScale;
  const back = 0.24 * amount * swingScale;
  const tuck = 0.035 * amount;
  const elbow = intensity === "mild" ? "medium" : "strong";

  return {
    [Bones.rightShoulder]: axisQuat(0.015, rightForward ? -tuck : tuck, 0),
    [Bones.leftShoulder]: axisQuat(0.015, rightForward ? -tuck : tuck, 0),
    [Bones.rightArm]: axisQuat(
      rightForward ? forward : back,
      rightForward ? -tuck : tuck,
      rightForward ? 0.025 * amount : -0.018 * amount
    ),
    [Bones.leftArm]: axisQuat(
      rightForward ? back : forward,
      rightForward ? -tuck : tuck,
      rightForward ? 0.018 * amount : -0.025 * amount
    ),
    [Bones.rightElbow]: q(RigCalibration.elbow.bend.right[elbow]),
    [Bones.leftElbow]: q(RigCalibration.elbow.bend.left[elbow]),
    [Bones.rightWrist]: q(RigCalibration.wrist.relaxedRight),
    [Bones.leftWrist]: q(RigCalibration.wrist.relaxedLeft),
    ...handPose("right", "fist"),
    ...handPose("left", "fist"),
  };
}

function runLegPose(
  rightForward: boolean,
  intensity: Intensity,
  strideScale = 1,
  kneeScale = 1
): BoneMap {
  const amount = runAmount(intensity);
  const forwardThigh = -0.42 * amount * strideScale;
  const backThigh = 0.24 * amount * strideScale;
  const liftKnee = 0.52 * amount * kneeScale;
  const pushKnee = 0.22 * amount * (0.75 + kneeScale * 0.25);
  const ankle = 0.18 * amount;
  const toe = 0.16 * amount;

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
  intensity: Intensity,
  strideScale = 1,
  kneeScale = 1,
  bodyScale = 1
): BoneMap {
  const amount = runAmount(intensity);

  return mergeBones(
    {
      [Bones.lowerBody]: axisQuat(0, rightLegForward ? -0.04 : 0.04, 0),
      [Bones.upperBody]: axisQuat(0.12 * amount * bodyScale, rightLegForward ? 0.035 : -0.035, 0),
      [Bones.upperBody1]: axisQuat(0.09 * amount * bodyScale, rightLegForward ? 0.045 : -0.045, 0),
      [Bones.upperBody2]: axisQuat(0.05 * amount * bodyScale, rightLegForward ? 0.05 : -0.05, 0),
      [Bones.head]: axisQuat(-0.04 * amount * bodyScale, rightLegForward ? -0.012 : 0.012, 0),
    },
    runArmSwingPose(!rightLegForward, intensity, strideScale),
    runLegPose(rightLegForward, intensity, strideScale, kneeScale)
  );
}

function runPositions(
  rightLegForward: boolean,
  intensity: Intensity,
  liftScale = 0,
  strideScale = 1,
  dropScale = 1
): PositionMap {
  const amount = runAmount(intensity);
  const stride = 0.38 * amount * strideScale;
  const lateral = 0.07 * amount;
  const lift = 0.13 * amount * liftScale;
  const drop = 0.16 * amount * dropScale - lift * 0.45;

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

export function runForwardPrimitive(intensity: Intensity): MotionPrimitive {
  const amount = runAmount(intensity);
  const rightContact = runPose(true, intensity);
  const leftContact = runPose(false, intensity);
  const rightCompression = runPose(true, intensity, 0.82, 0.82, 0.9);
  const leftCompression = runPose(false, intensity, 0.82, 0.82, 0.9);
  const rightPassing = runPose(true, intensity, 0.28, 0.55, 0.65);
  const leftPassing = runPose(false, intensity, 0.28, 0.55, 0.65);
  const rightFlight = mergeBones(runPose(true, intensity, 1.05, 1.12, 1), {
    [Bones.rightKneeD]: axisQuat(0.54 * amount, 0, 0),
    [Bones.leftKneeD]: axisQuat(0.34 * amount, 0, 0),
  });
  const leftFlight = mergeBones(runPose(false, intensity, 1.05, 1.12, 1), {
    [Bones.rightKneeD]: axisQuat(0.34 * amount, 0, 0),
    [Bones.leftKneeD]: axisQuat(0.54 * amount, 0, 0),
  });

  return {
    loop: true,
    holdFinalPose: false,
    frames: [
      {
        progress: 0,
        bones: rightContact,
        positions: runPositions(true, intensity, 0, 1, 1),
      },
      {
        progress: 0.12,
        bones: rightCompression,
        positions: runPositions(true, intensity, 0, 0.82, 1.15),
      },
      {
        progress: 0.25,
        bones: rightPassing,
        positions: runPositions(true, intensity, 0.25, 0.32, 0.85),
      },
      {
        progress: 0.38,
        bones: rightFlight,
        positions: runPositions(true, intensity, 1, 1.05, 0.55),
      },
      {
        progress: 0.5,
        bones: leftContact,
        positions: runPositions(false, intensity, 0, 1, 1),
      },
      {
        progress: 0.62,
        bones: leftCompression,
        positions: runPositions(false, intensity, 0, 0.82, 1.15),
      },
      {
        progress: 0.75,
        bones: leftPassing,
        positions: runPositions(false, intensity, 0.25, 0.32, 0.85),
      },
      {
        progress: 0.88,
        bones: leftFlight,
        positions: runPositions(false, intensity, 1, 1.05, 0.55),
      },
      {
        progress: 1,
        bones: rightContact,
        positions: runPositions(true, intensity, 0, 1, 1),
      },
    ],
  };
}

export function stepPose(type: MotionAction["type"], intensity: Intensity): BoneMap {
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

export function stepPositions(
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
