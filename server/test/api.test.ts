import assert from "node:assert/strict";
import { mkdtempSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildApp } from "../src/app.js";
import { openSqliteStore } from "../src/sqlite-store.js";

test("accounts own their plans and sessions expire on logout", async () => {
  const store = openSqliteStore(":memory:");
  const generatedPlan = { duration: 2, operators: [{ type: "look", target: "viewer" }] };
  const app = await buildApp(store, async () => JSON.stringify(generatedPlan));
  try {
    async function register(email: string) {
      const response = await app.inject({ method: "POST", url: "/api/auth/register", payload: { email, password: "strong-password-123" } });
      assert.equal(response.statusCode, 201);
      assert.equal(response.json().user.email, email);
      assert.equal(response.json().user.passwordHash, undefined);
      const cookie = response.headers["set-cookie"];
      assert.equal(typeof cookie, "string");
      assert.match(cookie as string, /HttpOnly/);
      return (cookie as string).split(";")[0];
    }

    const alice = await register("alice@example.com");
    const bob = await register("bob@example.com");
    const plan = { duration: 2, actions: [{ type: "neutral" }] };
    const created = await app.inject({ method: "POST", url: "/api/plans", headers: { cookie: alice }, payload: { title: "Wave", plan } });
    assert.equal(created.statusCode, 201);
    const id = created.json().plan.id as string;

    const bobList = await app.inject({ method: "GET", url: "/api/plans", headers: { cookie: bob } });
    assert.deepEqual(bobList.json().plans, []);
    for (const method of ["GET", "PUT", "DELETE"] as const) {
      const response = await app.inject({ method, url: `/api/plans/${id}`, headers: { cookie: bob }, payload: method === "PUT" ? { title: "Stolen", plan } : undefined });
      assert.equal(response.statusCode, 404);
    }

    const updated = await app.inject({ method: "PUT", url: `/api/plans/${id}`, headers: { cookie: alice }, payload: { title: "New title", plan } });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().plan.title, "New title");

    const invalid = await app.inject({ method: "POST", url: "/api/plans", headers: { cookie: alice }, payload: { title: "Bad", plan: { duration: 2, actions: [{ type: "unknown" }] } } });
    assert.equal(invalid.statusCode, 400);

    const generated = await app.inject({ method: "POST", url: "/api/generate/plan", headers: { cookie: alice }, payload: { prompt: "wave" } });
    assert.equal(generated.statusCode, 200);
    assert.deepEqual(generated.json(), { plan: generatedPlan });

    const rawMotion = await app.inject({ method: "POST", url: "/api/generate/motion", headers: { cookie: alice }, payload: { prompt: "wave" } });
    assert.equal(rawMotion.statusCode, 200);
    assert.equal(rawMotion.json().text, JSON.stringify(generatedPlan));

    const logout = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie: alice } });
    assert.equal(logout.statusCode, 200);
    const afterLogout = await app.inject({ method: "GET", url: "/api/plans", headers: { cookie: alice } });
    assert.equal(afterLogout.statusCode, 401);
  } finally {
    await app.close();
    store.close();
  }
});

test("invalid generated plans are rejected instead of replaced with a fallback motion", async () => {
  const store = openSqliteStore(":memory:");
  const outputs: Record<string, string> = {
    malformed: "Here is your plan: {}",
    empty: JSON.stringify({ duration: 2, operators: [] }),
    unknown: JSON.stringify({ duration: 2, operators: [{ type: "teleport" }] }),
    timing: JSON.stringify({ duration: 2, operators: [{ type: "look", target: "viewer", startTime: 2 }] }),
    unsupported: JSON.stringify({ duration: 2, operators: [{ type: "oscillate", effector: "right_foot", axis: "horizontal" }] }),
  };
  const app = await buildApp(store, async (_kind, prompt) => outputs[prompt]);
  try {
    const register = await app.inject({
      method: "POST", url: "/api/auth/register",
      payload: { email: "generator@example.com", password: "strong-password-123" },
    });
    const cookie = (register.headers["set-cookie"] as string).split(";")[0];

    for (const prompt of Object.keys(outputs)) {
      const response = await app.inject({
        method: "POST", url: "/api/generate/plan", headers: { cookie }, payload: { prompt },
      });
      assert.equal(response.statusCode, 502, prompt);
      assert.match(response.json().error, /invalid motion plan/i);
      assert.equal(response.json().plan, undefined);
    }
  } finally {
    await app.close();
    store.close();
  }
});

test("operator plans survive reopening the database", () => {
  const directory = mkdtempSync(join(tmpdir(), "mmd-viewer-test-"));
  const file = join(directory, "plans.sqlite");
  const plan = { duration: 2, operators: [{ type: "look", target: "viewer" }] };
  const first = openSqliteStore(file);
  let firstClosed = false;
  let second: ReturnType<typeof openSqliteStore> | undefined;
  try {
    const user = first.createUser("saved@example.com", "hash");
    assert.ok(user);
    const saved = first.createPlan(user.id, "Look at camera", plan);
    first.close();
    firstClosed = true;
    second = openSqliteStore(file);
    assert.deepEqual(second.getPlan(user.id, saved.id)?.plan, plan);
  } finally {
    if (second) second.close();
    if (!firstClosed) first.close();
    unlinkSync(file);
    rmdirSync(directory);
  }
});
