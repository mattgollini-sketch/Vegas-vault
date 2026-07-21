require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const webpush = require("web-push");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "subscriptions.json");

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
app.use(express.static(__dirname));

// ---------- Subscription storage (flat JSON file) ----------
function loadSubs() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    return [];
  }
}

function saveSubs(subs) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(subs, null, 2));
}

// ---------- API ----------
app.get("/api/vapid-public-key", (req, res) => {
  res.json({ publicKey: vapidConfigured ? VAPID_PUBLIC_KEY : null });
});

app.post("/api/subscribe", (req, res) => {
  const { subscription, trip } = req.body || {};
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "Missing subscription" });
  }
  const subs = loadSubs();
  const idx = subs.findIndex((s) => s.subscription.endpoint === subscription.endpoint);
  const record = { subscription, trip: trip || {}, updatedAt: new Date().toISOString() };
  if (idx >= 0) subs[idx] = record;
  else subs.push(record);
  saveSubs(subs);
  res.status(201).json({ ok: true });
});

app.post("/api/unsubscribe", (req, res) => {
  const { endpoint } = req.body || {};
  const subs = loadSubs().filter((s) => s.subscription.endpoint !== endpoint);
  saveSubs(subs);
  res.json({ ok: true });
});

// Manual trigger for local testing, so you don't have to wait for the cron hour.
app.post("/api/send-now", async (req, res) => {
  const result = await sendDailyNotifications();
  res.json(result);
});

// ---------- Daily hype message (server-side mirror of the client's logic) ----------
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

// Returns { title, body } to send, or null if nothing should be sent today
// (e.g. the trip is over, or there isn't enough data to say anything useful).
function buildMessageForTrip(trip) {
  const today = todayStr();
  const checkIn = trip.hotelCheckIn;
  const checkOut = trip.hotelCheckOut;

  let phase = "unknown";
  if (checkIn && checkOut) {
    if (today < checkIn) phase = "before";
    else if (today > checkOut) phase = "after";
    else phase = "during";
  } else if (trip.tripDate) {
    const tripDateOnly = trip.tripDate.slice(0, 10);
    if (today < tripDateOnly) phase = "before";
    else if (today > tripDateOnly) phase = "after";
    else phase = "during";
  }

  const name = trip.tripName || "your Vegas trip";

  if (phase === "during") {
    const todays = (trip.reservations || [])
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
    const target = checkIn ? new Date(`${checkIn}T00:00`) : trip.tripDate ? new Date(trip.tripDate) : null;
    if (!target || Number.isNaN(target.getTime())) return null;
    const daysLeft = Math.ceil((target.getTime() - Date.now()) / 86400000);
    if (daysLeft <= 0) return { title: "🎉 Today's the day!", body: `${name} starts today. ${tipOfDay()}` };
    return { title: `📅 ${daysLeft} day${daysLeft === 1 ? "" : "s"} until Vegas`, body: tipOfDay() };
  }

  return null; // no trip date set yet
}

async function sendDailyNotifications() {
  if (!vapidConfigured) {
    return { ok: false, reason: "VAPID keys not configured" };
  }
  const subs = loadSubs();
  const survivors = [];
  let sent = 0;

  for (const record of subs) {
    const message = buildMessageForTrip(record.trip || {});
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

  saveSubs(survivors);
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
