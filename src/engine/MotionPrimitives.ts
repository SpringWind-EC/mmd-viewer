import { RigCalibration} from "./RigCalibration";
import type { Intensity } from "./RigCalibration";

type BoneMap = Record<string, number[]>;

export function neutralArms(): BoneMap {
  return {
    右肩: [...RigCalibration.neutral],
    右腕: [...RigCalibration.neutral],
    右ひじ: [...RigCalibration.neutral],
    右手首: [...RigCalibration.neutral],

    左肩: [...RigCalibration.neutral],
    左腕: [...RigCalibration.neutral],
    左ひじ: [...RigCalibration.neutral],
    左手首: [...RigCalibration.neutral],
  };
}

export function rightArmForward(
  intensity: Intensity = "medium"
): BoneMap {
  return {
    右肩: [0.02, 0.1, 0.08, 0.99],
    右腕: [...RigCalibration.rightArm.forward[intensity]],
    右ひじ: [...RigCalibration.rightElbow.bend[intensity]],
    右手首: [0.04, -0.02, 0.03, 0.998],
  };
}

export function leftArmForward(
  intensity: Intensity = "medium"
): BoneMap {
  return {
    左肩: [0.02, 0.1, -0.08, 0.991],
    左腕: [...RigCalibration.leftArm.forward[intensity]],
    左ひじ: [...RigCalibration.leftElbow.bend[intensity]],
    左手首: [0.05, -0.02, 0.04, 0.9978],
  };
}

export function twoArmsForward(
  intensity: Intensity = "medium"
): BoneMap {
  return {
    ...rightArmForward(intensity),
    ...leftArmForward(intensity),
  };
}

export function bodyLeanForward(
  intensity: Intensity = "medium"
): BoneMap {
  if (intensity === "mild") {
    return {
      上半身: [0.015, 0, 0, 0.9998],
      上半身1: [0.02, 0, 0, 0.9996],
      上半身2: [0.025, 0, 0, 0.9995],
    };
  }

  if (intensity === "strong") {
    return {
      上半身: [0.05, 0, 0, 0.9987],
      上半身1: [0.055, 0, 0, 0.9984],
      上半身2: [0.06, 0, 0, 0.998],
    };
  }

  return {
    上半身: [0.03, 0, 0, 0.9995],
    上半身1: [0.035, 0, 0, 0.9993],
    上半身2: [0.04, 0, 0, 0.9992],
  };
}

export function neutralTorso(): BoneMap {
  return {
    上半身: [...RigCalibration.neutral],
    上半身1: [...RigCalibration.neutral],
    上半身2: [...RigCalibration.neutral],
  };
}

export function mergeBones(
  ...maps: BoneMap[]
): BoneMap {
  return Object.assign({}, ...maps);
}