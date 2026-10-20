import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { vmdPositionToViewer, vmdRotationToViewer } from "../qieqie-work/vmd-coordinates.mjs";

// MJPEG in AVI needs no separate encoder: every rendered JPEG is one video frame.
function chunk(id, payload) {
  const header = Buffer.alloc(8);
  header.write(id, 0, 4, "ascii");
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload, ...(payload.length % 2 ? [Buffer.alloc(1)] : [])]);
}
function list(type, contents) {
  return chunk("LIST", Buffer.concat([Buffer.from(type, "ascii"), ...contents]));
}
function encodeMjpegAvi(jpegs, width, height, fps) {
  const largest = Math.max(...jpegs.map((jpeg) => jpeg.length));
  const avih = Buffer.alloc(56);
  avih.writeUInt32LE(Math.round(1_000_000 / fps), 0);
  avih.writeUInt32LE(largest * fps, 4);
  avih.writeUInt32LE(0x10, 12); // AVIF_HASINDEX
  avih.writeUInt32LE(jpegs.length, 16);
  avih.writeUInt32LE(1, 24);
  avih.writeUInt32LE(largest, 28);
  avih.writeUInt32LE(width, 32);
  avih.writeUInt32LE(height, 36);
  const strh = Buffer.alloc(56);
  strh.write("vids", 0, 4, "ascii");
  strh.write("MJPG", 4, 4, "ascii");
  strh.writeUInt32LE(1, 20); // scale
  strh.writeUInt32LE(fps, 24); // rate
  strh.writeUInt32LE(jpegs.length, 32);
  strh.writeUInt32LE(largest, 36);
  strh.writeUInt32LE(0xffffffff, 40);
  strh.writeInt16LE(width, 52);
  strh.writeInt16LE(height, 54);
  const strf = Buffer.alloc(40);
  strf.writeUInt32LE(40, 0);
  strf.writeInt32LE(width, 4);
  strf.writeInt32LE(height, 8);
  strf.writeUInt16LE(1, 12);
  strf.writeUInt16LE(24, 14);
  strf.write("MJPG", 16, 4, "ascii");
  strf.writeUInt32LE(largest, 20);
  const hdrl = list("hdrl", [chunk("avih", avih), list("strl", [chunk("strh", strh), chunk("strf", strf)])]);
  const moviChunks = jpegs.map((jpeg) => chunk("00dc", jpeg));
  const movi = list("movi", moviChunks);
  const index = Buffer.alloc(jpegs.length * 16);
  let offset = 4;
  jpegs.forEach((jpeg, frame) => {
    const entry = frame * 16;
    index.write("00dc", entry, 4, "ascii");
    index.writeUInt32LE(0x10, entry + 4);
    index.writeUInt32LE(offset, entry + 8);
    index.writeUInt32LE(jpeg.length, entry + 12);
    offset += moviChunks[frame].length;
  });
  const body = Buffer.concat([Buffer.from("AVI ", "ascii"), hdrl, movi, chunk("idx1", index)]);
  const header = Buffer.alloc(8);
  header.write("RIFF", 0, 4, "ascii");
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

const output = resolve(process.env.MOTION_VIDEO_OUTPUT ?? "test-results/motion-video");
const singlePlan = process.env.MOTION_VIDEO_PLAN;
const sourceJson = process.env.MOTION_VIDEO_SOURCE_JSON;
const planFiles = process.env.MOTION_VIDEO_PLANS?.split(",").map((item) => item.trim()).filter(Boolean)
  ?? (singlePlan ? [singlePlan] : [process.env.MOTION_VIDEO_FIRST, process.env.MOTION_VIDEO_NEXT].filter(Boolean));
if (!sourceJson && (!planFiles.length || (!singlePlan && !process.env.MOTION_VIDEO_PLANS && planFiles.length !== 2))) {
  throw new Error("Set MOTION_VIDEO_SOURCE_JSON, MOTION_VIDEO_PLAN, MOTION_VIDEO_PLANS, or MOTION_VIDEO_FIRST and MOTION_VIDEO_NEXT.");
}
const plans = sourceJson
  ? [await readFile(resolve(sourceJson), "utf8").then((contents) => {
    const source = JSON.parse(contents);
    return {
      metadata: { fps: source.framesPerSecond },
      boneFrames: Object.entries(source.bones).flatMap(([boneName, frames]) =>
        frames.map(({ frame, position, rotation }) => ({
          boneName, frame,
          position: vmdPositionToViewer(position),
          rotation: vmdRotationToViewer(rotation),
        }))),
    };
  })]
  : await Promise.all(planFiles.map(async (file) => JSON.parse(await readFile(resolve(file), "utf8"))));
const totalDuration = sourceJson
  ? Number((Math.max(...plans[0].boneFrames.map((frame) => frame.frame)) / plans[0].metadata.fps).toFixed(4))
  : plans.reduce((sum, plan) => sum +
  (Array.isArray(plan.segments)
    ? plan.segments.reduce((length, segment) => length + segment.duration, 0)
    : plan.duration), 0);
const captureStart = Number(process.env.MOTION_VIDEO_START ?? 0);
if (!Number.isFinite(captureStart) || captureStart < 0 || captureStart >= totalDuration) {
  throw new Error(`MOTION_VIDEO_START must be between 0 and ${totalDuration}.`);
}
await mkdir(output, { recursive: true });
const cdpPort = Number(process.env.MOTION_VIDEO_CDP_PORT ?? 9227);
if (!Number.isInteger(cdpPort) || cdpPort < 1 || cdpPort > 65535) {
  throw new Error("MOTION_VIDEO_CDP_PORT must be a valid TCP port.");
}
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();
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
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression) {
  for (let i = 0; i < 200; i++) {
    if (await evalPage(expression)) return;
    const error = await evalPage("document.querySelector('.motion-panel-error')?.textContent ?? null");
    if (error) throw new Error(error);
    await new Promise((done) => setTimeout(done, 100));
  }
  const pageText = await evalPage("document.body?.innerText?.slice(0, 800) ?? ''");
  throw new Error(`Timed out: ${expression}\nPage text: ${pageText}`);
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
async function apply(plan, expectedDuration) {
  await evalPage(`(() => {
    const field = document.querySelector('#motion-json');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(field, ${JSON.stringify(JSON.stringify(plan))});
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await click("Apply JSON Motion");
  await waitFor(`window.__mmdQaDuration?.() === ${expectedDuration}`);
  const error = await evalPage("document.querySelector('.motion-panel-error')?.textContent ?? null");
  if (error) throw new Error(error);
}

const views = [
  ["front", 0, 5, 40],
  ["right_side", Math.PI / 2, 5, 40],
  ["back", Math.PI, 5, 40],
  ["left_side", -Math.PI / 2, 5, 40],
  ["upper_close", Math.PI / 4, 7, 23],
  ["hand_close", Math.PI / 4, 2, 10],
  ["hand_profile", -Math.PI / 2, 2, 10],
  ["left_elbow_close", Math.PI / 4, 2, 8],
  ["left_elbow_profile", Math.PI / 2, 2, 8],
  ["right_elbow_close", -Math.PI / 4, 2, 8],
  ["right_elbow_profile", -Math.PI / 2, 2, 8],
  ["right_hand_close", -Math.PI / 4, 2, 10],
  ["right_hand_profile", Math.PI / 2, 2, 10],
  ["feet_close", Math.PI / 2, -8.5, 14],
  ["feet_wide", 0, -7, 36],
  ["right_foot_tracking_front", 0, -7, 9],
  ["right_foot_tracking_side", Math.PI / 2, -7, 9],
  ["right_foot_tracking_back", Math.PI, -7, 9],
];

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  if (process.env.MOTION_VIDEO_RELOAD !== "0") {
    await send("Page.reload", { ignoreCache: true });
  }
  await waitFor("typeof window.__mmdQaProgress === 'function'");
  if (!await evalPage("!!document.querySelector('#motion-json')")) {
    await waitFor("[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Manual JSON')");
    await click("Manual JSON");
  }
  await waitFor("!!document.querySelector('#motion-json')");
  let elapsed = 0;
  for (const plan of plans) {
    elapsed = sourceJson ? totalDuration : Array.isArray(plan.segments)
      ? plan.segments.reduce((length, segment) => length + segment.duration, 0)
      : plan.continuePrevious ? elapsed + plan.duration : plan.duration;
    await apply(plan, elapsed);
  }
  const fps = Number(process.env.MOTION_VIDEO_FPS ?? 20);
  const count = Math.max(2, Math.round((totalDuration - captureStart) * fps));
  for (const [name, azimuth, targetY, radius] of views.filter(([name]) => !process.env.MOTION_VIDEO_VIEWS || process.env.MOTION_VIDEO_VIEWS.split(",").includes(name))) {
    if (name.startsWith("hand_") || name.startsWith("right_hand_") || name.startsWith("left_elbow_") || name.startsWith("right_elbow_")) {
      await evalPage("window.__mmdQaProgress(0.81)");
      await evalPage("new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))");
      const bone = name.startsWith("right_hand_") ? "右手首"
        : name.startsWith("left_elbow_") ? "左ひじ"
        : name.startsWith("right_elbow_") ? "右ひじ" : "左手首";
      const hand = await evalPage(`window.__mmdQaBones(['${bone}'])['${bone}']`);
      if (!hand) throw new Error(`Missing ${bone} for hand QA camera.`);
      await evalPage(`window.__mmdQaView(${azimuth}, Math.PI / 2, ${hand[1]}, ${radius}, ${hand[0]}, ${hand[2]})`);
    } else if (name === "feet_wide") {
      await evalPage(`window.__mmdQaView(${azimuth}, Math.PI / 2, ${targetY}, ${radius}, -1.4, 0)`);
    } else {
      await evalPage(`window.__mmdQaView(${azimuth}, Math.PI / 2, ${targetY}, ${radius})`);
    }
    await new Promise((done) => setTimeout(done, 180));
    const frames = [];
    for (let index = 0; index < count; index++) {
      await evalPage(`window.__mmdQaProgress(${(captureStart + (totalDuration - captureStart) * index / (count - 1)) / totalDuration})`);
      if (name.startsWith("right_foot_tracking_")) {
        const foot = await evalPage("window.__mmdQaBones(['右足首'])['右足首']");
        if (!foot) throw new Error("Missing right ankle for foot tracking camera.");
        await evalPage(`window.__mmdQaView(${azimuth}, Math.PI / 2, ${foot[1]}, ${radius}, ${foot[0]}, ${foot[2]})`);
      }
      await evalPage("new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))");
      const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 85, captureBeyondViewport: false,
        clip: { x: 400, y: 45, width: 570, height: 730, scale: 1 } });
      frames.push(Buffer.from(shot.data, "base64"));
    }
    await writeFile(resolve(output, `${name}.avi`), encodeMjpegAvi(frames, 570, 730, fps));
    await writeFile(resolve(output, `${name}-first.jpg`), frames[0]);
    await writeFile(resolve(output, `${name}-middle.jpg`), frames[Math.floor(frames.length / 2)]);
    await writeFile(resolve(output, `${name}-last.jpg`), frames.at(-1));
    if (process.env.MOTION_VIDEO_DIAGNOSTICS === "1") {
      const names = ["下半身", "上半身", "首", "右肩", "右腕", "右ひじ", "右腕捩", "右手首", "左肩", "左腕", "左ひじ", "左腕捩", "左手首"];
      const diagnostics = await evalPage(`({ rotations: window.__mmdQaBoneRotations(${JSON.stringify(names)}), positions: window.__mmdQaBones(${JSON.stringify(names)}) })`);
      await writeFile(resolve(output, `${name}-last-bones.json`), JSON.stringify(diagnostics, null, 2));
    }
    console.log(`${name}: ${count} frames, ${fps} fps`);
  }
} finally {
  socket.close();
}
