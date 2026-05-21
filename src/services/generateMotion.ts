import { geminiModel } from "./gemini";

export async function generateMotion(prompt: string) {
  // 🔥 LOAD VALID BONES
  const boneResponse = await fetch("/ControlBones.txt");
  const boneText = await boneResponse.text();

  const boneList = boneText
    .split("\n")
    .map(b => b.trim())
    .filter(Boolean);

  const result = await geminiModel.generateContent(`
You generate physically plausible MMD motion JSON for a Japanese PMX/PMD model.

IMPORTANT:
You MUST ONLY use bones from this list.
DO NOT invent bones.
DO NOT use bones not listed.

CONTROL BONES:
${boneText}

==================================================
OUTPUT RULES
==================================================

- ONLY output valid JSON
- DO NOT output markdown
- DO NOT output explanations
- DO NOT output comments
- DO NOT output extra text
- Output MUST start with {
- Output MUST end with }

==================================================
MODEL ASSUMPTIONS
==================================================

The model starts in a relaxed default A-pose:
- spine upright
- head facing forward
- feet flat on ground
- arms slightly lowered outward
- hands relaxed
- knees slightly relaxed

All generated motion must respect the default A-pose.

==================================================
ROTATION SYSTEM
==================================================

IMPORTANT:
All rotations MUST use QUATERNIONS.

Quaternion format:
[x, y, z, w]

DO NOT use Euler rotations.

Quaternion rules:
- quaternions MUST remain normalized
- w component MUST be included
- rotations MUST interpolate smoothly
- avoid sudden quaternion sign flips
- preserve shortest rotational path
- maintain stable orientation continuity

==================================================
QUATERNION STABILITY RULES
==================================================

- Consecutive frames should use nearest quaternion hemisphere
- Avoid flipping quaternion signs between frames
- Preserve rotational continuity
- Prefer minimal rotational distance
- Avoid unstable spinning
- Avoid sudden orientation inversion

==================================================
MOTION RULES
==================================================

- Motion must be physically plausible
- Motion must be smooth
- Motion must be stable
- Motion must preserve balance
- Motion must avoid jitter
- Motion must avoid snapping
- Motion must avoid teleporting limbs
- Motion must maintain continuous movement
- Motion should include easing in/out naturally

==================================================
ANIMATION PRINCIPLES
==================================================

- Use anticipation before major movement
- Use follow-through after movement
- Use natural inertia
- Use acceleration and deceleration
- Avoid robotic motion
- Avoid perfectly linear movement
- Preserve momentum between frames

==================================================
HIERARCHY RULES
==================================================

- Parent bones drive child motion
- Shoulder movement drives arm movement
- Hip movement drives leg movement
- Spine movement affects upper body naturally
- Child bones should use smaller compensating rotations
- Avoid large isolated child bone rotations

==================================================
SAFETY RULES
==================================================

DO NOT:
- animate cloth
- animate hair
- animate accessory bones
- animate dummy bones
- cause body clipping
- cause hands through torso
- cause arms through head
- cause feet below ground
- cause knees through body
- cause elbows bending backward
- cause impossible joint twisting
- cause extreme stretching
- cause extreme bending
- cause broken anatomy
- rotate unused bones unnecessarily

==================================================
JOINT LIMITS
==================================================

Neck:
- max rotation ≈ 0.5 radians

Head:
- max rotation ≈ 0.6 radians

Shoulders:
- max rotation ≈ 1.0 radians

Elbows:
- mostly bend naturally
- avoid twisting

Wrists:
- max rotation ≈ 0.4 radians

Spine:
- smooth gradual rotation only

Hips:
- max rotation ≈ 0.8 radians

Knees:
- bend naturally forward only

Ankles:
- subtle motion only

==================================================
STABILITY RULES
==================================================

- Keep unchanged bones identical between frames
- Avoid micro jitter
- Avoid oscillating rotations
- Avoid noisy motion
- Prefer stable continuous movement
- Preserve previous frame momentum

==================================================
TIMING RULES
==================================================

- MUST use fixed timestep of 0.1 seconds
- time starts at 0
- increments MUST be exactly 0.1
- duration = last frame time
- MAX duration = 10.0 seconds
- Maximum 100 frames

==================================================
INTERPOLATION RULES
==================================================

Between frames:
- rotation changes MUST be smooth
- no sudden jumps
- no abrupt reversals
- preserve continuous rotational arcs
- prefer slerp-friendly progression
- maintain stable quaternion continuity

==================================================
BONE USAGE RULES
==================================================

- Only animate bones relevant to the request
- Keep unrelated bones stable
- Minimize unnecessary movement
- Use symmetrical motion when appropriate
- Preserve natural posture

==================================================
JSON FORMAT
==================================================

Return format EXACTLY:

{
  "duration": number,
  "frames": [
    {
      "time": number,
      "bones": {
        "頭": [x, y, z, w]
      }
    }
  ]
}

==================================================
EXAMPLE
==================================================

{
  "duration": 0.3,
  "frames": [
    {
      "time": 0.0,
      "bones": {
        "頭": [0, 0, 0, 1]
      }
    },
    {
      "time": 0.1,
      "bones": {
        "頭": [0.02, 0.01, 0, 0.999]
      }
    },
    {
      "time": 0.2,
      "bones": {
        "頭": [0.04, 0.02, 0, 0.998]
      }
    },
    {
      "time": 0.3,
      "bones": {
        "頭": [0.01, 0.005, 0, 0.999]
      }
    }
  ]
}

==================================================
USER REQUEST
==================================================

${prompt}

`);

  const response = await result.response;
  const text = response.text();

  console.log("RAW GEMINI RESPONSE:", text);

  // 🔥 Extract JSON safely
  const match = text.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error("No JSON found in Gemini response");
  }

  const parsed = JSON.parse(match[0]);

  return parsed;
}