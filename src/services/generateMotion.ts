import { geminiModel } from "./gemini";
import * as THREE from "three";

export async function generateMotion(
  prompt: string
) {

  // =========================================
  // LOAD VALID BONES
  // =========================================

  const boneResponse = await fetch("/ControlBones.txt");

  const boneText  = await boneResponse.text();

  // =========================================
  // GENERATE
  // =========================================

  const promptResponse =await fetch("/MotionPrompt.txt");

  let systemPrompt = await promptResponse.text();

  systemPrompt = systemPrompt.replaceAll("${boneText}", boneText).replaceAll("${prompt}", prompt);

  const result = await geminiModel.generateContent(systemPrompt);

  // =========================================
  // RESPONSE
  // =========================================

  const response =
    await result.response;

  const text =
    response.text();

  console.log(
    "RAW GEMINI RESPONSE:",
    text
  );

  // =========================================
  // EXTRACT JSON
  // =========================================

  const match =
    text.match(/\{[\s\S]*\}/);

  if (!match) {

    throw new Error(
      "No JSON found in Gemini response"
    );
  }

  const parsed = JSON.parse(match[0]);

  // =========================================
  // VALIDATION PASS
  // =========================================

  if (!parsed.keyframes || !Array.isArray(parsed.keyframes)) {
    throw new Error("Invalid motion JSON: missing keyframes array");
  }

  if (parsed.keyframes.length < 2) {
    throw new Error("Invalid motion JSON: at least 2 keyframes required");
  }

  if (typeof parsed.duration !== "number") {
    throw new Error("Invalid motion JSON: missing duration");
  }

  if (parsed.duration <= 0) {
    throw new Error("Invalid motion JSON: duration must be greater than 0");
  }

  parsed.keyframes.forEach((keyframe: any) => {
  if (typeof keyframe.time !== "number") {
    throw new Error("Invalid keyframe: missing time");
  }

  if (!keyframe.bones || typeof keyframe.bones !== "object") {
    throw new Error("Invalid keyframe: missing bones");
  }

  Object.entries(keyframe.bones).forEach(
    ([boneName, quat]: any) => {
      if (!Array.isArray(quat) || quat.length !== 4) {
        throw new Error(`Invalid quaternion for bone ${boneName}`);
      }

      const q = new THREE.Quaternion(
        quat[0],
        quat[1],
        quat[2],
        quat[3]
      );

      q.normalize();

      quat[0] = q.x;
      quat[1] = q.y;
        quat[2] = q.z;
      quat[3] = q.w;
    }
  );
});

  // sort keyframes by time
  parsed.keyframes.sort(
    (a: any, b: any) => a.time - b.time
  );

  // clamp duration to last keyframe if needed
  const lastKeyframe = parsed.keyframes[parsed.keyframes.length - 1];

  if (lastKeyframe && parsed.duration < lastKeyframe.time) {
    parsed.duration = lastKeyframe.time;
  }

  return parsed;
}