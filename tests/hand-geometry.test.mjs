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
const fingers = ["Index", "Middle", "Ring", "Pinky"];

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

function point(mesh, name) {
  return mesh.skeleton.getBoneByName(name).getWorldPosition(new THREE.Vector3());
}

function fingerTips(mesh, side) {
  return fingers.map((finger) => {
    const middle = point(mesh, Bones[`${side}${finger}2`]);
    const distal = point(mesh, Bones[`${side}${finger}3`]);
    return distal.clone().add(distal.clone().sub(middle).multiplyScalar(0.8));
  });
}

function sample(plan, progressList, inspect) {
  const mesh = createRig();
  const player = new MotionPlayer(mesh);
  const log = console.log;
  console.log = () => {};
  try {
    const motion = compileMotionPlan(plan, mesh);
    player.loadMotion(motion);
    return progressList.map((progress) => {
      player.update(progress * motion.duration);
      return inspect(mesh, progress);
    });
  } finally {
    console.log = log;
  }
}

function handGeometry(mesh, side) {
  const tips = fingerTips(mesh, side);
  const wrist = point(mesh, Bones[`${side}Wrist`]);
  const thumb = point(mesh, side === "right" ? "右親指先" : "左親指先");
  return {
    tips,
    wrist,
    thumb,
    thumbIndexGap: thumb.distanceTo(point(mesh, Bones[`${side}Index2`])),
    thumbMiddleGap: thumb.distanceTo(point(mesh, Bones[`${side}Middle2`])),
    gaps: tips.slice(1).map((tip, index) => tip.distanceTo(tips[index])),
    wristAngle: mesh.skeleton.getBoneByName(Bones[`${side}Wrist`]).quaternion.angleTo(new THREE.Quaternion()),
  };
}

test("fists and peace signs keep fingers separated and the thumb tucked", () => {
  for (const side of ["right", "left"]) {
    const [fist] = sample({ duration: 2, actions: [{ type: `${side}_fist` }] }, [1], (mesh) => handGeometry(mesh, side));
    const [peace] = sample({ duration: 2, actions: [{ type: `${side}_peace_sign` }] }, [1], (mesh) => handGeometry(mesh, side));
    assert.ok(fist.gaps.every((gap) => gap > 0.2), `${side} fist fingers crossed`);
    assert.ok(Math.min(fist.thumbIndexGap, fist.thumbMiddleGap) > 0.15 && Math.min(fist.thumbIndexGap, fist.thumbMiddleGap) < 0.5, `${side} fist thumb missed or entered the folded fingers`);
    assert.ok(fist.tips.every((tip) => tip.distanceTo(fist.wrist) < 1.1), `${side} fist left a finger extended`);
    assert.ok(peace.gaps[0] > 0.5, `${side} V fingers overlap`);
    assert.ok(peace.gaps[1] > 1.4, `${side} ring finger failed to fold`);
    assert.ok(peace.gaps[2] > 0.2, `${side} folded fingers crossed`);
    assert.ok(Math.min(peace.thumbIndexGap, peace.thumbMiddleGap) > 0.15, `${side} peace thumb intersects a finger`);

    for (const shape of ["fist", "peace"]) {
      const [operator] = sample({ duration: 2, operators: [{ type: "hand_shape", side, shape }] }, [1], (mesh) => handGeometry(mesh, side));
      const action = shape === "fist" ? fist : peace;
      assert.ok(operator.tips.every((tip, index) => tip.distanceTo(action.tips[index]) < 0.001), `${side}/${shape} operator differs from action`);
      const [both] = sample({ duration: 2, actions: [{ type: shape === "fist" ? "both_fists" : "both_peace_signs" }] }, [1], (mesh) => handGeometry(mesh, side));
      assert.ok(both.tips.every((tip, index) => tip.distanceTo(action.tips[index]) < 0.001), `both ${shape} changed ${side} hand`);
    }
  }
});

test("finger control keeps adjacent fingers apart at curl, spread, and twist extremes", () => {
  for (const side of ["right", "left"]) {
    const [defaultPose] = sample({ duration: 2, actions: [{ type: "finger_control", side, finger: "all" }] }, [1], (mesh) => handGeometry(mesh, side));
    const [openPose] = sample({ duration: 2, actions: [{ type: "finger_control", side, finger: "all", curl: 0 }] }, [1], (mesh) => handGeometry(mesh, side));
    assert.ok(defaultPose.tips.every((tip, index) => tip.distanceTo(openPose.tips[index]) < 0.001), `${side} omitted curl closed the fingers`);

    for (const curl of [0, 0.5, 1]) {
      for (const spread of [-1, 0, 1]) {
        for (const twist of [-1, 0, 1]) {
          const plan = { duration: 2, actions: [{ type: "finger_control", side, finger: "all", curl, spread, twist }] };
          const samples = sample(plan, [0.25, 0.5, 0.75, 1], (mesh) => handGeometry(mesh, side));
          for (const hand of samples) {
            assert.ok(hand.gaps.every((gap) => gap > 0.18), `${side} fingers crossed at curl ${curl}, spread ${spread}, twist ${twist}`);
            assert.ok(Math.min(hand.thumbIndexGap, hand.thumbMiddleGap) > 0.08, `${side} thumb entered a finger at curl ${curl}, spread ${spread}, twist ${twist}`);
            assert.ok(hand.wristAngle < 0.001, `${side} finger control twisted the wrist`);
          }
        }
      }
    }

    const [single] = sample({ duration: 2, actions: [{ type: "finger_control", side, finger: "index", joints: { base: 1, middle: 0, tip: 0 } }] }, [1], (mesh) => ({
      index: mesh.skeleton.getBoneByName(Bones[`${side}Index1`]).quaternion.angleTo(new THREE.Quaternion()),
      middle: mesh.skeleton.getBoneByName(Bones[`${side}Index2`]).quaternion.angleTo(new THREE.Quaternion()),
      ring: mesh.skeleton.getBoneByName(Bones[`${side}Ring1`]).quaternion.angleTo(new THREE.Quaternion()),
    }));
    assert.ok(single.index > 0.5 && single.middle < 0.001 && single.ring < 0.001, `${side} individual joint control affected other joints`);
  }
});

test("hand oscillation shares movement with elbow or forearm and limits wrist rotation", () => {
  for (const side of ["right", "left"]) {
    const effector = `${side}_hand`;
    const anchor = { type: "move_effector", effector, region: `${side}_side_of_head`, intensity: "strong" };
    const [raised] = sample({ duration: 2.5, operators: [anchor] }, [0.25], (mesh) => point(mesh, Bones[`${side}Wrist`]));
    for (const axis of ["horizontal", "vertical", "twist"]) {
      const plan = { duration: 2.5, operators: [anchor, { type: "oscillate", effector, axis, cycles: 2, amplitude: 0.8 }] };
      const samples = sample(plan, [0, 0.25, 0.5, 0.75, 1], (mesh) => ({
        wrist: point(mesh, Bones[`${side}Wrist`]),
        wristQuat: mesh.skeleton.getBoneByName(Bones[`${side}Wrist`]).quaternion.clone(),
        elbowAngle: mesh.skeleton.getBoneByName(Bones[`${side}Elbow`]).quaternion.angleTo(new THREE.Quaternion()),
        forearmAngle: mesh.skeleton.getBoneByName(Bones[`${side}HandTwist`]).quaternion.angleTo(new THREE.Quaternion()),
      }));
      assert.ok(samples[0].wristQuat.angleTo(new THREE.Quaternion()) < 0.001 && samples[4].wristQuat.angleTo(new THREE.Quaternion()) < 0.001, `${side}/${axis} failed to reset wrist`);
      assert.ok(samples.slice(1, 4).every(({ wristQuat }) => wristQuat.angleTo(new THREE.Quaternion()) < 0.27), `${side}/${axis} overtwisted wrist`);
      assert.ok(samples[1].wristQuat.angleTo(samples[2].wristQuat) > 0.15, `${side}/${axis} did not oscillate`);
      if (axis === "twist") {
        assert.ok(samples[1].forearmAngle > 0.05, `${side} twist stayed in wrist`);
      } else {
        assert.ok(samples[1].elbowAngle > 0.05, `${side}/${axis} kept elbow rigid`);
        assert.ok(samples[1].wrist.distanceTo(raised) > 0.04, `${side}/${axis} only rotated the wrist`);
      }
    }

    const reach = { type: "reach", effector, anchor: "chest", offset: { right: side === "right" ? 0.18 : -0.18, up: 0, forward: 0.4 } };
    const timing = { type: "oscillate", effector: "head", axis: "horizontal", cycles: 2, amplitude: 0 };
    const [reachOnly] = sample({ duration: 2.5, operators: [reach, timing] }, [0.25], (mesh) => mesh.skeleton.getBoneByName(Bones[`${side}Elbow`]).quaternion.clone());
    const [withOscillation] = sample({ duration: 2.5, operators: [reach, { type: "oscillate", effector, axis: "horizontal", cycles: 2, amplitude: 0.8 }] }, [0.25], (mesh) => ({
      elbow: mesh.skeleton.getBoneByName(Bones[`${side}Elbow`]).quaternion.clone(),
      forearm: mesh.skeleton.getBoneByName(Bones[`${side}HandTwist`]).quaternion.angleTo(new THREE.Quaternion()),
    }));
    assert.ok(withOscillation.elbow.angleTo(reachOnly) < 0.001, `${side} oscillation overwrote a reach elbow`);
    assert.ok(withOscillation.forearm > 0.05, `${side} reach oscillation failed to share motion with forearm`);
  }
});
