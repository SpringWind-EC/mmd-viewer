import type { MotionAction } from "../MotionPlan";
import { Bones, RigCalibration, type Intensity } from "../RigCalibration";
import type { BoneMap } from "./types";
import { q } from "./math";
import { mergeBones } from "./core";
import { bothHandsPose } from "./hands";

export function rightArmForwardPose(intensity: Intensity): BoneMap {
  return {
    [Bones.rightShoulder]: q(RigCalibration.shoulder.supportForward[intensity]),
    [Bones.rightArm]: q(RigCalibration.rightArm.forward[intensity]),
    [Bones.rightElbow]: q(RigCalibration.elbow.bend.right[intensity]),
    [Bones.rightWrist]: q(RigCalibration.wrist.relaxedRight),
  };
}

export function leftArmForwardPose(intensity: Intensity): BoneMap {
  return {
    [Bones.leftShoulder]: q(RigCalibration.shoulder.supportForward[intensity]),
    [Bones.leftArm]: q(RigCalibration.leftArm.forward[intensity]),
    [Bones.leftElbow]: q(RigCalibration.elbow.bend.left[intensity]),
    [Bones.leftWrist]: q(RigCalibration.wrist.relaxedLeft),
  };
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

export function bodyLeanBackward(intensity: Intensity): BoneMap {
  return {
    [Bones.upperBody]: q(RigCalibration.torso.backward[intensity]),
    [Bones.upperBody1]: q(RigCalibration.torso.backward[intensity]),
  };
}

export function headPose(type: MotionAction["type"]): BoneMap {
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
