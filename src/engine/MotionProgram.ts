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
      // Model-space offsets in MMD units. Move the pelvis while planted foot IK
      // targets remain in place; the leg IK chain supplies the knee bend.
      type: "place_body";
      offset: { right: number; up: number; forward: number };
      startTime?: number;
      endTime?: number;
    }
  | {
      // Independent foot target, relative to its rest position in MMD units.
      type: "place_foot";
      side: "right" | "left";
      offset: { right: number; up: number; forward: number };
      startTime?: number;
      endTime?: number;
    }
  | {
      // Bounded torso rotation in degrees, relative to the pelvis.
      type: "pose_torso";
      pitch?: number;
      yaw?: number;
      roll?: number;
      startTime?: number;
      endTime?: number;
    }
  | {
      // Turn or tilt the whole body above the planted feet.
      type: "pose_waist";
      pitch?: number;
      yaw?: number;
      roll?: number;
      startTime?: number;
      endTime?: number;
    }
  | {
      // Combined neck and head orientation in degrees.
      type: "pose_head";
      pitch?: number;
      yaw?: number;
      roll?: number;
      startTime?: number;
      endTime?: number;
    }
  | {
      // Elbow flex with a lowered or otherwise un-targeted arm.
      type: "bend_elbow";
      side: "right" | "left";
      flex: number;
      startTime?: number;
      endTime?: number;
    }
  | {
      // Independent upper-arm sweep, side lift, and elbow flex in degrees.
      // Use when the arm's shape matters more than an exact hand target.
      type: "pose_arm";
      side: "right" | "left";
      forward?: number;
      outward?: number;
      flex?: number;
      startTime?: number;
      endTime?: number;
    }
  | {
      // Local wrist hinge and forearm-axis turn in degrees.
      type: "pose_wrist";
      side: "right" | "left";
      bend?: number;
      twist?: number;
      startTime?: number;
      endTime?: number;
    }
  | {
      type: "reach";
      effector: "right_hand" | "left_hand";
      anchor: "head" | "chest" | "hips";
      // Fractions of arm length in body-relative right/up/forward directions.
      offset: { right: number; up: number; forward: number };
      startTime?: number;
      endTime?: number;
    }
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
