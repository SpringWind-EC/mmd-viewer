import { geminiModel } from "./gemini";
import type { MotionPlan } from "../engine/MotionPlan";

export async function generateMotionPlan(
  prompt: string
): Promise<MotionPlan> {
  const promptResponse =
    await fetch("/MotionPlanPrompt.txt");

  let systemPrompt =
    await promptResponse.text();

  systemPrompt =
    systemPrompt.replaceAll("${prompt}", prompt);

  const result =
    await geminiModel.generateContent(systemPrompt);

  const response =
    await result.response;

  const text =
    response.text();

  console.log("RAW MOTION PLAN RESPONSE:", text);

  const match =
    text.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error("No JSON found in motion plan response");
  }

  const parsed =
    JSON.parse(match[0]);

  if (
    typeof parsed.duration !== "number" ||
    parsed.duration <= 0
  ) {
    parsed.duration = 2.5;
  }

  if (parsed.duration > 3) {
    parsed.duration = 3;
  }

  if (!Array.isArray(parsed.actions)) {
    throw new Error("Invalid motion plan: missing actions");
  }

  parsed.holdFinalPose =
    parsed.holdFinalPose ?? true;

  return parsed;
}