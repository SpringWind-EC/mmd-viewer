import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { CCDIKSolver } from "three/examples/jsm/animation/CCDIKSolver.js";
import { Parser } from "three/examples/jsm/libs/mmdparser.module.js";
import { appendMotionProgram, compileMotionPlan } from "../src/engine/MotionCompiler.ts";
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

const point = (mesh, name) => mesh.skeleton.getBoneByName(name).getWorldPosition(new THREE.Vector3());

const curvedPose = {
  duration: 2.5,
  holdFinalPose: true,
  operators: [
    { type: "pose_pelvis", yaw: -16, pitch: -2, startTime: 0, endTime: 1.4 },
    { type: "pose_spine", segment: "lower", pitch: -25, yaw: -6, startTime: 0.2, endTime: 1.6 },
    { type: "pose_spine", segment: "upper", pitch: 32, yaw: 3, startTime: 0.3, endTime: 1.7 },
    { type: "place_foot", side: "right", offset: { right: 0.75, up: 1.3, forward: 3.4 }, startTime: 0, endTime: 1.8 },
    { type: "pose_ankle", side: "right", pitch: 25, yaw: -8, startTime: 0.6, endTime: 1.9 },
    { type: "pose_toe", side: "right", curl: 25, startTime: 0.8, endTime: 2 },
    { type: "pose_ankle", side: "left", yaw: 20, startTime: 0.4, endTime: 1.7 },
    { type: "pose_arm", side: "right", forward: 12, outward: -16, flex: 8, startTime: 0.4, endTime: 1.7 },
    { type: "pose_arm", side: "left", forward: 10, outward: -15, flex: 8, startTime: 0.4, endTime: 1.7 },
    { type: "pose_wrist", side: "right", bend: 5, tilt: 12, startTime: 1, endTime: 2 },
    { type: "pose_wrist", side: "left", bend: 5, tilt: -12, startTime: 1, endTime: 2 },
    { type: "pose_head", pitch: -8, yaw: -10, startTime: 1, endTime: 2 },
  ],
};

test("pose_ankle turns the visible foot without moving its IK target", () => {
  const sample = (pitch) => {
    const { mesh, solver } = rig();
    const motion = compileMotionPlan({
      duration: 0.5, holdFinalPose: true,
      operators: [
        { type: "place_foot", side: "right", offset: { right: 1.4, up: 0.8, forward: -1.2 } },
        { type: "pose_ankle", side: "right", pitch },
      ],
    }, mesh);
    const player = new MotionPlayer(mesh);
    const originalLog = console.log;
    console.log = () => {};
    try { player.loadMotion(motion); } finally { console.log = originalLog; }
    player.update(0.5);
    solver.update();
    return {
      ankle: mesh.skeleton.getBoneByName(Bones.rightAnkle).quaternion.clone(),
      target: point(mesh, Bones.rightFootIk),
    };
  };
  const neutral = sample(0);
  const pointed = sample(-25);
  assert.ok(pointed.ankle.angleTo(neutral.ankle) > 0.15,
    `ankle orientation changed ${pointed.ankle.angleTo(neutral.ankle)} radians`);
  assert.ok(pointed.target.distanceTo(neutral.target) < 0.001, "ankle pose moved the foot target");
});

test("independent pelvis, spine, foot and arm controls form a smooth supported pose", () => {
  assert.equal(generatedProgramSchema.safeParse(curvedPose).success, true);
  const { mesh, solver } = rig();
  const motion = compileMotionPlan(curvedPose, mesh);
  const player = new MotionPlayer(mesh);
  const originalLog = console.log;
  console.log = () => {};
  try { player.loadMotion(motion); } finally { console.log = originalLog; }
  const samples = [];
  for (let i = 0; i <= 50; i++) {
    player.update(i * 0.05);
    solver.update();
    samples.push({
      rightAnkle: point(mesh, Bones.rightAnkle),
      rightTarget: point(mesh, Bones.rightFootIk),
      rightToe: point(mesh, Bones.rightToe),
      leftAnkle: point(mesh, Bones.leftAnkle),
      leftTarget: point(mesh, Bones.leftFootIk),
      leftToe: point(mesh, Bones.leftToe),
      rightWrist: point(mesh, Bones.rightWrist),
      leftWrist: point(mesh, Bones.leftWrist),
      lowerSpine: mesh.skeleton.getBoneByName(Bones.upperBody1).quaternion.clone(),
      upperSpine: mesh.skeleton.getBoneByName(Bones.upperBody2).quaternion.clone(),
      rightFootEx: mesh.skeleton.getBoneByName(Bones.rightFootEx).quaternion.clone(),
      rightAnkleRotation: mesh.skeleton.getBoneByName(Bones.rightAnkle).quaternion.clone(),
    });
  }
  const start = samples[0];
  const finish = samples.at(-1);
  const minRightToe = Math.min(...samples.map((sample) => sample.rightToe.y));
  const maxLeftFootDrift = Math.max(...samples.map((sample) => sample.leftTarget.distanceTo(start.leftTarget)));
  const maxRightTargetError = Math.max(...samples.map((sample) => sample.rightAnkle.distanceTo(sample.rightTarget)));
  const maxFootStep = Math.max(...samples.slice(1).map((sample, index) => sample.rightTarget.distanceTo(samples[index].rightTarget)));
  assert.ok(maxLeftFootDrift < 0.001, "support foot target moved");
  assert.ok(Math.max(...samples.map((sample) => sample.leftAnkle.distanceTo(sample.leftTarget))) < 0.05, "support ankle left its target");
  assert.ok(finish.rightTarget.z > start.rightTarget.z + 3, "raised foot did not travel forward");
  assert.ok(finish.rightAnkle.y > start.rightAnkle.y + 0.4, "raised ankle did not clear the floor");
  assert.ok(finish.rightAnkle.distanceTo(finish.rightTarget) < 0.1, "raised ankle missed its final IK target");
  assert.ok(maxRightTargetError < 0.4, "raised ankle strayed too far from its IK path");
  assert.ok(minRightToe >= start.rightToe.y - 0.02, "moving toe crossed the floor");
  assert.ok(finish.leftToe.y > 0.15, "support toe crossed the floor");
  assert.ok(maxFootStep < 0.25, "foot target jumped between samples");
  assert.ok(samples.every((sample) => sample.rightAnkle.x < sample.leftAnkle.x - 0.3), "legs crossed");
  assert.ok(finish.rightWrist.x < -0.8 && finish.leftWrist.x > 0.8, "arms crossed the torso");
  assert.ok(finish.lowerSpine.x < -0.05 && finish.upperSpine.x > 0.05, "spine did not counter-bend");
  assert.ok(finish.rightFootEx.x > 0.05, "toe did not curl");
  assert.ok(finish.rightAnkleRotation.angleTo(start.rightAnkleRotation) > 0.1, "foot did not turn through its IK controller");
});

test("shoulder yaw changes arm placement without winding the elbow or wrist", () => {
  const base = { duration: 1, holdFinalPose: true, operators: [
    { type: "pose_arm", side: "left", forward: 10, outward: -15, flex: 8 },
    { type: "pose_wrist", side: "left", bend: 5, tilt: -16, twist: 2 },
  ] };
  const turned = { ...base, operators: [
    { ...base.operators[0], shoulderYaw: 15 }, base.operators[1],
  ] };
  const rolled = { ...base, operators: [
    { ...base.operators[0], shoulderRoll: 8 }, base.operators[1],
  ] };
  const led = { ...base, operators: [
    { ...base.operators[0], shoulderShare: 0.28 }, base.operators[1],
  ] };
  assert.equal(generatedProgramSchema.safeParse(turned).success, true);
  assert.equal(generatedProgramSchema.safeParse(rolled).success, true);
  assert.equal(generatedProgramSchema.safeParse(led).success, true);
  const run = (plan) => {
    const { mesh } = rig();
    const player = new MotionPlayer(mesh);
    const originalLog = console.log;
    console.log = () => {};
    try { player.loadMotion(compileMotionPlan(plan, mesh)); } finally { console.log = originalLog; }
    player.update(1);
    return {
      shoulder: mesh.skeleton.getBoneByName(Bones.leftShoulder).quaternion.clone(),
      arm: mesh.skeleton.getBoneByName(Bones.leftArm).quaternion.clone(),
      elbow: mesh.skeleton.getBoneByName(Bones.leftElbow).quaternion.clone(),
      wrist: mesh.skeleton.getBoneByName(Bones.leftWrist).quaternion.clone(),
      hand: point(mesh, Bones.leftWrist),
    };
  };
  const before = run(base);
  const after = run(turned);
  const roll = run(rolled);
  const lead = run(led);
  assert.ok(after.shoulder.angleTo(before.shoulder) > 0.25, "shoulder turn was ignored");
  assert.ok(after.elbow.angleTo(before.elbow) < 0.001, "shoulder turn twisted the elbow hinge");
  assert.ok(after.wrist.angleTo(before.wrist) < 0.001, "shoulder turn twisted the wrist locally");
  assert.ok(after.hand.distanceTo(before.hand) > 0.15, "shoulder turn did not reposition the hand");
  assert.ok(roll.shoulder.angleTo(before.shoulder) > 0.13, "shoulder roll was ignored");
  assert.ok(roll.elbow.angleTo(before.elbow) < 0.001, "shoulder roll twisted the elbow hinge");
  assert.ok(roll.wrist.angleTo(before.wrist) < 0.001, "shoulder roll twisted the wrist locally");
  assert.ok(lead.shoulder.angleTo(before.shoulder) > 0.03, "shoulder share did not move the clavicle");
  assert.ok(lead.arm.angleTo(before.arm) > 0.03, "shoulder share did not redistribute the arm sweep");
  assert.ok(lead.elbow.angleTo(before.elbow) < 0.001, "shoulder share twisted the elbow hinge");
  assert.ok(roll.hand.distanceTo(before.hand) > 0.1, "shoulder roll did not reposition the hand");
});

test("a relative follow-up preserves the prior pose and moves smoothly without crossing", () => {
  const followUp = {
    duration: 0.5, continuePrevious: true, holdFinalPose: true,
    operators: [
      { type: "place_body", offset: { right: -0.04, up: -0.006, forward: -0.02 } },
      { type: "pose_pelvis", yaw: -0.4 },
      { type: "pose_spine", segment: "lower", pitch: -0.5 },
      { type: "place_foot", side: "right", offset: { right: 0, up: 0, forward: 0.017 } },
      { type: "pose_ankle", side: "right", pitch: 0.5 },
      { type: "pose_arm", side: "left", forward: -0.5, flex: 0.8 },
      { type: "pose_wrist", side: "left", tilt: -1.8 },
      { type: "pose_head", yaw: -0.8, roll: -0.5 },
    ],
  };
  assert.equal(generatedProgramSchema.safeParse(followUp).success, true);
  assert.equal(generatedProgramSchema.safeParse({
    duration: 0.5, continuePrevious: true,
    operators: [{ type: "look", target: "left" }],
  }).success, false);
  assert.throws(() => appendMotionProgram(null, followUp), /previous motion plan/);
  const { mesh, solver } = rig();
  const first = compileMotionPlan(curvedPose, mesh);
  assert.throws(() => appendMotionProgram(first, {
    duration: 0.5, continuePrevious: true, operators: [
      { type: "place_foot", side: "right", offset: { right: 0, up: 0, forward: 1 } },
    ],
  }, mesh), /continuing foot reach/);
  const full = appendMotionProgram(first, followUp, mesh);
  assert.equal(full.duration, 3);
  assert.equal(full.keyframes.at(-1).time, 3);
  const player = new MotionPlayer(mesh);
  const originalLog = console.log;
  console.log = () => {};
  try { player.loadMotion(full); } finally { console.log = originalLog; }
  const samples = [];
  for (let i = 0; i <= 60; i++) {
    player.update(i * 0.05);
    solver.update();
    samples.push({
      rightAnkle: point(mesh, Bones.rightAnkle),
      rightTarget: point(mesh, Bones.rightFootIk),
      leftAnkle: point(mesh, Bones.leftAnkle),
      leftTarget: point(mesh, Bones.leftFootIk),
      rightWrist: point(mesh, Bones.rightWrist),
      leftWrist: point(mesh, Bones.leftWrist),
      head: mesh.skeleton.getBoneByName(Bones.head).quaternion.clone(),
    });
  }
  const before = samples[50];
  const after = samples[51];
  const final = samples[60];
  assert.ok(after.rightTarget.distanceTo(before.rightTarget) < 0.01, "foot target jumped at segment boundary");
  assert.ok(after.leftTarget.distanceTo(before.leftTarget) < 0.001, "support foot moved at segment boundary");
  assert.ok(after.head.angleTo(before.head) < 0.02, "head snapped at segment boundary");
  assert.ok(final.rightTarget.distanceTo(before.rightTarget) < 0.03, "follow-up foot change was too large");
  assert.ok(final.leftTarget.distanceTo(before.leftTarget) < 0.001, "support foot drifted");
  assert.ok(final.rightAnkle.distanceTo(final.rightTarget) < 0.12, "moving ankle missed its target");
  assert.ok(final.leftAnkle.distanceTo(final.leftTarget) < 0.05, "support ankle missed its target");
  assert.ok(samples.every((sample) => sample.rightAnkle.x < sample.leftAnkle.x - 0.3), "legs crossed");
  assert.ok(samples.every((sample) => sample.rightWrist.x < -0.8 && sample.leftWrist.x > 0.8), "arms crossed the torso");
  assert.ok(final.head.angleTo(before.head) < 0.04, "head follow-up twisted too far");
});

test("unsafe extended foot reaches and competing spine controls are rejected", () => {
  const base = { duration: 2.5, holdFinalPose: true };
  assert.equal(generatedProgramSchema.safeParse({ ...base, operators: [
    { type: "place_foot", side: "right", offset: { right: 0, up: 0, forward: 3.5 } },
  ] }).success, false);
  assert.equal(generatedProgramSchema.safeParse({ ...base, operators: [
    { type: "pose_torso", pitch: 12 },
    { type: "pose_spine", segment: "lower", pitch: -12 },
  ] }).success, false);
  assert.equal(generatedProgramSchema.safeParse({ ...base, operators: [
    { type: "pose_arm", side: "right", outward: -25, flex: 15 },
    { type: "pose_wrist", side: "right", tilt: 25 },
  ] }).success, true);
  assert.equal(generatedProgramSchema.safeParse({ ...base, operators: [
    { type: "pose_wrist", side: "right", tilt: 80 },
  ] }).success, false, "large wrist reversals require a held pose");
  assert.equal(generatedProgramSchema.safeParse({ ...base, operators: [
    { type: "pose_forearm", side: "right", roll: 50 },
  ] }).success, false, "large forearm rolls require a held pose");
  const { mesh } = rig();
  assert.throws(() => compileMotionPlan({ ...base, operators: [
    { type: "pose_wrist", side: "right", tilt: 80 },
  ] }, mesh), /continuing segment/);
  const raisedFoot = compileMotionPlan({ ...base, operators: [
    { type: "place_foot", side: "right", offset: { right: 0.75, up: 1.3, forward: 3.4 } },
  ] }, mesh);
  assert.throws(() => appendMotionProgram(raisedFoot, {
    duration: 0.5, continuePrevious: true, operators: [
      { type: "place_foot", side: "right", extendedReach: true,
        offset: { right: 2, up: -0.7, forward: 0 } },
    ],
  }, mesh), /continuing foot reach/, "a wide leg sweep cannot lower the foot below its safe lift");
});

