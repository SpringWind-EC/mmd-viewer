import type { MotionAction } from "./MotionPlan";
import type { MotionOperator, MotionSide } from "./MotionProgram";
import { Bones, RigCalibration, type Intensity } from "./RigCalibration";
import {
  axisQuat,
  bodyLeanBackward,
  bodyLeanForward,
  bothHandsGuardFrontChestPrimitive,
  type ContactHoldSide,
  crouchPrimitive,
  fingerControlPose,
  type HandKneeMode,
  handOnKneePrimitive,
  handPose,
  headPose,
  mergeBones,
  peaceSignPose,
  posePrimitive,
  q,
  leftHandFrontChestPrimitive,
  leftReachForwardPrimitive,
  rightHandFrontChestPrimitive,
  rightReachForwardPrimitive,
  type BoneMap,
  type MotionPrimitive,
  type PositionMap,
} from "./primitives";

export type CompiledOperator = {
  primitive: MotionPrimitive;
  priority: number;
};

export type MotionOperatorContext = {
  crouchIntensity?: Intensity;
  crouchContactHoldSide?: ContactHoldSide;
  guardFrontChestRoleForOperator?: (
    operator: MotionOperator & { type: "move_effector" }
  ) => "driver" | "suppressed" | undefined;
  handKneeModeForOperator?: (
    operator: MotionOperator & { type: "move_effector" }
  ) => HandKneeMode;
};

function sideList(side: MotionSide): Array<"right" | "left"> {
  return side === "both" ? ["right", "left"] : [side];
}

function handShapePose(
  side: MotionSide,
  shape: "relaxed" | "open" | "guard" | "fist" | "peace"
): BoneMap {
  return sideList(side).reduce((pose, currentSide) => {
    const resolvedShape = shape === "guard" ? "fist" : shape;

    return mergeBones(
      pose,
      resolvedShape === "peace"
        ? peaceSignPose(currentSide)
        : handPose(currentSide, resolvedShape)
    );
  }, {} as BoneMap);
}

function raisedHandPose(
  side: "right" | "left",
  intensity: Intensity,
  region: MotionOperator & { type: "move_effector" }
): BoneMap {
  const isRight = side === "right";
  const shoulder = isRight ? Bones.rightShoulder : Bones.leftShoulder;
  const arm = isRight ? Bones.rightArm : Bones.leftArm;
  const armTarget = isRight
    ? RigCalibration.rightArm.waveUp[intensity]
    : RigCalibration.leftArm.waveUp[intensity];
  const sideSign = isRight ? 1 : -1;
  const armRotation =
    region.region === "right_side_of_head" || region.region === "left_side_of_head"
      ? axisQuat(armTarget[0] ?? 0, sideSign * 0.18, sideSign * 0.18)
      : q(armTarget);

  return {
    [shoulder]: q(RigCalibration.shoulder.lift[intensity]),
    [arm]: armRotation,
  };
}

function guardHandPose(side: "right" | "left", intensity: Intensity): BoneMap {
  const isRight = side === "right";

  return mergeBones({
    [isRight ? Bones.rightShoulder : Bones.leftShoulder]: q(
      RigCalibration.shoulder.lift[intensity]
    ),
    [isRight ? Bones.rightArm : Bones.leftArm]: q(
      isRight
        ? RigCalibration.rightArm.guard[intensity]
        : RigCalibration.leftArm.guard[intensity]
    ),
  }, bodyLeanForward(intensity));
}

function isGuardRegion(region: MotionOperator & { type: "move_effector" }) {
  return (
    region.region === "front_of_face" ||
    region.region === "front_of_chest" ||
    region.region === "chest_center"
  );
}

function isKneeRegion(region: MotionOperator & { type: "move_effector" }) {
  return (
    region.region === "right_knee" ||
    region.region === "left_knee" ||
    region.region === "knees"
  );
}

function handKneeSide(
  operator: MotionOperator & { type: "move_effector" }
): "right" | "left" | "both" | null {
  if (!isKneeRegion(operator)) {
    return null;
  }

  if (
    operator.effector === "right_hand" &&
    (operator.region === "right_knee" || operator.region === "knees")
  ) {
    return operator.region === "knees" ? "both" : "right";
  }

  if (
    operator.effector === "left_hand" &&
    (operator.region === "left_knee" || operator.region === "knees")
  ) {
    return operator.region === "knees" ? "both" : "left";
  }

  return null;
}

function moveEffectorPose(operator: MotionOperator & { type: "move_effector" }) {
  const intensity = operator.intensity ?? "medium";

  if (operator.effector === "right_hand") {
    if (isKneeRegion(operator)) {
      return {};
    }

    if (isGuardRegion(operator)) {
      return guardHandPose("right", intensity);
    }

    if (operator.region === "forward") {
      return {
        [Bones.rightShoulder]: q(RigCalibration.shoulder.supportForward[intensity]),
        [Bones.rightArm]: q(RigCalibration.rightArm.forward[intensity]),
      };
    }

    return raisedHandPose("right", intensity, operator);
  }

  if (operator.effector === "left_hand") {
    if (isKneeRegion(operator)) {
      return {};
    }

    if (isGuardRegion(operator)) {
      return guardHandPose("left", intensity);
    }

    if (operator.region === "forward") {
      return {
        [Bones.leftShoulder]: q(RigCalibration.shoulder.supportForward[intensity]),
        [Bones.leftArm]: q(RigCalibration.leftArm.forward[intensity]),
      };
    }

    return raisedHandPose("left", intensity, operator);
  }

  if (operator.effector === "torso" && operator.region === "forward") {
    return bodyLeanForward(intensity);
  }

  return {};
}

function orientEffectorPose(
  operator: MotionOperator & { type: "orient_effector" }
) {
  const intensity = operator.intensity ?? "medium";
  const amount = intensity === "strong" ? 0.14 : intensity === "mild" ? 0.05 : 0.09;
  const vertical =
    operator.facing === "up" ? -amount : operator.facing === "down" ? amount : 0;
  const horizontal =
    operator.facing === "left" ? amount : operator.facing === "right" ? -amount : 0;

  if (operator.effector === "head" || operator.effector === "gaze") {
    if (operator.facing === "left") {
      return headPose("look_left", intensity);
    }

    if (operator.facing === "right") {
      return headPose("look_right", intensity);
    }

    if (operator.facing === "up") {
      return headPose("look_up", intensity);
    }

    if (operator.facing === "down") {
      return headPose("look_down", intensity);
    }

    // A front-facing head is an explicit pose so a later operator can recenter it.
    return headPose("forward", intensity);
  }

  if (operator.effector === "right_hand") {
    return {
      [Bones.rightWrist]: axisQuat(vertical, horizontal, 0),
    };
  }

  if (operator.effector === "left_hand") {
    return {
      [Bones.leftWrist]: axisQuat(vertical, horizontal, 0),
    };
  }

  return {};
}

function lookPose(target: MotionOperator & { type: "look" }) {
  const intensity = target.intensity ?? "medium";
  if (target.target === "left") {
    return headPose("look_left", intensity);
  }

  if (target.target === "right") {
    return headPose("look_right", intensity);
  }

  if (target.target === "up") {
    return headPose("look_up", intensity);
  }

  if (target.target === "down") {
    return headPose("look_down", intensity);
  }

  // The stage's neutral model direction faces its front camera/viewer.
  return headPose("forward", intensity);
}

function shiftWeightPose(
  operator: MotionOperator & { type: "shift_weight" }
): { bones: BoneMap; positions?: PositionMap } {
  const intensity = operator.intensity ?? "medium";
  const forward = RigCalibration.position.centerForward[intensity];

  if (operator.direction === "forward") {
    return {
      bones: bodyLeanForward(intensity, 0.45),
      positions: {
        [Bones.center]: [...forward],
      },
    };
  }

  if (operator.direction === "back") {
    return {
      bones: bodyLeanBackward(intensity, 0.55),
      positions: { [Bones.center]: [0, 0, -forward[2]] },
    };
  }

  const amount = intensity === "strong" ? 0.42 : intensity === "mild" ? 0.14 : 0.27;
  const sign = operator.direction === "left" ? 1 : -1;

  return {
    bones: {
      [Bones.upperBody]: axisQuat(0, 0, -sign * amount * 0.1),
    },
    positions: {
      [Bones.center]: [sign * amount, 0, 0],
    },
  };
}

function oscillationBone(operator: MotionOperator & { type: "oscillate" }) {
  if (operator.effector === "right_hand") {
    return Bones.rightWrist;
  }

  if (operator.effector === "left_hand") {
    return Bones.leftWrist;
  }

  if (operator.effector === "head" || operator.effector === "gaze") {
    return Bones.head;
  }

  if (operator.effector === "torso") {
    return Bones.upperBody;
  }

  return undefined;
}

function oscillationPrimitive(
  operator: MotionOperator & { type: "oscillate" }
): MotionPrimitive {
  const bone = oscillationBone(operator);

  if (!bone) {
    return posePrimitive({});
  }

  const cycles = Math.max(1, Math.min(5, Math.round(operator.cycles ?? 2)));
  const amplitude = Math.max(0, Math.min(1, operator.amplitude ?? 0.25));
  const frames = Array.from({ length: cycles * 2 + 1 }, (_, index) => {
    const progress = index / (cycles * 2);
    const direction = index % 2 === 0 ? 1 : -1;
    const amount = amplitude * 0.4 * direction;
    const rotation =
      operator.axis === "vertical"
        ? axisQuat(amount, 0, 0)
        : operator.axis === "twist"
          ? axisQuat(0, amount, 0)
          : axisQuat(0, 0, amount);

    return {
      progress,
      bones: {
        [bone]: rotation,
      },
    };
  });

  return {
    holdFinalPose: false,
    frames: [
      { progress: 0, bones: {} },
      ...frames.slice(1, -1),
      { progress: 1, bones: {} },
    ],
  };
}

export function compileMotionOperator(
  operator: MotionOperator,
  context: MotionOperatorContext = {}
): CompiledOperator {
  switch (operator.type) {
    case "move_effector": {
      const guardFrontChestRole =
        context.guardFrontChestRoleForOperator?.(operator);

      if (guardFrontChestRole === "driver") {
        return {
          primitive: bothHandsGuardFrontChestPrimitive(
            operator.intensity ?? "medium"
          ),
          priority: 20,
        };
      }

      if (guardFrontChestRole === "suppressed") {
        return {
          primitive: posePrimitive({}),
          priority: 20,
        };
      }

      const handKnee = handKneeSide(operator);

      if (handKnee) {
        return {
          primitive: handOnKneePrimitive(
            handKnee,
            context.crouchIntensity ?? operator.intensity ?? "medium",
            context.handKneeModeForOperator?.(operator) ??
              (context.crouchIntensity !== undefined ? "crouched" : "standing")
          ),
          priority: 20,
        };
      }

      if (operator.effector === "right_hand" && operator.region === "forward") {
        return {
          primitive: rightReachForwardPrimitive(operator.intensity ?? "medium"),
          priority: 20,
        };
      }

      if (
        operator.effector === "right_hand" &&
        (operator.region === "front_of_chest" || operator.region === "chest_center")
      ) {
        return {
          primitive: rightHandFrontChestPrimitive(operator.intensity ?? "medium"),
          priority: 20,
        };
      }

      if (operator.effector === "left_hand" && operator.region === "forward") {
        return {
          primitive: leftReachForwardPrimitive(operator.intensity ?? "medium"),
          priority: 20,
        };
      }

      if (
        operator.effector === "left_hand" &&
        (operator.region === "front_of_chest" || operator.region === "chest_center")
      ) {
        return {
          primitive: leftHandFrontChestPrimitive(operator.intensity ?? "medium"),
          priority: 20,
        };
      }

      return {
        primitive: posePrimitive(moveEffectorPose(operator)),
        priority: 20,
      };
    }
    case "orient_effector":
      return {
        primitive: posePrimitive(orientEffectorPose(operator)),
        priority: 25,
      };
    case "hand_shape":
      return {
        primitive: posePrimitive(handShapePose(operator.side, operator.shape)),
        priority: 30,
      };
    case "finger":
      return {
        primitive: posePrimitive(
          fingerControlPose({
            type: "finger_control",
            side: operator.side,
            finger: operator.finger,
            curl: operator.curl,
            spread: operator.spread,
            twist: operator.twist,
            joints: operator.joints,
          } satisfies MotionAction)
        ),
        priority: 40,
      };
    case "look":
      return {
        primitive: posePrimitive(lookPose(operator)),
        priority: 15,
      };
    case "oscillate":
      return {
        primitive: oscillationPrimitive(operator),
        priority: 45,
      };
    case "shift_weight": {
      if (operator.direction === "down") {
        return {
          primitive: crouchPrimitive(
            operator.intensity ?? "medium",
            context.crouchContactHoldSide
          ),
          priority: 10,
        };
      }

      const pose = shiftWeightPose(operator);

      return {
        primitive: posePrimitive(pose.bones, true, pose.positions),
        priority: 10,
      };
    }
    default:
      return {
        primitive: posePrimitive({}),
        priority: 0,
      };
  }
}
