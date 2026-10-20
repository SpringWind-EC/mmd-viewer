import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

for (const filename of process.argv.slice(2)) {
  const path = resolve(filename);
  const bytes = await readFile(path);
  const directory = resolve(dirname(path), `${basename(path, ".avi")}-frames`);
  await mkdir(directory, { recursive: true });
  let offset = 0;
  let frame = 0;
  while (true) {
    const start = bytes.indexOf(Buffer.from([0xff, 0xd8]), offset);
    if (start < 0) break;
    const end = bytes.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
    if (end < 0) throw new Error(`Incomplete JPEG frame in ${path}`);
    await writeFile(resolve(directory, `${String(frame).padStart(2, "0")}.jpg`), bytes.subarray(start, end + 2));
    offset = end + 2;
    frame++;
  }
  console.log(`${path}: ${frame} frames`);
}
