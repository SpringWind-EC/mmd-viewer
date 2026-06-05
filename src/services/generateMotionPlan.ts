import { geminiModel } from "./gemini";
import type { MotionAction, MotionActionType, MotionPlan } from "../engine/MotionPlan";
import type {
  BodyEffector,
  BodyRegion,
  FacingTarget,
  MotionOperator,
  MotionProgram,
  MotionSide,
} from "../engine/MotionProgram";

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
  "right_peace_sign",
  "left_peace_sign",
  "both_peace_signs",
  "photo_peace_sign",
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
const allowedOperatorTypes = new Set([
  "move_effector",
  "orient_effector",
  "hand_shape",
  "finger",
  "look",
  "oscillate",
  "shift_weight",
]);
const allowedEffectors = new Set<BodyEffector>([
  "head",
  "gaze",
  "torso",
  "hips",
  "right_hand",
  "left_hand",
  "right_foot",
  "left_foot",
]);
const allowedRegions = new Set<BodyRegion>([
  "forward",
  "front_of_face",
  "front_of_chest",
  "chest_center",
  "waist",
  "above_head",
  "right_side_of_head",
  "left_side_of_head",
  "right_knee",
  "left_knee",
  "knees",
]);
const allowedFacingTargets = new Set<FacingTarget>([
  "viewer",
  "forward",
  "left",
  "right",
  "up",
  "down",
]);
const allowedHandShapes = new Set(["relaxed", "open", "guard", "fist", "peace"]);
const allowedOscillationAxes = new Set(["horizontal", "vertical", "twist"]);
const allowedWeightDirections = new Set(["forward", "back", "left", "right", "down"]);

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number"
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function normalizeTimeFields<T extends { startTime?: number; endTime?: number }>(
  item: T,
  source: Partial<T>,
  duration: number
) {
  if (typeof source.startTime === "number") {
    item.startTime = clampNumber(source.startTime, 0, 0, duration);
  }

  if (typeof source.endTime === "number") {
    item.endTime = clampNumber(source.endTime, duration, 0, duration);
  }
}

function normalizeAction(action: Partial<MotionAction>): MotionAction | undefined {
  if (
    typeof action.type !== "string" ||
    !allowedActionTypeSet.has(action.type)
  ) {
    return undefined;
  }

  const normalized: Partial<MotionAction> = {
    ...action,
    type: action.type as MotionActionType,
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

  return normalized as MotionAction;
}

function normalizeOperator(
  operator: Partial<MotionOperator>,
  duration: number
): MotionOperator | undefined {
  if (
    typeof operator.type !== "string" ||
    !allowedOperatorTypes.has(operator.type)
  ) {
    return undefined;
  }

  switch (operator.type) {
    case "move_effector": {
      if (
        typeof operator.effector !== "string" ||
        !allowedEffectors.has(operator.effector as BodyEffector) ||
        typeof operator.region !== "string" ||
        !allowedRegions.has(operator.region as BodyRegion)
      ) {
        return undefined;
      }

      const normalized: MotionOperator = {
        type: "move_effector",
        effector: operator.effector as BodyEffector,
        region: operator.region as BodyRegion,
        intensity:
          typeof operator.intensity === "string" &&
          allowedIntensities.has(operator.intensity)
            ? operator.intensity
            : "medium",
      };
      normalizeTimeFields(normalized, operator, duration);
      return normalized;
    }

    case "orient_effector": {
      if (
        typeof operator.effector !== "string" ||
        !allowedEffectors.has(operator.effector as BodyEffector) ||
        typeof operator.facing !== "string" ||
        !allowedFacingTargets.has(operator.facing as FacingTarget)
      ) {
        return undefined;
      }

      const normalized: MotionOperator = {
        type: "orient_effector",
        effector: operator.effector as BodyEffector,
        facing: operator.facing as FacingTarget,
        intensity:
          typeof operator.intensity === "string" &&
          allowedIntensities.has(operator.intensity)
            ? operator.intensity
            : "medium",
      };
      normalizeTimeFields(normalized, operator, duration);
      return normalized;
    }

    case "hand_shape": {
      if (
        typeof operator.side !== "string" ||
        !allowedFingerSides.has(operator.side) ||
        typeof operator.shape !== "string" ||
        !allowedHandShapes.has(operator.shape)
      ) {
        return undefined;
      }

      const normalized: MotionOperator = {
        type: "hand_shape",
        side: operator.side as MotionSide,
        shape: operator.shape as "relaxed" | "open" | "guard" | "fist" | "peace",
      };
      normalizeTimeFields(normalized, operator, duration);
      return normalized;
    }

    case "finger": {
      if (
        typeof operator.side !== "string" ||
        !allowedFingerSides.has(operator.side) ||
        typeof operator.finger !== "string" ||
        !allowedFingers.has(operator.finger)
      ) {
        return undefined;
      }

      const curl = clampNumber(operator.curl, 1, 0, 1);
      const normalized: MotionOperator = {
        type: "finger",
        side: operator.side as MotionSide,
        finger: operator.finger as "thumb" | "index" | "middle" | "ring" | "pinky" | "all",
        curl,
        spread: clampNumber(operator.spread, 0, -1, 1),
        twist: clampNumber(operator.twist, 0, -1, 1),
      };

      if (Array.isArray(operator.joints)) {
        normalized.joints = [
          clampNumber(operator.joints[0], curl, 0, 1),
          clampNumber(operator.joints[1], curl, 0, 1),
          clampNumber(operator.joints[2], curl, 0, 1),
        ];
      } else if (operator.joints && typeof operator.joints === "object") {
        normalized.joints = {
          base: clampNumber(operator.joints.base, curl, 0, 1),
          middle: clampNumber(operator.joints.middle, curl, 0, 1),
          tip: clampNumber(operator.joints.tip, curl, 0, 1),
        };
      }

      normalizeTimeFields(normalized, operator, duration);
      return normalized;
    }

    case "look": {
      if (
        typeof operator.target !== "string" ||
        !allowedFacingTargets.has(operator.target as FacingTarget)
      ) {
        return undefined;
      }

      const normalized: MotionOperator = {
        type: "look",
        target: operator.target as FacingTarget,
        intensity:
          typeof operator.intensity === "string" &&
          allowedIntensities.has(operator.intensity)
            ? operator.intensity
            : "medium",
      };
      normalizeTimeFields(normalized, operator, duration);
      return normalized;
    }

    case "oscillate": {
      if (
        typeof operator.effector !== "string" ||
        !allowedEffectors.has(operator.effector as BodyEffector) ||
        typeof operator.axis !== "string" ||
        !allowedOscillationAxes.has(operator.axis)
      ) {
        return undefined;
      }

      const normalized: MotionOperator = {
        type: "oscillate",
        effector: operator.effector as BodyEffector,
        axis: operator.axis as "horizontal" | "vertical" | "twist",
        cycles: clampNumber(operator.cycles, 2, 1, 5),
        amplitude: clampNumber(operator.amplitude, 0.25, 0, 1),
      };
      normalizeTimeFields(normalized, operator, duration);
      return normalized;
    }

    case "shift_weight": {
      if (
        typeof operator.direction !== "string" ||
        !allowedWeightDirections.has(operator.direction)
      ) {
        return undefined;
      }

      const normalized: MotionOperator = {
        type: "shift_weight",
        direction: operator.direction as "forward" | "back" | "left" | "right" | "down",
        intensity:
          typeof operator.intensity === "string" &&
          allowedIntensities.has(operator.intensity)
            ? operator.intensity
            : "medium",
      };
      normalizeTimeFields(normalized, operator, duration);
      return normalized;
    }

    default:
      return undefined;
  }
}

export async function generateMotionPlan(
  prompt: string
): Promise<MotionPlan | MotionProgram> {
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

  parsed.holdFinalPose = parsed.holdFinalPose ?? true;
  parsed.loop = parsed.loop === true;

  if (Array.isArray(parsed.operators)) {
    const program: MotionProgram = {
      duration: parsed.duration,
      loop: parsed.loop,
      holdFinalPose: parsed.holdFinalPose,
      operators: parsed.operators
        .map((operator: Partial<MotionOperator>) =>
          normalizeOperator(operator, parsed.duration)
        )
        .filter(Boolean),
    };

    if (program.operators.length === 0) {
      program.operators = [{ type: "look", target: "viewer", intensity: "medium" }];
    }

    return program;
  }

  if (!Array.isArray(parsed.actions)) {
    throw new Error("Invalid motion plan: missing operators");
  }

  const plan: MotionPlan = {
    duration: parsed.duration,
    loop: parsed.loop,
    holdFinalPose: parsed.holdFinalPose,
    actions: parsed.actions
      .map((action: Partial<MotionAction>) => normalizeAction(action))
      .filter(Boolean),
  };

  if (plan.actions.length === 0) {
    plan.actions = [{ type: "neutral", intensity: "medium" }];
  }

  return plan;
}
