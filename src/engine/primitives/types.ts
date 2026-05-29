import type { PositionArray, QuaternionArray } from "../RigCalibration";

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

export type Side = "right" | "left";
export type FingerName = "thumb" | "index" | "middle" | "ring" | "pinky";
export type FingerJointName = "base" | "middle" | "tip";
export type PunchStyle = "straight" | "jab" | "cross" | "hook" | "uppercut";
