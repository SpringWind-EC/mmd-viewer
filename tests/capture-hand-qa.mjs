import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve(process.env.HAND_QA_OUTPUT ?? "test-results/hand-qa/after");
const targets = await (await fetch("http://127.0.0.1:9227/json")).json();
const page = targets.find((item) => item.type === "page" && item.url.includes("/MMD"));
if (!page) throw new Error("No MMD page is open in the QA browser.");
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
  message.error ? request.fail(new Error(message.error.message)) : request.done(message.result);
});
function send(method, params = {}) {
  return new Promise((done, fail) => {
    const id = ++nextId;
    pending.set(id, { done, fail });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression) {
  for (let tries = 0; tries < 100; tries++) {
    if (await evaluate(expression)) return;
    await new Promise((done) => setTimeout(done, 100));
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
async function apply(plan) {
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

const oscillate = (axis, side = "right") => ({ duration: 2.5, operators: [
  { type: "move_effector", effector: `${side}_hand`, region: `${side}_side_of_head`, intensity: "strong" },
  { type: "oscillate", effector: `${side}_hand`, axis, cycles: 2, amplitude: 0.8 },
] });
const cases = [
  ...["right", "left"].flatMap((side) => [
    [`${side}_fist`, { duration: 2.5, actions: [{ type: `${side}_fist`, intensity: "strong" }] }, side, [0.35, 1]],
    [`${side}_peace_sign`, { duration: 2.5, actions: [{ type: `${side}_peace_sign`, intensity: "strong" }] }, side, [0.35, 1]],
    [`${side}_finger_curl`, { duration: 2.5, actions: [{ type: "finger_control", side, finger: "all", curl: 1 }] }, side, [0.35, 1]],
    [`${side}_finger_spread`, { duration: 2.5, actions: [{ type: "finger_control", side, finger: "all", curl: 0, spread: 1 }] }, side, [1]],
    [`${side}_finger_twist`, { duration: 2.5, actions: [{ type: "finger_control", side, finger: "all", curl: 0.6, twist: 1 }] }, side, [1]],
    [`${side}_osc_horizontal`, oscillate("horizontal", side), side, [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]],
    [`${side}_osc_vertical`, oscillate("vertical", side), side, [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]],
    [`${side}_osc_twist`, oscillate("twist", side), side, [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]],
    [`${side}_reach_osc`, { duration: 2.5, operators: [
      { type: "reach", effector: `${side}_hand`, anchor: "chest", offset: { right: side === "right" ? 0.18 : -0.18, up: 0, forward: 0.4 } },
      { type: "oscillate", effector: `${side}_hand`, axis: "horizontal", cycles: 2, amplitude: 0.8 },
    ] }, side, [0.25, 0.5, 0.75]],
  ]),
  ["both_fists", { duration: 2.5, actions: [{ type: "both_fists", intensity: "strong" }] }, "right", [1]],
  ["both_peace_signs", { duration: 2.5, actions: [{ type: "both_peace_signs", intensity: "strong" }] }, "right", [1]],
  ["operator_fist", { duration: 2.5, operators: [{ type: "hand_shape", side: "right", shape: "fist" }] }, "right", [1]],
  ["operator_peace", { duration: 2.5, operators: [{ type: "hand_shape", side: "right", shape: "peace" }] }, "right", [1]],
  ["operator_finger", { duration: 2.5, operators: [{ type: "finger", side: "right", finger: "all", curl: 0.75, spread: 0.75, twist: 0.5 }] }, "right", [1]],
];

await mkdir(output, { recursive: true });
try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send("Page.reload", { ignoreCache: true });
  await waitFor("!!document.querySelector('.mmd-stage canvas')");
  await waitFor("typeof window.__mmdQaBones === 'function'");
  await click("Manual JSON");
  await waitFor("!!document.querySelector('#motion-json')");
  const selected = process.env.HAND_QA_CASES?.split(",");
  for (const [name, plan, side, phases] of cases.filter(([name]) => !selected || selected.includes(name))) {
    await apply(plan);
    for (const phase of phases) {
      await evaluate(`window.__mmdQaProgress(${phase})`);
      await new Promise((done) => setTimeout(done, 120));
      const prefix = side === "right" ? "右" : "左";
      const points = await evaluate(`window.__mmdQaBones(['${prefix}手首','${prefix}中指１','${prefix}中指３'])`);
      const wrist = points[`${prefix}手首`];
      const middle = points[`${prefix}中指１`];
      const target = wrist.map((v, index) => (v + middle[index]) / 2);
      const views = [
        ["front", 0, Math.PI / 2],
        ["side", side === "right" ? -Math.PI / 2 : Math.PI / 2, Math.PI / 2],
        ["back", Math.PI, Math.PI / 2],
        ["above", 0, 0.65],
      ];
      for (const [view, azimuth, polar] of views) {
        await evaluate(`window.__mmdQaView(${azimuth},${polar},${target[1]},6.5,${target[0]},${target[2]})`);
        await new Promise((done) => setTimeout(done, 100));
        await evaluate("document.querySelector('.motion-panel').style.visibility = 'hidden'");
        try {
          const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false,
            clip: { x: 350, y: 65, width: 580, height: 690, scale: 1 } });
          await writeFile(resolve(output, `${name}-${String(phase).replace(".", "_")}-${view}.png`), Buffer.from(screenshot.data, "base64"));
        } finally {
          await evaluate("document.querySelector('.motion-panel').style.visibility = ''");
        }
      }
    }
    console.log(`${name}: ${phases.length * 4} screenshots`);
  }
  console.log(output);
} finally {
  socket.close();
}
