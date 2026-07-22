const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { readCollection, writeCollection } = require("./db");

const SESSION_COOKIE = "vv_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function publicUser(user) {
  return { id: user.id, email: user.email };
}

function createSession(userId) {
  const sessions = readCollection("sessions");
  const id = crypto.randomBytes(32).toString("hex");
  sessions.push({ id, userId, createdAt: new Date().toISOString(), expiresAt: Date.now() + SESSION_TTL_MS });
  writeCollection("sessions", sessions);
  return id;
}

function destroySession(sessionId) {
  const sessions = readCollection("sessions").filter((s) => s.id !== sessionId);
  writeCollection("sessions", sessions);
}

function getUserForSession(sessionId) {
  if (!sessionId) return null;
  const sessions = readCollection("sessions");
  const session = sessions.find((s) => s.id === sessionId);
  if (!session || session.expiresAt < Date.now()) return null;
  const users = readCollection("users");
  return users.find((u) => u.id === session.userId) || null;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
  };
}

// Attaches req.user (without passwordHash) when a valid session cookie is present.
// Never rejects the request — routes that require a login check req.user themselves.
function attachUser(req, res, next) {
  const sessionId = req.cookies && req.cookies[SESSION_COOKIE];
  const user = getUserForSession(sessionId);
  req.user = user ? publicUser(user) : null;
  req.sessionId = sessionId || null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Not signed in" });
  next();
}

module.exports = {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  publicUser,
  createSession,
  destroySession,
  getUserForSession,
  cookieOptions,
  attachUser,
  requireAuth,
};
