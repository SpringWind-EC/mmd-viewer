import * as THREE from "three";

type VmdBoneFrame = {
  boneName: string;
  frame: number;
  time?: number;
  position: [number, number, number];
  rotation: [number, number, number, number];
};

type RawVmdJson = {
  metadata?: {
    fps?: number;
  };
  boneFrames?: VmdBoneFrame[];
};

function isFiniteVec3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value.slice(0, 3).every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function isFiniteQuat(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 4 &&
    value.slice(0, 4).every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

export function isRawVmdJson(value: unknown): value is RawVmdJson {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as RawVmdJson;

  return (
    Array.isArray(candidate.boneFrames) &&
    candidate.boneFrames.every((frame) => {
      return (
        frame &&
        typeof frame.boneName === "string" &&
        typeof frame.frame === "number" &&
        isFiniteVec3(frame.position) &&
        isFiniteQuat(frame.rotation)
      );
    })
  );
}

function frameTime(frame: VmdBoneFrame, fps: number) {
  return typeof frame.time === "number" ? frame.time : frame.frame / fps;
}

function normalizeQuat(values: [number, number, number, number]) {
  const quat = new THREE.Quaternion(
    values[0],
    values[1],
    values[2],
    values[3]
  ).normalize();

  return [quat.x, quat.y, quat.z, quat.w] as [number, number, number, number];
}

function lerpPosition(
  a: [number, number, number],
  b: [number, number, number],
  t: number
) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ] as [number, number, number];
}

function slerpRotation(
  a: [number, number, number, number],
  b: [number, number, number, number],
  t: number
) {
  const qa = new THREE.Quaternion(a[0], a[1], a[2], a[3]).normalize();
  const qb = new THREE.Quaternion(b[0], b[1], b[2], b[3]).normalize();

  if (qa.dot(qb) < 0) {
    qb.x *= -1;
    qb.y *= -1;
    qb.z *= -1;
    qb.w *= -1;
  }

  const result = new THREE.Quaternion().slerpQuaternions(qa, qb, t);

  return [result.x, result.y, result.z, result.w] as [
    number,
    number,
    number,
    number,
  ];
}

function sampleBoneFrames(
  frames: VmdBoneFrame[],
  time: number,
  fps: number
) {
  if (frames.length === 1) {
    return frames[0];
  }

  let previous = frames[0];
  let next = frames[frames.length - 1];

  for (let index = 0; index < frames.length - 1; index += 1) {
    const a = frames[index];
    const b = frames[index + 1];
    const aTime = frameTime(a, fps);
    const bTime = frameTime(b, fps);

    if (time >= aTime && time <= bTime) {
      previous = a;
      next = b;
      break;
    }
  }

  const previousTime = frameTime(previous, fps);
  const nextTime = frameTime(next, fps);
  const span = nextTime - previousTime;
  const t = span <= 0 ? 0 : (time - previousTime) / span;

  return {
    boneName: previous.boneName,
    frame: Math.round(time * fps),
    time,
    position: lerpPosition(previous.position, next.position, t),
    rotation: slerpRotation(previous.rotation, next.rotation, t),
  } satisfies VmdBoneFrame;
}

export function rawVmdJsonToMotion(raw: RawVmdJson) {
  const fps = raw.metadata?.fps ?? 30;
  const framesByBone = new Map<string, VmdBoneFrame[]>();

  for (const frame of raw.boneFrames ?? []) {
    const frames = framesByBone.get(frame.boneName) ?? [];
    frames.push({
      ...frame,
      position: [...frame.position] as [number, number, number],
      rotation: normalizeQuat(frame.rotation),
    });
    framesByBone.set(frame.boneName, frames);
  }

  for (const frames of framesByBone.values()) {
    frames.sort((a, b) => frameTime(a, fps) - frameTime(b, fps));
  }

  const times = [...new Set(
    [...framesByBone.values()]
      .flat()
      .map((frame) => Number(frameTime(frame, fps).toFixed(4)))
  )].sort((a, b) => a - b);

  const keyframes = times.map((time) => {
    const bones: Record<string, [number, number, number, number]> = {};
    const positions: Record<string, [number, number, number]> = {};

    for (const [boneName, frames] of framesByBone) {
      const sample = sampleBoneFrames(frames, time, fps);
      bones[boneName] = normalizeQuat(sample.rotation);
      positions[boneName] = sample.position;
    }

    return {
      time,
      bones,
      positions,
    };
  });

  return {
    duration: times[times.length - 1] ?? 0,
    loop: false,
    holdFinalPose: true,
    rotationMode: "absolute" as const,
    positionMode: "offset" as const,
    sourceFormat: "raw-vmd-json" as const,
    keyframes,
  };
}
