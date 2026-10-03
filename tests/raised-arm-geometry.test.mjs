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

function armData(mesh, side, restDirection) {
  const right = side === "right";
  const shoulder = point(mesh, right ? Bones.rightArm : Bones.leftArm);
  const elbow = point(mesh, right ? Bones.rightElbow : Bones.leftElbow);
  const wrist = point(mesh, right ? Bones.rightWrist : Bones.leftWrist);
  const index = point(mesh, right ? Bones.rightIndex3 : Bones.leftIndex3);
  const middle = point(mesh, right ? Bones.rightMiddle3 : Bones.leftMiddle3);
  const head = point(mesh, Bones.head);
  const upper = elbow.clone().sub(shoulder);
  const flex = THREE.MathUtils.radToDeg(Math.PI - shoulder.clone().sub(elbow).angleTo(wrist.clone().sub(elbow)));
  return {
    shoulder, elbow, wrist, index, middle, head, flex,
    swing: THREE.MathUtils.radToDeg(upper.angleTo(restDirection)),
    headDistance: Math.min(wrist.distanceTo(head), index.distanceTo(head), middle.distanceTo(head)),
  };
}

test("forward reaches and raised gestures avoid shoulder strain and head overlap", () => {
  const mesh = createRig();
  const player = new MotionPlayer(mesh);
  const restDirections = Object.fromEntries(["right", "left"].map((side) => {
    const right = side === "right";
    return [side, point(mesh, right ? Bones.rightElbow : Bones.leftElbow).sub(point(mesh, right ? Bones.rightArm : Bones.leftArm))];
  }));
  const log = console.log;
  console.log = () => {};
  try {
    for (const intensity of ["mild", "medium", "strong"]) {
      for (const type of ["two_arms_forward", "reach_forward", "right_arm_forward", "left_arm_forward", "wave_right", "wave_left", "happy_greeting", "photo_peace_sign"]) {
        const motion = compileMotionPlan({ duration: 2.5, actions: [{ type, intensity }] }, mesh);
        player.loadMotion(motion);
        const forward = ["two_arms_forward", "reach_forward", "right_arm_forward", "left_arm_forward"].includes(type);
        const activeSides = ["two_arms_forward", "reach_forward"].includes(type) ? ["right", "left"] : type === "left_arm_forward" || type === "wave_left" ? ["left"] : ["right"];
        const samples = [];
        for (let i = 0; i <= 100; i++) {
          player.update(i / 100 * motion.duration);
          samples.push(Object.fromEntries(["right", "left"].map((side) => [side, armData(mesh, side, restDirections[side])])));
        }
        for (const side of activeSides) {
          const measures = samples.map((sample) => sample[side]);
          for (let i = 0; i < measures.length; i++) {
            const value = measures[i];
            assert.ok(value.swing < (forward ? 85 : 95), `${type}/${intensity}/${side} shoulder strain at ${i / 100}: ${value.swing.toFixed(1)}°`);
            assert.ok(value.flex < 130, `${type}/${intensity}/${side} elbow overbend at ${i / 100}`);
            assert.ok(value.headDistance > 2.8, `${type}/${intensity}/${side} hand overlaps head or hair at ${i / 100}`);
          }
          const pose = measures[forward || type === "photo_peace_sign" ? 100 : 60];
          if (forward) {
            assert.ok(pose.flex > 25, `${type}/${intensity}/${side} elbow locks straight`);
            assert.ok(pose.wrist.z > pose.shoulder.z + 2.5, `${type}/${intensity}/${side} does not reach forward`);
          } else {
            assert.ok(pose.wrist.y > pose.head.y + 0.5, `${type}/${intensity}/${side} hand is not raised`);
          }
        }
        if (["two_arms_forward", "reach_forward"].includes(type)) {
          const right = samples[100].right;
          const left = samples[100].left;
          assert.ok(Math.abs(right.wrist.y - left.wrist.y) < 0.15, `${type}/${intensity} hands are uneven`);
          assert.ok(Math.abs(right.wrist.z - left.wrist.z) < 0.15, `${type}/${intensity} hands reach different depths`);
        }
        if (type === "right_arm_forward" || type === "left_arm_forward") {
          const other = type === "right_arm_forward" ? "left" : "right";
          assert.ok(Math.max(...samples.map((sample) => sample[other].swing)) < 5, `${type}/${intensity} moved the opposite arm`);
        }
      }
    }
  } finally {
    console.log = log;
  }
});

test("operator forward and model-relative reach paths are checked separately", () => {
  const mesh = createRig();
  const player = new MotionPlayer(mesh);
  const restDirections = Object.fromEntries(["right", "left"].map((side) => {
    const right = side === "right";
    return [side, point(mesh, right ? Bones.rightElbow : Bones.leftElbow).sub(point(mesh, right ? Bones.rightArm : Bones.leftArm))];
  }));
  const log = console.log;
  console.log = () => {};
  try {
    for (const side of ["right", "left"]) {
      for (const intensity of ["mild", "medium", "strong"]) {
        for (const kind of ["move_effector", "reach"]) {
          const operator = kind === "move_effector"
            ? { type: kind, effector: `${side}_hand`, region: "forward", intensity }
            : { type: kind, effector: `${side}_hand`, anchor: "chest", offset: { right: side === "right" ? 0.18 : -0.18, up: 0, forward: 0.4 } };
          const motion = compileMotionPlan({ duration: 2.5, operators: [operator] }, mesh);
          player.loadMotion(motion);
          const samples = [];
          for (let i = 0; i <= 100; i++) {
            player.update(i / 100 * motion.duration);
            samples.push(armData(mesh, side, restDirections[side]));
          }
          const end = samples[100];
          assert.ok(samples.every((m) => m.swing < 85 && m.headDistance > 2.8), `${kind}/${side}/${intensity} strains the shoulder or overlaps the head`);
          assert.ok(end.flex > 25 && end.flex < 130, `${kind}/${side}/${intensity} elbow limit`);
          assert.ok(end.wrist.z > end.shoulder.z + 1.5, `${kind}/${side}/${intensity} fails to reach forward`);
          if (kind === "move_effector") assert.ok(end.wrist.z > end.shoulder.z + 2.5, `${side}/${intensity} operator reach is too short`);
        }
      }
    }
  } finally {
    console.log = log;
  }
});

test("photo peace palm faces the camera and its two fingers form a visible V", () => {
  const mesh = createRig();
  const player = new MotionPlayer(mesh);
  const log = console.log;
  console.log = () => {};
  try {
    for (const intensity of ["mild", "medium", "strong"]) {
      const motion = compileMotionPlan({ duration: 2.5, actions: [{ type: "photo_peace_sign", intensity }] }, mesh);
      player.loadMotion(motion);
      for (const progress of [0.35, 0.65, 1]) {
        player.update(progress * motion.duration);
        const wrist = point(mesh, Bones.rightWrist);
        const across = point(mesh, Bones.rightIndex1).sub(point(mesh, Bones.rightPinky1)).normalize();
        const up = point(mesh, Bones.rightMiddle1).sub(wrist).normalize();
        const palm = across.cross(up).normalize();
        const indexTip = point(mesh, Bones.rightIndex3);
        const middleTip = point(mesh, Bones.rightMiddle3);
        assert.ok(palm.z > 0.9 && Math.abs(palm.x) < 0.2, `${intensity}/${progress} palm is turned away from the camera`);
        assert.ok(up.y > 0.9, `${intensity}/${progress} fingers do not point upward`);
        assert.ok(indexTip.x - middleTip.x > 0.75, `${intensity}/${progress} fingers overlap from the front`);
        assert.ok(Math.abs(indexTip.y - middleTip.y) < 0.25, `${intensity}/${progress} fingers are uneven`);
      }
    }
  } finally {
    console.log = log;
  }
});
