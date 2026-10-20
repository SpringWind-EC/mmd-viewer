import { readFile } from "node:fs/promises";
import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from "@google/generative-ai";

const promptFiles = {
  motion: new URL("../../public/MotionPrompt.txt", import.meta.url),
  plan: new URL("../../public/MotionPlanPrompt.txt", import.meta.url),
  bones: new URL("../../public/ControlBones.txt", import.meta.url),
};

const choice = (values: string[]): ResponseSchema => ({ type: SchemaType.STRING, format: "enum", enum: values });
const number: ResponseSchema = { type: SchemaType.NUMBER };

// The model schema guides output shape; the server validates operator-specific fields and timing.
export const motionProgramResponseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    duration: number,
    loop: { type: SchemaType.BOOLEAN },
    holdFinalPose: { type: SchemaType.BOOLEAN },
    continuePrevious: { type: SchemaType.BOOLEAN },
    operators: {
      type: SchemaType.ARRAY,
      minItems: 1,
      maxItems: 100,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: choice(["place_body", "place_foot", "pose_pelvis", "pose_spine", "pose_ankle", "pose_toe", "pose_torso", "pose_waist", "pose_head", "pose_neck", "bend_elbow", "pose_arm", "pose_forearm", "pose_wrist", "pose_palm", "reach", "move_effector", "orient_effector", "hand_shape", "finger", "look", "oscillate", "shift_weight"]),
          effector: choice(["head", "gaze", "torso", "right_hand", "left_hand"]),
          anchor: choice(["head", "chest", "hips"]),
          offset: {
            type: SchemaType.OBJECT,
            properties: { right: number, up: number, forward: number },
            required: ["right", "up", "forward"],
          },
          from: {
            type: SchemaType.OBJECT,
            properties: { right: number, up: number, forward: number, outward: number,
              pitch: number, yaw: number, roll: number, neckShare: number,
              shoulderYaw: number, shoulderRoll: number, shoulderShare: number,
              upperArmRoll: number, flex: number, elbowPlane: number, bend: number, twist: number, tilt: number },
          },
          extendedReach: { type: SchemaType.BOOLEAN },
          continuous: { type: SchemaType.BOOLEAN },
          overhead: { type: SchemaType.BOOLEAN },
          pitch: number,
          yaw: number,
          roll: number,
          turn: number,
          neckShare: number,
          segment: choice(["base", "lower", "upper"]),
          flex: number,
          forward: number,
          outward: number,
          shoulderYaw: number,
          shoulderRoll: number,
          shoulderShare: number,
          upperArmRoll: number,
          elbowPlane: number,
          bend: number,
          tilt: number,
          region: choice(["forward", "front_of_face", "front_of_chest", "chest_center", "above_head", "right_side_of_head", "left_side_of_head", "right_knee", "left_knee", "knees"]),
          intensity: choice(["mild", "medium", "strong"]),
          facing: choice(["viewer", "forward", "left", "right", "up", "down"]),
          target: choice(["viewer", "forward", "left", "right", "up", "down"]),
          side: choice(["left", "right", "both"]),
          shape: choice(["relaxed", "open", "guard", "fist", "peace"]),
          finger: choice(["thumb", "index", "middle", "ring", "pinky", "all", "four_fingers"]),
          curl: number,
          spread: number,
          twist: number,
          joints: {
            type: SchemaType.OBJECT,
            properties: { base: number, middle: number, tip: number },
          },
          axis: choice(["horizontal", "vertical", "twist"]),
          cycles: number,
          amplitude: number,
          direction: choice(["forward", "back", "left", "right", "down"]),
          startTime: number,
          endTime: number,
        },
        required: ["type"],
      },
    },
  },
  required: ["duration", "operators"],
};

export async function generateWithGemini(kind: "motion" | "plan", prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured");

  const [template, bones] = await Promise.all([
    readFile(kind === "motion" ? promptFiles.motion : promptFiles.plan, "utf8"),
    kind === "motion" ? readFile(promptFiles.bones, "utf8") : Promise.resolve(""),
  ]);
  const requestText = template.replaceAll("${boneText}", bones).replaceAll("${prompt}", prompt);
  const model = new GoogleGenerativeAI(key).getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: kind === "plan"
      ? { responseMimeType: "application/json", responseSchema: motionProgramResponseSchema }
      : undefined,
  });
  const result = await model.generateContent(requestText);
  return result.response.text();
}
