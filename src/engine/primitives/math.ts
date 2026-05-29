import { RigCalibration, type PositionArray, type QuaternionArray } from "../RigCalibration";

export const neutral = RigCalibration.neutral;

export function q(values: readonly number[]): QuaternionArray {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1];
}

export function nlerp(
  a: QuaternionArray,
  b: QuaternionArray,
  t: number
): QuaternionArray {
  let bx = b[0];
  let by = b[1];
  let bz = b[2];
  let bw = b[3];

  const dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;

  if (dot < 0) {
    bx *= -1;
    by *= -1;
    bz *= -1;
    bw *= -1;
  }

  const x = a[0] + (bx - a[0]) * t;
  const y = a[1] + (by - a[1]) * t;
  const z = a[2] + (bz - a[2]) * t;
  const w = a[3] + (bw - a[3]) * t;
  const length = Math.hypot(x, y, z, w) || 1;

  return [x / length, y / length, z / length, w / length];
}

export function normalizeQuat(values: QuaternionArray): QuaternionArray {
  const length = Math.hypot(values[0], values[1], values[2], values[3]) || 1;

  return [
    values[0] / length,
    values[1] / length,
    values[2] / length,
    values[3] / length,
  ];
}

export function multiplyQuat(
  a: QuaternionArray,
  b: QuaternionArray
): QuaternionArray {
  return normalizeQuat([
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ]);
}

export function axisQuat(x: number, y: number, z: number): QuaternionArray {
  const w = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z));
  return [x, y, z, w];
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function lerpPosition(
  a: PositionArray,
  b: PositionArray,
  t: number
): PositionArray {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
