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

test("viewer and forward head operators explicitly restore the neutral facing", () => {
  for (const target of ["viewer", "forward"]) {
    for (const operator of [
      { type: "look", target },
      { type: "orient_effector", effector: "head", facing: target },
      { type: "orient_effector", effector: "gaze", facing: target },
    ]) {
      const motion = compileMotionPlan({ duration: 2, operators: [operator] });
      const final = motion.keyframes.at(-1).bones;
      assert.deepEqual(final[Bones.head], [0, 0, 0, 1], `${operator.type}/${target} omitted head`);
      assert.deepEqual(final[Bones.neck], [0, 0, 0, 1], `${operator.type}/${target} omitted neck`);
    }

    const motion = compileMotionPlan({ duration: 2.5, operators: [
      { type: "look", target: "left", startTime: 0, endTime: 1 },
      { type: "look", target, startTime: 1, endTime: 2.5 },
    ] });
    const mesh = createRig();
    const player = new MotionPlayer(mesh);
    const log = console.log;
    console.log = () => {};
    try {
      player.loadMotion(motion);
      player.update(0.65);
      assert.ok(mesh.skeleton.getBoneByName(Bones.head).quaternion.angleTo(new THREE.Quaternion()) > 0.08);
      player.update(2.5);
      assert.ok(mesh.skeleton.getBoneByName(Bones.head).quaternion.angleTo(new THREE.Quaternion()) < 0.001);
    } finally {
      console.log = log;
    }
  }
});

test("look, nod, and shake stay within a safe head range and return smoothly", () => {
  const mesh = createRig();
  const player = new MotionPlayer(mesh);
  const log = console.log;
  console.log = () => {};
  try {
    for (const intensity of ["mild", "medium", "strong"]) {
      for (const type of ["look_left", "look_right", "look_up", "look_down", "nod", "shake_head"]) {
        const motion = compileMotionPlan({ duration: 2.5, actions: [{ type, intensity }] }, mesh);
        player.loadMotion(motion);
        let maxAngle = 0;
        for (let i = 0; i <= 100; i++) {
          player.update(i / 100 * motion.duration);
          const angle = mesh.skeleton.getBoneByName(Bones.head).quaternion.angleTo(new THREE.Quaternion());
          maxAngle = Math.max(maxAngle, angle);
          assert.ok(angle < THREE.MathUtils.degToRad(22), `${type}/${intensity} overrotates the head at ${i / 100}`);
        }
        assert.ok(maxAngle > THREE.MathUtils.degToRad(3), `${type}/${intensity} does not move the head`);
        if (type === "nod" || type === "shake_head") {
          assert.ok(mesh.skeleton.getBoneByName(Bones.head).quaternion.angleTo(new THREE.Quaternion()) < 0.001, `${type} does not recenter`);
        }
      }
    }
  } finally {
    console.log = log;
  }
});
