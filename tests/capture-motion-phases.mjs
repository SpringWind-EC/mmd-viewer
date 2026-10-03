import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve(process.env.MOTION_QA_OUTPUT ?? "test-results/motion-qa/after");
const targets = await (await fetch("http://127.0.0.1:9227/json")).json();
const page = targets.find((item) => item.type === "page" && item.url.includes("/MMD"));
if (!page) throw new Error("No MMD page is open in the QA browser.");
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolveOpen, reject) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", reject, { once: true });
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
  return new Promise((resolveRequest, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve: resolveRequest, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(expression)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out: ${expression}`);
}
async function click(label) {
  const point = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(label)});
    if (!button) return null;
    const box = button.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  })()`);
  if (!point) throw new Error(`Missing button: ${label}`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
}
async function apply(type) {
  const operatorSide = type.includes("left") ? "left" : "right";
  const headOperator = type.startsWith("head_operator_");
  const headTarget = type.endsWith("viewer") ? "viewer" : "forward";
  const weightShift = type.startsWith("weight_");
  const plan = weightShift
    ? { duration: 2.5, operators: [{ type: "shift_weight", direction: type.slice("weight_".length), intensity: "strong" }] }
    : headOperator
    ? { duration: 2.5, operators: [
      { type: "look", target: "left", startTime: 0, endTime: 1 },
      type.includes("_orient_")
        ? { type: "orient_effector", effector: "head", facing: headTarget, startTime: 1, endTime: 2.5 }
        : { type: "look", target: headTarget, startTime: 1, endTime: 2.5 },
    ] }
    : type.startsWith("operator_")
    ? { duration: 2.5, operators: [type.endsWith("_reach")
      ? { type: "reach", effector: `${operatorSide}_hand`, anchor: "chest", offset: { right: operatorSide === "right" ? 0.18 : -0.18, up: 0, forward: 0.4 } }
      : { type: "move_effector", effector: `${operatorSide}_hand`, region: "forward", intensity: "strong" }] }
    : { duration: type === "run_forward" ? 2 : 2.5, actions: [{ type, intensity: "strong" }] };
  await evaluate(`(() => {
    const field = document.querySelector('#motion-json');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(field, ${JSON.stringify(JSON.stringify(plan))});
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await click("Apply JSON Motion");
  await waitFor("[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Download VMD' && !button.disabled)");
  const error = await evaluate("document.querySelector('.motion-panel-error')?.textContent ?? null");
  if (error) throw new Error(error);
}
async function capture(type, progress, view) {
  const punch = /^(right|left)_(punch|jab|cross|hook|uppercut)$/.test(type);
  const raised = /^(two_arms_forward|reach_forward|right_arm_forward|left_arm_forward|wave_right|wave_left|happy_greeting|photo_peace_sign|operator_.*)$/.test(type);
  const head = /^(look_(left|right|up|down)|nod|shake_head|head_operator_.*)$/.test(type);
  const activeSide = type.startsWith("left") || type.startsWith("operator_left_") || type === "wave_left" ? "left" : "right";
  const azimuth = view === "front" ? 0 : view === "back" ? Math.PI : view === "photo_quarter" ? (activeSide === "right" ? -Math.PI / 4 : Math.PI / 4) : view === "punch_side" || view === "gesture_side" ? (activeSide === "right" ? -Math.PI / 2 : Math.PI / 2) : Math.PI / 2;
  await evaluate(`window.__mmdQaView(${azimuth}, ${Math.PI / 2}, ${head ? 8 : punch || raised ? 9.5 : 5}, ${head ? 23 : punch || raised ? 31 : 52})`);
  await evaluate(`window.__mmdQaProgress(${progress})`);
  await new Promise((resolveWait) => setTimeout(resolveWait, 160));
  if (view === "front" && /^(weight_.*|body_lean_(forward|backward)|dance_sway)$/.test(type)) {
    measurements.push({ type, progress, bones: await evaluate("window.__mmdQaBones(['センター','下半身','上半身','上半身1','上半身2','首','頭','右足ＩＫ','左足ＩＫ','右足首','左足首','右つま先','左つま先'])") });
  }
  await evaluate("document.querySelector('.motion-panel').style.visibility = 'hidden'");
  try {
    const result = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
      clip: { x: (punch || raised) && activeSide === "left" && (view === "punch_side" || view === "gesture_side") ? 250 : 400, y: 75, width: 570, height: 690, scale: 1 },
    });
    await writeFile(resolve(output, `${type}-${String(progress).replace(".", "_")}-${view}.png`), Buffer.from(result.data, "base64"));
  } finally {
    await evaluate("document.querySelector('.motion-panel').style.visibility = ''");
  }
}

const measurements = [];
await mkdir(output, { recursive: true });
try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send("Page.reload", { ignoreCache: true });
  await waitFor("!!document.querySelector('.mmd-stage canvas')");
  await waitFor("typeof window.__mmdQaProgress === 'function'");
  await click("Manual JSON");
  await waitFor("!!document.querySelector('#motion-json')");
  const cases = [
    ["run_forward", [0, 0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88]],
    ...["step_forward", "step_back", "step_left", "step_right"].map((name) => [name, [0, 0.22, 0.42, 0.52, 0.7, 0.84, 1]]),
    ...["fighting_stance", "bow"].map((name) => [name, [0, 0.35, 0.65, 1]]),
    ...["right", "left"].flatMap((side) => [
      [`${side}_punch`, [0.18, 0.5, 0.82]],
      [`${side}_jab`, [0.18, 0.39, 0.72]],
      [`${side}_cross`, [0.18, 0.5, 0.82]],
      [`${side}_hook`, [0.18, 0.56, 0.82]],
      [`${side}_uppercut`, [0.18, 0.56, 0.82]],
    ]),
    ...["two_arms_forward", "reach_forward", "right_arm_forward", "left_arm_forward"].map((name) => [name, [0.35, 0.65, 1]]),
    ...["wave_right", "wave_left", "happy_greeting"].map((name) => [name, [0.2, 0.4, 0.6, 0.8]]),
    ["photo_peace_sign", [0.2, 0.35, 1]],
    ...["operator_right_forward", "operator_left_forward", "operator_right_reach", "operator_left_reach"].map((name) => [name, [0.35, 0.65, 1]]),
    ...["look_left", "look_right", "look_up", "look_down"].map((name) => [name, [0.35, 1]]),
    ["nod", [0.15, 0.3, 0.45, 0.6, 0.8]],
    ["shake_head", [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]],
    ...["head_operator_look_viewer", "head_operator_look_forward", "head_operator_orient_viewer", "head_operator_orient_forward"].map((name) => [name, [0.35, 1]]),
    ...["weight_forward", "weight_back", "weight_left", "weight_right", "body_lean_forward", "body_lean_backward"].map((name) => [name, [0, 0.35, 1]]),
    ["dance_sway", [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]],
  ];
  const requested = process.env.MOTION_QA_CASES?.split(",");
  for (const [type, phases] of cases.filter(([name]) => !requested || requested.includes(name))) {
    await apply(type);
    const views = /^(right|left)_(punch|jab|cross|hook|uppercut)$/.test(type)
      ? ["front", "punch_side"]
      : /^(look_(left|right|up|down)|nod|shake_head|head_operator_.*)$/.test(type) ? ["front", "side", "back"]
      : /^(weight_.*|body_lean_(forward|backward)|dance_sway)$/.test(type) ? ["front", "side", "back"]
      : /^(two_arms_forward|reach_forward)$/.test(type) ? ["front", "gesture_side", "side"]
      : type === "photo_peace_sign" ? ["front", "photo_quarter", "gesture_side"]
      : /^(right_arm_forward|left_arm_forward|wave_right|wave_left|happy_greeting|operator_.*)$/.test(type) ? ["front", "gesture_side"]
      : ["fighting_stance", "bow"].includes(type) ? ["front", "side", "back"] : ["front", "side"];
    for (const progress of phases) {
      for (const view of views) await capture(type, progress, view);
    }
    console.log(`${type}: ${phases.length * views.length} screenshots`);
  }
  console.log(output);
  if (measurements.length) await writeFile(resolve(output, "measurements.json"), JSON.stringify(measurements, null, 2));
} finally {
  socket.close();
}
