import type { MotionAction } from "../MotionPlan";
import { Bones, RigCalibration, type Intensity } from "../RigCalibration";
import type { BoneMap, MotionPrimitive, PositionMap } from "./types";
import { neutral, nlerp, q } from "./math";
import { mergeBones } from "./core";

type LearnedRightReachFrame = {
  progress: number;
  center: [number, number, number];
  upperBody1: [number, number, number, number];
  upperBody2: [number, number, number, number];
  rightArm: [number, number, number, number];
};

const learnedRightReachForwardFrames: LearnedRightReachFrame[] = [
  { progress: 0, center: [0, 0, 0], upperBody1: [0, 0, 0, 1], upperBody2: [0, 0, 0, 1], rightArm: [0, 0, 0, 1] },
  { progress: 0.137931, center: [0.005270853638648987, -0.00480134692043066, -0.08926860988140106], upperBody1: [-0.0017185043543577194, 0.0001803963677957654, -0.000019471224732114933, 0.9999985098838806], upperBody2: [-0.0030771191231906414, 0.00016829276864882559, -0.000013317807315615937, 0.9999953508377075], rightArm: [0.03751514106988907, -0.012081327848136425, 0.014850754290819168, 0.9991127252578735] },
  { progress: 0.275862, center: [0.0189483854919672, -0.017260538414120674, -0.32091498374938965], upperBody1: [-0.006178270094096661, 0.0006485506310127676, -0.00007000182085903361, 0.9999808073043823], upperBody2: [-0.011064005084335804, 0.000605111476033926, -0.000047885343519737944, 0.9999386072158813], rightArm: [0.14093990623950958, -0.045388251543045044, 0.05579238012433052, 0.9874022006988525] },
  { progress: 0.413793, center: [0.03783005475997925, -0.03446030244231224, -0.6407000422477722], upperBody1: [-0.012335346080362797, 0.0012948765652254224, -0.00013976350601296872, 0.9999231696128845], upperBody2: [-0.022092275321483612, 0.0012082669418305159, -0.00009561597107676789, 0.9997552037239075], rightArm: [0.2923688292503357, -0.09415441006422043, 0.11573710292577744, 0.9445953965187073] },
  { progress: 0.551724, center: [0.058713316917419434, -0.05348336324095726, -0.9943846464157104], upperBody1: [-0.01914491504430771, 0.0020096967928111553, -0.0002169181825593114, 0.9998147487640381], upperBody2: [-0.03428847715258598, 0.0018753004260361195, -0.00014840146468486637, 0.9994102716445923], rightArm: [0.4560759961605072, -0.14687466621398926, 0.18054209649562836, 0.8589686751365662] },
  { progress: 0.689655, center: [0.07839561253786087, -0.07141244411468506, -1.3277294635772705], upperBody1: [-0.025561857968568802, 0.0026833005249500275, -0.0002896242367569357, 0.9996696710586548], upperBody2: [-0.045777421444654465, 0.0025036525912582874, -0.0001981262757908553, 0.9989485740661621], rightArm: [0.5897926092147827, -0.18993674218654633, 0.23347511887550354, 0.7493718862533569] },
  { progress: 0.827586, center: [0.09367441385984421, -0.08533027768135071, -1.5864953994750977], upperBody1: [-0.030541934072971344, 0.00320607447065413, -0.00034605013206601143, 0.9995282888412476], upperBody2: [-0.054689083248376846, 0.0029910479206591845, -0.0002366959524806589, 0.9984989166259766], rightArm: [0.6732861399650574, -0.21682512760162354, 0.26652681827545166, 0.6547031998634338] },
  { progress: 0.965517, center: [0.1013471782207489, -0.09231958538293839, -1.7164431810379028], upperBody1: [-0.033042311668395996, 0.003468546085059643, -0.00037438017898239195, 0.9994479417800903], upperBody2: [-0.05916137993335724, 0.003235644893720746, -0.00025605224072933197, 0.9982431530952454], rightArm: [0.7081462144851685, -0.22805127501487732, 0.2803264856338501, 0.6065794825553894] },
  { progress: 1, center: [0.10170162469148636, -0.09264244884252548, -1.722446322441101], upperBody1: [-0.033157818019390106, 0.0034806702751666307, -0.0003756888909265399, 0.9994440674781799], upperBody2: [-0.059367913752794266, 0.0032469413708895445, -0.0002569460484664887, 0.9982308745384216], rightArm: [0.7096457481384277, -0.2285342812538147, 0.2809201180934906, 0.6043666005134583] },
];

function reachScale(intensity: Intensity) {
  return intensity === "mild" ? 0.55 : intensity === "strong" ? 1.12 : 1;
}

function scaledPosition(values: readonly number[], scale: number): [number, number, number] {
  return [
    (values[0] ?? 0) * scale,
    (values[1] ?? 0) * scale,
    (values[2] ?? 0) * scale,
  ];
}

function scaledQuat(values: readonly number[], scale: number) {
  const converted = [
    -(values[0] ?? 0),
    -(values[1] ?? 0),
    values[2] ?? 0,
    values[3] ?? 1,
  ];

  return nlerp(neutral, q(converted), scale);
}

function rightReachForwardPose(frame: LearnedRightReachFrame, intensity: Intensity): BoneMap {
  const scale = reachScale(intensity);

  return {
    [Bones.upperBody1]: scaledQuat(frame.upperBody1, scale),
    [Bones.upperBody2]: scaledQuat(frame.upperBody2, scale),
    [Bones.rightArm]: scaledQuat(frame.rightArm, scale),
  };
}

function rightReachForwardPositions(
  frame: LearnedRightReachFrame,
  intensity: Intensity
): PositionMap {
  return {
    [Bones.center]: scaledPosition(frame.center, reachScale(intensity)),
  };
}

export function rightArmForwardPose(intensity: Intensity): BoneMap {
  return rightReachForwardPose(
    learnedRightReachForwardFrames[learnedRightReachForwardFrames.length - 1],
    intensity
  );
}

export function leftArmForwardPose(intensity: Intensity): BoneMap {
  return {
    [Bones.leftShoulder]: q(RigCalibration.shoulder.supportForward[intensity]),
    [Bones.leftArm]: q(RigCalibration.leftArm.forward[intensity]),
  };
}

export function rightArmForward(intensity: Intensity = "medium"): BoneMap {
  return rightArmForwardPose(intensity);
}

export function rightReachForwardPrimitive(intensity: Intensity = "medium"): MotionPrimitive {
  return {
    rotationMode: "absolute",
    holdFinalPose: true,
    holdProgress: 1,
    frames: learnedRightReachForwardFrames.map((frame) => ({
      progress: frame.progress,
      bones: rightReachForwardPose(frame, intensity),
      positions: rightReachForwardPositions(frame, intensity),
    })),
  };
}

export function leftArmForward(intensity: Intensity = "medium"): BoneMap {
  return leftArmForwardPose(intensity);
}

export function twoArmsForward(intensity: Intensity = "medium"): BoneMap {
  return mergeBones(
    rightArmForwardPose(intensity),
    leftArmForwardPose(intensity)
  );
}

export function bodyLeanForward(intensity: Intensity = "medium"): BoneMap {
  return {
    [Bones.upperBody]: q(RigCalibration.torso.forward[intensity]),
    [Bones.upperBody1]: q(RigCalibration.torso.forwardUpper[intensity]),
    [Bones.upperBody2]: q(RigCalibration.torso.forwardUpper[intensity]),
  };
}

export function bodyLeanBackward(intensity: Intensity): BoneMap {
  return {
    [Bones.upperBody]: q(RigCalibration.torso.backward[intensity]),
    [Bones.upperBody1]: q(RigCalibration.torso.backward[intensity]),
  };
}

export function headPose(type: MotionAction["type"]): BoneMap {
  switch (type) {
    case "look_left":
      return { [Bones.head]: q(RigCalibration.head.lookLeft) };
    case "look_right":
      return { [Bones.head]: q(RigCalibration.head.lookRight) };
    case "look_up":
      return { [Bones.head]: q(RigCalibration.head.lookUp) };
    case "look_down":
      return { [Bones.head]: q(RigCalibration.head.lookDown) };
    default:
      return {};
  }
}
