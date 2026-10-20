import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { Parser } from "three/examples/jsm/libs/mmdparser.module.js";
import { appendMotionProgram, compileMotionPlan } from "../src/engine/MotionCompiler.ts";
import { MotionPlayer } from "../src/engine/MotionPlayer.ts";
import { Bones } from "../src/engine/RigCalibration.ts";
import { generatedProgramSchema } from "../server/src/plan-schema.ts";

const file = readFileSync(new URL("../public/models/cyrene.pmx", import.meta.url));
const parsed = new Parser().parsePmx(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), true);

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

test("two foot target phases sweep continuously through their handoff", () => {
  const rear = { right: -0.3, up: 0.7, forward: -2.5 };
  const front = { right: -0.3, up: 1.2, forward: 4 };
  const program = {
    duration: 2.4, holdFinalPose: true,
    operators: [
      { type: "place_foot", side: "right", offset: rear, startTime: 0.2, endTime: 1.2 },
      { type: "place_foot", side: "right", from: rear, offset: front, startTime: 1.2, endTime: 2.3 },
    ],
  };
  const parsedProgram = generatedProgramSchema.parse(program);
  assert.deepEqual(parsedProgram.operators[1].from, rear);
  const mesh = rig();
  const player = new MotionPlayer(mesh);
  const log = console.log;
  console.log = () => {};
  try { player.loadMotion(compileMotionPlan(program, mesh)); } finally { console.log = log; }
  const foot = mesh.skeleton.getBoneByName(Bones.rightFootIk);
  const positionAt = time => {
    player.update(time);
    return foot.getWorldPosition(new THREE.Vector3());
  };
  const before = positionAt(1.19);
  const at = positionAt(1.2);
  const after = positionAt(1.21);
  assert.ok(before.distanceTo(at) < 0.25, "foot jumped before the handoff");
  assert.ok(at.distanceTo(after) < 0.25, "foot jumped after the handoff");
  assert.ok(positionAt(2.3).distanceTo(before) > 2, "foot did not move across the trajectory");
});

test("an already lifted foot can sweep widely in a continuing segment", () => {
  const base = { duration: 1, holdFinalPose: true, operators: [
    { type: "place_foot", side: "right", offset: { right: -0.3, up: 0.7, forward: -2.5 } },
  ] };
  const continuation = { duration: 1, continuePrevious: true, holdFinalPose: true, operators: [
    { type: "place_foot", side: "right", extendedReach: true,
      offset: { right: 5.2, up: 0, forward: 2.4 } },
  ] };
  assert.equal(generatedProgramSchema.safeParse(continuation).success, true);
  assert.equal(generatedProgramSchema.safeParse({ ...continuation,
    operators: [{ ...continuation.operators[0], extendedReach: false }] }).success, false);
  const mesh = rig();
  assert.doesNotThrow(() => appendMotionProgram(compileMotionPlan(base, mesh), continuation, mesh));
});
