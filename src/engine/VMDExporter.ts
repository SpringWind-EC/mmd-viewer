import Encoding from "encoding-japanese";
import * as THREE from "three";

export class VMDExporter {
  static export(motion: any): Uint8Array {
    const keyframes = motion.keyframes;

    if (!keyframes || !Array.isArray(keyframes)) {
      throw new Error("VMD export failed: motion.keyframes is missing");
    }

    // Large temporary buffer
    const buffer = new ArrayBuffer(1024 * 1024 * 10);
    const view = new DataView(buffer);

    let offset = 0;

    // =====================================
    // HEADER
    // =====================================

    const header = "Vocaloid Motion Data 0002";

    for (let i = 0; i < header.length; i++) {
      view.setUint8(offset++, header.charCodeAt(i));
    }

    while (offset < 30) {
      view.setUint8(offset++, 0);
    }

    // =====================================
    // MODEL NAME
    // =====================================

    const modelName = Encoding.convert("AI Motion", {
      to: "SJIS",
      type: "array",
    }) as number[];

    for (let i = 0; i < 20; i++) {
      view.setUint8(offset++, modelName[i] || 0);
    }

    // =====================================
    // COUNT TOTAL BONE KEYFRAMES
    // =====================================

    let boneFrameCount = 0;

    for (const keyframe of keyframes) {
      const boneNames = new Set<string>([
        ...Object.keys(keyframe.bones ?? {}),
        ...Object.keys(keyframe.positions ?? {}),
      ]);

      boneFrameCount += boneNames.size;
    }

    view.setUint32(offset, boneFrameCount, true);
    offset += 4;

    // =====================================
    // WRITE BONE KEYFRAMES
    // =====================================

    for (const keyframe of keyframes) {
      // VMD uses 30 FPS frame numbers
      const frameIndex = Math.round(keyframe.time * 30);
      const boneNames = new Set<string>([
        ...Object.keys(keyframe.bones ?? {}),
        ...Object.keys(keyframe.positions ?? {}),
      ]);

      for (const boneName of boneNames) {
        const q = (keyframe.bones?.[boneName] ?? [0, 0, 0, 1]) as number[];
        const position = (keyframe.positions?.[boneName] ?? [0, 0, 0]) as number[];

        if (!Array.isArray(q) || q.length < 4) {
          continue;
        }

        // Normalize quaternion before export
        const quat = new THREE.Quaternion(
          q[0] ?? 0,
          q[1] ?? 0,
          q[2] ?? 0,
          q[3] ?? 1
        ).normalize();

        // ==========================
        // BONE NAME: 15 bytes Shift-JIS
        // ==========================

        const encodedName = Encoding.convert(boneName, {
          to: "SJIS",
          type: "array",
        }) as number[];

        for (let i = 0; i < 15; i++) {
          view.setUint8(offset++, encodedName[i] || 0);
        }

        // ==========================
        // FRAME NUMBER
        // ==========================

        view.setUint32(offset, frameIndex, true);
        offset += 4;

        // ==========================
        // POSITION
        // ==========================

        view.setFloat32(offset, position[0] ?? 0, true);
        offset += 4;

        view.setFloat32(offset, position[1] ?? 0, true);
        offset += 4;

        view.setFloat32(offset, position[2] ?? 0, true);
        offset += 4;

        // ==========================
        // QUATERNION ROTATION
        // VMD order: x, y, z, w
        // ==========================

        view.setFloat32(offset, quat.x, true);
        offset += 4;

        view.setFloat32(offset, quat.y, true);
        offset += 4;

        view.setFloat32(offset, quat.z, true);
        offset += 4;

        view.setFloat32(offset, quat.w, true);
        offset += 4;

        // ==========================
        // INTERPOLATION
        // 64 bytes.
        // Simple smooth-ish default.
        // ==========================

        for (let i = 0; i < 64; i++) {
          view.setUint8(offset++, 20);
        }
      }
    }

    // =====================================
    // EMPTY MORPH FRAMES
    // =====================================

    view.setUint32(offset, 0, true);
    offset += 4;

    // =====================================
    // EMPTY CAMERA FRAMES
    // =====================================

    view.setUint32(offset, 0, true);
    offset += 4;

    // =====================================
    // EMPTY LIGHT FRAMES
    // =====================================

    view.setUint32(offset, 0, true);
    offset += 4;

    const arrayBuffer = buffer.slice(0, offset) as ArrayBuffer;

    return new Uint8Array(arrayBuffer);
  }
}
