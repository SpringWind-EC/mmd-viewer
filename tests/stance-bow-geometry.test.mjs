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

function point(mesh, bone) {
  return mesh.skeleton.getBoneByName(bone).getWorldPosition(new THREE.Vector3());
}

test("stance and bow keep both feet planted and balanced", () => {
  const { mesh, solver } = createRig();
  const player = new MotionPlayer(mesh);
  const log = console.log;
  console.log = () => {};
  try {
    for (const [type, intensity] of [
      ["fighting_stance", "mild"],
      ["fighting_stance", "medium"],
      ["fighting_stance", "strong"],
      ["bow", "strong"],
    ]) {
      const motion = compileMotionPlan({ duration: 2.5, actions: [{ type, intensity }] }, mesh);
      player.loadMotion(motion);
      const samples = [];
      for (let i = 0; i <= 100; i++) {
        player.update(i / 100 * motion.duration);
        solver.update();
        samples.push({
          progress: i / 100,
          right: point(mesh, Bones.rightAnkle),
          left: point(mesh, Bones.leftAnkle),
          rightTarget: point(mesh, Bones.rightFootIk),
          leftTarget: point(mesh, Bones.leftFootIk),
          center: point(mesh, Bones.center),
          upper: point(mesh, Bones.upperBody2),
        });
      }
      const start = samples[0];
      const finish = samples[100];
      const ground = start.rightTarget.y;
      const horizontalDrift = (side, startIndex, endIndex) => Math.max(...samples
        .slice(startIndex, endIndex + 1)
        .map((s) => Math.hypot(s[side].x - samples[startIndex][side].x, s[side].z - samples[startIndex][side].z)));
      for (const sample of samples) {
        assert.ok(sample.right.x < sample.left.x, `${type}/${intensity} legs crossed at ${sample.progress}`);
        assert.ok(sample.center.x > sample.right.x && sample.center.x < sample.left.x, `${type}/${intensity} center left support area at ${sample.progress}`);
        assert.ok(sample.right.y > ground - 0.08, `${type}/${intensity} right ankle sank at ${sample.progress}`);
        assert.ok(sample.left.y > ground - 0.08, `${type}/${intensity} left ankle sank at ${sample.progress}`);
      }
      if (type === "fighting_stance") {
        assert.ok(horizontalDrift("left", 0, 47) < 0.05, `${intensity} support foot slid during first placement`);
        assert.ok(horizontalDrift("right", 48, 100) < 0.05, `${intensity} right foot slid after planting`);
        assert.ok(horizontalDrift("left", 82, 100) < 0.05, `${intensity} left foot slid after planting`);
        assert.ok(samples[35].right.y > ground + 0.08, `${intensity} right foot did not lift for placement`);
        assert.ok(samples[65].left.y > ground + 0.08, `${intensity} left foot did not lift for placement`);
        assert.ok(Math.abs(finish.right.y - ground) < 0.08, `${intensity} right foot did not land`);
        assert.ok(Math.abs(finish.left.y - ground) < 0.08, `${intensity} left foot did not land`);
        assert.ok(finish.left.x - finish.right.x > start.left.x - start.right.x + 0.35, `${intensity} stance did not widen`);
        assert.ok(finish.left.z - finish.right.z > 0.25, `${intensity} stance did not stagger`);
      } else {
        assert.ok(horizontalDrift("right", 0, 100) < 0.02, "bow right foot slid");
        assert.ok(horizontalDrift("left", 0, 100) < 0.02, "bow left foot slid");
        assert.ok(Math.max(...samples.map((s) => s.right.y)) < ground + 0.02, "bow right foot lifted");
        assert.ok(Math.max(...samples.map((s) => s.left.y)) < ground + 0.02, "bow left foot lifted");
      }
    }
  } finally {
    console.log = log;
  }
});
