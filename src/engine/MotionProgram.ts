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
      // Continue a moving foot from an explicit prior target without snapping
      // back to its rest target at the start of a new phase.
      from?: { right: number; up: number; forward: number };
      extendedReach?: boolean;
      startTime?: number;
      endTime?: number;
    }
  | {
      // Rotate the pelvis above separately controlled foot targets.
      type: "pose_pelvis";
      pitch?: number;
      yaw?: number;
      roll?: number;
      from?: { pitch?: number; yaw?: number; roll?: number };
      continuous?: boolean;
      startTime?: number;
      endTime?: number;
    }
  | {
      // Shape either part of the spine independently for curved torso poses.
      type: "pose_spine";
      segment: "base" | "lower" | "upper";
      pitch?: number;
      yaw?: number;
      roll?: number;
      from?: { pitch?: number; yaw?: number; roll?: number };
      continuous?: boolean;
      startTime?: number;
      endTime?: number;
    }
  | {
      // Set local foot orientation without moving its IK target.
      type: "pose_ankle";
      side: "right" | "left";
      pitch?: number;
      yaw?: number;
      roll?: number;
      startTime?: number;
      endTime?: number;
    }
  | {
      // Curl or point the toe independently of the ankle.
      type: "pose_toe";
      side: "right" | "left";
      curl: number;
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
      // Combined neck and head orientation in degrees. neckShare sets how
      // much of the turn is carried by the neck instead of the head bone.
      type: "pose_head";
      pitch?: number;
      yaw?: number;
      roll?: number;
      neckShare?: number;
      from?: { pitch?: number; yaw?: number; roll?: number };
      continuous?: boolean;
      startTime?: number;
      endTime?: number;
    }
  | {
      // Rotate the neck independently when the head counter-rotates to keep
      // the gaze stable through a body turn.
      type: "pose_neck";
      pitch?: number;
      yaw?: number;
      roll?: number;
      from?: { pitch?: number; yaw?: number; roll?: number };
      continuous?: boolean;
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
      // Independent upper-arm sweep, shoulder turn, side lift/tuck, and elbow flex in degrees.
      // Use when the arm's shape matters more than an exact hand target.
      type: "pose_arm";
      side: "right" | "left";
      forward?: number;
      outward?: number;
      shoulderYaw?: number;
      shoulderRoll?: number;
      shoulderShare?: number;
      // Explicit raised-arm range; distributes the lift through the shoulder.
      overhead?: boolean;
      // Axial rotation of the upper arm around its shoulder-to-elbow shaft.
      upperArmRoll?: number;
      flex?: number;
      // Turn the elbow's local bend axis within its XY plane.
      elbowPlane?: number;
      // Carry the arm through the entire interval instead of arriving early
      // and holding, for continuous elbow/shoulder paths.
      continuous?: boolean;
      // Optional local pose at the start of this clip, relative to the
      // segment's incoming pose. Enables a smooth second phase on one arm.
      from?: {
        forward?: number;
        outward?: number;
        shoulderYaw?: number;
        shoulderRoll?: number;
        shoulderShare?: number;
        upperArmRoll?: number;
        flex?: number;
        elbowPlane?: number;
      };
      startTime?: number;
      endTime?: number;
    }
  | {
      // Axial upper-arm roll, separate from wrist orientation, in degrees.
      type: "pose_forearm";
      side: "right" | "left";
      roll: number;
      startTime?: number;
      endTime?: number;
    }
  | {
      // Local wrist hinge and forearm-axis turn in degrees.
      type: "pose_wrist";
      side: "right" | "left";
      bend?: number;
      twist?: number;
      tilt?: number;
      from?: { bend?: number; twist?: number; tilt?: number };
      continuous?: boolean;
      startTime?: number;
      endTime?: number;
    }
  | {
      // Anatomical palm turn shared by the arm and hand twist bones, with bounded wrist tilt.
      type: "pose_palm";
      side: "right" | "left";
      turn: number;
      tilt?: number;
      bend?: number;
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
      finger: FingerName | "all" | "four_fingers";
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
  // Append this segment as relative changes to the previous program's final pose.
  continuePrevious?: boolean;
  holdFinalPose?: boolean;
  loop?: boolean;
}

export interface MotionSequence {
  segments: MotionProgram[];
}
