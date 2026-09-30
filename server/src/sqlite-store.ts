import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SavedPlan, Store, User } from "./types.js";

type UserRow = { id: string; email: string; password_hash: string; created_at: string };
type PlanRow = { id: string; title: string; plan: string; created_at: string; updated_at: string };

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, createdAt: row.created_at };
}

function toPlan(row: PlanRow): SavedPlan {
  return {
    id: row.id,
    title: row.title,
    plan: JSON.parse(row.plan),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function openSqliteStore(file: string): Store {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS motion_plans (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      plan TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS motion_plans_owner_updated_idx
      ON motion_plans(owner_id, updated_at DESC);
  `);

  return {
    createUser(email, passwordHash) {
      const user = { id: randomUUID(), email, createdAt: new Date().toISOString() };
      try {
        db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
          .run(user.id, email, passwordHash, user.createdAt);
        return user;
      } catch (error) {
        if (error instanceof Error && error.message.includes("UNIQUE constraint failed: users.email")) return null;
        throw error;
      }
    },
    findUserByEmail(email) {
      const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
      return row ? { ...toUser(row), passwordHash: row.password_hash } : null;
    },
    findUserBySession(tokenHash) {
      const row = db.prepare(`
        SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ?
      `).get(tokenHash, new Date().toISOString()) as UserRow | undefined;
      return row ? toUser(row) : null;
    },
    createSession(userId, tokenHash, expiresAt) {
      db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
      db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
        .run(tokenHash, userId, expiresAt);
    },
    deleteSession(tokenHash) {
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    },
    listPlans(userId) {
      const rows = db.prepare("SELECT id, title, plan, created_at, updated_at FROM motion_plans WHERE owner_id = ? ORDER BY updated_at DESC")
        .all(userId) as PlanRow[];
      return rows.map(toPlan);
    },
    getPlan(userId, id) {
      const row = db.prepare("SELECT id, title, plan, created_at, updated_at FROM motion_plans WHERE owner_id = ? AND id = ?")
        .get(userId, id) as PlanRow | undefined;
      return row ? toPlan(row) : null;
    },
    createPlan(userId, title, plan) {
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare("INSERT INTO motion_plans (id, owner_id, title, plan, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id, userId, title, JSON.stringify(plan), now, now);
      return { id, title, plan, createdAt: now, updatedAt: now };
    },
    updatePlan(userId, id, title, plan) {
      const now = new Date().toISOString();
      const result = db.prepare("UPDATE motion_plans SET title = ?, plan = ?, updated_at = ? WHERE owner_id = ? AND id = ?")
        .run(title, JSON.stringify(plan), now, userId, id);
      return result.changes ? this.getPlan(userId, id) : null;
    },
    deletePlan(userId, id) {
      return db.prepare("DELETE FROM motion_plans WHERE owner_id = ? AND id = ?").run(userId, id).changes > 0;
    },
    close() {
      db.close();
    },
  };
}
