import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { Parser } from "three/examples/jsm/libs/mmdparser.module.js";
import { vmdPositionToViewer, vmdRotationToViewer } from "../qieqie-work/vmd-coordinates.mjs";

const vmdPath = "test-results/qieqie-updated-sections/vmd/qieqie_section_02_of_80.vmd";
const jsonPath = "test-results/qieqie-updated-sections/json/qieqie_section_02_of_80.json";

test("split VMD JSON converts to the same coordinates as Three.js MMDLoader", {
  skip: !existsSync(vmdPath) || !existsSync(jsonPath),
}, () => {
  const bytes = readFileSync(vmdPath);
  const parsed = new Parser().parseVmd(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), true);
  const source = JSON.parse(readFileSync(jsonPath, "utf8"));
  for (const [name, frame] of [["左ひじ", 30], ["左腕", 42], ["左手首", 45], ["センター", 30]]) {
    const expected = parsed.motions.find(item => item.boneName === name && item.frameNum === frame);
    assert.ok(expected, `${name} at frame ${frame} exists in the parsed VMD`);
    const raw = source.bones[name][frame];
    assert.deepEqual(vmdRotationToViewer(raw.rotation), expected.rotation);
    assert.deepEqual(vmdPositionToViewer(raw.position), expected.position);
  }
});
