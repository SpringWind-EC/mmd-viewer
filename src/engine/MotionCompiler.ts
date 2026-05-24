import type { MotionPlan, MotionAction } from "./MotionPlan";

import {
  neutralArms,
  neutralTorso,
  twoArmsForward,
  rightArmForward,
  leftArmForward,
  bodyLeanForward,
  mergeBones,
} from "./MotionPrimitives";

import type { Intensity } from "./RigCalibration";

type Keyframe = {
  time: number;
  bones: Record<string, number[]>;
};

function compileAction(
  action: MotionAction
): Record<string, number[]> {
  const intensity: Intensity =
    action.intensity ?? "medium";

  switch (action.type) {
    case "two_arms_forward":
      return twoArmsForward(intensity);

    case "right_arm_forward":
      return rightArmForward(intensity);

    case "left_arm_forward":
      return leftArmForward(intensity);

    case "body_lean_forward":
      return bodyLeanForward(intensity);

    default:
      return {};
  }
}

export function compileMotionPlan(plan: MotionPlan) {
  const duration =
    plan.duration && plan.duration > 0
      ? plan.duration
      : 3;

  const startPose = mergeBones(
    neutralTorso(),
    neutralArms()
  );

  const finalPoseParts =
    plan.actions.map(compileAction);

  const finalPose =
    mergeBones(startPose, ...finalPoseParts);

  const keyframes: Keyframe[] = [
    {
      time: 0,
      bones: startPose,
    },
    {
      time: Math.min(duration * 0.55, duration - 0.4),
      bones: finalPose,
    },
    {
      time: duration,
      bones: finalPose,
    },
  ];

  return {
    duration,
    keyframes,
  };
}