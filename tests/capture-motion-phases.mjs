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
  const plan = { duration: type === "run_forward" ? 2 : 2.5, actions: [{ type, intensity: "strong" }] };
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
  const azimuth = view === "front" ? 0 : Math.PI / 2;
  await evaluate(`window.__mmdQaView(${azimuth}, ${Math.PI / 2}, 5, 52)`);
  await evaluate(`window.__mmdQaProgress(${progress})`);
  await new Promise((resolveWait) => setTimeout(resolveWait, 160));
  const result = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    clip: { x: 400, y: 75, width: 570, height: 690, scale: 1 },
  });
  await writeFile(resolve(output, `${type}-${String(progress).replace(".", "_")}-${view}.png`), Buffer.from(result.data, "base64"));
}

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
  ];
  const requested = process.env.MOTION_QA_CASES?.split(",");
  for (const [type, phases] of cases.filter(([name]) => !requested || requested.includes(name))) {
    await apply(type);
    for (const progress of phases) {
      for (const view of ["front", "side"]) await capture(type, progress, view);
    }
    console.log(`${type}: ${phases.length * 2} screenshots`);
  }
  console.log(output);
} finally {
  socket.close();
}
