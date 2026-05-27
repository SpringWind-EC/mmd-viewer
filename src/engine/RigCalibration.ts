export type Intensity = "mild" | "medium" | "strong";
export type QuaternionArray = [number, number, number, number];
export type PositionArray = [number, number, number];

type IntensityMap = Record<Intensity, QuaternionArray>;
type SideMap = {
  right: QuaternionArray;
  left: QuaternionArray;
};

export const Bones = {
  center: "センター",
  waist: "腰",
  lowerBody: "下半身",
  upperBody: "上半身",
  upperBody1: "上半身1",
  upperBody2: "上半身2",
  neck: "首",
  head: "頭",

  leftShoulder: "左肩",
  leftArm: "左腕",
  leftArmTwist: "左腕捩",
  leftElbow: "左ひじ",
  leftHandTwist: "左手捩",
  leftWrist: "左手首",
  leftHandTip: "左手先",
  leftThumb0: "左親指０",
  leftThumb1: "左親指１",
  leftThumb2: "左親指２",
  leftIndex1: "左人指１",
  leftIndex2: "左人指２",
  leftIndex3: "左人指３",
  leftMiddle1: "左中指１",
  leftMiddle2: "左中指２",
  leftMiddle3: "左中指３",
  leftRing1: "左薬指１",
  leftRing2: "左薬指２",
  leftRing3: "左薬指３",
  leftPinky1: "左小指１",
  leftPinky2: "左小指２",
  leftPinky3: "左小指３",

  rightShoulder: "右肩",
  rightArm: "右腕",
  rightArmTwist: "右腕捩",
  rightElbow: "右ひじ",
  rightHandTwist: "右手捩",
  rightWrist: "右手首",
  rightHandTip: "右手先",
  rightThumb0: "右親指０",
  rightThumb1: "右親指１",
  rightThumb2: "右親指２",
  rightIndex1: "右人指１",
  rightIndex2: "右人指２",
  rightIndex3: "右人指３",
  rightMiddle1: "右中指１",
  rightMiddle2: "右中指２",
  rightMiddle3: "右中指３",
  rightRing1: "右薬指１",
  rightRing2: "右薬指２",
  rightRing3: "右薬指３",
  rightPinky1: "右小指１",
  rightPinky2: "右小指２",
  rightPinky3: "右小指３",

  leftLeg: "左足",
  leftKnee: "左ひざ",
  leftAnkle: "左足首",
  leftToe: "左つま先",
  leftFootIk: "左足ＩＫ",
  leftToeIk: "左つま先ＩＫ",
  leftFootIkParent: "左足IK親",
  leftLegD: "左足D",
  leftKneeD: "左ひざD",
  leftAnkleD: "左足首D",
  leftFootEx: "左足先EX",
  rightLeg: "右足",
  rightKnee: "右ひざ",
  rightAnkle: "右足首",
  rightToe: "右つま先",
  rightFootIk: "右足ＩＫ",
  rightToeIk: "右つま先ＩＫ",
  rightFootIkParent: "右足IK親",
  rightLegD: "右足D",
  rightKneeD: "右ひざD",
  rightAnkleD: "右足首D",
  rightFootEx: "右足先EX",

  bothEyes: "両目",
  leftEye: "左目",
  rightEye: "右目",
} as const;

export const RigCalibration = {
  neutral: [0, 0, 0, 1] as QuaternionArray,

  shoulder: {
    supportForward: {
      mild: [-0.02, 0, 0, 0.9998],
      medium: [-0.05, 0, 0, 0.9987],
      strong: [-0.08, 0, 0, 0.9968],
    } satisfies IntensityMap,
    lift: {
      mild: [0.02, 0.03, 0, 0.9993],
      medium: [0.04, 0.07, 0.02, 0.9966],
      strong: [0.07, 0.11, 0.03, 0.991],
    } satisfies IntensityMap,
  },

  rightArm: {
    forward: {
      mild: [-0.15, 0.1, 0.08, 0.98],
      medium: [-0.25, 0.25, 0.15, 0.93],
      strong: [-0.35, 0.45, 0.22, 0.8],
    } satisfies IntensityMap,
    guard: {
      mild: [-0.18, 0.12, 0.12, 0.97],
      medium: [-0.28, 0.28, 0.18, 0.9],
      strong: [-0.36, 0.42, 0.24, 0.8],
    } satisfies IntensityMap,
    punch: {
      mild: [-0.25, 0.18, 0.08, 0.95],
      medium: [-0.38, 0.32, 0.12, 0.86],
      strong: [-0.48, 0.45, 0.15, 0.74],
    } satisfies IntensityMap,
    waveUp: {
      mild: [-0.28, 0.16, 0.12, 0.94],
      medium: [-0.42, 0.26, 0.2, 0.84],
      strong: [-0.55, 0.34, 0.28, 0.7],
    } satisfies IntensityMap,
  },

  leftArm: {
    forward: {
      mild: [-0.15, -0.1, -0.08, 0.98],
      medium: [-0.25, -0.25, -0.15, 0.93],
      strong: [-0.35, -0.45, -0.22, 0.8],
    } satisfies IntensityMap,
    guard: {
      mild: [-0.18, -0.12, -0.12, 0.97],
      medium: [-0.28, -0.28, -0.18, 0.9],
      strong: [-0.36, -0.42, -0.24, 0.8],
    } satisfies IntensityMap,
    punch: {
      mild: [-0.25, -0.18, -0.08, 0.95],
      medium: [-0.38, -0.32, -0.12, 0.86],
      strong: [-0.48, -0.45, -0.15, 0.74],
    } satisfies IntensityMap,
    waveUp: {
      mild: [-0.28, -0.16, -0.12, 0.94],
      medium: [-0.42, -0.26, -0.2, 0.84],
      strong: [-0.55, -0.34, -0.28, 0.7],
    } satisfies IntensityMap,
  },

  elbow: {
    bend: {
      mild: [-0.18, 0, 0, 0.98],
      medium: [-0.3, 0, 0, 0.95],
      strong: [-0.5, 0, 0, 0.866],
    } satisfies IntensityMap,
    nearlyStraight: {
      mild: [-0.08, 0, 0, 0.9968],
      medium: [-0.12, 0, 0, 0.9928],
      strong: [-0.16, 0, 0, 0.987],
    } satisfies IntensityMap,
  },

  wrist: {
    relaxedRight: [0, 0.04, 0, 0.9992] as QuaternionArray,
    relaxedLeft: [0, -0.04, 0, 0.9992] as QuaternionArray,
    waveRightA: [0.06, 0.12, 0.12, 0.984],
    waveRightB: [-0.06, -0.08, -0.12, 0.989],
    waveLeftA: [0.06, -0.12, -0.12, 0.984],
    waveLeftB: [-0.06, 0.08, 0.12, 0.989],
  },

  hand: {
    relaxedFinger1: {
      right: [-0.08, 0, 0, 0.9968],
      left: [-0.08, 0, 0, 0.9968],
    } satisfies SideMap,
    relaxedFinger2: {
      right: [-0.1, 0, 0, 0.995],
      left: [-0.1, 0, 0, 0.995],
    } satisfies SideMap,
    relaxedFinger3: {
      right: [-0.08, 0, 0, 0.9968],
      left: [-0.08, 0, 0, 0.9968],
    } satisfies SideMap,
    openFinger: {
      right: [0, 0, 0, 1],
      left: [0, 0, 0, 1],
    } satisfies SideMap,
    guardFinger1: {
      right: [-0.22, 0, 0, 0.975],
      left: [-0.22, 0, 0, 0.975],
    } satisfies SideMap,
    guardFinger2: {
      right: [-0.42, 0, 0, 0.907],
      left: [-0.42, 0, 0, 0.907],
    } satisfies SideMap,
    guardFinger3: {
      right: [-0.36, 0, 0, 0.933],
      left: [-0.36, 0, 0, 0.933],
    } satisfies SideMap,
    fistFinger1: {
      right: [0, -0.02, 0.1, 0.1],
      left: [0, 0.02, -0.1, 0.1],
    } satisfies SideMap,
    fistFinger2: {
      right: [0, 0, 0.1, 0.1],
      left: [0, 0, -0.1, 0.1],
    } satisfies SideMap,
    fistFinger3: {
      right: [0, 0, 0.1, 0.1],
      left: [0, 0, -0.1, 0.1],
    } satisfies SideMap,
    thumbOpenRight0: [0, 0.04, 0, 0.9992],
    thumbOpenRight1: [0, 0.04, 0, 0.9992],
    thumbOpenRight2: [0, 0.04, 0, 0.9992],
    thumbOpenLeft0: [0, -0.04, 0, 0.9992],
    thumbOpenLeft1: [0, -0.04, 0, 0.9992],
    thumbOpenLeft2: [0, -0.04, 0, 0.9992],

    thumbGuardRight0: [-0.2, 0, 0, 0.98],
    thumbGuardRight1: [-0.2, 0, 0, 0.98],
    thumbGuardRight2: [-0.2, 0, 0, 0.98],
    thumbGuardLeft0: [-0.2, 0, 0, 0.98],
    thumbGuardLeft1: [-0.2, 0, 0, 0.98],
    thumbGuardLeft2: [-0.2, 0, 0, 0.98],

    thumbFistRight0: [0, 0, 0, 1],
    thumbFistRight1: [0.3, 0, 0, 1],
    thumbFistRight2: [0.3, 0, 0, 1],
    thumbFistLeft0: [0, 0, 0, 1],
    thumbFistLeft1: [0.3, 0, 0, 1],
    thumbFistLeft2: [0.3, 0, 0, 1],
  },

  torso: {
    forward: {
      mild: [0.04, 0, 0, 0.9992],
      medium: [0.08, 0, 0, 0.9968],
      strong: [0.12, 0, 0, 0.9928],
    } satisfies IntensityMap,
    forwardUpper: {
      mild: [0.02, 0, 0, 0.9998],
      medium: [0.05, 0, 0, 0.9987],
      strong: [0.08, 0, 0, 0.9968],
    } satisfies IntensityMap,
    backward: {
      mild: [-0.03, 0, 0, 0.9995],
      medium: [-0.06, 0, 0, 0.9982],
      strong: [-0.1, 0, 0, 0.995],
    } satisfies IntensityMap,
    swayLeft: [0, 0, 0.06, 0.9982] as QuaternionArray,
    swayRight: [0, 0, -0.06, 0.9982] as QuaternionArray,
    twistLeft: [0, 0.08, 0, 0.9968] as QuaternionArray,
    twistRight: [0, -0.08, 0, 0.9968] as QuaternionArray,
  },

  leg: {
    bendThigh: {
      mild: [-0.1, 0, 0, 0.995],
      medium: [-0.18, 0, 0, 0.984],
      strong: [-0.28, 0, 0, 0.96],
    } satisfies IntensityMap,
    bendKnee: {
      mild: [0.18, 0, 0, 0.984],
      medium: [0.35, 0, 0, 0.936],
      strong: [0.5, 0, 0, 0.866],
    } satisfies IntensityMap,
    ankleCounter: {
      mild: [0.1, 0, 0, 0.995],
      medium: [0.18, 0, 0, 0.984],
      strong: [0.25, 0, 0, 0.968],
    } satisfies IntensityMap,
    rightStepForward: [-0.22, -0.04, 0, 0.975] as QuaternionArray,
    leftStepForward: [-0.22, 0.04, 0, 0.975] as QuaternionArray,
    rightStepBack: [0.16, 0.03, 0, 0.987] as QuaternionArray,
    leftStepBack: [0.16, -0.03, 0, 0.987] as QuaternionArray,
    toeGrip: {
      mild: [0.06, 0, 0, 0.9982],
      medium: [0.1, 0, 0, 0.995],
      strong: [0.14, 0, 0, 0.99],
    } satisfies IntensityMap,
    heelCounter: {
      mild: [0.04, 0, 0, 0.9992],
      medium: [0.08, 0, 0, 0.9968],
      strong: [0.12, 0, 0, 0.9928],
    } satisfies IntensityMap,
  },

  position: {
    centerDrop: {
      mild: [0, -0.25, 0],
      medium: [0, -0.5, 0],
      strong: [0, -0.75, 0],
    } satisfies Record<Intensity, PositionArray>,
    centerForward: {
      mild: [0, -0.15, -0.08],
      medium: [0, -0.35, -0.16],
      strong: [0, -0.55, -0.24],
    } satisfies Record<Intensity, PositionArray>,
    rightFootBrace: {
      mild: [0.08, 0, 0.02],
      medium: [0.16, 0, 0.03],
      strong: [0.24, 0, 0.04],
    } satisfies Record<Intensity, PositionArray>,
    leftFootBrace: {
      mild: [-0.08, 0, -0.02],
      medium: [-0.16, 0, -0.03],
      strong: [-0.24, 0, -0.04],
    } satisfies Record<Intensity, PositionArray>,
  },

  head: {
    lookLeft: [0, 0.16, 0, 0.987] as QuaternionArray,
    lookRight: [0, -0.16, 0, 0.987] as QuaternionArray,
    lookUp: [-0.1, 0, 0, 0.995] as QuaternionArray,
    lookDown: [0.14, 0, 0, 0.99] as QuaternionArray,
    nodDown: [0.16, 0, 0, 0.987] as QuaternionArray,
    nodUp: [-0.08, 0, 0, 0.9968] as QuaternionArray,
  },
} as const;
