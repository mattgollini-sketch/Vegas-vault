# Vegas Vault

A trip dashboard for a Las Vegas trip: a live countdown, hotel and flight details, reservations, a packing list, a gambling bankroll, group expenses, a map, polls, an itinerary, weather, and a daily hype section.

Everything works in the browser with no account. If you turn on the included Node server, you also get accounts, sync between phones, a shared group Vault, and daily push notifications.

## What you can do

- Countdown to the trip in **Las Vegas time**, even if your phone is set to another time zone
- Hotel, flights, and reservations (restaurants, shows, spas, nightclubs, pool), with a phone number, address, and confirmation link
- Booking shortcuts on each reservation: OpenTable, Resy, and Ticketmaster search links. These open the other site; Vegas Vault does not book anything for you
- Flight status opens FlightAware (and the airline's status page when the airline is recognized). Gate and delay numbers are on that site. There is no paid flight API
- Gambling bankroll with a loss cap, and a group spending budget. The app warns you at 80%, and a signed-in phone can also get a push
- Group expenses: who paid, an even split, a who-owes-whom list, and a Venmo link when you saved that person's Venmo username
- Add the whole trip, or one reservation, to Apple or Google Calendar with an `.ics` file
- A map of the hotel and reservations (OpenStreetMap), with a walking-time estimate
- Polls and RSVPs inside a shared Vault
- Offline use. This browser keeps your trip. If you are signed in and the connection drops, edits wait and sync when you are back online
- Saved / syncing / offline indicator, undo after a delete, and an install prompt (iPhone notifications only work after you add the app to your Home Screen)
- Export and import a JSON backup

## Run it on your computer with no accounts

```bash
python3 -m http.server 8000 --directory public
```

Open `http://localhost:8000`. Sign-in, sync, and push will not work in this mode. The trip stays in that browser.

## Run it with accounts, sync, and notifications

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Optional push notifications:

1. `npm run generate-vapid-keys`
2. Copy `.env.example` to `.env`
3. Fill in `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`
4. Restart `npm start`

Accounts and sharing work without those keys. Push stays off until the keys are set.

### Accounts and shared Vaults

- Account tab → sign up. You get a private Vault and it starts syncing. A copy stays in this browser too.
- If this browser already had a trip, you can import it once.
- Only an owner can create an invite. The link works **once** and expires after **7 days**. You can revoke it before anyone uses it. Send the link yourself (text, email, AirDrop).
- Owners can remove someone or make them an owner. Anyone else can leave. The only owner cannot leave while other people are still in the Vault.
- If two people edit at the same time, the server rejects the older save. The app merges the two copies and saves again instead of silently wiping one person's work.
- Passwords are hashed. You can change your password while signed in, and "Log out everywhere" ends the other sessions. There is no emailed password reset, because that needs a mail provider.

### Push notifications

- Sign in, then tap **Enable daily notifications** and allow the browser prompt.
- On an iPhone, install Vegas Vault to your Home Screen first or iOS will not deliver the push. The app shows that hint.
- The daily message is sent at `NOTIFY_HOUR` (default 9) in **Pacific time**, using the trip's dates in that time zone. It stops after the trip.
- A one-time push also goes out when gambling losses or group spending cross 80% of the budget you set.
- `POST /api/send-now` only works with the header `x-admin-secret` set to `ADMIN_SECRET`. If that variable is empty, the route is turned off.

## Deploy on Railway

Use one Railway service for the site and the API. Do this only after the security fixes in this version. The server no longer publishes the project folder, so accounts and the database are not on the public site.

1. Railway → New Project → Deploy from this GitHub repo.
2. Start command: `npm start`. Node 18 or newer (`engines` in `package.json`).
3. Variables:
   - `NODE_ENV=production` (turns on the secure cookie flag; Railway HTTPS covers that)
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:you@example.com`
   - `NOTIFY_HOUR=9` (9:00 America/Los_Angeles, not the server's UTC clock)
   - `ADMIN_SECRET` set to a long random string if you want to trigger the daily push by hand
4. **Storage.** Attach a Railway Volume and set `SQLITE_PATH` to a file on that volume, for example `/data/vegas-vault.sqlite`. Without a volume, every redeploy gives you an empty database and wipes accounts. The app also keeps 7 nightly copies in a `backups` folder next to that file.
5. Generate a Railway domain. HTTPS is automatic. Push notifications and the installed app need HTTPS.
6. Health check path: `/healthz`.

If you already had the old JSON files in `data/` (`users.json`, `vaults.json`, and the rest), the first startup copies them into SQLite and renames them to `*.json.imported`. New sessions stay valid because the old session cookie is stored as a hash.

A Netlify-only deploy can host the `public/` folder for the no-account mode. Accounts, sync, and push need this Node server.

## Tests

```bash
npm test
```

The tests cover the security fixes: private files are not served, signup does not say whether an email is registered, login is rate limited, push send/unsubscribe require the right person, Vault edits from outside the group are rejected, stale saves conflict, and invites and member removal follow the owner rules.

## Files

- `public/` — the site (HTML, CSS, JavaScript, service worker, icons). This is the only folder the server hands to browsers
- `server.js` — accounts, Vaults, invites, push, and the daily job
- `db.js` — SQLite database (`SQLITE_PATH` or `DATA_DIR`)
- `auth.js`, `users.js`, `vaults.js`, `notify.js` — passwords, sessions, sharing, and notifications
- `.env.example` — the settings Railway or a local `.env` file can use
