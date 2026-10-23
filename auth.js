"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { getDb, hashToken } = require("./db");

const SESSION_COOKIE = "vv_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function bcryptCost() {
  const cost = Number.parseInt(process.env.BCRYPT_COST || "12", 10);
  if (!Number.isInteger(cost) || cost < 4 || cost > 15) return 12;
  return cost;
}

let dummyHashPromise = null;

function ensureDummyHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash("not-a-real-password", bcryptCost());
  }
  return dummyHashPromise;
}

function hashPassword(password) {
  return bcrypt.hash(String(password), bcryptCost());
}

function verifyPassword(password, passwordHash) {
  return bcrypt.compare(String(password), passwordHash);
}

function publicUser(user) {
  return { id: user.id, email: user.email };
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  getDb()
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`
    )
    .run(hashToken(token), userId, new Date().toISOString(), Date.now() + SESSION_TTL_MS);
  return token;
}

function destroySession(sessionToken) {
  if (!sessionToken) return;
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(sessionToken));
}

function destroyAllSessions(userId) {
  getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

function destroyOtherSessions(userId, keepToken) {
  const keepHash = keepToken ? hashToken(keepToken) : "";
  getDb().prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(userId, keepHash);
}

function getUserForSession(sessionToken) {
  if (!sessionToken) return null;
  const db = getDb();
  const session = db.prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?").get(hashToken(sessionToken));
  if (!session || session.expires_at < Date.now()) {
    if (session) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(sessionToken));
    return null;
  }
  return db.prepare("SELECT id, email, password_hash, active_vault_id, created_at FROM users WHERE id = ?").get(session.user_id) || null;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: "/",
  };
}

function attachUser(req, res, next) {
  const sessionToken = req.cookies && req.cookies[SESSION_COOKIE];
  const user = getUserForSession(sessionToken);
  req.user = user ? publicUser(user) : null;
  req.sessionToken = sessionToken || null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Not signed in" });
  next();
}

function safeEqual(a, b) {
  const left = crypto.createHash("sha256").update(String(a)).digest();
  const right = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  SESSION_COOKIE,
  bcryptCost,
  ensureDummyHash,
  hashPassword,
  verifyPassword,
  publicUser,
  createSession,
  destroySession,
  destroyAllSessions,
  destroyOtherSessions,
  getUserForSession,
  cookieOptions,
  attachUser,
  requireAuth,
  safeEqual,
};
