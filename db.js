"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  active_vault_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS vaults (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  state_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  group_unlocked INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  vault_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (vault_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT,
  vault_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at TEXT,
  used_by TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_invites_vault ON invites(vault_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subscription_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);

CREATE TABLE IF NOT EXISTS budget_alerts (
  vault_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (vault_id, kind, fingerprint)
);
`;

let dbInstance = null;
let dbPath = null;

function resolveDbPath() {
  if (process.env.SQLITE_PATH) return process.env.SQLITE_PATH;
  const dir = process.env.DATA_DIR || path.join(__dirname, "data");
  return path.join(dir, "vegas-vault.sqlite");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function readJsonArray(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return null;
  }
}

function importLegacyJson(db, sqliteFile) {
  const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (userCount > 0) return;

  const dir = sqliteFile === ":memory:" ? path.join(__dirname, "data") : path.dirname(sqliteFile);
  const users = readJsonArray(path.join(dir, "users.json"));
  if (!users || users.length === 0) return;

  const importAll = db.transaction(() => {
    const insertUser = db.prepare(
      `INSERT OR IGNORE INTO users (id, email, password_hash, active_vault_id, created_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const user of users) {
      insertUser.run(user.id, user.email, user.passwordHash, user.activeVaultId || null, user.createdAt || new Date().toISOString());
    }

    const sessions = readJsonArray(path.join(dir, "sessions.json")) || [];
    const insertSession = db.prepare(
      `INSERT OR IGNORE INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`
    );
    for (const session of sessions) {
      if (!session.id || !session.userId) continue;
      insertSession.run(hashToken(session.id), session.userId, session.createdAt || new Date().toISOString(), session.expiresAt || 0);
    }

    const vaults = readJsonArray(path.join(dir, "vaults.json")) || [];
    const insertVault = db.prepare(
      `INSERT OR IGNORE INTO vaults (id, name, state_json, version, updated_at, updated_by, created_at)
       VALUES (?, ?, ?, 1, ?, NULL, ?)`
    );
    for (const vault of vaults) {
      insertVault.run(
        vault.id,
        vault.name || "Vault",
        JSON.stringify(vault.state || {}),
        vault.updatedAt || vault.createdAt || new Date().toISOString(),
        vault.createdAt || new Date().toISOString()
      );
    }

    const memberships = readJsonArray(path.join(dir, "memberships.json")) || [];
    const insertMember = db.prepare(
      `INSERT OR IGNORE INTO memberships (vault_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`
    );
    for (const membership of memberships) {
      insertMember.run(membership.vaultId, membership.userId, membership.role || "member", membership.joinedAt || new Date().toISOString());
    }

    const invites = readJsonArray(path.join(dir, "invites.json")) || [];
    const insertInvite = db.prepare(
      `INSERT OR IGNORE INTO invites
        (id, token_hash, token_hint, vault_id, created_by, created_at, expires_at, used_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`
    );
    for (const invite of invites) {
      if (!invite.token) continue;
      insertInvite.run(
        crypto.randomUUID(),
        hashToken(invite.token),
        String(invite.token).slice(-4),
        invite.vaultId,
        invite.createdByUserId || "",
        invite.createdAt || new Date().toISOString(),
        invite.expiresAt || 0
      );
    }

    const subs = readJsonArray(path.join(dir, "subscriptions.json")) || [];
    const insertSub = db.prepare(
      `INSERT OR IGNORE INTO subscriptions (endpoint, user_id, subscription_json, updated_at) VALUES (?, ?, ?, ?)`
    );
    for (const sub of subs) {
      if (!sub.subscription || !sub.subscription.endpoint || !sub.userId) continue;
      insertSub.run(sub.subscription.endpoint, sub.userId, JSON.stringify(sub.subscription), sub.updatedAt || new Date().toISOString());
    }
  });

  importAll();

  for (const name of ["users", "sessions", "vaults", "memberships", "invites", "subscriptions"]) {
    const file = path.join(dir, `${name}.json`);
    if (!fs.existsSync(file)) continue;
    const renamed = path.join(dir, `${name}.json.imported`);
    try {
      fs.renameSync(file, renamed);
    } catch (e) {
      console.warn("Could not rename imported file", file, e.message);
    }
  }
  console.log("Imported existing JSON data into SQLite.");
}

function purgeExpired(db) {
  const now = Date.now();
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  db.prepare("DELETE FROM invites WHERE expires_at < ? AND used_at IS NULL AND revoked_at IS NULL").run(now);
}

function ensureGroupUnlockColumn(db) {
  const columns = db.prepare("PRAGMA table_info(vaults)").all();
  if (!columns.some((column) => column.name === "group_unlocked")) {
    db.exec("ALTER TABLE vaults ADD COLUMN group_unlocked INTEGER NOT NULL DEFAULT 0");
  }
}

// Vaults that were already shared before the one-time unlock existed stay open.
// A locked vault cannot gain a second member or an invite, so repeating this
// on startup does not unlock a vault that still needs to be paid for.
function grandfatherSharedVaults(db) {
  db.exec(`
    UPDATE vaults SET group_unlocked = 1
    WHERE group_unlocked = 0
      AND id IN (
        SELECT vault_id FROM memberships GROUP BY vault_id HAVING COUNT(*) > 1
        UNION
        SELECT vault_id FROM invites
      )
  `);
}

function openDatabase() {
  const file = resolveDbPath();
  if (dbInstance && dbPath === file) return dbInstance;
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  ensureGroupUnlockColumn(db);
  importLegacyJson(db, file);
  grandfatherSharedVaults(db);
  purgeExpired(db);
  dbInstance = db;
  dbPath = file;
  return db;
}

function getDb() {
  return openDatabase();
}

function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbPath = null;
  }
}

function backupDatabase() {
  const file = resolveDbPath();
  if (file === ":memory:") return;
  const db = getDb();
  const dir = path.join(path.dirname(file), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const dest = path.join(dir, `vegas-vault-${day}.sqlite`);
  return db.backup(dest).then(() => {
    const files = fs.readdirSync(dir).filter((name) => name.endsWith(".sqlite")).sort();
    while (files.length > 7) {
      const oldest = files.shift();
      fs.unlinkSync(path.join(dir, oldest));
    }
  }).catch((err) => {
    console.error("Nightly database backup failed:", err.message);
  });
}

module.exports = { getDb, closeDb, resolveDbPath, hashToken, backupDatabase, purgeExpired };
