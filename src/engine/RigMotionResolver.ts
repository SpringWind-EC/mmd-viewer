import * as THREE from "three";
import { CCDIKSolver } from "three/examples/jsm/animation/CCDIKSolver.js";
import type { MotionOperator } from "./MotionProgram";
import { Bones } from "./RigCalibration";
import type { BoneMap, MotionPrimitive } from "./primitives";

type Reach = Extract<MotionOperator, { type: "reach" }>;

const maxElbowFlex = THREE.MathUtils.degToRad(150);

const anchorBones = {
  head: Bones.head,
  chest: Bones.upperBody2,
  hips: Bones.lowerBody,
};

function distanceToSegment(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3) {
  const span = end.clone().sub(start);
  const progress = THREE.MathUtils.clamp(
    point.clone().sub(start).dot(span) / Math.max(span.lengthSq(), 0.000001),
    0,
    1
  );
  return point.distanceTo(start.addScaledVector(span, progress));
}

export function resolveReach(mesh: THREE.SkinnedMesh, operator: Reach): MotionPrimitive {
  const bones = mesh.skeleton.bones;
  const savedPose = bones.map((bone) => ({
    position: bone.position.clone(),
    rotation: bone.quaternion.clone(),
    scale: bone.scale.clone(),
  }));

  try {
    mesh.pose();
    mesh.updateMatrixWorld(true);

    const side = operator.effector === "right_hand" ? 1 : -1;
    const minForward = operator.anchor === "head" ? 0.12 : 0.22;
    if (side * operator.offset.right < 0.08 || operator.offset.forward < minForward) {
      throw new Error("This reach needs a target in front of the same-side shoulder.");
    }
    if (operator.anchor === "head" &&
        Math.hypot(operator.offset.right, operator.offset.up, operator.offset.forward) < 0.23) {
      throw new Error("This reach target is too close to the center of the head.");
    }

    const armName = operator.effector === "right_hand" ? Bones.rightArm : Bones.leftArm;
    const wristName = operator.effector === "right_hand" ? Bones.rightWrist : Bones.leftWrist;
    const arm = mesh.skeleton.getBoneByName(armName);
    const wrist = mesh.skeleton.getBoneByName(wristName);
    const anchor = mesh.skeleton.getBoneByName(anchorBones[operator.anchor]);
    if (!arm || !wrist || !anchor) {
      throw new Error("The loaded model does not have the bones needed for this reach.");
    }

    const armPosition = arm.getWorldPosition(new THREE.Vector3());
    const elbowName = operator.effector === "right_hand" ? Bones.rightElbow : Bones.leftElbow;
    const elbow = mesh.skeleton.getBoneByName(elbowName);
    if (!elbow) {
      throw new Error("The loaded model does not have an elbow bone for this reach.");
    }
    const elbowPosition = elbow.getWorldPosition(new THREE.Vector3());
    const wristPosition = wrist.getWorldPosition(new THREE.Vector3());
    const upperLength = armPosition.distanceTo(elbowPosition);
    const lowerLength = elbowPosition.distanceTo(wristPosition);
    const armLength = upperLength + lowerLength;
    if (armLength < 0.001) {
      throw new Error("The model's arm has no usable length.");
    }

    const targetPosition = new THREE.Vector3(
      -operator.offset.right,
      operator.offset.up,
      operator.offset.forward
    )
      .multiplyScalar(armLength)
      .applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()))
      .add(anchor.getWorldPosition(new THREE.Vector3()));

    const toTarget = targetPosition.clone().sub(armPosition);
    const distance = toTarget.length();
    const minDistance = Math.sqrt(
      upperLength ** 2 + lowerLength ** 2 -
      2 * upperLength * lowerLength * Math.cos(Math.PI - maxElbowFlex)
    );
    if (distance < minDistance || distance > armLength) {
      throw new Error("This hand target is outside the arm's safe reach.");
    }

    const direction = toTarget.normalize();
    const pole = new THREE.Vector3(-side, -0.45, 0.8)
      .applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
    pole.addScaledVector(direction, -pole.dot(direction));
    if (pole.lengthSq() < 0.001) {
      throw new Error("This reach has no stable elbow direction.");
    }
    pole.normalize();
    const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
    const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
    const elbowTarget = armPosition.clone().addScaledVector(direction, along).addScaledVector(pole, height);

    const armIndex = bones.indexOf(arm);
    const elbowIndex = bones.indexOf(elbow);
    const wristIndex = bones.indexOf(wrist);
    const armRest = arm.quaternion.clone();
    const elbowRest = elbow.quaternion.clone();
    const target = new THREE.Bone();

    // Solve shoulder and elbow separately so PMX twist bones remain in their rest pose.
    bones.push(target);
    try {
      const solver = new CCDIKSolver(mesh);
      target.matrixWorld.makeTranslation(elbowTarget.x, elbowTarget.y, elbowTarget.z);
      solver.updateOne({ target: bones.length - 1, effector: elbowIndex, links: [{ index: armIndex }], iteration: 16, maxAngle: 0.2 });
      target.matrixWorld.makeTranslation(targetPosition.x, targetPosition.y, targetPosition.z);
      solver.updateOne({ target: bones.length - 1, effector: wristIndex, links: [{ index: elbowIndex }], iteration: 16, maxAngle: 0.2 });
    } finally {
      bones.pop();
    }

    const solvedElbow = elbow.getWorldPosition(new THREE.Vector3());
    const solvedWrist = wrist.getWorldPosition(new THREE.Vector3());
    const elbowFlex = Math.PI - armPosition.clone().sub(solvedElbow)
      .angleTo(solvedWrist.clone().sub(solvedElbow));
    const shoulderSwing = elbowPosition.clone().sub(armPosition)
      .angleTo(solvedElbow.clone().sub(armPosition));
    if (elbowFlex > maxElbowFlex + 0.02 || shoulderSwing > THREE.MathUtils.degToRad(115) ||
        solvedWrist.distanceTo(targetPosition) > 0.03 * armLength) {
      throw new Error("This hand target cannot be reached with a natural arm bend.");
    }

    const head = mesh.skeleton.getBoneByName(Bones.head);
    const chest = mesh.skeleton.getBoneByName(Bones.upperBody2);
    const hips = mesh.skeleton.getBoneByName(Bones.lowerBody);
    if (!head || !chest || !hips) {
      throw new Error("The loaded model is missing body landmarks for reach clearance.");
    }
    const headPosition = head.getWorldPosition(new THREE.Vector3());
    const chestPosition = chest.getWorldPosition(new THREE.Vector3());
    const hipPosition = hips.getWorldPosition(new THREE.Vector3());
    const solvedArmRotation = arm.quaternion.clone();
    const solvedElbowRotation = elbow.quaternion.clone();
    for (let step = 0; step <= 10; step++) {
      const progress = step / 10;
      arm.quaternion.copy(armRest).slerp(solvedArmRotation, progress);
      elbow.quaternion.copy(elbowRest).slerp(solvedElbowRotation, progress);
      mesh.updateMatrixWorld(true);
      const shoulderPoint = arm.getWorldPosition(new THREE.Vector3());
      const elbowPoint = elbow.getWorldPosition(new THREE.Vector3());
      const wristPoint = wrist.getWorldPosition(new THREE.Vector3());
      if (distanceToSegment(headPosition, elbowPoint.clone(), wristPoint) < 0.17 * armLength) {
        throw new Error("This reach would pass through the head.");
      }
      for (const [start, end] of [[shoulderPoint, elbowPoint], [elbowPoint, wristPoint]]) {
        for (let sample = 0; sample <= 8; sample++) {
          const point = start.clone().lerp(end, sample / 8);
          if (distanceToSegment(point, hipPosition.clone(), chestPosition) < 0.15 * armLength) {
            throw new Error("This reach would pass through the torso.");
          }
        }
      }
    }
    arm.quaternion.copy(solvedArmRotation);
    elbow.quaternion.copy(solvedElbowRotation);

    const armDelta = armRest.invert().multiply(arm.quaternion);
    const elbowDelta = elbowRest.invert().multiply(elbow.quaternion);
    const pose: BoneMap = {
      [arm.name]: [armDelta.x, armDelta.y, armDelta.z, armDelta.w],
      [elbow.name]: [elbowDelta.x, elbowDelta.y, elbowDelta.z, elbowDelta.w],
    };

    return {
      rotationMode: "delta",
      holdFinalPose: true,
      frames: [
        { progress: 0, bones: {} },
        { progress: 0.7, bones: pose },
        { progress: 1, bones: pose },
      ],
    };
  } finally {
    bones.forEach((bone, index) => {
      bone.position.copy(savedPose[index].position);
      bone.quaternion.copy(savedPose[index].rotation);
      bone.scale.copy(savedPose[index].scale);
    });
    mesh.updateMatrixWorld(true);
  }
}
