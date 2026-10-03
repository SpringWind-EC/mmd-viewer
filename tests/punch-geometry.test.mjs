import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
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
  return mesh;
}

function point(mesh, bone) {
  return mesh.skeleton.getBoneByName(bone).getWorldPosition(new THREE.Vector3());
}

function measure(mesh, side) {
  const isRight = side === "right";
  const shoulder = point(mesh, isRight ? Bones.rightArm : Bones.leftArm);
  const elbow = point(mesh, isRight ? Bones.rightElbow : Bones.leftElbow);
  const wrist = point(mesh, isRight ? Bones.rightWrist : Bones.leftWrist);
  const fist = point(mesh, isRight ? Bones.rightMiddle1 : Bones.leftMiddle1);
  const chest = point(mesh, Bones.upperBody2);
  const flex = THREE.MathUtils.radToDeg(Math.PI - shoulder.clone().sub(elbow).angleTo(wrist.clone().sub(elbow)));
  return { shoulder, elbow, wrist, fist, chest, flex };
}

test("punches keep bent elbows, aligned fists and clear torso paths", () => {
  const mesh = createRig();
  const player = new MotionPlayer(mesh);
  const log = console.log;
  console.log = () => {};
  try {
    for (const side of ["right", "left"]) {
      for (const intensity of ["mild", "medium", "strong"]) {
        const impacts = {};
        for (const style of ["punch", "jab", "cross", "hook", "uppercut"]) {
          const type = `${side}_${style}`;
          const motion = compileMotionPlan({ duration: 2.5, actions: [{ type, intensity }] }, mesh);
          player.loadMotion(motion);
          const impactIndex = style === "jab" ? 39 : style === "hook" || style === "uppercut" ? 56 : 50;
          const recoilIndex = style === "jab" ? 72 : 82;
          const samples = [];
          for (let i = 0; i <= 100; i++) {
            player.update(i / 100 * motion.duration);
            const sample = measure(mesh, side);
            const forearm = sample.wrist.clone().sub(sample.elbow);
            const hand = sample.fist.clone().sub(sample.wrist);
            const wristAngle = THREE.MathUtils.radToDeg(forearm.angleTo(hand));
            assert.ok(sample.flex > 2 && sample.flex < 135, `${type}/${intensity} elbow ${sample.flex.toFixed(1)}° at ${i / 100}`);
            assert.ok(wristAngle < 35, `${type}/${intensity} wrist bends ${wristAngle.toFixed(1)}° at ${i / 100}`);
            for (let t = 0; t <= 1; t += 0.1) {
              const onForearm = sample.elbow.clone().lerp(sample.fist, t);
              const inTorsoHeight = onForearm.y > sample.chest.y - 1 && onForearm.y < sample.chest.y + 3;
              const inTorsoWidth = Math.abs(onForearm.x - sample.chest.x) < 0.9;
              const behindChestFront = onForearm.z < sample.chest.z + 0.65;
              assert.ok(!(inTorsoHeight && inTorsoWidth && behindChestFront), `${type}/${intensity} fist path entered torso at ${i / 100}`);
            }
            samples.push(sample);
          }
          const chamber = samples[18];
          const impact = samples[impactIndex];
          const recoil = samples[recoilIndex];
          impacts[style] = impact;
          assert.ok(impact.fist.z > chamber.fist.z + 1.3, `${type}/${intensity} did not extend at impact`);
          assert.ok(recoil.fist.distanceTo(chamber.fist) < 0.03, `${type}/${intensity} did not recoil to chamber`);
          assert.ok(Math.abs(chamber.fist.x - chamber.chest.x) < 1.8, `${type}/${intensity} chamber stayed too wide`);
          if (style === "hook") assert.ok(impact.flex > 65, `${type}/${intensity} hook straightened`);
          if (style === "uppercut") assert.ok(impact.fist.y > chamber.fist.y + 0.8, `${type}/${intensity} uppercut did not rise`);
        }
        const sign = side === "right" ? -1 : 1;
        assert.ok(sign * (impacts.punch.wrist.x - impacts.cross.wrist.x) > 0.25, `${side}/${intensity} straight and cross paths match`);
      }
    }
  } finally {
    console.log = log;
  }
});
