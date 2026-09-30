import type { MotionPlan } from "../engine/MotionPlan";
import type { MotionProgram } from "../engine/MotionProgram";

export type PlanData = MotionPlan | MotionProgram;
export type Account = { id: string; email: string; createdAt: string };
export type SavedPlan = {
  id: string;
  title: string;
  plan: PlanData;
  createdAt: string;
  updatedAt: string;
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => {
    throw new Error("The API server is unavailable or returned an invalid response.");
  });
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body as T;
}

export const accountApi = {
  me: () => api<{ user: Account | null }>("/auth/me"),
  register: (email: string, password: string) => api<{ user: Account }>("/auth/register", {
    method: "POST", body: JSON.stringify({ email, password }),
  }),
  login: (email: string, password: string) => api<{ user: Account }>("/auth/login", {
    method: "POST", body: JSON.stringify({ email, password }),
  }),
  logout: () => api<{ ok: boolean }>("/auth/logout", { method: "POST" }),
};

export const planApi = {
  list: () => api<{ plans: SavedPlan[] }>("/plans"),
  create: (title: string, plan: PlanData) => api<{ plan: SavedPlan }>("/plans", {
    method: "POST", body: JSON.stringify({ title, plan }),
  }),
  update: (id: string, title: string, plan: PlanData) => api<{ plan: SavedPlan }>(`/plans/${id}`, {
    method: "PUT", body: JSON.stringify({ title, plan }),
  }),
  delete: (id: string) => api<void>(`/plans/${id}`, { method: "DELETE" }),
};

export async function generateText(kind: "motion", prompt: string): Promise<string> {
  const response = await api<{ text: string }>(`/generate/${kind}`, {
    method: "POST", body: JSON.stringify({ prompt }),
  });
  return response.text;
}

export async function generatePlan(prompt: string): Promise<MotionProgram> {
  const response = await api<{ plan: MotionProgram }>("/generate/plan", {
    method: "POST", body: JSON.stringify({ prompt }),
  });
  return response.plan;
}
