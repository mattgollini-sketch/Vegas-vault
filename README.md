# Vegas Vault

A trip dashboard for your next Las Vegas trip: a live countdown, hotel and flight details, a reservation tracker (restaurants, shows, spas, nightclubs, pool), a gambling bankroll tracker, an outfit planner, an auto-built group itinerary, real weather, and a daily "hype" section with a personalized "Tonight in Vegas" preview and a rotating Vegas tip. Everything is saved locally in your browser (`localStorage`) — no account needed.

Optionally, run the included Node server to get real daily push notifications and install the site as an app on your phone/desktop (PWA).

## Features

- Live days/hours/minutes/seconds countdown to your trip
- Hotel card: name, confirmation #, check-in/out, room type, notes
- Flight info for outbound and return legs
- Unified reservation tracker for Restaurants, Shows, Spas, Nightclubs, and Pool — each entry has a date, time, and confirmation #
- Editable essentials packing checklist (pre-seeded with common items)
- Gambling bankroll tracker (starting amount + a running win/loss log)
- Outfit planner, per day
- Group Itinerary — auto-built day-by-day schedule from your hotel dates, flights, reservations, and outfits
- Live Las Vegas weather forecast (via Open-Meteo, no API key)
- A daily hype section above the tabs: a countdown-driven banner, a "Tonight in Vegas" preview built from your own dated reservations, and a rotating Vegas tip of the day
- Installable as a PWA, with optional real daily push notifications
- Data persists across reloads via `localStorage`

## Running locally (static, no notifications)

The frontend works standalone with no server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser. Push notifications won't work in this mode (there's no backend to send them), but everything else does.

## Running with daily push notifications (optional)

Real push notifications need a backend that's always running — a static host like GitHub Pages can't do this. The included `server.js` serves the site *and* handles push subscriptions + a daily cron job, so it's still a single deploy.

1. `npm install`
2. Generate VAPID keys: `npm run generate-vapid-keys`
3. Copy `.env.example` to `.env` and fill in `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (a `mailto:` address)
4. `npm start` — serves the app at `http://localhost:3000`
5. Open the site, click "🔔 Enable daily notifications", and allow the browser's permission prompt
6. The server sends one push per subscriber per day at `NOTIFY_HOUR` (default 9am server time) with your countdown/hype message, and stops once your trip is over

Notes:

- Deploy `server.js` somewhere that stays running (Render, Railway, Fly.io, a small VPS, etc.) to get notifications outside of local testing.
- Subscriptions are stored in `data/subscriptions.json` (gitignored) — back it up if you redeploy.
- To trigger the daily job immediately instead of waiting for `NOTIFY_HOUR`, `POST /api/send-now`.
- Only your trip dates and reservation names/times are sent to the server so it can compose your daily message — hotel confirmation numbers, bankroll, and everything else stay in your browser.

## Files

- `index.html`, `style.css`, `app.js` — the frontend (works standalone as a static site)
- `manifest.json`, `sw.js`, `icons/` — PWA install support and the push-notification service worker
- `server.js`, `package.json` — optional Node/Express backend for push notifications (static file serving + subscribe/unsubscribe API + daily cron)
- `.env.example` — template for the VAPID keys the backend needs
