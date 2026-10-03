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
const parsed = new Parser().parsePmx(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), true);
const footIKNames = new Set([Bones.rightFootIk, Bones.leftFootIk, Bones.rightToeIk, Bones.leftToeIk]);

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
  const iks = parsed.bones.flatMap((bone, index) => {
    if (!bone.ik || !footIKNames.has(bone.name)) return [];
    return [{
      target: index, effector: bone.ik.effector, iteration: bone.ik.iteration, maxAngle: bone.ik.maxAngle,
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

function point(mesh, name) {
  return mesh.skeleton.getBoneByName(name).getWorldPosition(new THREE.Vector3());
}

function sampleMotion(plan) {
  const { mesh, solver } = createRig();
  const player = new MotionPlayer(mesh);
  const log = console.log;
  console.log = () => {};
  try {
    const motion = compileMotionPlan(plan, mesh);
    player.loadMotion(motion);
    const samples = [];
    for (let index = 0; index <= 100; index++) {
      player.update(index / 100 * motion.duration);
      solver.update();
      samples.push(Object.fromEntries([
        ["center", Bones.center], ["head", Bones.head],
        ["right", Bones.rightAnkle], ["left", Bones.leftAnkle],
        ["rightTarget", Bones.rightFootIk], ["leftTarget", Bones.leftFootIk],
      ].map(([key, name]) => [key, point(mesh, name)])));
    }
    return samples;
  } finally {
    console.log = log;
  }
}

function assertPlanted(samples, label) {
  const start = samples[0];
  for (const [index, sample] of samples.entries()) {
    const progress = index / 100;
    assert.ok(sample.right.x < sample.left.x, `${label} legs crossed at ${progress}`);
    assert.ok(sample.center.x > sample.right.x && sample.center.x < sample.left.x, `${label} center left the feet at ${progress}`);
    for (const side of ["right", "left"]) {
      assert.ok(sample[`${side}Target`].distanceTo(start[`${side}Target`]) < 0.001, `${label} moved ${side} foot IK at ${progress}`);
      assert.ok(sample[side].distanceTo(start[side]) < 0.065, `${label} slid or lifted ${side} ankle at ${progress}`);
    }
  }
}

test("weight shifts load the named side while keeping feet planted", () => {
  for (const intensity of ["mild", "medium", "strong"]) {
    for (const direction of ["forward", "back", "left", "right"]) {
      const label = `${direction}/${intensity}`;
      const samples = sampleMotion({ duration: 2.5, operators: [{ type: "shift_weight", direction, intensity }] });
      assertPlanted(samples, label);
      const start = samples[0];
      const finish = samples[100];
      const axis = direction === "left" || direction === "right" ? "x" : "z";
      const sign = direction === "left" || direction === "forward" ? 1 : -1;
      assert.ok(sign * (finish.center[axis] - start.center[axis]) > 0.08, `${label} moved center the wrong way`);
      assert.ok(sign * (finish.head[axis] - start.head[axis]) > 0.18, `${label} leaned head away from the shift`);
      if (axis === "x") {
        assert.ok(finish.head.x > finish.right.x && finish.head.x < finish.left.x, `${label} moved head beyond the support feet`);
      }
    }
  }
});

test("body leans keep the feet fixed and dance sway returns through center", () => {
  for (const type of ["body_lean_forward", "body_lean_backward"]) {
    const samples = sampleMotion({ duration: 2.5, actions: [{ type, intensity: "strong" }] });
    assertPlanted(samples, type);
    const sign = type.endsWith("forward") ? 1 : -1;
    assert.ok(sign * (samples[100].head.z - samples[0].head.z) > 1, `${type} lost the lean`);
  }

  const sway = Object.fromEntries(["mild", "medium", "strong"].map((intensity) => {
    const samples = sampleMotion({ duration: 2.5, actions: [{ type: "dance_sway", intensity }] });
    assertPlanted(samples, `dance_sway/${intensity}`);
    assert.ok(Math.abs(samples[50].head.x) < 0.02 && Math.abs(samples[100].head.x) < 0.02, `${intensity} sway failed to recenter`);
    return [intensity, samples];
  }));
  assert.ok(sway.mild[25].head.x < sway.medium[25].head.x && sway.medium[25].head.x < sway.strong[25].head.x, "sway intensity did not grow");
  assert.ok(sway.strong[25].head.x > 0.7 && sway.strong[25].center.x > 0.2, "first sway missed left foot");
  assert.ok(sway.strong[75].head.x < -0.7 && sway.strong[75].center.x < -0.2, "second sway missed right foot");
});
