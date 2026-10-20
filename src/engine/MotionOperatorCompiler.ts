import type { MotionAction } from "./MotionPlan";
import * as THREE from "three";
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
  kneeBendPose,
  mergeBones,
  nlerp,
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
  continuingSegment?: boolean;
  bodyHasKneeSeedForFoot?: (operator: MotionOperator & { type: "place_foot" }) => boolean;
  crouchIntensity?: Intensity;
  crouchContactHoldSide?: ContactHoldSide;
  guardFrontChestRoleForOperator?: (
    operator: MotionOperator & { type: "move_effector" }
  ) => "driver" | "suppressed" | undefined;
  handKneeModeForOperator?: (
    operator: MotionOperator & { type: "move_effector" }
  ) => HandKneeMode;
  handOscillationHasDrivenElbow?: (
    operator: MotionOperator & { type: "oscillate" }
  ) => boolean;
};

function sideList(side: MotionSide): Array<"right" | "left"> {
  return side === "both" ? ["right", "left"] : [side];
}

function bodyAngleQuat(pitch = 0, yaw = 0, roll = 0, fraction = 1) {
  const toRadians = THREE.MathUtils.degToRad;
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    toRadians(pitch * fraction),
    -toRadians(yaw * fraction),
    toRadians(roll * fraction),
    "XYZ"
  ));
  return [rotation.x, rotation.y, rotation.z, rotation.w] as [number, number, number, number];
}

function armJointAxis(side: "right" | "left") {
  // PMX upper arms slope away from the torso in the bind pose. A hinge
  // perpendicular to that slope raises the arm forward without axial twist.
  return new THREE.Vector3(-0.6745, side === "right" ? 0.738 : -0.738, 0).normalize();
}

function forearmHingeAxis(side: "right" | "left") {
  return new THREE.Vector3(-0.6201, side === "right" ? 0.7845 : -0.7845, 0).normalize();
}

function forearmTwistAxis(side: "right" | "left") {
  return new THREE.Vector3(side === "right" ? -0.7845 : 0.7845, -0.6201, 0).normalize();
}

function axisAngle(axis: THREE.Vector3, degrees: number) {
  const rotation = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(degrees));
  return [rotation.x, rotation.y, rotation.z, rotation.w] as [number, number, number, number];
}

function armSweepRotation(side: "right" | "left", forward: number, outward: number, fraction: number) {
  const forwardRotation = new THREE.Quaternion().setFromAxisAngle(
    armJointAxis(side), THREE.MathUtils.degToRad(forward * fraction)
  );
  const outwardRotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, side === "right" ? -1 : 1),
    THREE.MathUtils.degToRad(outward * fraction)
  );
  const rotation = outwardRotation.multiply(forwardRotation);
  return [rotation.x, rotation.y, rotation.z, rotation.w] as [number, number, number, number];
}

function transitionPose(to: BoneMap, from?: BoneMap, continuous = false): MotionPrimitive {
  if (!from) return continuous
    ? { holdFinalPose: true, frames: [
      { progress: 0, bones: {} },
      { progress: 1, bones: to },
      { progress: 1, bones: to },
    ] }
    : posePrimitive(to);
  return {
    holdFinalPose: true,
    frames: continuous
      ? [{ progress: 0, bones: from }, { progress: 1, bones: to }]
      : [
        { progress: 0, bones: from },
        { progress: 0.65, bones: to },
        { progress: 1, bones: to },
      ],
  };
}

type ArmPoseAngles = {
  forward?: number;
  outward?: number;
  shoulderYaw?: number;
  shoulderRoll?: number;
  shoulderShare?: number;
  upperArmRoll?: number;
  flex?: number;
  elbowPlane?: number;
};

function armPose(side: "right" | "left", angles: ArmPoseAngles): BoneMap {
  const isRight = side === "right";
  const shoulderShare = angles.shoulderShare ?? 0.12;
  const shoulderSweep = armSweepRotation(side, angles.forward ?? 0, angles.outward ?? 0, shoulderShare);
  const shoulderTurn = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-(angles.shoulderYaw ?? 0)))
    .multiply(new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      THREE.MathUtils.degToRad((isRight ? -1 : 1) * (angles.shoulderRoll ?? 0))
    ))
    .multiply(new THREE.Quaternion(...shoulderSweep));
  const upperArmShaft = new THREE.Vector3(
    isRight ? -0.738 : 0.738, -0.6745, -0.0224
  ).normalize();
  const armTurn = new THREE.Quaternion(...armSweepRotation(
    side, angles.forward ?? 0, angles.outward ?? 0, 1 - shoulderShare
  )).multiply(new THREE.Quaternion().setFromAxisAngle(
    upperArmShaft, THREE.MathUtils.degToRad(angles.upperArmRoll ?? 0)
  ));
  const elbowAxis = forearmHingeAxis(side).applyAxisAngle(
    new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(angles.elbowPlane ?? 0)
  );
  return {
    [isRight ? Bones.rightShoulder : Bones.leftShoulder]:
      [shoulderTurn.x, shoulderTurn.y, shoulderTurn.z, shoulderTurn.w],
    [isRight ? Bones.rightArm : Bones.leftArm]:
      [armTurn.x, armTurn.y, armTurn.z, armTurn.w],
    [isRight ? Bones.rightElbow : Bones.leftElbow]:
      axisAngle(elbowAxis, angles.flex ?? 0),
  };
}

type WristPoseAngles = { bend?: number; twist?: number; tilt?: number };

function wristPose(side: "right" | "left", angles: WristPoseAngles): BoneMap {
  const isRight = side === "right";
  const twistAxis = forearmTwistAxis(side);
  const wristRotation = new THREE.Quaternion()
    .setFromAxisAngle(forearmHingeAxis(side), THREE.MathUtils.degToRad(angles.bend ?? 0))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(angles.tilt ?? 0)))
    .multiply(new THREE.Quaternion().setFromAxisAngle(twistAxis, THREE.MathUtils.degToRad((angles.twist ?? 0) * 0.3)));
  return {
    [isRight ? Bones.rightHandTwist : Bones.leftHandTwist]: axisAngle(twistAxis, (angles.twist ?? 0) * 0.7),
    [isRight ? Bones.rightWrist : Bones.leftWrist]:
      [wristRotation.x, wristRotation.y, wristRotation.z, wristRotation.w],
  };
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

function raisedHandPose(side: "right" | "left", intensity: Intensity, region: MotionOperator & { type: "move_effector" }): BoneMap {
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
      return mergeBones({ [Bones.neck]: [0, 0, 0, 1] }, headPose("look_left", intensity));
    }

    if (operator.facing === "right") {
      return mergeBones({ [Bones.neck]: [0, 0, 0, 1] }, headPose("look_right", intensity));
    }

    if (operator.facing === "up") {
      return mergeBones({ [Bones.neck]: [0, 0, 0, 1] }, headPose("look_up", intensity));
    }

    if (operator.facing === "down") {
      return mergeBones({ [Bones.neck]: [0, 0, 0, 1] }, headPose("look_down", intensity));
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
    return mergeBones({ [Bones.neck]: [0, 0, 0, 1] }, headPose("look_left", intensity));
  }

  if (target.target === "right") {
    return mergeBones({ [Bones.neck]: [0, 0, 0, 1] }, headPose("look_right", intensity));
  }

  if (target.target === "up") {
    return mergeBones({ [Bones.neck]: [0, 0, 0, 1] }, headPose("look_up", intensity));
  }

  if (target.target === "down") {
    return mergeBones({ [Bones.neck]: [0, 0, 0, 1] }, headPose("look_down", intensity));
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
  operator: MotionOperator & { type: "oscillate" },
  hasDrivenElbow = false
): MotionPrimitive {
  const bone = oscillationBone(operator);

  if (!bone) {
    return posePrimitive({});
  }

  const cycles = Math.max(1, Math.min(5, Math.round(operator.cycles ?? 2)));
  const amplitude = Math.max(0, Math.min(1, operator.amplitude ?? 0.25));
  const handSide = operator.effector === "right_hand" ? "right" : operator.effector === "left_hand" ? "left" : undefined;
  const frames = Array.from({ length: cycles * 2 + 1 }, (_, index) => {
    const progress = index / (cycles * 2);
    const direction = index % 2 === 0 ? 1 : -1;
    if (handSide) {
      const isRight = handSide === "right";
      const wrist = isRight ? Bones.rightWrist : Bones.leftWrist;
      const elbow = isRight ? Bones.rightElbow : Bones.leftElbow;
      const handTwist = isRight ? Bones.rightHandTwist : Bones.leftHandTwist;
      const sideSign = isRight ? 1 : -1;
      const wave = amplitude * direction;
      const wristRotation = operator.axis === "vertical"
        ? axisQuat(wave * 0.12, 0, 0)
        : operator.axis === "twist"
          ? axisQuat(0, sideSign * wave * 0.08, 0)
          : axisQuat(0, 0, sideSign * wave * 0.12);
      return {
        progress,
        bones: operator.axis === "twist"
          ? { [wrist]: wristRotation, [handTwist]: axisQuat(0, sideSign * wave * 0.08, 0) }
          : hasDrivenElbow
            ? { [wrist]: wristRotation, [handTwist]: operator.axis === "vertical"
                ? axisQuat(wave * 0.06, 0, 0)
                : axisQuat(0, 0, sideSign * wave * 0.06) }
            : { [wrist]: wristRotation, [elbow]: axisQuat(-amplitude * (0.1 + direction * 0.04), 0, 0) },
      };
    }

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
    case "place_body": {
      if (operator.offset.up >= 0) {
        return {
          primitive: posePrimitive({}, true, {
            [Bones.center]: [-operator.offset.right, operator.offset.up, operator.offset.forward],
          }),
          priority: 5,
        };
      }
      // Use the rig-calibrated center descent and knee seed as a continuous
      // curve. The requested spatial offset still determines the final pose.
      const descent = crouchPrimitive("strong");
      const firstY = descent.frames[0].positions?.[Bones.center]?.[1] ?? 0;
      const lastY = descent.frames.at(-1)?.positions?.[Bones.center]?.[1] ?? -3.48;
      const bend = Math.min(1, -operator.offset.up / 3.2);
      return {
        primitive: {
          holdFinalPose: true,
          frames: descent.frames.map((frame) => {
            const y = frame.positions?.[Bones.center]?.[1] ?? 0;
            const fraction = THREE.MathUtils.clamp((y - firstY) / (lastY - firstY), 0, 1);
            return {
              progress: frame.progress,
              bones: Object.fromEntries(Object.entries(frame.bones).map(([name, rotation]) => [
                name, nlerp([0, 0, 0, 1], rotation, bend),
              ])),
              positions: {
                [Bones.center]: [
                  -operator.offset.right * fraction,
                  operator.offset.up * fraction,
                  operator.offset.forward * fraction,
                ] as [number, number, number],
              },
            };
          }),
        },
        priority: 5,
      };
    }
    case "place_foot": {
      const foot = operator.side === "right" ? Bones.rightFootIk : Bones.leftFootIk;
      const toe = operator.side === "right" ? Bones.rightToeIk : Bones.leftToeIk;
      const offset: [number, number, number] = [
        -operator.offset.right, operator.offset.up, operator.offset.forward,
      ];
      const from: [number, number, number] | undefined = operator.from && [
        -operator.from.right, operator.from.up, operator.from.forward,
      ];
      const kneeSeed = kneeBendPose("mild");
      const leg = operator.side === "right" ? Bones.rightLeg : Bones.leftLeg;
      const knee = operator.side === "right" ? Bones.rightKnee : Bones.leftKnee;
      const bones = operator.offset.up > 0.05 && !context.bodyHasKneeSeedForFoot?.(operator)
        ? { [leg]: kneeSeed[leg], [knee]: kneeSeed[knee] }
        : {};
      return {
        primitive: from ? {
          holdFinalPose: true,
          frames: [
            { progress: 0, bones, positions: { [foot]: from, [toe]: from } },
            { progress: 0.65, bones, positions: { [foot]: offset, [toe]: offset } },
            { progress: 1, bones, positions: { [foot]: offset, [toe]: offset } },
          ],
        } : posePrimitive(bones, true, { [foot]: offset, [toe]: offset }),
        priority: 6,
      };
    }
    case "pose_pelvis":
      return {
        primitive: transitionPose({
          [Bones.lowerBody]: bodyAngleQuat(operator.pitch, operator.yaw, operator.roll),
        }, operator.from ? { [Bones.lowerBody]: bodyAngleQuat(operator.from.pitch, operator.from.yaw, operator.from.roll) } : undefined,
        operator.continuous),
        priority: 8,
      };
    case "pose_spine":
      return {
        primitive: transitionPose({
          [operator.segment === "base" ? Bones.upperBody
            : operator.segment === "lower" ? Bones.upperBody1 : Bones.upperBody2]:
            bodyAngleQuat(operator.pitch, operator.yaw, operator.roll),
        }, operator.from ? {
          [operator.segment === "base" ? Bones.upperBody
            : operator.segment === "lower" ? Bones.upperBody1 : Bones.upperBody2]:
            bodyAngleQuat(operator.from.pitch, operator.from.yaw, operator.from.roll),
        } : undefined, operator.continuous),
        priority: 12,
      };
    case "pose_ankle":
      return {
        primitive: posePrimitive({
          // The IK controller's rotation does not turn this rig's shoe. Drive
          // the ankle bone after the IK target is positioned so pitch, yaw,
          // and roll actually affect the visible foot.
          [operator.side === "right" ? Bones.rightAnkle : Bones.leftAnkle]:
            bodyAngleQuat(operator.pitch, operator.yaw, operator.roll),
        }),
        priority: 16,
      };
    case "pose_toe":
      return {
        primitive: posePrimitive({
          [operator.side === "right" ? Bones.rightFootEx : Bones.leftFootEx]:
            bodyAngleQuat(operator.curl),
        }),
        priority: 17,
      };
    case "pose_torso": {
      return {
        primitive: posePrimitive({
          [Bones.upperBody1]: bodyAngleQuat(operator.pitch, operator.yaw, operator.roll, 0.65),
          [Bones.upperBody2]: bodyAngleQuat(operator.pitch, operator.yaw, operator.roll, 0.35),
        }),
        priority: 12,
      };
    }
    case "pose_waist":
      return {
        primitive: posePrimitive({
          [Bones.waist]: bodyAngleQuat(operator.pitch, operator.yaw, operator.roll),
        }),
        priority: 8,
      };
    case "pose_head": {
      const neckShare = operator.neckShare ?? 0.3;
      return {
        primitive: transitionPose({
          ...(neckShare > 0 ? { [Bones.neck]: bodyAngleQuat(operator.pitch, operator.yaw, operator.roll, neckShare) } : {}),
          [Bones.head]: bodyAngleQuat(operator.pitch, operator.yaw, operator.roll, 1 - neckShare),
        }, operator.from ? {
          ...(neckShare > 0 ? { [Bones.neck]: bodyAngleQuat(operator.from.pitch, operator.from.yaw, operator.from.roll, neckShare) } : {}),
          [Bones.head]: bodyAngleQuat(operator.from.pitch, operator.from.yaw, operator.from.roll, 1 - neckShare),
        } : undefined, operator.continuous),
        priority: 15,
      };
    }
    case "pose_neck":
      return {
        primitive: transitionPose({
          [Bones.neck]: bodyAngleQuat(operator.pitch, operator.yaw, operator.roll),
        }, operator.from ? { [Bones.neck]: bodyAngleQuat(operator.from.pitch, operator.from.yaw, operator.from.roll) } : undefined,
        operator.continuous),
        priority: 15,
      };
    case "bend_elbow": {
      const elbow = operator.side === "right" ? Bones.rightElbow : Bones.leftElbow;
      const arm = operator.side === "right" ? Bones.rightArm : Bones.leftArm;
      const shoulder = operator.side === "right" ? Bones.rightShoulder : Bones.leftShoulder;
      // The forearms slope outward and down in the bind pose. Rotating around
      // X would also rotate around that slope, visibly twisting the forearm.
      // These mirrored hinge axes are perpendicular to each rest forearm and
      // bring the hand forward as the elbow flexes.
      return {
        primitive: posePrimitive({
          [shoulder]: [0, 0, 0, 1],
          [arm]: [0, 0, 0, 1],
          [elbow]: axisAngle(forearmHingeAxis(operator.side), operator.flex),
        }),
        priority: 20,
      };
    }
    case "pose_arm": {
      return {
        primitive: transitionPose(armPose(operator.side, operator),
          operator.from ? armPose(operator.side, operator.from) : undefined,
          operator.continuous === true),
        priority: 20,
      };
    }
    case "pose_forearm":
      return {
        primitive: posePrimitive({
          [operator.side === "right" ? Bones.rightArmTwist : Bones.leftArmTwist]:
            axisAngle(forearmTwistAxis(operator.side), operator.roll),
        }),
        priority: 22,
      };
    case "pose_wrist": {
      return {
        primitive: transitionPose(wristPose(operator.side, operator),
          operator.from ? wristPose(operator.side, operator.from) : undefined,
          operator.continuous === true),
        priority: 25,
      };
    }
    case "pose_palm": {
      const isRight = operator.side === "right";
      const twistAxis = forearmTwistAxis(operator.side);
      const wristRotation = new THREE.Quaternion()
        .setFromAxisAngle(forearmHingeAxis(operator.side), THREE.MathUtils.degToRad(operator.bend ?? 0))
        .multiply(new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(operator.tilt ?? 0)
        ))
        .multiply(new THREE.Quaternion().setFromAxisAngle(
          twistAxis, THREE.MathUtils.degToRad(operator.turn * 0.1125)
        ));
      return {
        primitive: posePrimitive({
          [isRight ? Bones.rightArmTwist : Bones.leftArmTwist]:
            axisAngle(twistAxis, operator.turn * 0.625),
          [isRight ? Bones.rightHandTwist : Bones.leftHandTwist]:
            axisAngle(twistAxis, operator.turn * 0.2625),
          [isRight ? Bones.rightWrist : Bones.leftWrist]:
            [wristRotation.x, wristRotation.y, wristRotation.z, wristRotation.w],
        }),
        priority: 25,
      };
    }
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
        priority: operator.effector === "head" || operator.effector === "gaze" ? 15 : 25,
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
          } satisfies MotionAction, context.continuingSegment)
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
        primitive: oscillationPrimitive(operator, context.handOscillationHasDrivenElbow?.(operator)),
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
