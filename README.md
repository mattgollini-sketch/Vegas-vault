# Vegas Vault

A trip dashboard for a Las Vegas trip: a live countdown, hotel and flight details, reservations, a packing list, a gambling bankroll, group expenses, a map, polls, an itinerary, weather, and a daily hype section.

Everything works in the browser with no account. If you turn on the included Node server, you also get accounts, sync between phones, a shared group Vault, and daily push notifications.

## What you can do

- Countdown to the trip in **Las Vegas time**, even if your phone is set to another time zone
- Hotel, flights, and reservations (restaurants, shows, spas, nightclubs, pool), with a phone number, address, and confirmation link
- Booking shortcuts: hotels can open Booking.com or Expedia, restaurants can open OpenTable or Resy, and shows, tours, and clubs can open Viator, GetYourGuide, or Ticketmaster. These open the other site; Vegas Vault does not book anything for you. If you add affiliate IDs, a short disclosure line appears in the footer
- Flight status opens FlightAware (and the airline's status page when the airline is recognized). Gate and delay numbers are on that site. There is no paid flight API
- Gambling bankroll with a loss cap, and a group spending budget. The app warns you at 80%, and a signed-in phone can also get a push
- Group expenses: who paid, an even split, a who-owes-whom list, and a Venmo link when you saved that person's Venmo username
- Add the whole trip, or one reservation, to Apple or Google Calendar with an `.ics` file
- A map of the hotel and reservations (OpenStreetMap), with a walking-time estimate
- Polls and RSVPs inside a shared Vault. Planning alone stays free. Sharing a Vault (an invite, a poll, or an expense split with more than one person) can require a one-time unlock per Vault when Stripe is turned on
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
- With Stripe turned on, the owner pays once per Vault before the first invite, poll, or multi-person expense split. People already sharing a Vault before this was added keep it unlocked. Your own trip, with no group, stays free. If the Stripe settings are blank, sharing stays free and the server logs a reminder.
- Owners can remove someone or make them an owner. Anyone else can leave. The only owner cannot leave while other people are still in the Vault.
- If two people edit at the same time, the server rejects the older save. The app merges the two copies and saves again instead of silently wiping one person's work.
- Passwords are hashed. You can change your password while signed in, and "Log out everywhere" ends the other sessions. There is no emailed password reset, because that needs a mail provider.

### Push notifications

- Sign in, then tap **Enable daily notifications** and allow the browser prompt.
- On an iPhone, install Vegas Vault to your Home Screen first or iOS will not deliver the push. The app shows that hint.
- The daily message is sent at `NOTIFY_HOUR` (default 9) in **Pacific time**, using the trip's dates in that time zone. It stops after the trip.
- A one-time push also goes out when gambling losses or group spending cross 80% of the budget you set.
- `POST /api/send-now` only works with the header `x-admin-secret` set to `ADMIN_SECRET`. If that variable is empty, the route is turned off.

## Affiliate links

Vegas Vault never stores a real affiliate ID in the code. Add them as environment variables (locally in `.env`, or on Railway under Variables). Leave a line blank and that button stays a normal search link.

| What you booked | Where the ID comes from | Variable |
| --- | --- | --- |
| Hotel | Booking.com Affiliate Partner Centre, the `aid` value | `BOOKING_AFFILIATE_ID` |
| Hotel | Expedia affiliate program, the `affcid` value | `EXPEDIA_AFFILIATE_ID` |
| Tours and shows | Viator Partner Program, the `pid` | `VIATOR_PARTNER_ID` |
| Tours and shows | GetYourGuide Partner Hub, the `partner_id` | `GETYOURGUIDE_PARTNER_ID` |
| Shows, tours, and clubs | Ticketmaster's Impact account. You need both the publisher id and the ad id | `TICKETMASTER_IMPACT_PUBLISHER_ID` and `TICKETMASTER_IMPACT_AD_ID` |
| Restaurant | OpenTable partner ref, if you have one | `OPENTABLE_REF` |

Paste the ID only, not a full web address. Ticketmaster stays a normal search until both Impact IDs are set. The wrapped link looks like `https://ticketmaster.evyy.net/c/YOUR_PUBLISHER_ID/YOUR_AD_ID/...`. Resy has no affiliate slot and stays a plain search.

When at least one of those IDs is actually in use, the footer says: "Some Book links are affiliate links. If you book through them, Vegas Vault may earn a commission at no extra cost to you."

Hotel pages show "Book a room". Restaurants show "Reserve a table". Shows and clubs show "Book tickets". Tours show "Book this tour".

The no-account mode (`python3 -m http.server`) cannot read these variables, so those links stay plain and the disclosure stays hidden.

## Group unlock with Stripe

A trip you keep to yourself is free. The paid part is sharing one Vault with other people: creating an invite, adding a poll, or splitting an expense across more than one person. It is a single payment for that Vault, not a subscription. The default price shown in the app is **$7.99**. The amount Stripe actually charges is the Price you create in Stripe. Set `GROUP_UNLOCK_PRICE` to the same dollars-and-cents figure so the button matches the charge.

Vaults that already had a second person or an invite when you deploy this stay unlocked. Nobody is asked to pay for a group that was already sharing.

If `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, or `STRIPE_WEBHOOK_SECRET` is missing, sharing stays free and the server prints: `Stripe keys are missing ... Group Vault unlock stays free in dev mode.`

### Try it before going live

Stripe sandboxes are the right place to practice. A sandbox is a Stripe test environment with its own data, separate from live charges and from the older shared test mode. Test keys start with `sk_test_` or `rk_test_`. You can create one with the Stripe CLI (`stripe sandbox create`) or from the Stripe Dashboard.

1. In that sandbox, create a Product and a one-time Price. Copy the `price_...` id into `STRIPE_PRICE_ID`.
2. Create a restricted key that is allowed to create Checkout Sessions. Paste it into `STRIPE_SECRET_KEY`. A secret key (`sk_test_...`) also works if you already have one. Do not put the key in git.
3. Set `GROUP_UNLOCK_PRICE` to the Price amount, for example `7.99`.
4. Point Stripe at the webhook `https://YOUR-DOMAIN/api/stripe/webhook` (or, on your computer, `stripe listen --forward-to localhost:3000/api/stripe/webhook`).
5. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`.
6. Copy the signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`. The CLI prints a different secret than the Dashboard endpoint. Use the one that matches the listener you are using.
7. Restart the server. Sign in, open Account, and tap **Unlock group tools**. Pay with Stripe's test card `4242 4242 4242 4242`. The Vault unlocks when the webhook arrives, not when the browser merely lands back on the site.

The success page only shows a confirmation. Unlocking happens on the server after Stripe says the payment is paid. A delayed bank payment waits for `checkout.session.async_payment_succeeded` and does not unlock while the payment is still unpaid.

Live mode is the same three variables with live keys and a live webhook on the Railway domain. Switch them together. Do not mix a live secret key with a test price.

## Deploy on Railway

Use one Railway service for the site and the API. Do this only after the security fixes in this version. The server no longer publishes the project folder, so accounts and the database are not on the public site.

1. Railway → New Project → Deploy from this GitHub repo.
2. Start command: `npm start`. Node 18 or newer (`engines` in `package.json`).
3. Variables:
   - `NODE_ENV=production` (turns on the secure cookie flag; Railway HTTPS covers that)
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:you@example.com`
   - `NOTIFY_HOUR=9` (9:00 America/Los_Angeles, not the server's UTC clock)
   - `ADMIN_SECRET` set to a long random string if you want to trigger the daily push by hand
   - Affiliate IDs, only for the programs you join. Leave the rest blank. See the table above. Do not paste real IDs into the repo
   - `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, and `GROUP_UNLOCK_PRICE=7.99` when you want the group unlock to be paid. The webhook URL is `https://YOUR-RAILWAY-DOMAIN/api/stripe/webhook`. Leave the Stripe variables blank and sharing stays free
4. **Storage.** Attach a Railway Volume and set `SQLITE_PATH` to a file on that volume, for example `/data/vegas-vault.sqlite`. Without a volume, every redeploy gives you an empty database and wipes accounts. The app also keeps 7 nightly copies in a `backups` folder next to that file.
5. Generate a Railway domain. HTTPS is automatic. Push notifications and the installed app need HTTPS.
6. Health check path: `/healthz`.

If you already had the old JSON files in `data/` (`users.json`, `vaults.json`, and the rest), the first startup copies them into SQLite and renames them to `*.json.imported`. New sessions stay valid because the old session cookie is stored as a hash.

A Netlify-only deploy can host the `public/` folder for the no-account mode. Accounts, sync, and push need this Node server.

## Tests

```bash
npm test
```

The tests cover the security fixes: private files are not served, signup does not say whether an email is registered, login is rate limited, push send/unsubscribe require the right person, Vault edits from outside the group are rejected, stale saves conflict, and invites and member removal follow the owner rules. They also check affiliate links with and without IDs, the group paywall, Stripe Checkout setup, the webhook that unlocks a Vault, and the free pass for Vaults that were already shared.

## Files

- `public/` — the site (HTML, CSS, JavaScript, service worker, icons). This is the only folder the server hands to browsers
- `server.js` — accounts, Vaults, invites, push, Stripe webhook, and the daily job
- `billing.js` — the one-time group unlock and Checkout Session
- `public/affiliates.js` — booking links. IDs are read from the environment at request time
- `db.js` — SQLite database (`SQLITE_PATH` or `DATA_DIR`)
- `auth.js`, `users.js`, `vaults.js`, `notify.js` — passwords, sessions, sharing, and notifications
- `.env.example` — the settings Railway or a local `.env` file can use, including Stripe and affiliate IDs
