# Vegas Vault

A trip dashboard for your next Las Vegas trip: a live countdown, hotel and flight details, a reservation tracker (restaurants, shows, spas, nightclubs, pool), a gambling bankroll tracker, an outfit planner, an auto-built group itinerary, real weather, and a daily "hype" section with a personalized "Tonight in Vegas" preview and a rotating Vegas tip.

By default everything is saved locally in your browser (`localStorage`) — no account needed. Optionally, run the included Node server to get an account with cross-device sync, shareable group Vaults, real daily push notifications, and PWA install support.

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
- Optional accounts: email/password sign-in, cross-device sync, and shareable Vaults so a travel group can plan on the same trip together
- Installable as a PWA, with optional real daily push notifications
- Data persists across reloads via `localStorage`, and via the server if you're signed in

## Running locally (static, no accounts/notifications)

The frontend works standalone with no server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser. Signing in, sync, and push notifications won't work in this mode (there's no backend), but everything else does — your trip just stays in that browser.

## Running with the full backend (accounts, sync, sharing, notifications)

The included `server.js` serves the site *and* the API, so it's still a single deploy — just not one that a static host like GitHub Pages can run, since it needs to stay running continuously.

1. `npm install`
2. (Optional, for push notifications) Generate VAPID keys: `npm run generate-vapid-keys`
3. Copy `.env.example` to `.env`. Push notifications need `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` filled in — accounts and sharing work without any of that.
4. `npm start` — serves the app at `http://localhost:3000`

### Accounts and shared Vaults

- Open the Account tab, sign up with an email + password. This creates a private "Vault" (your trip data) tied to that account, and starts syncing it to the server on every change (still cached in `localStorage` too, so it's instant and still works offline).
- If you already had trip data in that browser before signing up, you'll be offered a one-time import into your new account.
- Click "Invite someone to this Vault" to get a shareable link. Anyone who opens it, signs up or logs in, and clicks Join becomes a member of the same Vault — you'll both see and edit the same trip data. There's no invite email sent automatically; you send the link yourself (text, email, whatever).
- If you belong to more than one Vault, a switcher appears in the Account tab.
- Passwords are hashed with bcrypt; sessions use an httpOnly cookie. There's no email verification or password reset flow, and no rate limiting on login attempts — fine for personal/small-group use, not hardened for public deployment.

### Push notifications

- Requires being signed in, so the server knows which Vault to notify you about.
- Click "🔔 Enable daily notifications" and allow the browser's permission prompt.
- The server sends one push per subscriber per day at `NOTIFY_HOUR` (default 9am server time), built from your Vault's live saved state (countdown status + today's first reservation), and stops once your trip is over.
- To trigger the daily job immediately instead of waiting for `NOTIFY_HOUR`, `POST /api/send-now`.

### Deployment notes

- Deploy `server.js` somewhere that stays running (Render, Railway, Fly.io, a small VPS, etc.).
- All server data (accounts, password hashes, Vaults, sessions, invites, push subscriptions) lives in flat JSON files under `data/` (gitignored) — back that folder up before redeploying, and treat it as sensitive (it contains password hashes and everyone's trip data).
- Set `NODE_ENV=production` so session cookies get the `Secure` flag (requires HTTPS).

## Files

- `index.html`, `style.css`, `app.js` — the frontend (works standalone as a static site)
- `manifest.json`, `sw.js`, `icons/` — PWA install support and the push-notification service worker
- `server.js` — Express app: static file serving, auth/vault/invite/push API routes, and the daily notification cron
- `db.js`, `auth.js`, `users.js`, `vaults.js` — small backend modules for JSON-file storage, sessions/passwords, and Vault/membership/invite logic
- `.env.example` — template for the VAPID keys (push) the backend can use
