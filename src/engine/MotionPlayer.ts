import * as THREE from "three";

export class MotionPlayer {
  mesh: any;
  motion: any;

  restPose: Record<string, THREE.Quaternion> = {};

  startTime = 0;

  constructor(mesh: any) {
    this.mesh = mesh;

    // Save original A-pose / rest pose
    this.mesh.skeleton.bones.forEach((bone: any) => {
      this.restPose[bone.name] = bone.quaternion.clone();
    });
  }

  resetToRestPose() {
    this.mesh.skeleton.bones.forEach((bone: any) => {
      const restQuat = this.restPose[bone.name];

      if (restQuat) {
        bone.quaternion.copy(restQuat);
      }
    });
  }

  loadMotion(motion: any) {
    // Important: clear previous motion pose first
    this.resetToRestPose();

    this.motion = motion;
    this.startTime = performance.now();
  }

  update() {
    if (!this.motion) return;

    const keyframes = this.motion.keyframes;
    if (!keyframes || keyframes.length < 2) return;

    const duration =
      this.motion.duration ??
      keyframes[keyframes.length - 1].time;

    if (!duration || duration <= 0) return;

    const tGlobal =
      ((performance.now() - this.startTime) / 1000) %
      duration;

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

    // Blender-like easing
    const smoothT =
      t * t * (3 - 2 * t);

    // =========================
    // APPLY KEYFRAME POSE
    // =========================

    for (const boneName in kfA.bones) {
      const bone =
        this.mesh.skeleton.getBoneByName(boneName);

      if (!bone) continue;

      const a = kfA.bones[boneName];
      const b = kfB.bones[boneName];

      if (!a || !b) continue;
      if (a.length < 4 || b.length < 4) continue;

      const qa =
        new THREE.Quaternion(
          a[0],
          a[1],
          a[2],
          a[3]
        ).normalize();

      const qb =
        new THREE.Quaternion(
          b[0],
          b[1],
          b[2],
          b[3]
        ).normalize();

      if (qa.dot(qb) < 0) {
        qb.x *= -1;
        qb.y *= -1;
        qb.z *= -1;
        qb.w *= -1;
      }

      bone.quaternion.slerpQuaternions(
        qa,
        qb,
        smoothT
      );
    }
  }
}