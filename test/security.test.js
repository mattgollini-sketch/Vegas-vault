"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vegas-vault-"));
process.env.SQLITE_PATH = path.join(tmp, "test.sqlite");
process.env.ADMIN_SECRET = "test-admin-secret";
process.env.BCRYPT_COST = "4";
process.env.NODE_ENV = "test";
process.env.AUTH_RATE_LIMIT_MAX = "5";
process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";
process.env.VAPID_PUBLIC_KEY = "";
process.env.VAPID_PRIVATE_KEY = "";

const { app, SIGNUP_MESSAGE } = require("../server");
const { getDb, hashToken } = require("../db");

let base;
let server;
let ipCounter = 10;

function nextIp() {
  ipCounter += 1;
  return `10.1.0.${ipCounter}`;
}

function cookieHeader(response) {
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function api(pathname, { method = "GET", body, cookie, ip, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (body !== undefined) requestHeaders["Content-Type"] = "application/json";
  if (cookie) requestHeaders.Cookie = cookie;
  if (ip) requestHeaders["X-Forwarded-For"] = ip;
  const response = await fetch(base + pathname, {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    json = null;
  }
  return { status: response.status, json, text, cookie: cookieHeader(response), headers: response.headers };
}

async function signup(email, password, ip = nextIp()) {
  return api("/api/auth/signup", { method: "POST", body: { email, password }, ip });
}

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("only frontend files are served", async () => {
  const home = await api("/");
  assert.equal(home.status, 200);
  assert.match(home.text, /Vegas Vault/);
  assert.ok(home.headers.get("content-security-policy"));
  assert.equal(home.headers.get("x-powered-by"), null);

  const appJs = await api("/app.js");
  assert.equal(appJs.status, 200);
  assert.match(appJs.text, /vegasVaultData/);

  for (const hidden of [
    "/server.js",
    "/auth.js",
    "/db.js",
    "/vaults.js",
    "/package.json",
    "/.env",
    "/data/users.json",
    "/data/sessions.json",
    "/data/vaults.json",
    "/data/vegas-vault.sqlite",
  ]) {
    const response = await api(hidden);
    assert.equal(response.status, 404, hidden);
    assert.equal(/passwordHash|BEGIN|session/i.test(response.text), false, hidden);
  }
});

test("signup does not reveal whether an email already has an account", async () => {
  const email = `taken-${Date.now()}@example.com`;
  const first = await signup(email, "password123");
  const second = await signup(email, "another-password");

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.json.message, SIGNUP_MESSAGE);
  assert.equal(second.json.message, SIGNUP_MESSAGE);
  assert.equal(JSON.stringify(second.json).toLowerCase().includes("already exists"), false);
  assert.equal(second.json.error, undefined);
  assert.ok(first.json.user && first.json.user.email === email);
  assert.equal(second.json.user, null);
  assert.match(first.cookie, /vv_session=/);
  assert.equal(second.cookie, "");
});

test("login uses one message for unknown emails and wrong passwords", async () => {
  const email = `login-${Date.now()}@example.com`;
  const created = await signup(email, "password123");
  assert.equal(created.status, 200);

  const wrongPassword = await api("/api/auth/login", {
    method: "POST",
    ip: nextIp(),
    body: { email, password: "not-the-password" },
  });
  const unknown = await api("/api/auth/login", {
    method: "POST",
    ip: nextIp(),
    body: { email: "nobody@example.com", password: "password123" },
  });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrongPassword.json.error, unknown.json.error);
  assert.match(wrongPassword.json.error, /Invalid email or password/);
});

test("session tokens are stored hashed", async () => {
  const created = await signup(`hash-${Date.now()}@example.com`, "password123");
  const token = created.cookie.split("=")[1];
  assert.ok(token);
  const rows = getDb().prepare("SELECT token_hash FROM sessions").all();
  assert.equal(rows.some((row) => row.token_hash === token), false);
  assert.equal(rows.some((row) => row.token_hash === hashToken(token)), true);
});

test("login and signup are rate limited", async () => {
  const ip = "10.9.8.7";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await api("/api/auth/login", {
      method: "POST",
      ip,
      body: { email: "nobody@example.com", password: "wrong-password" },
    });
    assert.equal(response.status, 401, `attempt ${attempt}`);
  }
  const blocked = await api("/api/auth/login", {
    method: "POST",
    ip,
    body: { email: "nobody@example.com", password: "wrong-password" },
  });
  assert.equal(blocked.status, 429);

  const otherIp = await api("/api/auth/login", {
    method: "POST",
    ip: nextIp(),
    body: { email: "nobody@example.com", password: "wrong-password" },
  });
  assert.equal(otherIp.status, 401);
});

test("send-now requires the admin secret", async () => {
  const previous = process.env.ADMIN_SECRET;
  delete process.env.ADMIN_SECRET;
  const hidden = await api("/api/send-now", { method: "POST", body: {} });
  assert.equal(hidden.status, 404);
  process.env.ADMIN_SECRET = previous;

  const missing = await api("/api/send-now", { method: "POST", body: {} });
  assert.equal(missing.status, 403);
  const wrong = await api("/api/send-now", {
    method: "POST",
    body: {},
    headers: { "x-admin-secret": "nope" },
  });
  assert.equal(wrong.status, 403);
  const allowed = await api("/api/send-now", {
    method: "POST",
    body: {},
    headers: { "x-admin-secret": "test-admin-secret" },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.json.ok, false);
  assert.match(allowed.json.reason, /VAPID/);
});

test("unsubscribe requires login and only removes your own subscription", async () => {
  const anonymous = await api("/api/unsubscribe", {
    method: "POST",
    body: { endpoint: "https://push.example/anyone" },
  });
  assert.equal(anonymous.status, 401);

  const owner = await signup(`push-owner-${Date.now()}@example.com`, "password123");
  const other = await signup(`push-other-${Date.now()}@example.com`, "password123");
  const endpoint = `https://push.example/${crypto.randomUUID()}`;
  const subscribed = await api("/api/subscribe", {
    method: "POST",
    cookie: owner.cookie,
    ip: nextIp(),
    body: { subscription: { endpoint, keys: { p256dh: "abc", auth: "def" } } },
  });
  assert.equal(subscribed.status, 201);

  const stolen = await api("/api/unsubscribe", {
    method: "POST",
    cookie: other.cookie,
    ip: nextIp(),
    body: { endpoint },
  });
  assert.equal(stolen.status, 403);
  const stillThere = getDb().prepare("SELECT user_id FROM subscriptions WHERE endpoint = ?").get(endpoint);
  assert.ok(stillThere);

  const removed = await api("/api/unsubscribe", {
    method: "POST",
    cookie: owner.cookie,
    ip: nextIp(),
    body: { endpoint },
  });
  assert.equal(removed.status, 200);
  const gone = getDb().prepare("SELECT user_id FROM subscriptions WHERE endpoint = ?").get(endpoint);
  assert.equal(gone, undefined);
});

test("vault reads and writes are limited to members and reject stale versions", async () => {
  const owner = await signup(`owner-${Date.now()}@example.com`, "password123");
  const stranger = await signup(`stranger-${Date.now()}@example.com`, "password123");
  const vaultId = owner.json.activeVaultId;

  const denied = await api(`/api/vault/${vaultId}`, { cookie: stranger.cookie });
  assert.equal(denied.status, 403);

  const loaded = await api(`/api/vault/${vaultId}`, { cookie: owner.cookie });
  assert.equal(loaded.status, 200);
  assert.equal(loaded.json.version, 1);

  const saved = await api(`/api/vault/${vaultId}`, {
    method: "PUT",
    cookie: owner.cookie,
    ip: nextIp(),
    body: { baseVersion: 1, state: { tripName: "Owner edit" } },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.version, 2);

  const invite = await api(`/api/vault/${vaultId}/invite`, { method: "POST", cookie: owner.cookie, ip: nextIp() });
  assert.equal(invite.status, 201);
  const guest = await signup(`guest-${Date.now()}@example.com`, "password123");
  const joined = await api(`/api/invite/${invite.json.token}/accept`, {
    method: "POST",
    cookie: guest.cookie,
    ip: nextIp(),
  });
  assert.equal(joined.status, 200);

  const guestLoaded = await api(`/api/vault/${vaultId}`, { cookie: guest.cookie });
  assert.equal(guestLoaded.json.version, 2);

  const stale = await api(`/api/vault/${vaultId}`, {
    method: "PUT",
    cookie: guest.cookie,
    ip: nextIp(),
    body: { baseVersion: 1, state: { tripName: "Stale guest edit" } },
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.version, 2);
  assert.equal(stale.json.state.tripName, "Owner edit");

  const current = await api(`/api/vault/${vaultId}`, { cookie: owner.cookie });
  assert.equal(current.json.state.tripName, "Owner edit");

  const fresh = await api(`/api/vault/${vaultId}`, {
    method: "PUT",
    cookie: guest.cookie,
    ip: nextIp(),
    body: { baseVersion: stale.json.version, state: { tripName: "Merged guest edit" } },
  });
  assert.equal(fresh.status, 200);
  assert.equal(fresh.json.version, 3);
});

test("invites are owner-only, single-use, revocable, and expirable", async () => {
  const owner = await signup(`invite-owner-${Date.now()}@example.com`, "password123");
  const vaultId = owner.json.activeVaultId;
  const memberAccount = await signup(`invite-member-${Date.now()}@example.com`, "password123");

  const ownerInvite = await api(`/api/vault/${vaultId}/invite`, {
    method: "POST",
    cookie: owner.cookie,
    ip: nextIp(),
  });
  assert.equal(ownerInvite.status, 201);
  await api(`/api/invite/${ownerInvite.json.token}/accept`, {
    method: "POST",
    cookie: memberAccount.cookie,
    ip: nextIp(),
  });

  const memberInvite = await api(`/api/vault/${vaultId}/invite`, {
    method: "POST",
    cookie: memberAccount.cookie,
    ip: nextIp(),
  });
  assert.equal(memberInvite.status, 403);

  const reusable = await api(`/api/vault/${vaultId}/invite`, {
    method: "POST",
    cookie: owner.cookie,
    ip: nextIp(),
  });
  const firstGuest = await signup(`invite-one-${Date.now()}@example.com`, "password123");
  const secondGuest = await signup(`invite-two-${Date.now()}@example.com`, "password123");
  const firstJoin = await api(`/api/invite/${reusable.json.token}/accept`, {
    method: "POST",
    cookie: firstGuest.cookie,
    ip: nextIp(),
  });
  assert.equal(firstJoin.status, 200);
  const secondJoin = await api(`/api/invite/${reusable.json.token}/accept`, {
    method: "POST",
    cookie: secondGuest.cookie,
    ip: nextIp(),
  });
  assert.equal(secondJoin.status, 404);

  const revocable = await api(`/api/vault/${vaultId}/invite`, {
    method: "POST",
    cookie: owner.cookie,
    ip: nextIp(),
  });
  const revoked = await api(`/api/vault/${vaultId}/invites/${revocable.json.id}`, {
    method: "DELETE",
    cookie: owner.cookie,
  });
  assert.equal(revoked.status, 200);
  const afterRevoke = await api(`/api/invite/${revocable.json.token}/accept`, {
    method: "POST",
    cookie: secondGuest.cookie,
    ip: nextIp(),
  });
  assert.equal(afterRevoke.status, 404);

  const expiring = await api(`/api/vault/${vaultId}/invite`, {
    method: "POST",
    cookie: owner.cookie,
    ip: nextIp(),
  });
  getDb().prepare("UPDATE invites SET expires_at = ? WHERE id = ?").run(Date.now() - 1000, expiring.json.id);
  const expired = await api(`/api/invite/${expiring.json.token}`);
  assert.equal(expired.status, 404);
});

test("owners can remove members and members can leave", async () => {
  const owner = await signup(`remove-owner-${Date.now()}@example.com`, "password123");
  const vaultId = owner.json.activeVaultId;
  const member = await signup(`remove-member-${Date.now()}@example.com`, "password123");
  const invite = await api(`/api/vault/${vaultId}/invite`, { method: "POST", cookie: owner.cookie, ip: nextIp() });
  await api(`/api/invite/${invite.json.token}/accept`, { method: "POST", cookie: member.cookie, ip: nextIp() });

  const memberRemovesOwner = await api(`/api/vault/${vaultId}/members/${owner.json.user.id}`, {
    method: "DELETE",
    cookie: member.cookie,
  });
  assert.equal(memberRemovesOwner.status, 403);

  const ownerLeavesTooSoon = await api(`/api/vault/${vaultId}/leave`, { method: "POST", cookie: owner.cookie });
  assert.equal(ownerLeavesTooSoon.status, 400);

  const removed = await api(`/api/vault/${vaultId}/members/${member.json.user.id}`, {
    method: "DELETE",
    cookie: owner.cookie,
  });
  assert.equal(removed.status, 200);
  const memberLockedOut = await api(`/api/vault/${vaultId}`, { cookie: member.cookie });
  assert.equal(memberLockedOut.status, 403);

  const reinvite = await api(`/api/vault/${vaultId}/invite`, { method: "POST", cookie: owner.cookie, ip: nextIp() });
  await api(`/api/invite/${reinvite.json.token}/accept`, { method: "POST", cookie: member.cookie, ip: nextIp() });
  const left = await api(`/api/vault/${vaultId}/leave`, { method: "POST", cookie: member.cookie });
  assert.equal(left.status, 200);
  const afterLeave = await api(`/api/vault/${vaultId}`, { cookie: member.cookie });
  assert.equal(afterLeave.status, 403);

  const members = await api(`/api/vault/${vaultId}/members`, { cookie: owner.cookie });
  assert.equal(members.status, 200);
  assert.equal(members.json.members.length, 1);
  assert.equal(members.json.members[0].role, "owner");
});

test("cross-origin writes are rejected", async () => {
  const response = await api("/api/auth/login", {
    method: "POST",
    ip: nextIp(),
    body: { email: "nobody@example.com", password: "password123" },
    headers: { Origin: "https://evil.example" },
  });
  assert.equal(response.status, 403);
});
