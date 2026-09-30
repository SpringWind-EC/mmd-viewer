import { z } from "zod";

const intensity = z.enum(["mild", "medium", "strong"]);
const side = z.enum(["left", "right", "both"]);
const timing = {
  startTime: z.number().finite().min(0).max(5).optional(),
  endTime: z.number().finite().min(0).max(5).optional(),
};
const joints = z.union([
  z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  z.object({ base: z.number().finite().optional(), middle: z.number().finite().optional(), tip: z.number().finite().optional() }),
]);
const finger = z.enum(["thumb", "index", "middle", "ring", "pinky", "all"]);
const effector = z.enum(["head", "gaze", "torso", "hips", "right_hand", "left_hand", "right_foot", "left_foot"]);
const facing = z.enum(["viewer", "forward", "left", "right", "up", "down"]);

const action = z.object({
  type: z.enum([
    "neutral", "two_arms_forward", "right_arm_forward", "left_arm_forward", "reach_forward",
    "right_punch", "left_punch", "right_jab", "left_jab", "right_cross", "left_cross",
    "right_hook", "left_hook", "right_uppercut", "left_uppercut", "right_fist", "left_fist",
    "both_fists", "right_peace_sign", "left_peace_sign", "both_peace_signs", "photo_peace_sign",
    "finger_control", "guard", "fighting_stance", "bend_knees", "crouch", "body_lean_forward",
    "body_lean_backward", "bow", "look_left", "look_right", "look_up", "look_down", "nod",
    "shake_head", "wave_right", "wave_left", "happy_greeting", "dance_sway", "idle_breathing",
    "run_forward", "step_forward", "step_back", "step_left", "step_right",
  ]),
  intensity: intensity.optional(),
  side: side.optional(),
  finger: finger.optional(),
  curl: z.number().finite().min(0).max(1).optional(),
  spread: z.number().finite().min(-1).max(1).optional(),
  twist: z.number().finite().min(-1).max(1).optional(),
  joints: joints.optional(),
  ...timing,
});

const region = z.enum([
  "forward", "front_of_face", "front_of_chest", "chest_center", "waist", "above_head",
  "right_side_of_head", "left_side_of_head", "right_knee", "left_knee", "knees",
]);

const operator = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move_effector"), effector, region, intensity: intensity.optional(), ...timing }),
  z.object({ type: z.literal("orient_effector"), effector, facing, intensity: intensity.optional(), ...timing }),
  z.object({ type: z.literal("hand_shape"), side, shape: z.enum(["relaxed", "open", "guard", "fist", "peace"]), ...timing }),
  z.object({ type: z.literal("finger"), side, finger, curl: z.number().finite().min(0).max(1).optional(), spread: z.number().finite().min(-1).max(1).optional(), twist: z.number().finite().min(-1).max(1).optional(), joints: joints.optional(), ...timing }),
  z.object({ type: z.literal("look"), target: facing, intensity: intensity.optional(), ...timing }),
  z.object({ type: z.literal("oscillate"), effector, axis: z.enum(["horizontal", "vertical", "twist"]), cycles: z.number().finite().min(1).max(5).optional(), amplitude: z.number().finite().min(0).max(1).optional(), ...timing }),
  z.object({ type: z.literal("shift_weight"), direction: z.enum(["forward", "back", "left", "right", "down"]), intensity: intensity.optional(), ...timing }),
]);

const common = {
  duration: z.number().finite().min(0.5).max(5),
  holdFinalPose: z.boolean().optional(),
  loop: z.boolean().optional(),
};

export const planSchema = z.union([
  z.object({ ...common, operators: z.array(operator).min(1).max(100) }),
  z.object({ ...common, actions: z.array(action).min(1).max(100) }),
]);

export const planInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  plan: planSchema,
});
