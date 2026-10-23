"use strict";

const { getDb } = require("./db");
const users = require("./users");
const vaults = require("./vaults");
const { todayStr, daysUntil, safeZone, DEFAULT_TZ } = require("./public/time");

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

function tripZone(vaultState) {
  return safeZone((vaultState && vaultState.timezone) || DEFAULT_TZ);
}

function tipOfDay(timeZone, now) {
  const today = todayStr(timeZone, now);
  const [year, month, day] = today.split("-").map(Number);
  const dayOfYear = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000);
  return VEGAS_TIPS[dayOfYear % VEGAS_TIPS.length];
}

function budgetSnapshot(state) {
  const bankroll = (state && state.bankroll) || {};
  const net = (bankroll.entries || []).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const losses = Math.max(0, -net);
  const spent = ((state && state.expenses) || []).reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0);
  const gamblingCap = Number(bankroll.gamblingBudget) || 0;
  const spendingCap = Number(state && state.spendingBudget) || 0;
  return {
    losses,
    spent,
    gamblingCap,
    spendingCap,
    gamblingPct: gamblingCap > 0 ? losses / gamblingCap : 0,
    spendingPct: spendingCap > 0 ? spent / spendingCap : 0,
  };
}

function buildMessageForVault(vaultState, now) {
  const state = vaultState || {};
  const zone = tripZone(state);
  const hotel = state.hotel || {};
  const today = todayStr(zone, now);
  const checkIn = hotel.checkIn;
  const checkOut = hotel.checkOut;

  let phase = "unknown";
  if (checkIn && checkOut) {
    if (today < checkIn) phase = "before";
    else if (today > checkOut) phase = "after";
    else phase = "during";
  } else if (state.tripDate) {
    const tripDateOnly = String(state.tripDate).slice(0, 10);
    if (today < tripDateOnly) phase = "before";
    else if (today > tripDateOnly) phase = "after";
    else phase = "during";
  }

  const name = state.tripName || "your Vegas trip";
  const budget = budgetSnapshot(state);
  let budgetNote = "";
  if (budget.gamblingPct >= 0.8) budgetNote = " Heads up: gambling losses are past 80% of the budget.";
  else if (budget.spendingPct >= 0.8) budgetNote = " Heads up: group spending is past 80% of the budget.";

  if (phase === "during") {
    const todays = (state.reservations || [])
      .filter((reservation) => reservation.date === today)
      .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
    if (todays.length) {
      const first = todays[0];
      return {
        title: "Tonight in Vegas",
        body: `First up today: ${first.name}${first.time ? " at " + first.time : ""}. ${tipOfDay(zone, now)}${budgetNote}`,
      };
    }
    return {
      title: "You're in Vegas!",
      body: `Nothing booked today — go make something happen. ${tipOfDay(zone, now)}${budgetNote}`,
    };
  }

  if (phase === "after") return null;

  if (phase === "before") {
    const targetDate = checkIn || (state.tripDate ? String(state.tripDate).slice(0, 10) : "");
    const daysLeft = daysUntil(targetDate, zone, now);
    if (daysLeft == null) return null;
    if (daysLeft <= 0) return { title: "Today's the day!", body: `${name} starts today. ${tipOfDay(zone, now)}` };
    return {
      title: `${daysLeft} day${daysLeft === 1 ? "" : "s"} until Vegas`,
      body: tipOfDay(zone, now),
    };
  }

  return null;
}

function upsertSubscription(userId, subscription) {
  getDb()
    .prepare(
      `INSERT INTO subscriptions (endpoint, user_id, subscription_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id,
         subscription_json = excluded.subscription_json,
         updated_at = excluded.updated_at`
    )
    .run(subscription.endpoint, userId, JSON.stringify(subscription), new Date().toISOString());
}

function deleteOwnSubscription(endpoint, userId) {
  const row = getDb().prepare("SELECT user_id FROM subscriptions WHERE endpoint = ?").get(endpoint);
  if (!row) return { ok: true };
  if (row.user_id !== userId) return { forbidden: true };
  getDb().prepare("DELETE FROM subscriptions WHERE endpoint = ?").run(endpoint);
  return { ok: true };
}

function listSubscriptions() {
  return getDb()
    .prepare("SELECT endpoint, user_id, subscription_json FROM subscriptions")
    .all()
    .map((row) => ({
      endpoint: row.endpoint,
      userId: row.user_id,
      subscription: JSON.parse(row.subscription_json),
    }));
}

function listSubscriptionsForUsers(userIds) {
  if (!userIds.length) return [];
  const marks = userIds.map(() => "?").join(",");
  return getDb()
    .prepare(`SELECT endpoint, user_id, subscription_json FROM subscriptions WHERE user_id IN (${marks})`)
    .all(...userIds)
    .map((row) => ({
      endpoint: row.endpoint,
      userId: row.user_id,
      subscription: JSON.parse(row.subscription_json),
    }));
}

function claimBudgetAlert(vaultId, kind, fingerprint) {
  const result = getDb()
    .prepare(
      `INSERT OR IGNORE INTO budget_alerts (vault_id, kind, fingerprint, sent_at) VALUES (?, ?, ?, ?)`
    )
    .run(vaultId, kind, fingerprint, new Date().toISOString());
  return result.changes > 0;
}

async function sendToSubscription(webpush, record, message, survivors) {
  try {
    await webpush.sendNotification(record.subscription, JSON.stringify(message));
    survivors.push(record);
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      getDb().prepare("DELETE FROM subscriptions WHERE endpoint = ?").run(record.endpoint);
      console.log("Removed an expired push subscription.");
      return false;
    }
    console.error("Push send failed:", err.message);
    survivors.push(record);
    return false;
  }
}

async function sendDailyNotifications(webpush, vapidConfigured) {
  if (!vapidConfigured) return { ok: false, reason: "VAPID keys not configured" };

  const subs = listSubscriptions();
  let sent = 0;
  for (const record of subs) {
    const user = users.findUserById(record.userId);
    const vault = user && user.activeVaultId ? vaults.getVault(user.activeVaultId) : null;
    const message = vault ? buildMessageForVault(vault.state) : null;
    if (!message) continue;
    const kept = [];
    const ok = await sendToSubscription(webpush, record, message, kept);
    if (ok) sent += 1;
  }
  return { ok: true, sent, total: subs.length };
}

async function maybeSendBudgetAlerts(webpush, vapidConfigured, vaultId) {
  if (!vapidConfigured) return;
  const vault = vaults.getVault(vaultId);
  if (!vault) return;
  const snapshot = budgetSnapshot(vault.state);
  const alerts = [];
  if (snapshot.gamblingCap > 0 && snapshot.gamblingPct >= 0.8) {
    alerts.push({
      kind: "gambling",
      fingerprint: String(snapshot.gamblingCap),
      message: {
        title: "Gambling budget alert",
        body: "Losses have reached 80% of the gambling budget for this trip.",
      },
    });
  }
  if (snapshot.spendingCap > 0 && snapshot.spendingPct >= 0.8) {
    alerts.push({
      kind: "spending",
      fingerprint: String(snapshot.spendingCap),
      message: {
        title: "Spending budget alert",
        body: "The group has used 80% of the spending budget for this trip.",
      },
    });
  }
  if (!alerts.length) return;

  const members = vaults.listMembers(vaultId);
  const subs = listSubscriptionsForUsers(members.map((member) => member.userId));
  for (const alert of alerts) {
    if (!claimBudgetAlert(vaultId, alert.kind, alert.fingerprint)) continue;
    for (const record of subs) {
      await sendToSubscription(webpush, record, alert.message, []);
    }
  }
}

module.exports = {
  VEGAS_TIPS,
  budgetSnapshot,
  buildMessageForVault,
  upsertSubscription,
  deleteOwnSubscription,
  listSubscriptions,
  sendDailyNotifications,
  maybeSendBudgetAlerts,
};
