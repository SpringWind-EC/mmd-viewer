import type { Intensity } from "./RigCalibration";

export type MotionActionType =
  | "two_arms_forward"
  | "right_arm_forward"
  | "left_arm_forward"
  | "body_lean_forward";

export interface MotionAction {
  type: MotionActionType;
  intensity?: Intensity;
  startTime?: number;
  endTime?: number;
}

export interface MotionPlan {
  duration: number;
  actions: MotionAction[];
  holdFinalPose?: boolean;
}