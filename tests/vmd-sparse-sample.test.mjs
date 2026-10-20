import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { sampleVmdRotation } from '../qieqie-work/sample-vmd-rotation.mjs';

test('sparse VMD rotations sample by keyframe number in viewer coordinates', () => {
  const halfTurn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  const source = { bones: { arm: [
    { frame: 0, rotation: [0, 0, 0, 1] },
    { frame: 24, rotation: halfTurn.toArray() },
  ] } };
  const midpoint = sampleVmdRotation(source, 'arm', 12);
  const expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  assert.ok(midpoint.angleTo(expected) < 1e-6);
  assert.ok(sampleVmdRotation(source, 'arm', -1).angleTo(new THREE.Quaternion()) < 1e-6);
  assert.ok(sampleVmdRotation(source, 'arm', 30).angleTo(
    new THREE.Quaternion(-halfTurn.x, -halfTurn.y, halfTurn.z, halfTurn.w)) < 1e-6);
});
