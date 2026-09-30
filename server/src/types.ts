export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface SavedPlan {
  id: string;
  title: string;
  plan: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface Store {
  createUser(email: string, passwordHash: string): User | null;
  findUserByEmail(email: string): (User & { passwordHash: string }) | null;
  findUserBySession(tokenHash: string): User | null;
  createSession(userId: string, tokenHash: string, expiresAt: string): void;
  deleteSession(tokenHash: string): void;
  listPlans(userId: string): SavedPlan[];
  getPlan(userId: string, id: string): SavedPlan | null;
  createPlan(userId: string, title: string, plan: unknown): SavedPlan;
  updatePlan(userId: string, id: string, title: string, plan: unknown): SavedPlan | null;
  deletePlan(userId: string, id: string): boolean;
  close(): void;
}
