import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Parser } from "three/examples/jsm/libs/mmdparser.module.js";
import { Bones } from "../src/engine/RigCalibration.ts";
import { runForwardPrimitive, stepPrimitive } from "../src/engine/primitives/lowerBody.ts";
import { samplePrimitive } from "../src/engine/primitives/core.ts";

const legD = [
  Bones.rightLegD, Bones.rightKneeD, Bones.rightAnkleD,
  Bones.leftLegD, Bones.leftKneeD, Bones.leftAnkleD,
];
const model = readFileSync(new URL("../public/models/cyrene.pmx", import.meta.url));
const modelBones = new Parser().parsePmx(
  model.buffer.slice(model.byteOffset, model.byteOffset + model.byteLength), true
).bones;
const restX = (name) => modelBones.find((bone) => bone.name === name).position[0];
const rightRestX = restX(Bones.rightFootIk);
const leftRestX = restX(Bones.leftFootIk);
for (const [toe, foot] of [[Bones.rightToeIk, Bones.rightFootIk], [Bones.leftToeIk, Bones.leftFootIk]]) {
  const bone = modelBones.find((entry) => entry.name === toe);
  assert.equal(modelBones[bone.parentIndex].name, foot);
}

function foot(sample, side) {
  return sample.positions[side === "right" ? Bones.rightFootIk : Bones.leftFootIk];
}

function checkChannels(primitive) {
  for (const frame of primitive.frames) {
    for (const bone of legD) assert.equal(frame.bones[bone], undefined, `${bone} at ${frame.progress}`);
    assert.deepEqual(frame.positions[Bones.rightToeIk], [0, 0, 0]);
    assert.deepEqual(frame.positions[Bones.leftToeIk], [0, 0, 0]);
  }
}

test("run contacts stay planted and both feet stay on their own sides", () => {
  for (const intensity of ["mild", "medium", "strong"]) {
    const primitive = runForwardPrimitive(intensity);
    checkChannels(primitive);
    assert.deepEqual(primitive.frames[0].positions, primitive.frames.at(-1).positions);

    for (let i = 0; i <= 100; i++) {
      const sample = samplePrimitive(primitive, i / 100);
      assert.ok(
        rightRestX + foot(sample, "right")[0] < leftRestX + foot(sample, "left")[0],
        `${intensity} crossing at ${i / 100}`
      );
      for (const side of ["right", "left"]) {
        const position = foot(sample, side);
        assert.ok(position[1] >= -1e-9, `${intensity} ${side} below floor at ${i / 100}`);
      }
    }

    for (const [from, to, side] of [[0, 0.12, "right"], [0.5, 0.62, "left"]]) {
      const planted = foot(samplePrimitive(primitive, from), side);
      for (let progress = from; progress <= to + 1e-9; progress += 0.01) {
        const current = foot(samplePrimitive(primitive, progress), side);
        for (let axis = 0; axis < 3; axis++) {
          assert.ok(Math.abs(current[axis] - planted[axis]) < 1e-9, `${intensity} ${side} slid during contact`);
        }
      }
    }
  }
});

test("steps lift the moving foot before travel and plant it before the hold", () => {
  for (const intensity of ["mild", "medium", "strong"]) {
    for (const type of ["step_forward", "step_back", "step_left", "step_right"]) {
      const primitive = stepPrimitive(type, intensity);
      checkChannels(primitive);
      const lead = type === "step_left" ? "left" : "right";
      const trail = lead === "left" ? "right" : "left";
      const at = (progress) => samplePrimitive(primitive, progress);
      const final = at(1);
      assert.deepEqual(foot(final, lead), foot(final, trail));
      assert.deepEqual(final.positions[Bones.center], foot(final, lead));
      assert.ok(Math.hypot(foot(final, lead)[0], foot(final, lead)[2]) >=
        (intensity === "strong" ? 2.3 : intensity === "medium" ? 1.5 : 0.8));
      assert.deepEqual(foot(at(0.12), lead), [0, 0, 0]);
      assert.deepEqual(foot(at(0.62), trail), [0, 0, 0]);
      assert.ok(foot(at(0.22), lead)[1] > 0);
      assert.ok(foot(at(0.42), lead)[1] > 0);
      assert.ok(foot(at(0.7), trail)[1] > 0);
      assert.ok(foot(at(0.84), trail)[1] > 0);
      assert.deepEqual(foot(at(0.52), lead), foot(final, lead));
      assert.deepEqual(foot(at(0.94), trail), foot(final, trail));

      for (let i = 0; i <= 100; i++) {
        const progress = i / 100;
        const sample = samplePrimitive(primitive, progress);
        for (const side of [lead, trail]) {
          const position = foot(sample, side);
          assert.ok(position[1] >= -1e-9, `${type} below floor at ${progress}`);
          if (type === "step_left") assert.ok(position[0] >= -1e-9);
          if (type === "step_right") assert.ok(position[0] <= 1e-9);
        }
        assert.ok(
          rightRestX + foot(sample, "right")[0] < leftRestX + foot(sample, "left")[0],
          `${type} crossing at ${progress}`
        );
      }
    }
  }
});
