import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { buildApp } from "./app.js";
import { openSqliteStore } from "./sqlite-store.js";

if (existsSync(".env")) loadEnvFile(".env");

const store = openSqliteStore(resolve(process.env.DATABASE_FILE ?? "./data/mmd-viewer.sqlite"));
const app = await buildApp(store);
app.addHook("onClose", async () => store.close());

try {
  const port = Number(process.env.PORT ?? 3001);
  const address = await app.listen({ port, host: process.env.HOST ?? "127.0.0.1" });
  console.log(`API listening at ${address}`);
} catch (error) {
  console.error(error);
  await app.close();
  process.exitCode = 1;
}
