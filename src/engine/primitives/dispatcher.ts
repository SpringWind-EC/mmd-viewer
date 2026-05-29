import type { MotionAction } from "../MotionPlan";
import type { MotionPrimitive } from "./types";
import { mergeBones, heldPosePrimitive, posePrimitive } from "./core";
import { bothHandsPose, fingerControlPose, handPose } from "./hands";
import { bodyLeanBackward, bodyLeanForward, headPose, leftArmForwardPose, rightArmForwardPose, twoArmsForward } from "./upperBody";
import { fightingStancePose, fightingStancePositions, guardPose, punchPrimitive } from "./combat";
import { crouchPose, crouchPositions, kneeBendPose, runForwardPrimitive, stepPose, stepPositions } from "./lowerBody";
import { danceSwayPrimitive, idleBreathingPrimitive, nodPrimitive, shakeHeadPrimitive, wavePrimitive } from "./gestures";

export function primitiveForAction(action: MotionAction): MotionPrimitive {
  const intensity = action.intensity ?? "medium";

  switch (action.type) {
    case "neutral":
      return posePrimitive({});
    case "two_arms_forward":
    case "reach_forward":
      return posePrimitive(twoArmsForward(intensity));
    case "right_arm_forward":
      return posePrimitive(
        mergeBones(rightArmForwardPose(intensity), handPose("right", "open"))
      );
    case "left_arm_forward":
      return posePrimitive(
        mergeBones(leftArmForwardPose(intensity), handPose("left", "open"))
      );
    case "right_punch":
      return punchPrimitive("right", intensity, "cross");
    case "left_punch":
      return punchPrimitive("left", intensity, "cross");
    case "right_jab":
      return punchPrimitive("right", intensity, "jab");
    case "left_jab":
      return punchPrimitive("left", intensity, "jab");
    case "right_cross":
      return punchPrimitive("right", intensity, "cross");
    case "left_cross":
      return punchPrimitive("left", intensity, "cross");
    case "right_hook":
      return punchPrimitive("right", intensity, "hook");
    case "left_hook":
      return punchPrimitive("left", intensity, "hook");
    case "right_uppercut":
      return punchPrimitive("right", intensity, "uppercut");
    case "left_uppercut":
      return punchPrimitive("left", intensity, "uppercut");
    case "right_fist":
      return heldPosePrimitive(handPose("right", "fist"));
    case "left_fist":
      return heldPosePrimitive(handPose("left", "fist"));
    case "both_fists":
      return heldPosePrimitive(bothHandsPose("fist"));
    case "finger_control":
      return posePrimitive(fingerControlPose(action));
    case "guard":
      return posePrimitive(guardPose(intensity));
    case "fighting_stance":
      return posePrimitive(
        fightingStancePose(intensity),
        true,
        fightingStancePositions(intensity)
      );
    case "bend_knees":
      return posePrimitive(kneeBendPose(intensity), true, crouchPositions(intensity));
    case "crouch":
      return posePrimitive(
        crouchPose(intensity),
        true,
        crouchPositions(intensity)
      );
    case "body_lean_forward":
      return posePrimitive(bodyLeanForward(intensity));
    case "body_lean_backward":
      return posePrimitive(bodyLeanBackward(intensity));
    case "bow":
      return posePrimitive(
        mergeBones(bodyLeanForward("strong"), kneeBendPose("mild")),
        true,
        crouchPositions("mild")
      );
    case "look_left":
    case "look_right":
    case "look_up":
    case "look_down":
      return posePrimitive(headPose(action.type));
    case "nod":
      return nodPrimitive();
    case "shake_head":
      return shakeHeadPrimitive();
    case "wave_right":
      return wavePrimitive("right", intensity);
    case "wave_left":
      return wavePrimitive("left", intensity);
    case "happy_greeting":
      return {
        holdFinalPose: false,
        frames: wavePrimitive("right", intensity).frames.map((frame) => ({
          progress: frame.progress,
          bones: mergeBones(frame.bones, bodyLeanForward("mild")),
          positions: frame.positions,
        })),
      };
    case "dance_sway":
      return danceSwayPrimitive();
    case "idle_breathing":
      return idleBreathingPrimitive();
    case "run_forward":
      return runForwardPrimitive(intensity);
    case "step_forward":
    case "step_back":
    case "step_left":
    case "step_right":
      return posePrimitive(
        stepPose(action.type, intensity),
        true,
        stepPositions(action.type, intensity)
      );
    default:
      return posePrimitive({});
  }
}
