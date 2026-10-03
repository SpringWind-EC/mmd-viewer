import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { CCDIKSolver } from "three/examples/jsm/animation/CCDIKSolver.js";
import { Parser } from "three/examples/jsm/libs/mmdparser.module.js";
import { compileMotionPlan } from "../src/engine/MotionCompiler.ts";
import { MotionPlayer } from "../src/engine/MotionPlayer.ts";
import { Bones } from "../src/engine/RigCalibration.ts";

const file = readFileSync(new URL("../public/models/cyrene.pmx", import.meta.url));
const parsed = new Parser().parsePmx(
  file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), true
);

function createRig() {
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

  const footIKNames = new Set([Bones.rightFootIk, Bones.leftFootIk, Bones.rightToeIk, Bones.leftToeIk]);
  const iks = parsed.bones.flatMap((bone, index) => {
    if (!bone.ik || !footIKNames.has(bone.name)) return [];
    return [{
      target: index,
      effector: bone.ik.effector,
      iteration: bone.ik.iteration,
      maxAngle: bone.ik.maxAngle,
      links: bone.ik.links.map((link) => {
        const entry = { index: link.index, enabled: true };
        if (link.angleLimitation === 1) {
          const min = link.lowerLimitationAngle;
          const max = link.upperLimitationAngle;
          entry.rotationMin = new THREE.Vector3(-max[0], -max[1], min[2]);
          entry.rotationMax = new THREE.Vector3(-min[0], -min[1], max[2]);
        }
        return entry;
      }),
    }];
  });
  return { mesh, solver: new CCDIKSolver(mesh, iks) };
}

function point(mesh, bone) {
  return mesh.skeleton.getBoneByName(bone).getWorldPosition(new THREE.Vector3());
}

test("PMX IK ankles plant, clear the floor, and do not cross", () => {
  const { mesh, solver } = createRig();
  const player = new MotionPlayer(mesh);
  const log = console.log;
  console.log = () => {};
  try {
    for (const type of ["run_forward", "step_forward", "step_back", "step_left", "step_right"]) {
      const motion = compileMotionPlan({ duration: 2, actions: [{ type, intensity: "strong" }] }, mesh);
      player.loadMotion(motion);
      const samples = [];
      for (let i = 0; i <= 100; i++) {
        const progress = i / 100;
        player.update(progress === 1 && motion.loop ? motion.duration - 1e-6 : progress * motion.duration);
        solver.update();
        samples.push({
          progress,
          right: point(mesh, Bones.rightAnkle),
          left: point(mesh, Bones.leftAnkle),
          rightTarget: point(mesh, Bones.rightFootIk),
          leftTarget: point(mesh, Bones.leftFootIk),
        });
      }
      const groundY = samples[0].rightTarget.y;
      for (const sample of samples) {
        assert.ok(sample.right.x < sample.left.x, `${type} crossed at ${sample.progress}`);
        assert.ok(sample.right.y > groundY - 0.05, `${type} right foot sank at ${sample.progress}`);
        assert.ok(sample.left.y > groundY - 0.05, `${type} left foot sank at ${sample.progress}`);
      }
      if (type === "run_forward") {
        for (const [start, end, side] of [[0, 12, "right"], [50, 62, "left"]]) {
          for (let i = start; i <= end; i++) {
            assert.ok(samples[i][side].distanceTo(samples[start][side]) < 0.025, `${side} slid at ${i / 100}`);
          }
        }
        assert.ok(samples[0].left.y > groundY + 0.08);
        assert.ok(samples[50].right.y > groundY + 0.08);
        assert.ok(samples[0].right.distanceTo(samples[100].right) < 0.005);
        assert.ok(samples[0].left.distanceTo(samples[100].left) < 0.005);
      } else {
        const lead = type === "step_left" ? "left" : "right";
        const trail = lead === "left" ? "right" : "left";
        const maxDrift = (side, start, end) => Math.max(...samples.slice(start, end + 1)
          .map((sample) => sample[side].distanceTo(samples[start][side])));
        const maxHorizontalDrift = (side, start, end) => Math.max(...samples.slice(start, end + 1)
          .map((sample) => Math.hypot(
            sample[side].x - samples[start][side].x,
            sample[side].z - samples[start][side].z
          )));
        assert.ok(maxHorizontalDrift(trail, 0, 62) < 0.05, `${type} support slid`);
        assert.ok(maxHorizontalDrift(lead, 52, 100) < 0.05, `${type} lead foot slid after landing`);
        assert.ok(maxDrift(trail, 0, 62) < 0.22, `${type} support lifted before takeoff`);
        assert.ok(maxDrift(lead, 52, 100) < 0.22, `${type} lead foot lifted after landing`);
        assert.ok(samples[36][lead].y > groundY + 0.15, `${type} lead foot did not clear`);
        assert.ok(samples[78][trail].y > groundY + 0.15, `${type} trailing foot did not clear`);
        assert.ok(Math.abs(samples[100][lead].y - groundY) < 0.05, `${type} lead foot did not land`);
        assert.ok(Math.abs(samples[100][trail].y - groundY) < 0.05, `${type} trailing foot did not land`);
        assert.ok(samples[100][lead].distanceTo(samples[0][lead]) > 2.3, `${type} step too short`);
        assert.ok(samples[100][trail].distanceTo(samples[0][trail]) > 2.3, `${type} trailing foot did not follow`);
      }
    }
  } finally {
    console.log = log;
  }
});
