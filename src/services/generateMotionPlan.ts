import { geminiModel } from "./gemini";
import type { MotionAction, MotionActionType, MotionPlan } from "../engine/MotionPlan";

const allowedActionTypes: MotionActionType[] = [
  "neutral",
  "two_arms_forward",
  "right_arm_forward",
  "left_arm_forward",
  "reach_forward",
  "right_punch",
  "left_punch",
  "right_jab",
  "left_jab",
  "right_cross",
  "left_cross",
  "right_hook",
  "left_hook",
  "right_uppercut",
  "left_uppercut",
  "right_fist",
  "left_fist",
  "both_fists",
  "finger_control",
  "guard",
  "fighting_stance",
  "bend_knees",
  "crouch",
  "body_lean_forward",
  "body_lean_backward",
  "bow",
  "look_left",
  "look_right",
  "look_up",
  "look_down",
  "nod",
  "shake_head",
  "wave_right",
  "wave_left",
  "happy_greeting",
  "dance_sway",
  "idle_breathing",
  "run_forward",
  "step_forward",
  "step_back",
  "step_left",
  "step_right",
];

const allowedActionTypeSet = new Set<string>(allowedActionTypes);
const allowedIntensities = new Set(["mild", "medium", "strong"]);
const allowedFingerSides = new Set(["right", "left", "both"]);
const allowedFingers = new Set(["thumb", "index", "middle", "ring", "pinky", "all"]);

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number"
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

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

  if (typeof parsed.duration !== "number" || parsed.duration <= 0) {
    parsed.duration = 2.5;
  }

  if (parsed.duration > 5) {
    parsed.duration = 5;
  }

  if (!Array.isArray(parsed.actions)) {
    throw new Error("Invalid motion plan: missing actions");
  }

  parsed.actions = parsed.actions
    .filter((action: Partial<MotionAction>) => {
      return (
        typeof action.type === "string" &&
        allowedActionTypeSet.has(action.type)
      );
    })
    .map((action: Partial<MotionAction>) => {
      const normalized: Partial<MotionAction> = {
        ...action,
        intensity:
          typeof action.intensity === "string" &&
          allowedIntensities.has(action.intensity)
            ? action.intensity
            : "medium",
      };

      if (normalized.type === "finger_control") {
        normalized.side =
          typeof action.side === "string" && allowedFingerSides.has(action.side)
            ? action.side
            : "right";
        normalized.finger =
          typeof action.finger === "string" && allowedFingers.has(action.finger)
            ? action.finger
            : "index";
        normalized.curl = clampNumber(action.curl, 1, 0, 1);
        normalized.spread = clampNumber(action.spread, 0, -1, 1);
        normalized.twist = clampNumber(action.twist, 0, -1, 1);

        if (Array.isArray(action.joints)) {
          normalized.joints = [
            clampNumber(action.joints[0], normalized.curl, 0, 1),
            clampNumber(action.joints[1], normalized.curl, 0, 1),
            clampNumber(action.joints[2], normalized.curl, 0, 1),
          ];
        } else if (action.joints && typeof action.joints === "object") {
          normalized.joints = {
            base: clampNumber(action.joints.base, normalized.curl, 0, 1),
            middle: clampNumber(action.joints.middle, normalized.curl, 0, 1),
            tip: clampNumber(action.joints.tip, normalized.curl, 0, 1),
          };
        }
      }

      return normalized;
    });

  if (parsed.actions.length === 0) {
    parsed.actions = [{ type: "neutral", intensity: "medium" }];
  }

  parsed.holdFinalPose = parsed.holdFinalPose ?? true;
  parsed.loop = parsed.loop === true;

  return parsed;
}
