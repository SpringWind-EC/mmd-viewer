import Encoding from "encoding-japanese";

export class VMDExporter {

  static export(motion: any): Uint8Array {

    // Large temporary buffer
    const buffer =
      new ArrayBuffer(1024 * 1024 * 10);

    const view =
      new DataView(buffer);

    let offset = 0;

    // =====================================
    // HEADER
    // =====================================

    const header =
      "Vocaloid Motion Data 0002";

    for (let i = 0; i < header.length; i++) {

      view.setUint8(
        offset++,
        header.charCodeAt(i)
      );
    }

    // pad header to 30 bytes
    while (offset < 30) {

      view.setUint8(offset++, 0);
    }

    // =====================================
    // MODEL NAME (20 bytes)
    // =====================================

    const modelName =
      Encoding.convert(
        "AI Motion",
        {
          to: "SJIS",
          type: "array"
        }
      );

    for (let i = 0; i < 20; i++) {

      view.setUint8(
        offset++,
        modelName[i] || 0
      );
    }

    // =====================================
    // COUNT TOTAL BONE FRAMES
    // =====================================

    let boneFrameCount = 0;

    for (const frame of motion.frames) {

      boneFrameCount +=
        Object.keys(frame.bones).length;
    }

    view.setUint32(
      offset,
      boneFrameCount,
      true
    );

    offset += 4;

    // =====================================
    // WRITE BONE KEYFRAMES
    // =====================================

    for (const frame of motion.frames) {

      const frameIndex =
        Math.round(frame.time * 30);

      for (
        const [boneName, rot]
        of Object.entries(frame.bones)
      ) {

        const q =
          rot as number[];

        // ==========================
        // BONE NAME (15 bytes SJIS)
        // ==========================

        const encodedName =
          Encoding.convert(
            boneName,
            {
              to: "SJIS",
              type: "array"
            }
          );

        for (let i = 0; i < 15; i++) {

          view.setUint8(
            offset++,
            encodedName[i] || 0
          );
        }

        // ==========================
        // FRAME NUMBER
        // ==========================

        view.setUint32(
          offset,
          frameIndex,
          true
        );

        offset += 4;

        // ==========================
        // POSITION (unused)
        // ==========================

        view.setFloat32(offset, 0, true);
        offset += 4;

        view.setFloat32(offset, 0, true);
        offset += 4;

        view.setFloat32(offset, 0, true);
        offset += 4;

        // ==========================
        // QUATERNION ROTATION
        // ==========================

        view.setFloat32(
          offset,
          q[0] || 0,
          true
        );

        offset += 4;

        view.setFloat32(
          offset,
          q[1] || 0,
          true
        );

        offset += 4;

        view.setFloat32(
          offset,
          q[2] || 0,
          true
        );

        offset += 4;

        view.setFloat32(
          offset,
          q[3] ?? 1,
          true
        );

        offset += 4;

        // ==========================
        // INTERPOLATION
        // 64 bytes
        // ==========================

        for (let i = 0; i < 64; i++) {

          view.setUint8(
            offset++,
            20
          );
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

    // Ensure the buffer is explicitly cast to ArrayBuffer
    const arrayBuffer = buffer.slice(0, offset) as ArrayBuffer;

    // Return a Uint8Array created from the ArrayBuffer
    return new Uint8Array(arrayBuffer);
  }
}