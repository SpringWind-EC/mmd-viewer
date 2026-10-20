import { readFile, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";

function jpegFrames(avi) {
  const marker = avi.indexOf(Buffer.from("movi", "ascii"));
  if (marker < 0) throw new Error("Missing AVI video frames.");
  const frames = [];
  for (let cursor = marker + 4; cursor + 8 <= avi.length;) {
    const type = avi.toString("ascii", cursor, cursor + 4);
    if (type !== "00dc") break;
    const size = avi.readUInt32LE(cursor + 4);
    frames.push(avi.subarray(cursor + 8, cursor + 8 + size));
    cursor += 8 + size + (size % 2);
  }
  if (!frames.length) throw new Error("The AVI contains no JPEG frames.");
  return frames;
}

const cdpPort = Number(process.env.MOTION_VIDEO_CDP_PORT ?? 9227);
if (!Number.isInteger(cdpPort) || cdpPort < 1 || cdpPort > 65535) throw new Error("Invalid CDP port.");
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
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

try {
  await send("Runtime.enable");
  for (const name of process.argv.slice(2)) {
    const path = resolve(name);
    if (extname(path).toLowerCase() !== ".avi") throw new Error(`Expected AVI: ${path}`);
    const frames = jpegFrames(await readFile(path));
    const sources = frames.map((frame) => `data:image/jpeg;base64,${frame.toString("base64")}`);
    const result = await evalPage(`(async () => {
      const sources = ${JSON.stringify(sources)};
      const images = await Promise.all(sources.map((source) => new Promise((resolve, reject) => {
        const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source;
      })));
      const canvas = document.createElement('canvas');
      canvas.width = images[0].naturalWidth;
      canvas.height = images[0].naturalHeight;
      const context = canvas.getContext('2d');
      const stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0];
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 3000000 });
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = (event) => reject(event.error); });
      context.drawImage(images[0], 0, 0);
      recorder.start();
      for (const image of images) {
        context.drawImage(image, 0, 0);
        track.requestFrame();
        await new Promise((resolve) => setTimeout(resolve, ${Number(process.env.MOTION_WEBM_FRAME_MS ?? 50)}));
      }
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((item) => item.stop());
      const blob = new Blob(chunks, { type: 'video/webm' });
      const video = document.createElement('video');
      const ready = new Promise((resolve) => { video.onloadedmetadata = () => resolve(true); video.onerror = () => resolve(false); });
      video.src = URL.createObjectURL(blob);
      const decodes = await ready;
      let preview = null;
      if (decodes) {
        video.muted = true;
        await video.play();
        await new Promise((resolve) => setTimeout(resolve, 1200));
        context.drawImage(video, 0, 0);
        preview = canvas.toDataURL('image/png');
        video.pause();
      }
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
      });
      return { data, decodes, preview, width: video.videoWidth, height: video.videoHeight };
    })()`);
    if (!result.decodes) throw new Error(`Recorded WebM cannot be decoded: ${path}`);
    const file = path.slice(0, -4) + ".webm";
    const bytes = Buffer.from(result.data.split(",")[1], "base64");
    if (bytes.length < 10000) throw new Error(`WebM recording too small: ${file}`);
    await writeFile(file, bytes);
    if (result.preview) await writeFile(file + ".preview.png", Buffer.from(result.preview.split(",")[1], "base64"));
    console.log(`${file}: ${frames.length} frames, ${bytes.length} bytes, ${result.width}x${result.height}`);
  }
} finally {
  socket.close();
}
