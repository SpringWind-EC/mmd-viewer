import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve(process.env.BODY_QA_OUTPUT ?? "test-results/body-composition");
await mkdir(output, { recursive: true });
const targets = await (await fetch("http://127.0.0.1:9227/json")).json();
const page = targets.find((item) => item.type === "page" && item.url.includes("/MMD"));
if (!page) throw new Error("Open the MMD page in the QA browser first.");
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((done, fail) => {
  socket.addEventListener("open", done, { once: true });
  socket.addEventListener("error", fail, { once: true });
});
let nextId = 0;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
});
function send(method, params = {}) {
  return new Promise((done, fail) => {
    const id = ++nextId;
    pending.set(id, { resolve: done, reject: fail });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evalPage(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression) {
  for (let i = 0; i < 120; i++) {
    if (await evalPage(expression)) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Timed out: ${expression}`);
}
async function click(label) {
  const point = await evalPage(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(label)});
    if (!button) return null;
    const box = button.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  })()`);
  if (!point) throw new Error(`Missing button: ${label}`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
}

const plans = {
  seated_grasp_and_reach: {
    duration: 4, holdFinalPose: true, operators: [
      { type: "place_body", offset: { right: 0, up: -5, forward: -2 }, startTime: 0, endTime: 1.6 },
      { type: "pose_torso", pitch: 10, yaw: -12, startTime: 1, endTime: 2.2 },
      { type: "reach", effector: "right_hand", anchor: "head", offset: { right: 0.35, up: 0.55, forward: 0.2 }, startTime: 1.6, endTime: 3 },
      { type: "reach", effector: "left_hand", anchor: "chest", offset: { right: -0.32, up: 0.03, forward: 0.28 }, startTime: 1.6, endTime: 3 },
      { type: "hand_shape", side: "left", shape: "fist", startTime: 2.2, endTime: 3.3 },
      { type: "look", target: "up", startTime: 2.2, endTime: 3.3 },
    ],
  },
  standing_twist: {
    duration: 3, holdFinalPose: true, operators: [
      { type: "place_body", offset: { right: -0.25, up: -0.8, forward: 0.1 }, startTime: 0, endTime: 1 },
      { type: "pose_torso", pitch: 17, yaw: 25, roll: 8, startTime: 0.6, endTime: 1.8 },
      { type: "move_effector", effector: "right_hand", region: "forward", intensity: "strong", startTime: 1, endTime: 2.3 },
      { type: "move_effector", effector: "left_hand", region: "left_side_of_head", intensity: "mild", startTime: 1, endTime: 2.3 },
      { type: "look", target: "right", startTime: 1.6, endTime: 2.6 },
    ],
  },
  one_foot_raised: {
    duration: 2.5, holdFinalPose: true, operators: [
      { type: "place_body", offset: { right: 0.25, up: 0, forward: 0 } },
      { type: "place_foot", side: "left", offset: { right: -0.2, up: 0.6, forward: 0.5 } },
      { type: "pose_torso", pitch: 8, yaw: 12 },
      { type: "move_effector", effector: "right_hand", region: "front_of_chest" },
      { type: "look", target: "left" },
    ],
  },
  waist_head_elbows: {
    duration: 3, holdFinalPose: true, operators: [
      { type: "pose_waist", yaw: 10, roll: 4, startTime: 0, endTime: 1.3 },
      { type: "pose_torso", pitch: 10, yaw: -10, startTime: 0.3, endTime: 1.8 },
      { type: "pose_head", pitch: -9, yaw: 13, roll: -7, startTime: 0.8, endTime: 2.2 },
      { type: "bend_elbow", side: "left", flex: 65, startTime: 0.3, endTime: 1.8 },
      { type: "bend_elbow", side: "right", flex: 35, startTime: 1, endTime: 2.4 },
      { type: "hand_shape", side: "left", shape: "open", startTime: 1.3, endTime: 2.5 },
    ],
  },
  lateral_reach: {
    duration: 3, holdFinalPose: true, operators: [
      { type: "pose_waist", yaw: -10, startTime: 0, endTime: 1.2 },
      { type: "reach", effector: "right_hand", anchor: "chest", offset: { right: 0.55, up: -0.15, forward: 0 }, startTime: 0.5, endTime: 2.1 },
      { type: "bend_elbow", side: "left", flex: 70, startTime: 0.5, endTime: 2.1 },
      { type: "pose_head", pitch: 3, yaw: -14, roll: 4, startTime: 1.2, endTime: 2.5 },
      { type: "hand_shape", side: "right", shape: "open", startTime: 1.2, endTime: 2.5 },
    ],
  },
  head_arm_transition: {
    duration: 2.4, holdFinalPose: true, operators: [
      { type: "pose_head", pitch: 10, yaw: 15, startTime: 0, endTime: 1.2 },
      { type: "reach", effector: "right_hand", anchor: "chest", offset: { right: 0.55, up: -0.15, forward: 0 }, startTime: 0, endTime: 1.2 },
      { type: "look", target: "up", startTime: 1.2, endTime: 2.4 },
      { type: "bend_elbow", side: "right", flex: 70, startTime: 1.2, endTime: 2.4 },
    ],
  },
  elbow_pair: {
    duration: 2.5, holdFinalPose: true, operators: [
      { type: "bend_elbow", side: "right", flex: 90 },
      { type: "bend_elbow", side: "left", flex: 90 },
    ],
  },
  arm_asymmetric: {
    duration: 3, holdFinalPose: true, operators: [
      { type: "pose_torso", yaw: 10, startTime: 0, endTime: 1.2 },
      { type: "pose_arm", side: "right", forward: 70, outward: 15, flex: 35, startTime: 0.2, endTime: 2 },
      { type: "pose_arm", side: "left", forward: 20, outward: 65, flex: 50, startTime: 0.4, endTime: 2.2 },
      { type: "pose_wrist", side: "right", bend: 12, twist: 20, startTime: 1, endTime: 2.4 },
      { type: "pose_wrist", side: "left", bend: -8, twist: -20, startTime: 1, endTime: 2.4 },
      { type: "pose_head", yaw: -10, startTime: 1.1, endTime: 2.5 },
    ],
  },
  arm_side_lift: {
    duration: 2.5, holdFinalPose: true, operators: [
      { type: "pose_arm", side: "right", outward: 75, forward: 10, flex: 10 },
      { type: "pose_arm", side: "left", outward: 75, forward: 10, flex: 10 },
      { type: "hand_shape", side: "both", shape: "open" },
    ],
  },
  arm_limit_probe: {
    duration: 2.5, holdFinalPose: true, operators: [
      { type: "pose_arm", side: "right", forward: 45, outward: 40, flex: 75 },
      { type: "pose_arm", side: "left", forward: 45, outward: 40, flex: 75 },
    ],
  },
  arm_reach_wrist: {
    duration: 3, holdFinalPose: true, operators: [
      { type: "reach", effector: "right_hand", anchor: "head", offset: { right: 0.35, up: 0.4, forward: 0.25 }, startTime: 0, endTime: 2 },
      { type: "pose_wrist", side: "right", bend: 12, twist: 25, startTime: 0.7, endTime: 2.3 },
      { type: "pose_arm", side: "left", forward: 35, outward: 30, flex: 65, startTime: 0.5, endTime: 2.2 },
      { type: "hand_shape", side: "right", shape: "open", startTime: 1.3, endTime: 2.5 },
      { type: "pose_head", pitch: -8, yaw: 12, startTime: 1.3, endTime: 2.5 },
    ],
  },
  arm_transition: {
    duration: 2.4, holdFinalPose: true, operators: [
      { type: "pose_arm", side: "right", forward: 60, flex: 20, startTime: 0, endTime: 1.2 },
      { type: "pose_wrist", side: "right", twist: 25, startTime: 0, endTime: 1.2 },
      { type: "pose_arm", side: "right", outward: 65, flex: 40, startTime: 1.2, endTime: 2.4 },
      { type: "pose_wrist", side: "right", bend: 15, startTime: 1.2, endTime: 2.4 },
    ],
  },
};

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send("Page.reload", { ignoreCache: true });
  await waitFor("typeof window.__mmdQaProgress === 'function'");
  await waitFor("[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Manual JSON')");
  await click("Manual JSON");
  await waitFor("!!document.querySelector('#motion-json')");
  const requested = process.env.BODY_QA_CASES?.split(",");
  for (const [name, plan] of Object.entries(plans).filter(([name]) => !requested || requested.includes(name))) {
    await evalPage(`(() => {
      const field = document.querySelector('#motion-json');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(field, ${JSON.stringify(JSON.stringify(plan))});
      field.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await click("Apply JSON Motion");
    await waitFor("[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Download VMD' && !button.disabled)");
    const error = await evalPage("document.querySelector('.motion-panel-error')?.textContent ?? null");
    if (error) throw new Error(error);
    const newControls = ["waist_head_elbows", "lateral_reach", "head_arm_transition", "elbow_pair", "arm_asymmetric", "arm_side_lift", "arm_limit_probe", "arm_reach_wrist", "arm_transition"].includes(name);
    const phases = name === "head_arm_transition" || name === "arm_transition" ? [0.45, 0.5, 0.55, 0.8, 1]
      : newControls ? [0.2, 0.5, 0.8, 1] : [0.35, 0.7, 1];
    const views = newControls
      ? [["front", 0], ["front_quarter", Math.PI / 4], ["right_side", Math.PI / 2], ["back", Math.PI], ["back_quarter", 3 * Math.PI / 4], ["left_side", -Math.PI / 2]]
      : [["front", 0], ["side", Math.PI / 2], ["back", Math.PI]];
    for (const progress of process.env.BODY_QA_CLOSE_ONLY ? [] : phases) {
      for (const [view, azimuth] of views) {
        await evalPage(`window.__mmdQaView(${azimuth}, ${Math.PI / 2}, 5, 52)`);
        await evalPage(`window.__mmdQaProgress(${progress})`);
        await new Promise((done) => setTimeout(done, 180));
        const bones = await evalPage("window.__mmdQaBones(['センター','下半身','上半身2','頭','右ひざ','左ひざ','右足首','左足首','右足ＩＫ','左足ＩＫ','右手首','左手首'])");
        await writeFile(resolve(output, `${name}-${progress}-${view}.json`), JSON.stringify(bones, null, 2));
        await evalPage("document.querySelector('.motion-panel').style.visibility = 'hidden'");
        const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false,
          clip: { x: 400, y: 45, width: 570, height: 730, scale: 1 } });
        await writeFile(resolve(output, `${name}-${progress}-${view}.png`), Buffer.from(screenshot.data, "base64"));
        await evalPage("document.querySelector('.motion-panel').style.visibility = ''");
      }
    }
    if (newControls) {
      const closeRadius = Number(process.env.BODY_QA_CLOSE_RADIUS ?? 24);
      const closeTargetY = Number(process.env.BODY_QA_CLOSE_TARGET_Y ?? 7);
      for (const [view, azimuth] of views) {
        await evalPage(`window.__mmdQaView(${azimuth}, ${Math.PI / 2}, ${closeTargetY}, ${closeRadius})`);
        await evalPage("window.__mmdQaProgress(1)");
        await new Promise((done) => setTimeout(done, 180));
        await evalPage("document.querySelector('.motion-panel').style.visibility = 'hidden'");
        const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false,
          clip: { x: 400, y: 45, width: 570, height: 730, scale: 1 } });
        await writeFile(resolve(output, `${name}-close-${view}.png`), Buffer.from(screenshot.data, "base64"));
        await evalPage("document.querySelector('.motion-panel').style.visibility = ''");
      }
    }
    console.log(`${name}: ${phases.length * views.length} screenshots`);
  }
} finally {
  socket.close();
}
