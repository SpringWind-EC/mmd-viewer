import { createHash, randomBytes } from "node:crypto";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { generateWithGemini } from "./generation.js";
import { hashPassword, verifyPassword } from "./password.js";
import { planInputSchema } from "./plan-schema.js";
import type { Store, User } from "./types.js";

const credentialsSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(12).max(128),
});
const idSchema = z.uuid();
const promptSchema = z.object({ prompt: z.string().trim().min(1).max(2000) });
const sessionDays = 30;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function buildApp(
  store: Store,
  generate: typeof generateWithGemini = generateWithGemini,
) {
  const app = Fastify({ bodyLimit: 300_000, logger: false });
  await app.register(cookie);
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  function currentUser(request: FastifyRequest): User | null {
    const token = request.cookies.session;
    return token ? store.findUserBySession(tokenHash(token)) : null;
  }

  function setSession(reply: FastifyReply, user: User) {
    const token = randomBytes(32).toString("hex");
    store.createSession(user.id, tokenHash(token), new Date(Date.now() + sessionDays * 86400_000).toISOString());
    reply.setCookie("session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/api",
      maxAge: sessionDays * 86400,
    });
  }

  app.get("/api/health", async () => ({ ok: true }));

  app.post("/api/auth/register", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter a valid email and a password of at least 12 characters." });
    const passwordHash = await hashPassword(parsed.data.password);
    const user = store.createUser(parsed.data.email, passwordHash);
    if (!user) return reply.code(409).send({ error: "An account with that email already exists." });
    setSession(reply, user);
    return reply.code(201).send({ user });
  });

  app.post("/api/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter a valid email and password." });
    const account = store.findUserByEmail(parsed.data.email);
    if (!account || !await verifyPassword(parsed.data.password, account.passwordHash)) {
      return reply.code(401).send({ error: "Incorrect email or password." });
    }
    const user: User = { id: account.id, email: account.email, createdAt: account.createdAt };
    setSession(reply, user);
    return { user };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const token = request.cookies.session;
    if (token) store.deleteSession(tokenHash(token));
    reply.clearCookie("session", { path: "/api" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (request) => ({ user: currentUser(request) }));

  app.get("/api/plans", async (request, reply) => {
    const user = currentUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to view your plans." });
    return { plans: store.listPlans(user.id) };
  });

  app.get<{ Params: { id: string } }>("/api/plans/:id", async (request, reply) => {
    const user = currentUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to view your plans." });
    if (!idSchema.safeParse(request.params.id).success) return reply.code(404).send({ error: "Plan not found." });
    const plan = store.getPlan(user.id, request.params.id);
    return plan ? { plan } : reply.code(404).send({ error: "Plan not found." });
  });

  app.post("/api/plans", async (request, reply) => {
    const user = currentUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to save plans." });
    const parsed = planInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid motion plan or title." });
    return reply.code(201).send({ plan: store.createPlan(user.id, parsed.data.title, parsed.data.plan) });
  });

  app.put<{ Params: { id: string } }>("/api/plans/:id", async (request, reply) => {
    const user = currentUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to update plans." });
    const parsed = planInputSchema.safeParse(request.body);
    if (!idSchema.safeParse(request.params.id).success || !parsed.success) {
      return reply.code(400).send({ error: "Invalid motion plan, title, or ID." });
    }
    const plan = store.updatePlan(user.id, request.params.id, parsed.data.title, parsed.data.plan);
    return plan ? { plan } : reply.code(404).send({ error: "Plan not found." });
  });

  app.delete<{ Params: { id: string } }>("/api/plans/:id", async (request, reply) => {
    const user = currentUser(request);
    if (!user) return reply.code(401).send({ error: "Sign in to delete plans." });
    if (!idSchema.safeParse(request.params.id).success) return reply.code(404).send({ error: "Plan not found." });
    return store.deletePlan(user.id, request.params.id)
      ? reply.code(204).send()
      : reply.code(404).send({ error: "Plan not found." });
  });

  for (const kind of ["motion", "plan"] as const) {
    app.post(`/api/generate/${kind}`, { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
      if (!currentUser(request)) return reply.code(401).send({ error: "Sign in to generate motions." });
      const parsed = promptSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Enter a motion prompt of at most 2000 characters." });
      if (!process.env.GEMINI_API_KEY && generate === generateWithGemini) {
        return reply.code(503).send({ error: "Gemini is not configured on the server." });
      }
      try {
        return { text: await generate(kind, parsed.data.prompt) };
      } catch (error) {
        request.log.error(error);
        return reply.code(502).send({ error: "Motion generation failed." });
      }
    });
  }

  return app;
}
