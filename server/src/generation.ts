import { readFile } from "node:fs/promises";
import { GoogleGenerativeAI } from "@google/generative-ai";

const promptFiles = {
  motion: new URL("../../public/MotionPrompt.txt", import.meta.url),
  plan: new URL("../../public/MotionPlanPrompt.txt", import.meta.url),
  bones: new URL("../../public/ControlBones.txt", import.meta.url),
};

export async function generateWithGemini(kind: "motion" | "plan", prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured");

  const [template, bones] = await Promise.all([
    readFile(kind === "motion" ? promptFiles.motion : promptFiles.plan, "utf8"),
    kind === "motion" ? readFile(promptFiles.bones, "utf8") : Promise.resolve(""),
  ]);
  const requestText = template.replaceAll("${boneText}", bones).replaceAll("${prompt}", prompt);
  const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(requestText);
  return result.response.text();
}
