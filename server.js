require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const webpush = require("web-push");
const cron = require("node-cron");

const { readCollection, writeCollection } = require("./db");
const auth = require("./auth");
const users = require("./users");
const vaults = require("./vaults");

const app = express();
const PORT = process.env.PORT || 3000;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:example@example.com";

const vapidConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (vapidConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn(
    "VAPID keys not set — push notifications are disabled. Run `npm run generate-vapid-keys` and fill in .env"
  );
}

app.use(express.json());
app.use(cookieParser());
app.use(auth.attachUser);
app.use(express.static(__dirname));

// ---------- Auth ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function meResponse(user) {
  return {
    user,
    vaults: vaults.getVaultsForUser(user.id),
    activeVaultId: users.findUserById(user.id).activeVaultId,
  };
}

app.post("/api/auth/signup", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !EMAIL_RE.test(String(email))) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  if (users.findUserByEmail(email)) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const passwordHash = auth.hashPassword(password);
  const user = users.createUser(email, passwordHash);
  const vault = vaults.createVault("My Vegas Trip");
  vaults.addMembership(vault.id, user.id, "owner");
  users.setActiveVault(user.id, vault.id);

  const sessionId = auth.createSession(user.id);
  res.cookie(auth.SESSION_COOKIE, sessionId, auth.cookieOptions());
  res.status(201).json(meResponse(auth.publicUser(user)));
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = email ? users.findUserByEmail(email) : null;
  if (!user || !auth.verifyPassword(String(password || ""), user.passwordHash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const sessionId = auth.createSession(user.id);
  res.cookie(auth.SESSION_COOKIE, sessionId, auth.cookieOptions());
  res.json(meResponse(auth.publicUser(user)));
});

app.post("/api/auth/logout", (req, res) => {
  if (req.sessionId) auth.destroySession(req.sessionId);
  res.clearCookie(auth.SESSION_COOKIE);
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

// ---------- Vault sync ----------
app.get("/api/vault/:id", auth.requireAuth, (req, res) => {
  const membership = vaults.getMembership(req.params.id, req.user.id);
  if (!membership) return res.status(403).json({ error: "You're not a member of that Vault." });
  const vault = vaults.getVault(req.params.id);
  if (!vault) return res.status(404).json({ error: "Vault not found." });
  res.json({ id: vault.id, name: vault.name, state: vault.state, role: membership.role });
});

app.put("/api/vault/:id", auth.requireAuth, (req, res) => {
  const membership = vaults.getMembership(req.params.id, req.user.id);
  if (!membership) return res.status(403).json({ error: "You're not a member of that Vault." });
  const { state } = req.body || {};
  if (typeof state !== "object" || state === null) {
    return res.status(400).json({ error: "Missing state." });
  }
  const vault = vaults.saveVaultState(req.params.id, state);
  res.json({ ok: true, updatedAt: vault.updatedAt });
});

// ---------- Sharing ----------
app.post("/api/vault/:id/invite", auth.requireAuth, (req, res) => {
  const membership = vaults.getMembership(req.params.id, req.user.id);
  if (!membership) return res.status(403).json({ error: "You're not a member of that Vault." });
  const invite = vaults.createInvite(req.params.id, req.user.id);
  res.status(201).json({ token: invite.token, path: `/?invite=${invite.token}` });
});

app.get("/api/invite/:token", (req, res) => {
  const invite = vaults.getInvite(req.params.token);
  if (!invite) return res.status(404).json({ error: "This invite link is invalid or has expired." });
  const vault = vaults.getVault(invite.vaultId);
  if (!vault) return res.status(404).json({ error: "This Vault no longer exists." });
  res.json({ vaultName: vault.name });
});

app.post("/api/invite/:token/accept", auth.requireAuth, (req, res) => {
  const invite = vaults.getInvite(req.params.token);
  if (!invite) return res.status(404).json({ error: "This invite link is invalid or has expired." });
  vaults.addMembership(invite.vaultId, req.user.id, "member");
  users.setActiveVault(req.user.id, invite.vaultId);
  res.json(meResponse(req.user));
});

// ---------- Push notifications ----------
app.get("/api/vapid-public-key", (req, res) => {
  res.json({ publicKey: vapidConfigured ? VAPID_PUBLIC_KEY : null });
});

app.post("/api/subscribe", auth.requireAuth, (req, res) => {
  const { subscription } = req.body || {};
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "Missing subscription" });
  }
  const vaultId = users.findUserById(req.user.id).activeVaultId;
  if (!vaultId) return res.status(400).json({ error: "No active Vault to notify you about." });

  const subs = readCollection("subscriptions");
  const idx = subs.findIndex((s) => s.subscription.endpoint === subscription.endpoint);
  const record = { subscription, vaultId, userId: req.user.id, updatedAt: new Date().toISOString() };
  if (idx >= 0) subs[idx] = record;
  else subs.push(record);
  writeCollection("subscriptions", subs);
  res.status(201).json({ ok: true });
});

app.post("/api/unsubscribe", (req, res) => {
  const { endpoint } = req.body || {};
  const subs = readCollection("subscriptions").filter((s) => s.subscription.endpoint !== endpoint);
  writeCollection("subscriptions", subs);
  res.json({ ok: true });
});

app.post("/api/send-now", async (req, res) => {
  const result = await sendDailyNotifications();
  res.json(result);
});

// ---------- Daily hype message, computed from the Vault's live saved state ----------
const VEGAS_TIPS = [
  "Casino floors are designed with no clocks or windows — set a phone alarm if you need to keep track of time.",
  "Rideshare pickup at the airport and big Strip resorts can involve a walk to a dedicated lot — budget extra time.",
  "Tap water is safe to drink, but hotel minibar bottles are pricey — grab a case at a nearby CVS or Walgreens instead.",
  "The Strip looks walkable on a map, but one 'block' can take 15+ minutes on foot — factor that into show and dinner timing.",
  "Ask about resort fees before you book elsewhere — they're charged nightly on top of the room rate almost everywhere.",
  "Most pool clubs and dayclubs are 21+ with a dress code — check swimwear rules before you pack.",
  "Sportsbooks get packed during major games — arrive early if you want a seat to watch and bet.",
  "Buffet and show tickets are often cheaper same-day through the box office or official hotel app than pre-booking.",
  "Keep a photo of your ID and reservation confirmations saved offline in case your phone dies or loses signal.",
  "Nightclub tables and bottle service require reservations well in advance for weekends — don't wait until you land.",
  "Fremont Street downtown has a different, cheaper vibe than the Strip — worth a night if you want a break from resort prices.",
  "Elevators in mega-resorts can take a while at peak times — build in buffer time before dinner reservations.",
  "Comfortable shoes matter more than they sound — you'll likely walk several miles a day between casinos alone.",
  "Set a gambling budget before you sit down, and treat it as the cost of entertainment, not an investment.",
  "Vegas is desert heat — even 'mild' days can hit 90°F+, so sunscreen and water matter even on indoors-heavy itineraries.",
  "Many shows sell rush or last-minute discounted tickets — check the day-of if you're flexible.",
  "If you're gambling, ask about a players card at the casino cage — comps and discounts add up fast.",
  "Late checkout isn't guaranteed — call the front desk the morning of if you want a shot at extra time.",
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function tipOfDay() {
  const d = new Date();
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return VEGAS_TIPS[dayOfYear % VEGAS_TIPS.length];
}

// vaultState is the exact JSON blob the client keeps in localStorage / PUTs to
// /api/vault/:id, so this reads the same shape app.js does client-side.
function buildMessageForVault(vaultState) {
  const state = vaultState || {};
  const hotel = state.hotel || {};
  const today = todayStr();
  const checkIn = hotel.checkIn;
  const checkOut = hotel.checkOut;

  let phase = "unknown";
  if (checkIn && checkOut) {
    if (today < checkIn) phase = "before";
    else if (today > checkOut) phase = "after";
    else phase = "during";
  } else if (state.tripDate) {
    const tripDateOnly = state.tripDate.slice(0, 10);
    if (today < tripDateOnly) phase = "before";
    else if (today > tripDateOnly) phase = "after";
    else phase = "during";
  }

  const name = state.tripName || "your Vegas trip";

  if (phase === "during") {
    const todays = (state.reservations || [])
      .filter((r) => r.date === today)
      .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
    if (todays.length) {
      const first = todays[0];
      return {
        title: "🌃 Tonight in Vegas",
        body: `First up today: ${first.name}${first.time ? " at " + first.time : ""}. ${tipOfDay()}`,
      };
    }
    return { title: "🌴 You're in Vegas!", body: `Nothing booked today — go make something happen. ${tipOfDay()}` };
  }

  if (phase === "after") return null; // stop notifying once the trip has ended

  if (phase === "before") {
    const target = checkIn ? new Date(`${checkIn}T00:00`) : state.tripDate ? new Date(state.tripDate) : null;
    if (!target || Number.isNaN(target.getTime())) return null;
    const daysLeft = Math.ceil((target.getTime() - Date.now()) / 86400000);
    if (daysLeft <= 0) return { title: "🎉 Today's the day!", body: `${name} starts today. ${tipOfDay()}` };
    return { title: `📅 ${daysLeft} day${daysLeft === 1 ? "" : "s"} until Vegas`, body: tipOfDay() };
  }

  return null; // no trip date set yet
}

async function sendDailyNotifications() {
  if (!vapidConfigured) return { ok: false, reason: "VAPID keys not configured" };

  const subs = readCollection("subscriptions");
  const survivors = [];
  let sent = 0;

  for (const record of subs) {
    const vault = vaults.getVault(record.vaultId);
    const message = vault ? buildMessageForVault(vault.state) : null;
    if (!message) {
      survivors.push(record);
      continue;
    }
    try {
      await webpush.sendNotification(record.subscription, JSON.stringify(message));
      survivors.push(record);
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.log("Subscription expired, removing:", record.subscription.endpoint);
      } else {
        console.error("Push send failed:", err.message);
        survivors.push(record);
      }
    }
  }

  writeCollection("subscriptions", survivors);
  return { ok: true, sent, total: subs.length };
}

const notifyHour = Number.parseInt(process.env.NOTIFY_HOUR, 10);
const cronHour = Number.isInteger(notifyHour) && notifyHour >= 0 && notifyHour <= 23 ? notifyHour : 9;
cron.schedule(`0 ${cronHour} * * *`, () => {
  console.log("Running daily Vegas Vault notification job...");
  sendDailyNotifications();
});

app.listen(PORT, () => {
  console.log(`Vegas Vault server running at http://localhost:${PORT}`);
  console.log(`Daily notifications scheduled for ${cronHour}:00 server time.`);
});
