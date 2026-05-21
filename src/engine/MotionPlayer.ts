import * as THREE from "three";
import { CCDIKSolver } from "three/examples/jsm/animation/CCDIKSolver.js";

export class MotionPlayer {
  mesh: any;
  motion: any;

  startTime = 0;

  failedAttempts = 0;
  maxFailedAttempts = 10;

  constructor(mesh: any) {
    this.mesh = mesh;
  }

  loadMotion(motion: any) {
    this.motion = motion;

    this.startTime = performance.now();

    this.failedAttempts = 0;
  }

  update() {
    if (!this.motion) return;

    const frames = this.motion.frames;

    if (!frames || frames.length === 0) return;

    // =========================
    // LOOP TIME
    // =========================

    const duration = frames[frames.length - 1].time;

    let elapsed = ((performance.now() - this.startTime) / 1000) % duration;

    // =========================
    // FIND FRAME PAIR
    // =========================

    let prevFrame = frames[0];
    let nextFrame = frames[0];

    for (let i = 0; i < frames.length - 1; i++) {

      const a = frames[i];
      const b = frames[i + 1];

      if (
        elapsed >= a.time &&
        elapsed <= b.time
      ) {
        prevFrame = a;
        nextFrame = b;
        break;
      }
    }

    // =========================
    // INTERPOLATION FACTOR
    // =========================

    const frameDelta = nextFrame.time - prevFrame.time;

    const t = frameDelta <= 0 ? 0 : (elapsed - prevFrame.time)/ frameDelta;

    // =========================
    // APPLY BONES
    // =========================
    Object.entries(prevFrame.bones).forEach(
      ([boneName, prevRot]: any) => {

        const bone =
          this.mesh.skeleton.getBoneByName(
            boneName
          );

        if (!bone) return;

        const nextRot =
          nextFrame.bones[boneName];

        if (
          !Array.isArray(prevRot) ||
          prevRot.length < 4
        ) {
          return;
        }

        if (
          !Array.isArray(nextRot) ||
          nextRot.length < 4
        ) {
          return;
        }

        try {

          // =========================
          // PREV QUAT
          // =========================

          const qa =
            new THREE.Quaternion(
              prevRot[0],
              prevRot[1],
              prevRot[2],
              prevRot[3]
            );

          // =========================
          // NEXT QUAT
          // =========================

          const qb =
            new THREE.Quaternion(
              nextRot[0],
              nextRot[1],
              nextRot[2],
              nextRot[3]
            );

          // =========================
          // FIX QUATERNION FLIPPING
          // =========================

          if (qa.dot(qb) < 0) {

            qb.x *= -1;
            qb.y *= -1;
            qb.z *= -1;
            qb.w *= -1;
          }

          // =========================
          // SLERP
          // =========================

          bone.quaternion.slerpQuaternions(
            qa,
            qb,
            t
          );

        } catch (error) {

          console.error(
            "Quaternion error:",
            boneName,
            error
          );
        }
      }
    );
  }
}


    