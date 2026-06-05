import type { Intensity } from "./RigCalibration";
import type { FingerJointName, FingerName } from "./primitives";

export type MotionSide = "right" | "left" | "both";

export type BodyEffector =
  | "head"
  | "gaze"
  | "torso"
  | "hips"
  | "right_hand"
  | "left_hand"
  | "right_foot"
  | "left_foot";

export type BodyRegion =
  | "forward"
  | "front_of_face"
  | "front_of_chest"
  | "chest_center"
  | "waist"
  | "above_head"
  | "right_side_of_head"
  | "left_side_of_head"
  | "right_knee"
  | "left_knee"
  | "knees";

export type FacingTarget =
  | "viewer"
  | "forward"
  | "left"
  | "right"
  | "up"
  | "down";

export type MotionOperator =
  | {
      type: "move_effector";
      effector: BodyEffector;
      region: BodyRegion;
      intensity?: Intensity;
      startTime?: number;
      endTime?: number;
    }
  | {
      type: "orient_effector";
      effector: BodyEffector;
      facing: FacingTarget;
      intensity?: Intensity;
      startTime?: number;
      endTime?: number;
    }
  | {
      type: "hand_shape";
      side: MotionSide;
      shape: "relaxed" | "open" | "guard" | "fist" | "peace";
      startTime?: number;
      endTime?: number;
    }
  | {
      type: "finger";
      side: MotionSide;
      finger: FingerName | "all";
      curl?: number;
      spread?: number;
      twist?: number;
      joints?: [number, number, number] | Partial<Record<FingerJointName, number>>;
      startTime?: number;
      endTime?: number;
    }
  | {
      type: "look";
      target: FacingTarget;
      intensity?: Intensity;
      startTime?: number;
      endTime?: number;
    }
  | {
      type: "oscillate";
      effector: BodyEffector;
      axis: "horizontal" | "vertical" | "twist";
      cycles?: number;
      amplitude?: number;
      startTime?: number;
      endTime?: number;
    }
  | {
      type: "shift_weight";
      direction: "forward" | "back" | "left" | "right" | "down";
      intensity?: Intensity;
      startTime?: number;
      endTime?: number;
    };

export interface MotionProgram {
  duration: number;
  operators: MotionOperator[];
  holdFinalPose?: boolean;
  loop?: boolean;
}
