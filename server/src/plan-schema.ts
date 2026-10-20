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
const finger = z.enum(["thumb", "index", "middle", "ring", "pinky", "all", "four_fingers"]);
const effector = z.enum(["head", "gaze", "torso", "hips", "right_hand", "left_hand", "right_foot", "left_foot"]);
const facing = z.enum(["viewer", "forward", "left", "right", "up", "down"]);
const bodyOffset = z.object({
  right: z.number().finite().min(-1).max(1),
  up: z.number().finite().min(-5.2).max(1),
  forward: z.number().finite().min(-2).max(2),
});
const footOffset = z.object({
  right: z.number().finite().min(-5.5).max(5.5),
  up: z.number().finite().min(-1.7).max(1.5),
  forward: z.number().finite().min(-4.1).max(4),
});

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

function safeReachTarget(item: {
  effector: "right_hand" | "left_hand";
  anchor: "head" | "chest" | "hips";
  offset: { right: number; up: number; forward: number };
}) {
  const side = item.effector === "right_hand" ? 1 : -1;
  const lateralTarget = side * item.offset.right >= 0.4;
  return side * item.offset.right >= 0.08 &&
    item.offset.forward >= (lateralTarget ? -0.08 : item.anchor === "head" ? 0.12 : 0.22) &&
    (item.anchor !== "head" ||
      Math.hypot(item.offset.right, item.offset.up, item.offset.forward) >= 0.23);
}

const operator = z.discriminatedUnion("type", [
  z.object({ type: z.literal("place_body"), offset: bodyOffset, ...timing }),
  z.object({ type: z.literal("place_foot"), side: z.enum(["right", "left"]), offset: footOffset,
    from: footOffset.optional(), extendedReach: z.boolean().optional(), ...timing }),
  z.object({
    type: z.literal("pose_pelvis"),
    pitch: z.number().finite().min(-15).max(15).optional(),
    yaw: z.number().finite().min(-60).max(60).optional(),
    roll: z.number().finite().min(-20).max(20).optional(),
    from: z.object({ pitch: z.number().finite().min(-15).max(15).optional(),
      yaw: z.number().finite().min(-60).max(60).optional(),
      roll: z.number().finite().min(-20).max(20).optional() }).optional(),
    continuous: z.boolean().optional(),
    ...timing,
  }),
  z.object({
    type: z.literal("pose_spine"),
    segment: z.enum(["base", "lower", "upper"]),
    pitch: z.number().finite().min(-40).max(40).optional(),
    yaw: z.number().finite().min(-20).max(20).optional(),
    roll: z.number().finite().min(-40).max(40).optional(),
    from: z.object({ pitch: z.number().finite().min(-40).max(40).optional(),
      yaw: z.number().finite().min(-20).max(20).optional(),
      roll: z.number().finite().min(-40).max(40).optional() }).optional(),
    continuous: z.boolean().optional(),
    ...timing,
  }),
  z.object({
    type: z.literal("pose_ankle"),
    side: z.enum(["right", "left"]),
    pitch: z.number().finite().min(-45).max(45).optional(),
    yaw: z.number().finite().min(-35).max(35).optional(),
    roll: z.number().finite().min(-20).max(20).optional(),
    ...timing,
  }),
  z.object({
    type: z.literal("pose_toe"),
    side: z.enum(["right", "left"]),
    curl: z.number().finite().min(-20).max(45),
    ...timing,
  }),
  z.object({
    type: z.literal("pose_torso"),
    pitch: z.number().finite().min(-25).max(35).optional(),
    yaw: z.number().finite().min(-35).max(35).optional(),
    roll: z.number().finite().min(-20).max(20).optional(),
    ...timing,
  }),
  z.object({
    type: z.literal("pose_waist"),
    pitch: z.number().finite().min(-5).max(5).optional(),
    yaw: z.number().finite().min(-10).max(10).optional(),
    roll: z.number().finite().min(-4).max(4).optional(),
    ...timing,
  }),
  z.object({
    type: z.literal("pose_head"),
    pitch: z.number().finite().min(-25).max(25).optional(),
    yaw: z.number().finite().min(-30).max(30).optional(),
    roll: z.number().finite().min(-20).max(20).optional(),
    neckShare: z.number().finite().min(0).max(0.7).optional(),
    from: z.object({ pitch: z.number().finite().min(-25).max(25).optional(),
      yaw: z.number().finite().min(-30).max(30).optional(),
      roll: z.number().finite().min(-20).max(20).optional() }).optional(),
    continuous: z.boolean().optional(),
    ...timing,
  }),
  z.object({
    type: z.literal("pose_neck"),
    pitch: z.number().finite().min(-40).max(40).optional(),
    yaw: z.number().finite().min(-40).max(40).optional(),
    roll: z.number().finite().min(-25).max(25).optional(),
    from: z.object({ pitch: z.number().finite().min(-40).max(40).optional(),
      yaw: z.number().finite().min(-40).max(40).optional(),
      roll: z.number().finite().min(-25).max(25).optional() }).optional(),
    continuous: z.boolean().optional(),
    ...timing,
  }),
  z.object({
    type: z.literal("bend_elbow"),
    side: z.enum(["right", "left"]),
    flex: z.number().finite().min(-110).max(110),
    ...timing,
  }),
  z.object({
    type: z.literal("pose_arm"),
    side: z.enum(["right", "left"]),
    forward: z.number().finite().min(-70).max(85).optional(),
    outward: z.number().finite().min(-110).max(80).optional(),
    shoulderYaw: z.number().finite().min(-40).max(40).optional(),
    shoulderRoll: z.number().finite().min(-12).max(12).optional(),
    shoulderShare: z.number().finite().min(0).max(0.28).optional(),
    overhead: z.boolean().optional(),
    upperArmRoll: z.number().finite().min(-90).max(90).optional(),
    flex: z.number().finite().min(-110).max(110).optional(),
    elbowPlane: z.number().finite().min(-55).max(55).optional(),
    continuous: z.boolean().optional(),
    from: z.object({
      forward: z.number().finite().min(-70).max(85).optional(),
      outward: z.number().finite().min(-110).max(80).optional(),
      shoulderYaw: z.number().finite().min(-40).max(40).optional(),
      shoulderRoll: z.number().finite().min(-12).max(12).optional(),
      shoulderShare: z.number().finite().min(0).max(0.28).optional(),
      upperArmRoll: z.number().finite().min(-90).max(90).optional(),
      flex: z.number().finite().min(-110).max(110).optional(),
      elbowPlane: z.number().finite().min(-55).max(55).optional(),
    }).optional(),
    ...timing,
  }),
  z.object({
    type: z.literal("pose_forearm"),
    side: z.enum(["right", "left"]),
    roll: z.number().finite().min(-105).max(105),
    ...timing,
  }),
  z.object({
    type: z.literal("pose_wrist"),
    side: z.enum(["right", "left"]),
    bend: z.number().finite().min(-25).max(25).optional(),
    twist: z.number().finite().min(-90).max(90).optional(),
    tilt: z.number().finite().min(-85).max(85).optional(),
    continuous: z.boolean().optional(),
    from: z.object({
      bend: z.number().finite().min(-25).max(25).optional(),
      twist: z.number().finite().min(-90).max(90).optional(),
      tilt: z.number().finite().min(-85).max(85).optional(),
    }).optional(),
    ...timing,
  }),
  z.object({
    type: z.literal("pose_palm"),
    side: z.enum(["right", "left"]),
    turn: z.number().finite().min(-90).max(90),
    tilt: z.number().finite().min(-45).max(45).optional(),
    bend: z.number().finite().min(-25).max(25).optional(),
    ...timing,
  }),
  z.object({
    type: z.literal("reach"),
    effector: z.enum(["right_hand", "left_hand"]),
    anchor: z.enum(["head", "chest", "hips"]),
    offset: z.object({
      right: z.number().finite().min(-1).max(1),
      up: z.number().finite().min(-1).max(1),
      forward: z.number().finite().min(-1).max(1),
    }),
    ...timing,
  }),
  z.object({ type: z.literal("move_effector"), effector, region, intensity: intensity.optional(), ...timing }),
  z.object({ type: z.literal("orient_effector"), effector, facing, intensity: intensity.optional(), ...timing }),
  z.object({ type: z.literal("hand_shape"), side, shape: z.enum(["relaxed", "open", "guard", "fist", "peace"]), ...timing }),
  z.object({ type: z.literal("finger"), side, finger, curl: z.number().finite().min(-1).max(1).optional(), spread: z.number().finite().min(-1).max(1).optional(), twist: z.number().finite().min(-1).max(1).optional(), joints: joints.optional(), ...timing }),
  z.object({ type: z.literal("look"), target: facing, intensity: intensity.optional(), ...timing }),
  z.object({ type: z.literal("oscillate"), effector, axis: z.enum(["horizontal", "vertical", "twist"]), cycles: z.number().finite().min(1).max(5).optional(), amplitude: z.number().finite().min(0).max(1).optional(), ...timing }),
  z.object({ type: z.literal("shift_weight"), direction: z.enum(["forward", "back", "left", "right", "down"]), intensity: intensity.optional(), ...timing }),
]);

type Operator = z.infer<typeof operator>;
function validateOperatorRelationships(
  program: { duration: number; operators: Operator[] },
  context: z.RefinementCtx
) {
  if ("continuePrevious" in program && program.continuePrevious) {
    const relativeControls = new Set([
      "place_body", "place_foot", "pose_pelvis", "pose_spine", "pose_ankle", "pose_toe",
      "pose_torso", "pose_waist", "pose_head", "pose_neck", "bend_elbow", "pose_arm", "pose_forearm", "pose_wrist", "pose_palm", "finger",
    ]);
    program.operators.forEach((item, index) => {
      if (!relativeControls.has(item.type)) context.addIssue({
        code: "custom", path: ["operators", index],
        message: "Continuing segments require numeric pose and placement operators.",
      });
    });
  }
  program.operators.forEach((item, index) => {
    const continuing = "continuePrevious" in program && program.continuePrevious;
    if (item.type === "pose_forearm" && Math.abs(item.roll) > 40 && !continuing) {
      context.addIssue({
        code: "custom", path: ["operators", index, "roll"],
        message: "Forearm rolls above 40 degrees require a continuing segment with a held pose.",
      });
    }
    if (item.type === "pose_arm" && !continuing && (
        Math.abs(item.shoulderYaw ?? 0) > 25 || Math.abs(item.from?.shoulderYaw ?? 0) > 25 ||
        Math.abs(item.upperArmRoll ?? 0) > 60 || Math.abs(item.from?.upperArmRoll ?? 0) > 60)) {
      context.addIssue({ code: "custom", path: ["operators", index],
        message: "Large shoulder yaw or upper-arm roll requires a continuing segment with a held pose." });
    }
    if (item.type === "pose_wrist" && Math.abs(item.tilt ?? 0) > 35 && !continuing) {
      context.addIssue({
        code: "custom", path: ["operators", index, "tilt"],
        message: "Wrist tilts above 35 degrees require a continuing segment with a held pose.",
      });
    }
    if (item.type === "pose_wrist" && !continuing &&
        (Math.abs(item.twist ?? 0) > 40 || Math.abs(item.from?.twist ?? 0) > 40)) {
      context.addIssue({ code: "custom", path: ["operators", index, "twist"],
        message: "Wrist twists above 40 degrees require a continuing segment with a held pose." });
    }
    if (item.type === "pose_palm" && Math.abs(item.turn) > 65 && !continuing) {
      context.addIssue({
        code: "custom", path: ["operators", index, "turn"],
        message: "Palm turns above 65 degrees require a continuing segment with a held pose.",
      });
    }
    if (item.type === "pose_palm" && Math.abs(item.tilt ?? 0) > 35 && !continuing) {
      context.addIssue({
        code: "custom", path: ["operators", index, "tilt"],
        message: "Palm tilts above 35 degrees require a continuing segment with a held pose.",
      });
    }
    if ((item.type === "bend_elbow" || item.type === "pose_arm") && (item.flex ?? 0) < 0 &&
        !continuing) {
      context.addIssue({
        code: "custom", path: ["operators", index, "flex"],
        message: "Negative elbow flex can only extend a held bend in a continuing segment.",
      });
    }
    if (item.type === "finger" && (item.curl ?? 0) < 0 &&
        !continuing) {
      context.addIssue({
        code: "custom", path: ["operators", index, "curl"],
        message: "Negative finger curl can only release a held pose in a continuing segment.",
      });
    }
    if (item.type === "place_foot") {
      const travel = Math.hypot(item.offset.right, item.offset.forward);
      const forward = Math.abs(item.offset.forward);
      const requiredLift = forward > 3 ? 1.2 : forward > 2 ? 0.7 : 0;
      const unsafeInitialPlacement = !continuing && (
        Math.abs(item.offset.right) > 1.5 || item.offset.up < requiredLift
      );
      if (item.extendedReach && !continuing) {
        context.addIssue({ code: "custom", path: ["operators", index, "extendedReach"],
          message: "Extended foot reach requires a continuing segment with an already lifted foot." });
      }
      if (travel > (item.extendedReach && continuing ? 6.2 : 4.1) || unsafeInitialPlacement) {
        context.addIssue({
          code: "custom",
          path: ["operators", index],
          message: "A foot placement must stay within 4.1 horizontal units, or 6.2 for an extended lifted continuation. An initial placement must stay within 1.5 units laterally and lift enough; wider side sweeps or lowering a raised foot require a continuing segment.",
        });
      }
    }
    if (item.type === "pose_arm") {
      if (((item.forward ?? 0) < -30 || (item.outward ?? 0) < -25) && !continuing) {
        context.addIssue({
          code: "custom",
          path: ["operators", index],
          message: "A large downward or backward arm sweep requires a continuing segment; use it to lower a held raised arm.",
        });
      }
      const lift = Math.max(0, item.forward ?? 0) + Math.max(0, item.outward ?? 0);
      const overhead = item.overhead === true && (item.shoulderShare ?? 0.12) >= 0.1;
      if (lift > (overhead ? 130 : 85) || (lift > 60 && (item.flex ?? 0) > 75)) {
        context.addIssue({
          code: "custom",
          path: ["operators", index],
          message: "Combined arm lift must stay within 85 degrees, or 130 with overhead and shoulderShare at least 0.1; above 60 degrees, elbow flex is limited to 75 degrees.",
        });
      }
    }
    if (item.type !== "bend_elbow" && item.type !== "pose_arm" && item.type !== "pose_forearm" &&
        item.type !== "pose_wrist" && item.type !== "pose_palm" && item.type !== "pose_head" && item.type !== "pose_neck" &&
        item.type !== "pose_pelvis" && item.type !== "pose_spine" &&
        item.type !== "pose_ankle" && item.type !== "pose_toe") return;
    const start = item.startTime ?? 0;
    const end = item.endTime ?? program.duration;
    const conflict = program.operators.some((other, otherIndex) => {
      if (index === otherIndex) return false;
      const otherStart = other.startTime ?? 0;
      const otherEnd = other.endTime ?? program.duration;
      if (Math.max(start, otherStart) >= Math.min(end, otherEnd)) return false;
      if (item.type === "bend_elbow" || item.type === "pose_arm") {
        return ((other.type === "reach" || other.type === "move_effector") &&
          other.effector === `${item.side}_hand`) ||
          ((other.type === "bend_elbow" || other.type === "pose_arm") && other.side === item.side);
      }
      if (item.type === "pose_forearm") {
        return (other.type === "pose_forearm" || other.type === "pose_palm") && other.side === item.side;
      }
      if (item.type === "pose_wrist") {
        return ((other.type === "orient_effector" || other.type === "oscillate") &&
          other.effector === `${item.side}_hand`) ||
          ((other.type === "pose_wrist" || other.type === "pose_palm") && other.side === item.side);
      }
      if (item.type === "pose_palm") {
        return ((other.type === "orient_effector" || other.type === "oscillate") &&
          other.effector === `${item.side}_hand`) ||
          ((other.type === "pose_forearm" || other.type === "pose_wrist" || other.type === "pose_palm") &&
            other.side === item.side);
      }
      if (item.type === "pose_pelvis") return other.type === "pose_pelvis";
      if (item.type === "pose_spine") return other.type === "pose_torso" ||
        (other.type === "pose_spine" && other.segment === item.segment);
      if (item.type === "pose_ankle" || item.type === "pose_toe") {
        return (other.type === "pose_ankle" || other.type === "pose_toe") &&
          other.type === item.type && other.side === item.side;
      }
      if (item.type === "pose_neck") return other.type === "pose_neck" ||
        (other.type === "pose_head" && (other.neckShare ?? 0.3) > 0) ||
        other.type === "look" ||
        (other.type === "orient_effector" && (other.effector === "head" || other.effector === "gaze"));
      if (item.type === "pose_head" && other.type === "pose_neck") return (item.neckShare ?? 0.3) > 0;
      return other.type === "look" ||
        (other.type === "orient_effector" && (other.effector === "head" || other.effector === "gaze"));
    });
    if (conflict) {
      context.addIssue({
        code: "custom",
        path: ["operators", index],
        message: item.type === "pose_head" || item.type === "pose_neck"
          ? "Compound head pose cannot overlap look or head orientation."
          : item.type === "pose_palm"
            ? "pose_palm cannot overlap forearm, wrist, or hand orientation on the same side."
            : item.type === "pose_wrist"
              ? "pose_wrist cannot overlap pose_palm or another hand orientation on the same side."
            : item.type === "pose_pelvis" || item.type === "pose_spine" ||
                item.type === "pose_ankle" || item.type === "pose_toe"
              ? "Two operators cannot drive the same body joint at the same time."
              : "Arm pose cannot overlap another arm pose or hand target on the same side.",
      });
    }
  });
}

const common = {
  duration: z.number().finite().min(0.5).max(5),
  continuePrevious: z.boolean().optional(),
  holdFinalPose: z.boolean().optional(),
  loop: z.boolean().optional(),
};

const individualPlanSchema = z.union([
  z.object({ ...common, operators: z.array(operator).min(1).max(100) }),
  z.object({ ...common, actions: z.array(action).min(1).max(100) }),
]).superRefine((plan, context) => {
  if (!("operators" in plan)) return;
  validateOperatorRelationships(plan, context);
  plan.operators.forEach((item, index) => {
    if (item.type === "reach" && !safeReachTarget(item)) {
      context.addIssue({ code: "custom", path: ["operators", index], message: "Reach target must stay in front of or outside the same-side shoulder." });
    }
  });
});

const sequenceSegmentSchema = z.object({
  ...common,
  duration: z.number().finite().min(0.25).max(5),
  operators: z.array(operator).min(1).max(100),
}).superRefine((segment, context) => {
  validateOperatorRelationships(segment, context);
  segment.operators.forEach((item, index) => {
    if (item.type === "reach" && !safeReachTarget(item)) {
      context.addIssue({ code: "custom", path: ["operators", index], message: "Reach target must stay in front of or outside the same-side shoulder." });
    }
  });
});

export const planSchema = z.union([
  individualPlanSchema,
  z.object({ segments: z.array(sequenceSegmentSchema).min(2).max(64) }).superRefine((sequence, context) => {
    sequence.segments.forEach((segment, index) => {
      if (Boolean(segment.continuePrevious) !== (index > 0)) {
        context.addIssue({
          code: "custom",
          path: ["segments", index, "continuePrevious"],
          message: index === 0
            ? "The first segment must start a new motion."
            : "Following segments must set continuePrevious to true.",
        });
      }
    });
  }),
]);

export const generatedProgramSchema = z.object({
  ...common,
  operators: z.array(operator).min(1).max(100),
}).superRefine((program, context) => {
  validateOperatorRelationships(program, context);
  program.operators.forEach((item, index) => {
    if (item.type === "reach" && !safeReachTarget(item)) {
      context.addIssue({ code: "custom", path: ["operators", index], message: "Reach target must stay in front of or outside the same-side shoulder." });
    }
    const start = item.startTime ?? 0;
    const end = item.endTime ?? program.duration;
    if (start >= end || end > program.duration) {
      context.addIssue({
        code: "custom",
        path: ["operators", index],
        message: "Operator timing must satisfy 0 <= startTime < endTime <= duration.",
      });
    }

    if (item.type === "move_effector") {
      const hand = item.effector === "right_hand" || item.effector === "left_hand";
      const knee = item.region === "right_knee" || item.region === "left_knee" || item.region === "knees";
      const matchingKnee = item.region === "knees" ||
        (item.effector === "right_hand" && item.region === "right_knee") ||
        (item.effector === "left_hand" && item.region === "left_knee");
      const supportedHandRegion = item.region !== "waist" && (!knee || matchingKnee);
      if (!(hand && supportedHandRegion) && !(item.effector === "torso" && item.region === "forward")) {
        context.addIssue({ code: "custom", path: ["operators", index], message: "Unsupported effector and region combination." });
      }
    }

    if (item.type === "orient_effector" && !["head", "gaze", "right_hand", "left_hand"].includes(item.effector)) {
      context.addIssue({ code: "custom", path: ["operators", index], message: "Unsupported orientation effector." });
    }

    if (item.type === "oscillate" && !["head", "gaze", "torso", "right_hand", "left_hand"].includes(item.effector)) {
      context.addIssue({ code: "custom", path: ["operators", index], message: "Unsupported oscillation effector." });
    }
  });
});

export const planInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  plan: planSchema,
});
