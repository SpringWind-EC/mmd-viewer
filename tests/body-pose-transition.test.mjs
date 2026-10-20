import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { Parser } from 'three/examples/jsm/libs/mmdparser.module.js';
import { appendMotionProgram, compileMotionPlan } from '../src/engine/MotionCompiler.ts';
import { MotionPlayer } from '../src/engine/MotionPlayer.ts';
import { generatedProgramSchema } from '../server/src/plan-schema.ts';

const bytes = readFileSync(new URL('../public/models/cyrene.pmx', import.meta.url));
const model = new Parser().parsePmx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), true);
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
  return mesh;
}

test('staged reusable body poses keep their direction and do not snap at a handoff', () => {
  const base = { duration: 1, holdFinalPose: true, operators: [
    { type: 'pose_pelvis', yaw: 8 },
    { type: 'pose_spine', segment: 'base', roll: 4 },
    { type: 'pose_neck', yaw: 10 },
    { type: 'pose_head', neckShare: 0, roll: 3 },
  ] };
  const staged = { duration: 2, continuePrevious: true, holdFinalPose: true, operators: [
    { type: 'pose_pelvis', from: { yaw: 0 }, yaw: -12, continuous: true, startTime: 0, endTime: 0.8 },
    { type: 'pose_pelvis', from: { yaw: -12 }, yaw: 6, continuous: true, startTime: 0.8, endTime: 2 },
    { type: 'pose_spine', segment: 'base', from: { roll: 0 }, roll: 8, continuous: true, startTime: 0, endTime: 0.8 },
    { type: 'pose_spine', segment: 'base', from: { roll: 8 }, roll: -2, continuous: true, startTime: 0.8, endTime: 2 },
    { type: 'pose_neck', from: { yaw: 0 }, yaw: 25, continuous: true, startTime: 0, endTime: 0.8 },
    { type: 'pose_neck', from: { yaw: 25 }, yaw: 5, continuous: true, startTime: 0.8, endTime: 2 },
    { type: 'pose_head', neckShare: 0, from: { roll: 0 }, roll: 10, continuous: true, startTime: 0, endTime: 0.8 },
    { type: 'pose_head', neckShare: 0, from: { roll: 10 }, roll: -6, continuous: true, startTime: 0.8, endTime: 2 },
  ] };
  assert.ok(generatedProgramSchema.safeParse(staged).success);
  const mesh = rig();
  const motion = appendMotionProgram(compileMotionPlan(base, mesh), staged, mesh);
  const player = new MotionPlayer(mesh);
  const oldLog = console.log;
  console.log = () => {};
  try { player.loadMotion(motion); } finally { console.log = oldLog; }
  const names = ['下半身', '上半身', '首', '頭'];
  const sample = time => {
    player.update(time);
    return names.map(name => mesh.skeleton.getBoneByName(name).quaternion.clone());
  };
  const before = sample(1.799);
  const after = sample(1.801);
  before.forEach((rotation, index) => {
    const jump = THREE.MathUtils.radToDeg(rotation.angleTo(after[index]));
    assert.ok(jump < 0.2, `${names[index]} jumped ${jump.toFixed(2)}° at handoff`);
  });
  const start = sample(1);
  const middle = sample(1.8);
  const finish = sample(3);
  assert.ok(THREE.MathUtils.radToDeg(start[0].angleTo(middle[0])) > 8);
  assert.ok(THREE.MathUtils.radToDeg(middle[0].angleTo(finish[0])) > 12);
  assert.ok(THREE.MathUtils.radToDeg(middle[2].angleTo(finish[2])) > 12);
});
