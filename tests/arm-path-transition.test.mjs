import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { Parser } from "three/examples/jsm/libs/mmdparser.module.js";
import { appendMotionProgram, compileMotionPlan } from "../src/engine/MotionCompiler.ts";
import { MotionPlayer } from "../src/engine/MotionPlayer.ts";
import { Bones } from "../src/engine/RigCalibration.ts";
import { generatedProgramSchema } from "../server/src/plan-schema.ts";
import { motionProgramResponseSchema } from "../server/src/generation.ts";

const file = readFileSync(new URL("../public/models/cyrene.pmx", import.meta.url));
const parsed = new Parser().parsePmx(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), true);

test("explicit overhead arm lift extends the reusable pose range with shoulder support", () => {
  const operator = { type: "pose_arm", side: "right", forward: 70, outward: 50,
    shoulderShare: 0.15, overhead: true, flex: 45 };
  const program = { duration: 2, operators: [operator] };
  assert.equal(generatedProgramSchema.safeParse(program).success, true);
  assert.doesNotThrow(() => compileMotionPlan(program, rig()));
  assert.equal(generatedProgramSchema.safeParse({ duration: 2,
    operators: [{ ...operator, overhead: false }] }).success, false);
  assert.equal(generatedProgramSchema.safeParse({ duration: 2,
    operators: [{ ...operator, shoulderShare: 0.05 }] }).success, false);
  assert.equal(generatedProgramSchema.safeParse({ duration: 2,
    operators: [{ ...operator, forward: 85, outward: 60 }] }).success, false);
});

test("wide arm and forearm sweeps require a continuing pose", () => {
  const operators = [
    { type: "pose_arm", side: "left", outward: -67, shoulderYaw: 36,
      upperArmRoll: 75, startTime: 0, endTime: 1 },
    { type: "pose_forearm", side: "left", roll: -101, startTime: 0, endTime: 1 },
  ];
  const initial = { duration: 1, operators };
  const continuing = { duration: 1, continuePrevious: true, operators };
  assert.equal(generatedProgramSchema.safeParse(initial).success, false);
  assert.equal(generatedProgramSchema.safeParse(continuing).success, true);
  assert.throws(() => compileMotionPlan(initial, rig()));
  assert.doesNotThrow(() => compileMotionPlan(continuing, rig()));
});

test("generator exposes staged arm and body controls allowed by validation", () => {
  const operators = motionProgramResponseSchema.properties.operators;
  assert.equal(operators.maxItems, 100);
  for (const key of ["continuous", "overhead"]) {
    assert.ok(operators.items.properties[key], `${key} missing from response schema`);
  }
  for (const key of ["pitch", "yaw", "roll", "forward", "outward", "upperArmRoll"]) {
    assert.ok(operators.items.properties.from.properties[key], `${key} missing from staged from schema`);
  }
});

function rig() {
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  const bones = parsed.bones.map(({ name }) => Object.assign(new THREE.Bone(), { name }));
  parsed.bones.forEach(({ parentIndex, position }, index) => {
    const local = new THREE.Vector3(...position);
    if (parentIndex >= 0) {
      bones[parentIndex].add(bones[index]);
      local.sub(new THREE.Vector3(...parsed.bones[parentIndex].position));
    } else mesh.add(bones[index]);
    bones[index].position.copy(local);
  });
  mesh.bind(new THREE.Skeleton(bones));
  mesh.updateMatrixWorld(true);
  return mesh;
}

test("timed arm release stays in front and continuous at the curl handoff", () => {
  const base = {
    duration: 2.4, holdFinalPose: true,
    operators: [
      { type: "pose_arm", side: "left", forward: 8, outward: 40, flex: 18 },
      { type: "pose_wrist", side: "left", tilt: -29 },
    ],
  };
  const continuation = {
    duration: 2.4, continuePrevious: true, holdFinalPose: true,
    operators: [
      { type: "pose_arm", side: "left", forward: 0, outward: -15, flex: 110, startTime: 0.1, endTime: 1.05 },
      { type: "pose_arm", side: "left", from: { forward: 0, outward: -15, flex: 110 },
        forward: 5, outward: -5, flex: 10, startTime: 1.05, endTime: 2.25 },
      { type: "pose_wrist", side: "left", tilt: 22, startTime: 0.1, endTime: 1.05 },
      { type: "pose_wrist", side: "left", from: { tilt: 22 }, tilt: 35, bend: -10,
        startTime: 1.05, endTime: 2.25 },
    ],
  };
  assert.ok(generatedProgramSchema.safeParse(continuation).success);
  const mesh = rig();
  const motion = appendMotionProgram(compileMotionPlan(base, mesh), continuation, mesh);
  const player = new MotionPlayer(mesh);
  const log = console.log;
  console.log = () => {};
  try { player.loadMotion(motion); } finally { console.log = log; }
  const wrist = mesh.skeleton.getBoneByName(Bones.leftWrist);
  const shoulder = mesh.skeleton.getBoneByName(Bones.leftArm);
  let previous;
  for (let t = 0.8; t <= 2.3; t += 0.05) {
    player.update(2.4 + t);
    const hand = wrist.getWorldPosition(new THREE.Vector3());
    const arm = shoulder.getWorldPosition(new THREE.Vector3());
    assert.ok(hand.z > arm.z + 0.25, `left hand moved behind the torso at ${t.toFixed(2)} s`);
    if (previous) assert.ok(hand.distanceTo(previous) < 0.6, `left hand snapped at ${t.toFixed(2)} s`);
    previous = hand;
  }
});

test("large continuous wrist turn is allowed only in a held continuation", () => {
  const wrist = { type: "pose_wrist", side: "left", twist: 80, startTime: 0.1, endTime: 1.1 };
  const initial = { duration: 1.2, holdFinalPose: true, operators: [wrist] };
  const continuing = { ...initial, continuePrevious: true,
    operators: [{ ...wrist, continuous: true }] };
  assert.equal(generatedProgramSchema.safeParse(initial).success, false);
  assert.equal(generatedProgramSchema.safeParse(continuing).success, true);
  assert.throws(() => compileMotionPlan(initial, rig()), /Wrist twists above 40 degrees/);
  const mesh = rig();
  const motion = appendMotionProgram(
    compileMotionPlan({ duration: 1, holdFinalPose: true, operators: [
      { type: "pose_wrist", side: "left", twist: 15 },
    ] }, mesh), continuing, mesh);
  const player = new MotionPlayer(mesh);
  const log = console.log;
  console.log = () => {};
  try { player.loadMotion(motion); } finally { console.log = log; }
  player.update(1.01);
  const twistBone = mesh.skeleton.getBoneByName(Bones.leftHandTwist);
  const start = twistBone.quaternion.clone();
  player.update(1.78);
  const middle = twistBone.quaternion.clone();
  player.update(2.15);
  const finish = twistBone.quaternion.clone();
  assert.ok(THREE.MathUtils.radToDeg(start.angleTo(finish)) > 35);
  assert.ok(THREE.MathUtils.radToDeg(start.angleTo(finish)) < 65);
  const remainingTurn = THREE.MathUtils.radToDeg(middle.angleTo(finish));
  assert.ok(remainingTurn > 5,
    `the wrist reached its final turn before the continuing clip ended (${remainingTurn.toFixed(2)} degrees remain)`);
});

test("continuous arm path keeps the elbow travelling through the full interval", () => {
  const base = { duration: 1, holdFinalPose: true, operators: [
    { type: "pose_arm", side: "left", outward: 0, flex: 0 },
  ] };
  const segment = { duration: 1, continuePrevious: true, holdFinalPose: true, operators: [
    { type: "pose_arm", side: "left", from: { outward: 0, flex: 0 },
      outward: 35, flex: -45, continuous: true, startTime: 0, endTime: 1 },
  ] };
  assert.ok(generatedProgramSchema.safeParse(segment).success);
  const mesh = rig();
  const motion = appendMotionProgram(compileMotionPlan(base, mesh), segment, mesh);
  const player = new MotionPlayer(mesh);
  const log = console.log;
  console.log = () => {};
  try { player.loadMotion(motion); } finally { console.log = log; }
  const elbow = mesh.skeleton.getBoneByName(Bones.leftElbow);
  player.update(1.65);
  const early = elbow.quaternion.clone();
  player.update(2);
  const end = elbow.quaternion.clone();
  assert.ok(THREE.MathUtils.radToDeg(early.angleTo(end)) > 5,
    "the elbow reached its final rotation before the segment ended");
});

test("decimal tenth arm stages meet without a false overlap", () => {
  const plan = { duration: 2, holdFinalPose: true, operators: [
    { type: "pose_arm", side: "left", from: { flex: 0 }, flex: 15,
      continuous: true, startTime: 1.3, endTime: 1.4 },
    { type: "pose_arm", side: "left", from: { flex: 15 }, flex: 35,
      continuous: true, startTime: 1.4, endTime: 1.5 },
  ] };
  assert.ok(generatedProgramSchema.safeParse(plan).success);
  assert.doesNotThrow(() => compileMotionPlan(plan, rig()));
});

test("base spine operator drives the main upper-body bone", () => {
  const plan = { duration: 1, holdFinalPose: true, operators: [
    { type: "pose_spine", segment: "base", roll: 8, startTime: 0, endTime: 1 },
  ] };
  assert.ok(generatedProgramSchema.safeParse(plan).success);
  const mesh = rig();
  const player = new MotionPlayer(mesh);
  const log = console.log;
  console.log = () => {};
  try { player.loadMotion(compileMotionPlan(plan, mesh)); } finally { console.log = log; }
  player.update(1);
  const base = mesh.skeleton.getBoneByName(Bones.upperBody);
  assert.ok(THREE.MathUtils.radToDeg(base.quaternion.angleTo(new THREE.Quaternion())) > 7);
});
