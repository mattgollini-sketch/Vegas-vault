"use strict";

require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const path = require("path");
const webpush = require("web-push");
const cron = require("node-cron");

const { getDb, backupDatabase } = require("./db");
const auth = require("./auth");
const users = require("./users");
const vaults = require("./vaults");
const notify = require("./notify");
const billing = require("./billing");
const affiliates = require("./public/affiliates");
const { authRateLimit, inviteRateLimit, geocodeRateLimit } = require("./rate-limit");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const NOTIFY_TIMEZONE = "America/Los_Angeles";
const SIGNUP_MESSAGE =
  "If this email is new, you're signed in. If you already have an account, log in with your password.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:example@example.com";
const vapidConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (vapidConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'", "https://unpkg.com"],
          "style-src": ["'self'", "https://unpkg.com", "'unsafe-inline'"],
          "img-src": ["'self'", "data:", "blob:", "https://unpkg.com", "https://*.tile.openstreetmap.org"],
          "connect-src": [
            "'self'",
            "https://api.open-meteo.com",
            "https://nominatim.openstreetmap.org",
            "https://router.project-osrm.org",
            "https://*.tile.openstreetmap.org",
          ],
          "worker-src": ["'self'"],
          "manifest-src": ["'self'"],
          "object-src": ["'none'"],
          "base-uri": ["'self'"],
          "frame-ancestors": ["'none'"],
        },
      },
    })
  );

  // Stripe signs the raw body. This route has to run before express.json()
  // parses it, and before the browser origin check (Stripe does not send one).
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
    if (!billing.paymentsConfigured()) {
      return res.status(503).json({ error: "Stripe is not configured." });
    }
    let event;
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : "");
      event = billing.constructEvent(raw, req.get("stripe-signature") || "");
    } catch (err) {
      return res.status(400).json({ error: "Invalid Stripe signature." });
    }
    try {
      const result = billing.handleStripeEvent(event);
      res.json({ ok: true, received: true, ...result });
    } catch (err) {
      console.error("Stripe webhook failed:", err.message);
      res.status(500).json({ error: "Webhook handler failed." });
    }
  });

  app.use(express.json({ limit: "512kb" }));
  app.use(cookieParser());
  app.use(auth.attachUser);
  app.use(requireJsonBody);
  app.use(sameOriginMutations);

  app.get("/healthz", (req, res) => {
    getDb();
    res.json({ ok: true });
  });

  app.get("/api/billing", (req, res) => {
    res.json(billing.publicBilling());
  });

  app.get("/api/affiliates", (req, res) => {
    const config = affiliates.configFromEnv(process.env);
    res.json({
      ...config,
      disclosure: affiliates.hasAny(config) ? affiliates.DISCLOSURE : "",
    });
  });

  const limitAuth = authRateLimit();
  const limitInvite = inviteRateLimit();

  app.post("/api/auth/signup", limitAuth, async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !EMAIL_RE.test(String(email)) || String(email).length > 254) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (!password || String(password).length < 8 || String(password).length > 200) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const passwordHash = await auth.hashPassword(password);
    if (users.findUserByEmail(email)) {
      return res.status(200).json({ ok: true, user: null, message: SIGNUP_MESSAGE });
    }

    const user = getDb().transaction(() => {
      const created = users.createUser(email, passwordHash);
      const vault = vaults.createVault("My Vegas Trip");
      vaults.addMembership(vault.id, created.id, "owner");
      users.setActiveVault(created.id, vault.id);
      return created;
    })();

    const sessionToken = auth.createSession(user.id);
    res.cookie(auth.SESSION_COOKIE, sessionToken, auth.cookieOptions());
    res.status(200).json({ ok: true, message: SIGNUP_MESSAGE, ...meResponse(auth.publicUser(user)) });
  });

  app.post("/api/auth/login", limitAuth, async (req, res) => {
    const { email, password } = req.body || {};
    const user = email ? users.findUserByEmail(email) : null;
    const hash = user ? user.passwordHash : await auth.ensureDummyHash();
    const matches = await auth.verifyPassword(String(password || ""), hash);
    if (!user || !matches) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    const sessionToken = auth.createSession(user.id);
    res.cookie(auth.SESSION_COOKIE, sessionToken, auth.cookieOptions());
    res.json(meResponse(auth.publicUser(user)));
  });

  app.post("/api/auth/logout", (req, res) => {
    if (req.sessionToken) auth.destroySession(req.sessionToken);
    res.clearCookie(auth.SESSION_COOKIE, { path: "/" });
    res.json({ ok: true });
  });

  app.post("/api/auth/logout-all", auth.requireAuth, (req, res) => {
    auth.destroyAllSessions(req.user.id);
    res.clearCookie(auth.SESSION_COOKIE, { path: "/" });
    res.json({ ok: true });
  });

  app.post("/api/auth/password", limitAuth, auth.requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 8 || String(newPassword).length > 200) {
      return res.status(400).json({ error: "New password must be at least 8 characters." });
    }
    const user = users.findUserById(req.user.id);
    const matches = await auth.verifyPassword(String(currentPassword || ""), user.passwordHash);
    if (!matches) return res.status(401).json({ error: "Current password is wrong." });
    users.setPasswordHash(user.id, await auth.hashPassword(newPassword));
    auth.destroyOtherSessions(user.id, req.sessionToken);
    res.json({ ok: true });
  });

  app.get("/api/me", (req, res) => {
    if (!req.user) return res.json({ user: null });
    res.json(meResponse(req.user));
  });

  app.put("/api/me/active-vault", auth.requireAuth, (req, res) => {
    const { vaultId } = req.body || {};
    if (!vaults.getMembership(vaultId, req.user.id)) {
      return res.status(403).json({ error: "You're not a member of that Vault." });
    }
    users.setActiveVault(req.user.id, vaultId);
    res.json(meResponse(req.user));
  });

  app.get("/api/vault/:id", auth.requireAuth, (req, res) => {
    const membership = vaults.getMembership(req.params.id, req.user.id);
    if (!membership) return res.status(403).json({ error: "You're not a member of that Vault." });
    const vault = vaults.getVault(req.params.id);
    if (!vault) return res.status(404).json({ error: "Vault not found." });
    res.json(vaultPayload(vault, membership.role));
  });

  app.put("/api/vault/:id", auth.requireAuth, async (req, res) => {
    const membership = vaults.getMembership(req.params.id, req.user.id);
    if (!membership) return res.status(403).json({ error: "You're not a member of that Vault." });
    const { state, baseVersion } = req.body || {};
    if (baseVersion == null || Number.isNaN(Number(baseVersion))) {
      return res.status(400).json({ error: "Missing baseVersion. Reload this Vault and try again." });
    }
    const existing = vaults.getVault(req.params.id);
    if (existing && Number(baseVersion) === existing.version) {
      const blocked = billing.assertGroupSaveAllowed(existing, state);
      if (blocked) return res.status(402).json(blocked);
    }
    const saved = vaults.saveVaultState(req.params.id, state, baseVersion, req.user.id);
    if (saved.error === "missing") return res.status(404).json({ error: "Vault not found." });
    if (saved.error === "invalid") return res.status(400).json({ error: saved.message });
    if (saved.error === "conflict") {
      return res.status(409).json({
        error: "Someone else saved this Vault. Your copy can be merged and saved again.",
        version: saved.vault.version,
        state: saved.vault.state,
        updatedAt: saved.vault.updatedAt,
        updatedByEmail: saved.vault.updatedByEmail,
      });
    }
    try {
      await notify.maybeSendBudgetAlerts(webpush, vapidConfigured, req.params.id);
    } catch (err) {
      console.error("Budget alert failed:", err.message);
    }
    res.json({ ok: true, version: saved.version, updatedAt: saved.updatedAt });
  });

  app.get("/api/vault/:id/members", auth.requireAuth, (req, res) => {
    const membership = vaults.getMembership(req.params.id, req.user.id);
    if (!membership) return res.status(403).json({ error: "You're not a member of that Vault." });
    const vault = vaults.getVault(req.params.id);
    res.json({
      members: vaults.listMembers(req.params.id),
      updatedAt: vault && vault.updatedAt,
      updatedByEmail: vault && vault.updatedByEmail,
    });
  });

  app.delete("/api/vault/:id/members/:userId", auth.requireAuth, (req, res) => {
    const membership = requireOwner(req, res);
    if (!membership) return;
    if (req.params.userId === req.user.id) {
      return res.status(400).json({ error: "Use leave to remove yourself." });
    }
    const result = vaults.removeMember(req.params.id, req.params.userId);
    if (result.error === "missing") return res.status(404).json({ error: "That person is not in this Vault." });
    if (result.error === "last-owner") {
      return res.status(400).json({ error: "Make someone else an owner before removing the last owner." });
    }
    res.json({ ok: true, members: vaults.listMembers(req.params.id) });
  });

  app.post("/api/vault/:id/members/:userId/role", auth.requireAuth, (req, res) => {
    const membership = requireOwner(req, res);
    if (!membership) return;
    const result = vaults.setMemberRole(req.params.id, req.params.userId, (req.body || {}).role);
    if (result.error === "missing") return res.status(404).json({ error: "That person is not in this Vault." });
    if (result.error === "last-owner") {
      return res.status(400).json({ error: "This Vault needs at least one owner." });
    }
    if (result.error) return res.status(400).json({ error: "Role must be owner or member." });
    res.json({ ok: true, members: vaults.listMembers(req.params.id) });
  });

  app.post("/api/vault/:id/leave", auth.requireAuth, (req, res) => {
    const membership = vaults.getMembership(req.params.id, req.user.id);
    if (!membership) return res.status(403).json({ error: "You're not a member of that Vault." });
    const result = vaults.leaveVault(req.params.id, req.user.id);
    if (result.error === "last-owner") {
      return res.status(400).json({
        error: "You're the only owner. Make someone else an owner before you leave.",
      });
    }
    res.json(meResponse(req.user));
  });

  app.post("/api/vault/:id/checkout", auth.requireAuth, async (req, res) => {
    const membership = requireOwner(req, res);
    if (!membership) return;
    const vault = vaults.getVault(req.params.id);
    if (!vault) return res.status(404).json({ error: "Vault not found." });
    if (!billing.paywallActive()) return res.json({ ok: true, devMode: true, unlocked: true });
    if (vault.groupUnlocked) return res.json({ ok: true, alreadyUnlocked: true });
    try {
      const origin = publicOrigin(req);
      const session = await billing.createCheckoutSession({
        vaultId: vault.id,
        successUrl: `${origin}/?unlock=success`,
        cancelUrl: `${origin}/?unlock=cancel`,
      });
      if (!session || !session.url) return res.status(502).json({ error: "Stripe did not return a checkout link." });
      res.json({ ok: true, url: session.url });
    } catch (err) {
      console.error("Checkout session failed:", err.message);
      res.status(502).json({ error: "Checkout could not be started. Try again in a moment." });
    }
  });

  app.post("/api/vault/:id/invite", limitInvite, auth.requireAuth, (req, res) => {
    const membership = requireOwner(req, res);
    if (!membership) return;
    const vault = vaults.getVault(req.params.id);
    if (vault && !billing.vaultUnlocked(vault)) return res.status(402).json(billing.lockedResponse());
    const invite = vaults.createInvite(req.params.id, req.user.id);
    res.status(201).json({
      id: invite.id,
      token: invite.token,
      path: `/?invite=${invite.token}`,
      expiresAt: invite.expiresAt,
    });
  });

  app.get("/api/vault/:id/invites", auth.requireAuth, (req, res) => {
    const membership = requireOwner(req, res);
    if (!membership) return;
    res.json({ invites: vaults.listInvites(req.params.id) });
  });

  app.delete("/api/vault/:id/invites/:inviteId", auth.requireAuth, (req, res) => {
    const membership = requireOwner(req, res);
    if (!membership) return;
    const revoked = vaults.revokeInvite(req.params.id, req.params.inviteId);
    if (!revoked) return res.status(404).json({ error: "That invite is already used or revoked." });
    res.json({ ok: true, invites: vaults.listInvites(req.params.id) });
  });

  app.get("/api/invite/:token", limitInvite, (req, res) => {
    const invite = vaults.getInvite(req.params.token);
    if (!invite) return res.status(404).json({ error: "This invite link is invalid, used, or expired." });
    const vault = vaults.getVault(invite.vaultId);
    if (!vault) return res.status(404).json({ error: "This Vault no longer exists." });
    res.json({ vaultName: vault.name, expiresAt: invite.expiresAt });
  });

  app.post("/api/invite/:token/accept", limitInvite, auth.requireAuth, (req, res) => {
    const result = vaults.acceptInvite(req.params.token, req.user.id);
    if (result.error) return res.status(404).json({ error: "This invite link is invalid, used, or expired." });
    users.setActiveVault(req.user.id, result.vaultId);
    res.json(meResponse(req.user));
  });

  app.get("/api/vapid-public-key", (req, res) => {
    res.json({ publicKey: vapidConfigured ? VAPID_PUBLIC_KEY : null });
  });

  app.post("/api/subscribe", auth.requireAuth, (req, res) => {
    const { subscription } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Missing subscription" });
    }
    notify.upsertSubscription(req.user.id, subscription);
    res.status(201).json({ ok: true });
  });

  app.post("/api/unsubscribe", auth.requireAuth, (req, res) => {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });
    const result = notify.deleteOwnSubscription(endpoint, req.user.id);
    if (result.forbidden) {
      return res.status(403).json({ error: "You can only remove your own notification subscription." });
    }
    res.json({ ok: true });
  });

  app.post("/api/send-now", async (req, res) => {
    const secret = process.env.ADMIN_SECRET || "";
    if (!secret) return res.status(404).json({ error: "Not found" });
    const provided = req.get("x-admin-secret") || "";
    if (!auth.safeEqual(provided, secret)) return res.status(403).json({ error: "Forbidden" });
    const result = await notify.sendDailyNotifications(webpush, vapidConfigured);
    res.json(result);
  });

  app.get("/api/geocode", geocodeRateLimit(), async (req, res) => {
    const query = String(req.query.q || "").trim();
    if (!query || query.length > 200) return res.status(400).json({ error: "Enter a place to look up." });
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "VegasVault/1.0 (personal trip planner)",
          Accept: "application/json",
        },
      });
      if (!response.ok) return res.status(502).json({ error: "Place lookup failed." });
      const matches = await response.json();
      if (!matches[0]) return res.status(404).json({ error: "No matching place." });
      res.json({
        lat: Number(matches[0].lat),
        lng: Number(matches[0].lon),
        label: matches[0].display_name,
      });
    } catch (err) {
      res.status(502).json({ error: "Place lookup failed." });
    }
  });

  app.use(express.static(PUBLIC_DIR, { dotfiles: "deny", index: "index.html", fallthrough: true }));

  app.use((req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
    res.status(404).type("text").send("Not found");
  });

  app.use((err, req, res, next) => {
    if (err && err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Request could not be read." });
    }
    if (err && err.type === "entity.too.large") {
      return res.status(413).json({ error: "That trip is too large to save." });
    }
    console.error(err);
    res.status(500).json({ error: "Something went wrong." });
  });

  billing.paywallActive();
  return app;
}

function meResponse(user) {
  const fresh = users.findUserById(user.id);
  return {
    user: auth.publicUser(fresh || user),
    vaults: vaults.getVaultsForUser(user.id),
    activeVaultId: fresh ? fresh.activeVaultId : null,
  };
}

function vaultPayload(vault, role) {
  return {
    id: vault.id,
    name: vault.name,
    state: vault.state,
    role,
    version: vault.version,
    updatedAt: vault.updatedAt,
    updatedByEmail: vault.updatedByEmail,
    groupUnlocked: billing.vaultUnlocked(vault),
  };
}

function publicOrigin(req) {
  const forwarded = req.get("x-forwarded-proto");
  const proto = forwarded ? String(forwarded).split(",")[0].trim() : req.protocol;
  return `${proto || "http"}://${req.get("host")}`;
}

function requireOwner(req, res) {
  const membership = vaults.getMembership(req.params.id, req.user.id);
  if (!membership) {
    res.status(403).json({ error: "You're not a member of that Vault." });
    return null;
  }
  if (membership.role !== "owner") {
    res.status(403).json({ error: "Only the Vault owner can do that." });
    return null;
  }
  return membership;
}

function requireJsonBody(req, res, next) {
  if (!["POST", "PUT", "PATCH"].includes(req.method)) return next();
  const length = Number(req.get("content-length") || 0);
  if (length > 0 && !req.is("application/json")) {
    return res.status(415).json({ error: "Content-Type must be application/json." });
  }
  next();
}

function sameOriginMutations(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next();
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch (e) {
    return res.status(403).json({ error: "Cross-origin request blocked." });
  }
  if (originHost !== req.get("host")) {
    return res.status(403).json({ error: "Cross-origin request blocked." });
  }
  next();
}

function notifyHour() {
  const hour = Number.parseInt(process.env.NOTIFY_HOUR, 10);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 9;
}

function start(existingApp) {
  const running = existingApp || createApp();
  const hour = notifyHour();
  cron.schedule(
    `0 ${hour} * * *`,
    () => {
      console.log("Running daily Vegas Vault notification job...");
      notify.sendDailyNotifications(webpush, vapidConfigured).catch((err) => {
        console.error("Daily notification job failed:", err.message);
      });
    },
    { timezone: NOTIFY_TIMEZONE }
  );
  cron.schedule(
    "30 3 * * *",
    () => {
      backupDatabase();
    },
    { timezone: NOTIFY_TIMEZONE }
  );
  running.listen(PORT, () => {
    console.log(`Vegas Vault server running at http://localhost:${PORT}`);
    console.log(`Daily notifications scheduled for ${hour}:00 ${NOTIFY_TIMEZONE}.`);
    if (!vapidConfigured) {
      console.warn("VAPID keys not set — push notifications are disabled. Run `npm run generate-vapid-keys`.");
    }
  });
  return running;
}

const app = createApp();

if (require.main === module) start(app);

module.exports = { app, createApp, start, SIGNUP_MESSAGE };
