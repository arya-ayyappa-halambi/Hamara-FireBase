// ─────────────────────────────────────────────────────────────────────────────
//  src/store/user.store.ts
//  SQLite-backed user store for AegisDB.
//
//  Implements the UserStore interface backed by SQLite database.
// ─────────────────────────────────────────────────────────────────────────────

import { User } from '../types/auth.types';
import { getDb } from '../db/sqlite.connection';

// ── Interface ─────────────────────────────────────────────────────────────────

export interface UserStore {
  /** Find a user by their email address. Returns undefined if not found. */
  findByEmail(email: string): Promise<User | undefined>;

  /** Find a user by their UUID. Returns undefined if not found. */
  findById(id: string): Promise<User | undefined>;

  /** Persist a new user record. Throws if the email already exists. */
  create(user: User): Promise<User>;
}

// ── SQLite Implementation ──────────────────────────────────────────────────────

interface RawUserRow {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

function mapRowToUser(row: RawUserRow): User {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

class SqliteUserStore implements UserStore {
  async findByEmail(email: string): Promise<User | undefined> {
    const normalised = email.toLowerCase().trim();
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(normalised) as RawUserRow | undefined;
    return row ? mapRowToUser(row) : undefined;
  }

  async findById(id: string): Promise<User | undefined> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as RawUserRow | undefined;
    return row ? mapRowToUser(row) : undefined;
  }

  async create(user: User): Promise<User> {
    const normalised = user.email.toLowerCase().trim();
    const createdAtStr = user.createdAt instanceof Date ? user.createdAt.toISOString() : String(user.createdAt);
    const updatedAtStr = user.updatedAt instanceof Date ? user.updatedAt.toISOString() : String(user.updatedAt);

    const record: User = {
      ...user,
      email: normalised,
      createdAt: new Date(createdAtStr),
      updatedAt: new Date(updatedAtStr),
    };

    const db = getDb();
    try {
      const stmt = db.prepare(`
        INSERT INTO users (id, email, name, passwordHash, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(record.id, record.email, record.name, record.passwordHash, createdAtStr, updatedAtStr);
      return record;
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        throw new Error(`User with email "${user.email}" already exists.`);
      }
      throw err;
    }
  }

  /** Utility — returns total stored user count. */
  count(): number {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return row.count;
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const userStore: UserStore = new SqliteUserStore();
