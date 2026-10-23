"use strict";

// Small in-memory limiter. Login and signup are the sensitive routes; a
// process restart clears the counters, which is acceptable for a single
// Railway instance. Keyed by IP (Express honours trust proxy).
function createRateLimit({ windowMs, max, name }) {
  const hits = new Map();

  function middleware(req, res, next) {
    const now = Date.now();
    const key = `${name}:${req.ip || "unknown"}`;
    const recent = (hits.get(key) || []).filter((ts) => now - ts < windowMs);
    if (recent.length >= max) {
      const retryAfter = Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000));
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "Too many attempts. Please wait and try again." });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  }

  return middleware;
}

function intEnv(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function authRateLimit() {
  return createRateLimit({
    name: "auth",
    windowMs: intEnv("AUTH_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
    max: intEnv("AUTH_RATE_LIMIT_MAX", 10),
  });
}

function inviteRateLimit() {
  return createRateLimit({
    name: "invite",
    windowMs: intEnv("INVITE_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
    max: intEnv("INVITE_RATE_LIMIT_MAX", 30),
  });
}

function geocodeRateLimit() {
  return createRateLimit({
    name: "geocode",
    windowMs: 60 * 1000,
    max: intEnv("GEOCODE_RATE_LIMIT_MAX", 30),
  });
}

module.exports = { createRateLimit, authRateLimit, inviteRateLimit, geocodeRateLimit };
