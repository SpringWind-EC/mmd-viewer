import type { Intensity } from "./RigCalibration";

export type MotionActionType =
  | "neutral"
  | "two_arms_forward"
  | "right_arm_forward"
  | "left_arm_forward"
  | "reach_forward"
  | "right_punch"
  | "left_punch"
  | "right_jab"
  | "left_jab"
  | "right_cross"
  | "left_cross"
  | "right_hook"
  | "left_hook"
  | "right_uppercut"
  | "left_uppercut"
  | "right_fist"
  | "left_fist"
  | "both_fists"
  | "finger_control"
  | "guard"
  | "fighting_stance"
  | "bend_knees"
  | "crouch"
  | "body_lean_forward"
  | "body_lean_backward"
  | "bow"
  | "look_left"
  | "look_right"
  | "look_up"
  | "look_down"
  | "nod"
  | "shake_head"
  | "wave_right"
  | "wave_left"
  | "happy_greeting"
  | "dance_sway"
  | "idle_breathing"
  | "run_forward"
  | "step_forward"
  | "step_back"
  | "step_left"
  | "step_right";

export interface MotionAction {
  type: MotionActionType;
  intensity?: Intensity;
  startTime?: number;
  endTime?: number;
  side?: "right" | "left" | "both";
  finger?: "thumb" | "index" | "middle" | "ring" | "pinky" | "all";
  curl?: number;
  spread?: number;
  twist?: number;
  joints?:
    | [number, number, number]
    | {
        base?: number;
        middle?: number;
        tip?: number;
      };
}

export interface MotionPlan {
  duration: number;
  actions: MotionAction[];
  holdFinalPose?: boolean;
  loop?: boolean;
}
