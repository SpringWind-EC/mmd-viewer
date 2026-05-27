import * as THREE from "three";

type QuaternionArray = [number, number, number, number];
type PositionArray = [number, number, number];

type MotionKeyframe = {
  time: number;
  bones?: Record<string, QuaternionArray>;
  positions?: Record<string, PositionArray>;
};

type MotionData = {
  duration?: number;
  loop?: boolean;
  holdFinalPose?: boolean;
  rotationMode?: "absolute" | "delta";
  keyframes: MotionKeyframe[];
};

export class MotionPlayer {
  mesh: any;
  motion: MotionData | null = null;

  restPose: Record<string, THREE.Quaternion> = {};
  restPosition: Record<string, THREE.Vector3> = {};

  startTime = 0;

  constructor(mesh: any) {
    this.mesh = mesh;

    // Save original MMD rest pose.
    this.mesh.skeleton.bones.forEach((bone: any) => {
      this.restPose[bone.name] = bone.quaternion.clone();
      this.restPosition[bone.name] = bone.position.clone();
    });
  }

  resetToRestPose() {
    this.mesh.skeleton.bones.forEach((bone: any) => {
      const restQuat = this.restPose[bone.name];
      const restPos = this.restPosition[bone.name];

      if (restQuat) {
        bone.quaternion.copy(restQuat);
      }

      if (restPos) {
        bone.position.copy(restPos);
      }
    });

    this.mesh.updateMatrixWorld(true);
  }

  loadMotion(motion: MotionData) {
    this.resetToRestPose();

    this.motion = motion;
    this.startTime = performance.now();

    console.log("Motion loaded:", motion);
  }

  update() {
    if (!this.motion) return;

    const keyframes = this.motion.keyframes;

    if (!keyframes || keyframes.length < 2) return;

    const duration =
      this.motion.duration ??
      keyframes[keyframes.length - 1].time;

    if (!duration || duration <= 0) return;

    const elapsed =
      (performance.now() - this.startTime) / 1000;

    // Important:
    // Do NOT loop by default.
    // For steps / poses, hold the final pose.
    const shouldLoop = this.motion.loop === true;

    const tGlobal = shouldLoop
      ? elapsed % duration
      : Math.min(elapsed, duration);

    // =========================
    // FIND SURROUNDING KEYFRAMES
    // =========================

    let kfA = keyframes[0];
    let kfB = keyframes[keyframes.length - 1];

    for (let i = 0; i < keyframes.length - 1; i++) {
      const a = keyframes[i];
      const b = keyframes[i + 1];

      if (tGlobal >= a.time && tGlobal <= b.time) {
        kfA = a;
        kfB = b;
        break;
      }
    }

    const span = kfB.time - kfA.time;

    const t =
      span <= 0
        ? 0
        : (tGlobal - kfA.time) / span;

    // Blender-like smooth interpolation
    const smoothT = t * t * (3 - 2 * t);

    // =========================
    // APPLY ROTATIONS + POSITIONS
    // =========================

    this.applyBoneRotations(kfA, kfB, smoothT);
    this.applyBonePositions(kfA, kfB, smoothT);

    this.mesh.updateMatrixWorld(true);
  }

  private applyBoneRotations(
    kfA: MotionKeyframe,
    kfB: MotionKeyframe,
    smoothT: number
  ) {
    const boneNames = new Set<string>();

    if (kfA.bones) {
      Object.keys(kfA.bones).forEach((name) => boneNames.add(name));
    }

    if (kfB.bones) {
      Object.keys(kfB.bones).forEach((name) => boneNames.add(name));
    }

    for (const boneName of boneNames) {
      const bone = this.mesh.skeleton.getBoneByName(boneName);

      if (!bone) {
        console.warn("Rotation bone not found:", boneName);
        continue;
      }

      const a =
        kfA.bones?.[boneName] ??
        this.quaternionToArray(this.restPose[boneName]);

      const b =
        kfB.bones?.[boneName] ??
        this.quaternionToArray(this.restPose[boneName]);

      if (!a || !b) continue;
      if (a.length < 4 || b.length < 4) continue;

      const qa = new THREE.Quaternion(
        a[0],
        a[1],
        a[2],
        a[3]
      ).normalize();

      const qb = new THREE.Quaternion(
        b[0],
        b[1],
        b[2],
        b[3]
      ).normalize();

      // Prevent quaternion long-path spinning
      if (qa.dot(qb) < 0) {
        qb.x *= -1;
        qb.y *= -1;
        qb.z *= -1;
        qb.w *= -1;
      }

      const result = new THREE.Quaternion().slerpQuaternions(qa, qb, smoothT);

      if (this.motion?.rotationMode === "delta") {
        const restQuat =
          this.restPose[boneName] ??
          new THREE.Quaternion();

        bone.quaternion.copy(restQuat).multiply(result);
      } else {
        bone.quaternion.copy(result);
      }
    }
  }

  private applyBonePositions(
    kfA: MotionKeyframe,
    kfB: MotionKeyframe,
    smoothT: number
  ) {
    const boneNames = new Set<string>();

    if (kfA.positions) {
      Object.keys(kfA.positions).forEach((name) => boneNames.add(name));
    }

    if (kfB.positions) {
      Object.keys(kfB.positions).forEach((name) => boneNames.add(name));
    }

    for (const boneName of boneNames) {
      const bone = this.mesh.skeleton.getBoneByName(boneName);

      if (!bone) {
        console.warn("Position bone not found:", boneName);
        continue;
      }

      const a = kfA.positions?.[boneName] ?? [0, 0, 0];
      const b = kfB.positions?.[boneName] ?? [0, 0, 0];

      if (a.length < 3 || b.length < 3) continue;

      const restPos =
        this.restPosition[boneName] ??
        new THREE.Vector3(0, 0, 0);

      // positions are OFFSETS from rest local bone position
      const posA = new THREE.Vector3(
        restPos.x + a[0],
        restPos.y + a[1],
        restPos.z + a[2]
      );

      const posB = new THREE.Vector3(
        restPos.x + b[0],
        restPos.y + b[1],
        restPos.z + b[2]
      );

      bone.position.lerpVectors(posA, posB, smoothT);
    }
  }

  private quaternionToArray(
    q?: THREE.Quaternion
  ): QuaternionArray | null {
    if (!q) return null;

    return [q.x, q.y, q.z, q.w];
  }
}
