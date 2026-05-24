export const RigCalibration = {
  rightArm: {
    forward: {
      mild: [-0.15, 0.1, 0.08, 0.98],
      medium: [-0.25, 0.25, 0.15, 0.93],
      strong: [-0.35, 0.45, 0.22, 0.8],
    },

    backward: {
      mild: [0.15, -0.1, -0.08, 0.98],
      medium: [0.25, -0.25, -0.15, 0.93],
      strong: [0.35, -0.45, -0.22, 0.8],
    },
  },

  leftArm: {
    forward: {
      mild: [-0.1, -0.2, 0.12, 0.97],
      medium: [-0.18, -0.35, 0.22, 0.9],
      strong: [-0.26, -0.5, 0.3, 0.77],
    },
  },

  rightElbow: {
    bend: {
      mild: [-0.18, 0, 0, 0.98],
      medium: [-0.3, 0, 0, 0.95],
      strong: [-0.6, 0, 0, 0.78],
    },
  },

  leftElbow: {
    bend: {
      mild: [-0.18, 0, 0, 0.98],
      medium: [-0.3, 0, 0, 0.95],
      strong: [-0.6, 0, 0, 0.8],
    },
  },

  neutral: [0, 0, 0, 1],
} as const;

export type Intensity = "mild" | "medium" | "strong";