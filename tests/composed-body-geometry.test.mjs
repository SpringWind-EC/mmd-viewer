import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { CCDIKSolver } from "three/examples/jsm/animation/CCDIKSolver.js";
import { Parser } from "three/examples/jsm/libs/mmdparser.module.js";
import { compileMotionPlan } from "../src/engine/MotionCompiler.ts";
import { MotionPlayer } from "../src/engine/MotionPlayer.ts";
import { Bones } from "../src/engine/RigCalibration.ts";
import { generatedProgramSchema } from "../server/src/plan-schema.ts";

const file = readFileSync(new URL("../public/models/cyrene.pmx", import.meta.url));
const model = new Parser().parsePmx(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), true);
const footNames = new Set([Bones.rightFootIk, Bones.leftFootIk, Bones.rightToeIk, Bones.leftToeIk]);

function rig() {
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  const bones = model.bones.map(({ name }) => Object.assign(new THREE.Bone(), { name }));
  model.bones.forEach(({ parentIndex, position }, index) => {
    const local = new THREE.Vector3(...position);
    if (parentIndex >= 0) {
      bones[parentIndex].add(bones[index]);
      local.sub(new THREE.Vector3(...model.bones[parentIndex].position));
    } else mesh.add(bones[index]);
    bones[index].position.copy(local);
  });
  mesh.bind(new THREE.Skeleton(bones));
  mesh.updateMatrixWorld(true);
  const iks = model.bones.flatMap((bone, index) => {
    if (!bone.ik || !footNames.has(bone.name)) return [];
    return [{
      target: index,
      effector: bone.ik.effector,
      iteration: bone.ik.iteration,
      maxAngle: bone.ik.maxAngle,
      links: bone.ik.links.map((link) => {
        const entry = { index: link.index, enabled: true };
        if (link.angleLimitation === 1) {
          entry.rotationMin = new THREE.Vector3(-link.upperLimitationAngle[0], -link.upperLimitationAngle[1], link.lowerLimitationAngle[2]);
          entry.rotationMax = new THREE.Vector3(-link.lowerLimitationAngle[0], -link.lowerLimitationAngle[1], link.upperLimitationAngle[2]);
        }
        return entry;
      }),
    }];
  });
  return { mesh, solver: new CCDIKSolver(mesh, iks) };
}

function point(mesh, name) {
  return mesh.skeleton.getBoneByName(name).getWorldPosition(new THREE.Vector3());
}

function loadMotionQuietly(player, motion) {
  const originalLog = console.log;
  console.log = () => {};
  try {
    player.loadMotion(motion);
  } finally {
    console.log = originalLog;
  }
}

test("timed spatial operators compose a lowered pelvis, planted feet, torso, arms and head", () => {
  const plan = {
    duration: 4,
    holdFinalPose: true,
    operators: [
      { type: "place_body", offset: { right: 0, up: -5, forward: -2 }, startTime: 0, endTime: 1.6 },
      { type: "pose_torso", pitch: 10, yaw: -12, startTime: 1, endTime: 2.2 },
      { type: "reach", effector: "right_hand", anchor: "head", offset: { right: 0.35, up: 0.55, forward: 0.2 }, startTime: 1.6, endTime: 3 },
      { type: "reach", effector: "left_hand", anchor: "chest", offset: { right: -0.32, up: 0.03, forward: 0.28 }, startTime: 1.6, endTime: 3 },
      { type: "hand_shape", side: "left", shape: "fist", startTime: 2.2, endTime: 3.3 },
      { type: "look", target: "up", startTime: 2.2, endTime: 3.3 },
    ],
  };
  assert.equal(generatedProgramSchema.safeParse(plan).success, true);
  const { mesh, solver } = rig();
  const motion = compileMotionPlan(plan, mesh);
  const player = new MotionPlayer(mesh);
  loadMotionQuietly(player, motion);
  const samples = [];
  for (let i = 0; i <= 20; i++) {
    player.update(i * 0.2);
    solver.update();
    samples.push({
      center: point(mesh, Bones.center),
      rightFoot: point(mesh, Bones.rightAnkle),
      leftFoot: point(mesh, Bones.leftAnkle),
      rightTarget: point(mesh, Bones.rightFootIk),
      leftTarget: point(mesh, Bones.leftFootIk),
      rightKnee: point(mesh, Bones.rightKnee),
      leftKnee: point(mesh, Bones.leftKnee),
      head: point(mesh, Bones.head),
      rightHand: point(mesh, Bones.rightWrist),
      leftHand: point(mesh, Bones.leftWrist),
    });
  }
  const start = samples[0];
  const finish = samples.at(-1);
  assert.ok(finish.center.y < start.center.y - 3, "pelvis did not lower");
  assert.ok(finish.center.z < start.center.z - 1, "pelvis did not move back");
  assert.ok(finish.rightTarget.distanceTo(start.rightTarget) < 0.001);
  assert.ok(finish.leftTarget.distanceTo(start.leftTarget) < 0.001);
  assert.ok(finish.rightFoot.distanceTo(finish.rightTarget) < 0.12, "right ankle missed IK target");
  assert.ok(finish.leftFoot.distanceTo(finish.leftTarget) < 0.12, "left ankle missed IK target");
  assert.ok(finish.rightKnee.z > start.rightKnee.z + 0.3, "right knee did not bend forward");
  assert.ok(finish.leftKnee.z > start.leftKnee.z + 0.3, "left knee did not bend forward");
  assert.ok(finish.rightHand.y > finish.head.y, "right hand did not reach above head");
  assert.ok(finish.leftHand.y < finish.head.y, "left hand should stay near chest");
  for (const sample of samples) {
    assert.ok(sample.rightKnee.x < sample.leftKnee.x, "knees crossed");
    assert.ok(sample.rightFoot.x < sample.leftFoot.x, "feet crossed");
    assert.ok(Math.abs(sample.rightFoot.y - start.rightFoot.y) < 0.15, "right foot lifted");
    assert.ok(Math.abs(sample.leftFoot.y - start.leftFoot.y) < 0.15, "left foot lifted");
  }
});

test("a single foot target lifts independently while the support foot stays planted", () => {
  const plan = {
    duration: 2.5,
    holdFinalPose: true,
    operators: [
      { type: "place_body", offset: { right: 0.25, up: 0, forward: 0 } },
      { type: "place_foot", side: "left", offset: { right: -0.2, up: 0.6, forward: 0.5 } },
      { type: "pose_torso", pitch: 8, yaw: 12 },
    ],
  };
  assert.equal(generatedProgramSchema.safeParse(plan).success, true);
  const { mesh, solver } = rig();
  const player = new MotionPlayer(mesh);
  loadMotionQuietly(player, compileMotionPlan(plan, mesh));
  const startRight = point(mesh, Bones.rightAnkle);
  const startLeft = point(mesh, Bones.leftAnkle);
  for (let i = 0; i <= 20; i++) {
    player.update(i / 20 * 2.5);
    solver.update();
    const right = point(mesh, Bones.rightAnkle);
    const left = point(mesh, Bones.leftAnkle);
    assert.ok(right.distanceTo(startRight) < 0.1, `support foot slipped at ${i / 20}`);
    assert.ok(right.x < left.x, `legs crossed at ${i / 20}`);
  }
  assert.ok(point(mesh, Bones.leftAnkle).y > startLeft.y + 0.5);
  assert.ok(point(mesh, Bones.leftAnkle).distanceTo(point(mesh, Bones.leftFootIk)) < 0.12);
});

test("waist, compound head and independent elbow controls remain smooth and planted", () => {
  const plan = {
    duration: 3,
    holdFinalPose: true,
    operators: [
      { type: "pose_waist", yaw: 10, roll: 4, startTime: 0, endTime: 1.3 },
      { type: "pose_torso", pitch: 10, yaw: -10, startTime: 0.3, endTime: 1.8 },
      { type: "pose_head", pitch: -9, yaw: 13, roll: -7, startTime: 0.8, endTime: 2.2 },
      { type: "bend_elbow", side: "left", flex: 65, startTime: 0.3, endTime: 1.8 },
      { type: "bend_elbow", side: "right", flex: 35, startTime: 1, endTime: 2.4 },
    ],
  };
  assert.equal(generatedProgramSchema.safeParse(plan).success, true);
  const { mesh, solver } = rig();
  const player = new MotionPlayer(mesh);
  loadMotionQuietly(player, compileMotionPlan(plan, mesh));
  const starting = {
    leftFoot: point(mesh, Bones.leftAnkle), rightFoot: point(mesh, Bones.rightAnkle),
    leftWrist: point(mesh, Bones.leftWrist), rightWrist: point(mesh, Bones.rightWrist),
  };
  for (let i = 0; i <= 60; i++) {
    player.update(i / 60 * plan.duration);
    solver.update();
    const leftFoot = point(mesh, Bones.leftAnkle);
    const rightFoot = point(mesh, Bones.rightAnkle);
    assert.ok(leftFoot.distanceTo(starting.leftFoot) < 0.17, `left foot moved at ${i / 60}`);
    assert.ok(rightFoot.distanceTo(starting.rightFoot) < 0.17, `right foot moved at ${i / 60}`);
    assert.ok(rightFoot.x < leftFoot.x, `legs crossed at ${i / 60}`);
    for (const side of ["left", "right"]) {
      const arm = point(mesh, side === "left" ? Bones.leftArm : Bones.rightArm);
      const elbow = point(mesh, side === "left" ? Bones.leftElbow : Bones.rightElbow);
      const wrist = point(mesh, side === "left" ? Bones.leftWrist : Bones.rightWrist);
      const bend = 180 - THREE.MathUtils.radToDeg(arm.clone().sub(elbow).angleTo(wrist.clone().sub(elbow)));
      assert.ok(bend < 125, `${side} elbow exceeded limit at ${i / 60}`);
    }
    const head = mesh.skeleton.getBoneByName(Bones.head).quaternion;
    const neck = mesh.skeleton.getBoneByName(Bones.neck).quaternion;
    assert.ok(THREE.MathUtils.radToDeg(head.angleTo(new THREE.Quaternion())) < 21);
    assert.ok(THREE.MathUtils.radToDeg(neck.angleTo(new THREE.Quaternion())) < 10);
  }
  assert.ok(point(mesh, Bones.leftWrist).distanceTo(starting.leftWrist) > 0.5);
  assert.ok(point(mesh, Bones.rightWrist).distanceTo(starting.rightWrist) > 0.3);
});

test("either hand can reach a lateral same-side point without crossing the torso", () => {
  for (const side of ["right", "left"]) {
    const { mesh } = rig();
    const operator = {
      type: "reach", effector: `${side}_hand`, anchor: "chest",
      offset: { right: side === "right" ? 0.55 : -0.55, up: -0.15, forward: 0 },
    };
    const plan = { duration: 2.5, operators: [operator] };
    assert.equal(generatedProgramSchema.safeParse(plan).success, true);
    const motion = compileMotionPlan(plan, mesh);
    const player = new MotionPlayer(mesh);
    loadMotionQuietly(player, motion);
    const shoulder = side === "right" ? Bones.rightArm : Bones.leftArm;
    const elbow = side === "right" ? Bones.rightElbow : Bones.leftElbow;
    const wrist = side === "right" ? Bones.rightWrist : Bones.leftWrist;
    const chest = point(mesh, Bones.upperBody2);
    const armLength = point(mesh, shoulder).distanceTo(point(mesh, elbow)) + point(mesh, elbow).distanceTo(point(mesh, wrist));
    const target = chest.clone().add(new THREE.Vector3(-operator.offset.right, operator.offset.up, operator.offset.forward).multiplyScalar(armLength));
    for (let i = 0; i <= 20; i++) {
      player.update(i / 20 * 2.5);
      const arm = point(mesh, shoulder);
      const bend = point(mesh, elbow);
      const hand = point(mesh, wrist);
      assert.ok((side === "right" ? -1 : 1) * (hand.x - chest.x) > 1.1, `${side} hand crossed inward`);
      assert.ok(bend.y < arm.y - 0.8, `${side} lateral reach lifted its elbow beside the shoulder`);
      const flex = 180 - THREE.MathUtils.radToDeg(arm.clone().sub(bend).angleTo(hand.clone().sub(bend)));
      assert.ok(flex < 150, `${side} elbow overbent`);
    }
    assert.ok(point(mesh, wrist).distanceTo(target) < 0.08, `${side} hand missed lateral point`);
  }
});

test("a lateral reach and opposite elbow bend keep both arms below the shoulders", () => {
  const plan = { duration: 3, holdFinalPose: true, operators: [
    { type: "pose_waist", yaw: -10, startTime: 0, endTime: 1.2 },
    { type: "reach", effector: "right_hand", anchor: "chest", offset: { right: 0.55, up: -0.15, forward: 0 }, startTime: 0.5, endTime: 2.1 },
    { type: "bend_elbow", side: "left", flex: 70, startTime: 0.5, endTime: 2.1 },
    { type: "pose_head", pitch: 3, yaw: -14, roll: 4, startTime: 1.2, endTime: 2.5 },
    { type: "hand_shape", side: "right", shape: "open", startTime: 1.2, endTime: 2.5 },
  ] };
  assert.equal(generatedProgramSchema.safeParse(plan).success, true);
  const { mesh } = rig();
  const player = new MotionPlayer(mesh);
  loadMotionQuietly(player, compileMotionPlan(plan, mesh));
  for (let i = 0; i <= 30; i++) {
    player.update(i / 30 * 3);
    const rightArm = point(mesh, Bones.rightArm);
    const rightElbow = point(mesh, Bones.rightElbow);
    const rightWrist = point(mesh, Bones.rightWrist);
    const leftArm = point(mesh, Bones.leftArm);
    const leftElbow = point(mesh, Bones.leftElbow);
    const leftWrist = point(mesh, Bones.leftWrist);
    assert.ok(rightElbow.y < rightArm.y - 0.8, `right reaching elbow rose at ${i / 30}`);
    assert.ok(leftElbow.y < leftArm.y - 0.8, `left bending elbow rose at ${i / 30}`);
    assert.ok(rightWrist.x < -1.5 && leftWrist.x > 1.5, `arms crossed at ${i / 30}`);
  }
});

test("conflicting joint and target operators are rejected instead of silently overriding", () => {
  const handConflict = { duration: 2, operators: [
    { type: "bend_elbow", side: "right", flex: 60 },
    { type: "reach", effector: "right_hand", anchor: "chest", offset: { right: 0.55, up: -0.15, forward: 0 } },
  ] };
  const headConflict = { duration: 2, operators: [
    { type: "pose_head", pitch: 10, yaw: 10 },
    { type: "look", target: "left" },
  ] };
  assert.equal(generatedProgramSchema.safeParse(handConflict).success, false);
  assert.equal(generatedProgramSchema.safeParse(headConflict).success, false);
  assert.throws(() => compileMotionPlan(handConflict), /cannot overlap/);
  assert.throws(() => compileMotionPlan(headConflict), /cannot overlap/);
  const sequential = { duration: 2, operators: [
    { type: "pose_head", pitch: 10, yaw: 10, startTime: 0, endTime: 1 },
    { type: "look", target: "left", startTime: 1, endTime: 2 },
  ] };
  assert.equal(generatedProgramSchema.safeParse(sequential).success, true);
});

test("joint-control limits keep both feet planted and elbows anatomical", () => {
  for (const sign of [-1, 1]) {
    const plan = { duration: 2.5, operators: [
      { type: "pose_waist", pitch: sign * 5, yaw: sign * 10, roll: sign * 4 },
      { type: "pose_head", pitch: sign * 15, yaw: sign * 20, roll: sign * 12 },
      { type: "bend_elbow", side: "right", flex: 110 },
      { type: "bend_elbow", side: "left", flex: 110 },
    ] };
    assert.equal(generatedProgramSchema.safeParse(plan).success, true);
    const { mesh, solver } = rig();
    const player = new MotionPlayer(mesh);
    loadMotionQuietly(player, compileMotionPlan(plan, mesh));
    const feet = { right: point(mesh, Bones.rightAnkle), left: point(mesh, Bones.leftAnkle) };
    for (let i = 0; i <= 20; i++) {
      player.update(i / 20 * 2.5);
      solver.update();
      for (const side of ["right", "left"]) {
        const ankle = point(mesh, side === "right" ? Bones.rightAnkle : Bones.leftAnkle);
        assert.ok(ankle.distanceTo(feet[side]) < 0.2, `${side} foot drifted at ${i / 20}`);
        const arm = point(mesh, side === "right" ? Bones.rightArm : Bones.leftArm);
        const elbow = point(mesh, side === "right" ? Bones.rightElbow : Bones.leftElbow);
        const wrist = point(mesh, side === "right" ? Bones.rightWrist : Bones.leftWrist);
        const bend = 180 - THREE.MathUtils.radToDeg(arm.clone().sub(elbow).angleTo(wrist.clone().sub(elbow)));
        assert.ok(bend < 125, `${side} elbow overbent at ${i / 20}`);
      }
      assert.ok(point(mesh, Bones.rightKnee).x < point(mesh, Bones.leftKnee).x, "knees crossed");
    }
  }
});

test("independent elbow bends hinge forward without forearm axial twist", () => {
  const plan = { duration: 2.5, operators: [
    { type: "bend_elbow", side: "right", flex: 90 },
    { type: "bend_elbow", side: "left", flex: 90 },
  ] };
  const { mesh } = rig();
  const rest = Object.fromEntries(["right", "left"].map((side) => {
    const elbow = point(mesh, side === "right" ? Bones.rightElbow : Bones.leftElbow);
    const wrist = point(mesh, side === "right" ? Bones.rightWrist : Bones.leftWrist);
    return [side, { direction: wrist.clone().sub(elbow).normalize(), wrist }];
  }));
  const player = new MotionPlayer(mesh);
  loadMotionQuietly(player, compileMotionPlan(plan, mesh));
  for (let i = 0; i <= 20; i++) {
    player.update(i / 20 * 2.5);
    for (const side of ["right", "left"]) {
      const elbow = point(mesh, side === "right" ? Bones.rightElbow : Bones.leftElbow);
      const wrist = point(mesh, side === "right" ? Bones.rightWrist : Bones.leftWrist);
      const hinge = mesh.skeleton.getBoneByName(side === "right" ? Bones.rightElbow : Bones.leftElbow).quaternion;
      const axis = new THREE.Vector3(hinge.x, hinge.y, hinge.z).normalize();
      assert.ok(Math.abs(axis.dot(rest[side].direction)) < 0.08, `${side} forearm twisted at ${i / 20}`);
      assert.ok(wrist.z >= rest[side].wrist.z - 0.03, `${side} hand bent behind the body`);
      assert.ok(wrist.distanceTo(elbow) > 2.4, `${side} forearm collapsed`);
    }
  }
  for (const side of ["right", "left"]) {
    const elbow = point(mesh, side === "right" ? Bones.rightElbow : Bones.leftElbow);
    const wrist = point(mesh, side === "right" ? Bones.rightWrist : Bones.leftWrist);
    assert.ok(wrist.z > rest[side].wrist.z + 1.5, `${side} hand did not bend forward`);
    assert.ok(Math.abs(wrist.x - elbow.x) < 1, `${side} hand drifted out to the side`);
  }
});

test("asymmetric arm sweeps and wrist turns compose smoothly with the torso", () => {
  const plan = { duration: 3, holdFinalPose: true, operators: [
    { type: "pose_torso", yaw: 10, startTime: 0, endTime: 1.2 },
    { type: "pose_arm", side: "right", forward: 70, outward: 15, flex: 35, startTime: 0.2, endTime: 2 },
    { type: "pose_arm", side: "left", forward: 20, outward: 65, flex: 50, startTime: 0.4, endTime: 2.2 },
    { type: "pose_wrist", side: "right", bend: 12, twist: 20, startTime: 1, endTime: 2.4 },
    { type: "pose_wrist", side: "left", bend: -8, twist: -20, startTime: 1, endTime: 2.4 },
  ] };
  assert.equal(generatedProgramSchema.safeParse(plan).success, true);
  const { mesh } = rig();
  const player = new MotionPlayer(mesh);
  loadMotionQuietly(player, compileMotionPlan(plan, mesh));
  const start = {
    rightWrist: point(mesh, Bones.rightWrist),
    leftWrist: point(mesh, Bones.leftWrist),
    rightFoot: point(mesh, Bones.rightAnkle),
    leftFoot: point(mesh, Bones.leftAnkle),
  };
  let previous;
  for (let i = 0; i <= 60; i++) {
    player.update(i / 20);
    const rightWrist = point(mesh, Bones.rightWrist);
    const leftWrist = point(mesh, Bones.leftWrist);
    assert.ok(point(mesh, Bones.rightAnkle).distanceTo(start.rightFoot) < 0.08, "right foot moved");
    assert.ok(point(mesh, Bones.leftAnkle).distanceTo(start.leftFoot) < 0.08, "left foot moved");
    assert.ok(rightWrist.x < 0 && leftWrist.x > 0, `arms crossed at ${i / 20}`);
    if (previous) {
      assert.ok(rightWrist.distanceTo(previous.right) < 0.55, `right arm snapped at ${i / 20}`);
      assert.ok(leftWrist.distanceTo(previous.left) < 0.55, `left arm snapped at ${i / 20}`);
    }
    previous = { right: rightWrist, left: leftWrist };
  }
  assert.ok(point(mesh, Bones.rightWrist).z > start.rightWrist.z + 1, "right arm did not sweep forward");
  assert.ok(point(mesh, Bones.leftWrist).y > start.leftWrist.y + 1, "left arm did not lift");
  for (const name of [Bones.rightHandTwist, Bones.leftHandTwist, Bones.rightWrist, Bones.leftWrist]) {
    const degrees = THREE.MathUtils.radToDeg(mesh.skeleton.getBoneByName(name).quaternion.angleTo(new THREE.Quaternion()));
    assert.ok(degrees > 2 && degrees < 35, `${name} wrist turn out of range`);
  }
});

test("arm targets and wrist orientations reject same-joint overlaps", () => {
  const handTarget = { duration: 2, operators: [
    { type: "pose_arm", side: "right", forward: 40 },
    { type: "reach", effector: "right_hand", anchor: "chest", offset: { right: 0.55, up: 0, forward: 0.25 } },
  ] };
  const wristOrientation = { duration: 2, operators: [
    { type: "pose_wrist", side: "left", twist: 20 },
    { type: "orient_effector", effector: "left_hand", facing: "up" },
  ] };
  const foldedArms = { duration: 2, operators: [
    { type: "pose_arm", side: "right", forward: 85, outward: 80, flex: 110 },
  ] };
  const safeBoundary = { duration: 2, operators: [
    { type: "pose_arm", side: "right", forward: 45, outward: 40, flex: 75 },
  ] };
  assert.equal(generatedProgramSchema.safeParse(handTarget).success, false);
  assert.equal(generatedProgramSchema.safeParse(wristOrientation).success, false);
  assert.equal(generatedProgramSchema.safeParse(foldedArms).success, false);
  assert.equal(generatedProgramSchema.safeParse(safeBoundary).success, true);
  assert.throws(() => compileMotionPlan(handTarget));
  assert.throws(() => compileMotionPlan(wristOrientation));
  assert.throws(() => compileMotionPlan(foldedArms));
});

test("successive arm and wrist commands inherit the preceding pose", () => {
  const plan = { duration: 2.4, operators: [
    { type: "pose_arm", side: "right", forward: 60, flex: 20, startTime: 0, endTime: 1.2 },
    { type: "pose_wrist", side: "right", twist: 25, startTime: 0, endTime: 1.2 },
    { type: "pose_arm", side: "right", outward: 65, flex: 40, startTime: 1.2, endTime: 2.4 },
    { type: "pose_wrist", side: "right", bend: 15, startTime: 1.2, endTime: 2.4 },
  ] };
  assert.equal(generatedProgramSchema.safeParse(plan).success, true);
  const { mesh } = rig();
  const player = new MotionPlayer(mesh);
  loadMotionQuietly(player, compileMotionPlan(plan, mesh));
  const sample = (time) => {
    player.update(time);
    return {
      wrist: point(mesh, Bones.rightWrist),
      arm: mesh.skeleton.getBoneByName(Bones.rightArm).quaternion.clone(),
      hand: mesh.skeleton.getBoneByName(Bones.rightWrist).quaternion.clone(),
    };
  };
  const before = sample(1.19);
  const after = sample(1.21);
  assert.ok(before.wrist.distanceTo(after.wrist) < 0.25, "arm snapped at boundary");
  assert.ok(THREE.MathUtils.radToDeg(before.arm.angleTo(after.arm)) < 5, "upper arm snapped at boundary");
  assert.ok(THREE.MathUtils.radToDeg(before.hand.angleTo(after.hand)) < 5, "wrist snapped at boundary");
  assert.ok(sample(2.4).wrist.distanceTo(before.wrist) > 0.5, "second arm pose had no effect");
});

test("sequential head and arm poses interpolate from the preceding pose", () => {
  const plan = { duration: 2.4, operators: [
    { type: "pose_head", pitch: 10, yaw: 15, startTime: 0, endTime: 1.2 },
    { type: "reach", effector: "right_hand", anchor: "chest", offset: { right: 0.55, up: -0.15, forward: 0 }, startTime: 0, endTime: 1.2 },
    { type: "look", target: "up", startTime: 1.2, endTime: 2.4 },
    { type: "bend_elbow", side: "right", flex: 70, startTime: 1.2, endTime: 2.4 },
  ] };
  assert.equal(generatedProgramSchema.safeParse(plan).success, true);
  const { mesh } = rig();
  const player = new MotionPlayer(mesh);
  loadMotionQuietly(player, compileMotionPlan(plan, mesh));
  const sample = (time) => {
    player.update(time);
    return {
      head: mesh.skeleton.getBoneByName(Bones.head).quaternion.clone(),
      neck: mesh.skeleton.getBoneByName(Bones.neck).quaternion.clone(),
      arm: mesh.skeleton.getBoneByName(Bones.rightArm).quaternion.clone(),
      elbow: mesh.skeleton.getBoneByName(Bones.rightElbow).quaternion.clone(),
      wrist: point(mesh, Bones.rightWrist),
    };
  };
  const before = sample(1.19);
  const after = sample(1.21);
  for (const name of ["head", "neck", "arm", "elbow"]) {
    assert.ok(THREE.MathUtils.radToDeg(before[name].angleTo(after[name])) < 5, `${name} snapped at the command boundary`);
  }
  assert.ok(before.wrist.distanceTo(after.wrist) < 0.25, "hand snapped at the command boundary");
  const finish = sample(2.4);
  assert.ok(THREE.MathUtils.radToDeg(finish.neck.angleTo(new THREE.Quaternion())) < 0.5, "neck did not recenter for look");
  assert.ok(finish.wrist.distanceTo(before.wrist) > 0.5, "arm did not move into the elbow bend");
});
