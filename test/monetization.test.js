"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Stripe = require("stripe");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vegas-vault-pay-"));
process.env.SQLITE_PATH = path.join(tmp, "test.sqlite");
process.env.ADMIN_SECRET = "test-admin-secret";
process.env.BCRYPT_COST = "4";
process.env.NODE_ENV = "test";
process.env.AUTH_RATE_LIMIT_MAX = "40";
process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";
process.env.VAPID_PUBLIC_KEY = "";
process.env.VAPID_PRIVATE_KEY = "";
process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
process.env.STRIPE_PRICE_ID = "price_test_vault_unlock";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_vault_unlock";
process.env.GROUP_UNLOCK_PRICE = "7.99";
delete process.env.BOOKING_AFFILIATE_ID;
delete process.env.EXPEDIA_AFFILIATE_ID;
delete process.env.VIATOR_PARTNER_ID;
delete process.env.GETYOURGUIDE_PARTNER_ID;
delete process.env.TICKETMASTER_IMPACT_PUBLISHER_ID;
delete process.env.TICKETMASTER_IMPACT_AD_ID;
delete process.env.OPENTABLE_REF;

const affiliates = require("../public/affiliates");
const { app } = require("../server");
const billing = require("../billing");
const vaults = require("../vaults");
const { getDb, closeDb } = require("../db");

const stripe = new Stripe("sk_test_placeholder");
let checkoutCalls = [];

billing.setStripeFactory(() => ({
  checkout: {
    sessions: {
      async create(params) {
        checkoutCalls.push(params);
        return { id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" };
      },
    },
  },
}));

let base;
let server;
let ipCounter = 20;

function nextIp() {
  ipCounter += 1;
  return `10.9.0.${ipCounter}`;
}

function cookieHeader(response) {
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function api(pathname, { method = "GET", body, cookie, ip, headers = {}, raw } = {}) {
  const requestHeaders = { ...headers };
  if (body !== undefined) requestHeaders["Content-Type"] = "application/json";
  if (raw !== undefined && !requestHeaders["Content-Type"]) requestHeaders["Content-Type"] = "application/json";
  if (cookie) requestHeaders.Cookie = cookie;
  if (ip) requestHeaders["X-Forwarded-For"] = ip;
  const response = await fetch(base + pathname, {
    method,
    headers: requestHeaders,
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    json = null;
  }
  return { status: response.status, json, text, cookie: cookieHeader(response) };
}

async function signup(email) {
  const response = await api("/api/auth/signup", {
    method: "POST",
    body: { email, password: "password123" },
    ip: nextIp(),
  });
  assert.equal(response.status, 200);
  assert.ok(response.json.user);
  return response;
}

function signedEvent(event) {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  return { payload, header };
}

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  closeDb();
});

test("booking links stay plain until an affiliate id is set", () => {
  const empty = affiliates.configFromEnv({});
  const hotel = affiliates.hotelLinks("Bellagio", empty);
  assert.equal(hotel[0].href.includes("aid="), false);
  assert.equal(hotel[1].href.includes("affcid="), false);
  assert.match(hotel[0].href, /booking\.com/);
  assert.match(hotel[1].href, /expedia\.com/);

  const shows = affiliates.linksForReservation({ category: "shows", name: "Cirque" }, empty);
  assert.equal(shows.some((link) => link.href.includes("viator.com") && !link.href.includes("pid=")), true);
  assert.equal(shows.some((link) => link.href.includes("getyourguide.com") && !link.href.includes("partner_id=")), true);
  assert.equal(shows.some((link) => link.href.startsWith("https://www.ticketmaster.com/search")), true);

  const tour = affiliates.linksForReservation({ category: "tours", name: "Grand Canyon" }, empty);
  assert.equal(tour.length, 3);
  assert.equal(affiliates.bookSuggestion("tours"), "Book this tour");
  assert.equal(affiliates.bookSuggestion("hotel"), "Book a room");
  assert.equal(affiliates.bookSuggestion("restaurants"), "Reserve a table");

  const dinner = affiliates.restaurantLinks("Carbone", empty)[0].href;
  assert.match(dinner, /opentable\.com/);
  assert.equal(dinner.includes("ref="), false);
  assert.equal(affiliates.hasAny(empty), false);
  assert.equal(affiliates.configFromEnv({ BOOKING_AFFILIATE_ID: "<script>" }).bookingAid, "");
});

test("configured ids are added and ticketmaster needs both impact ids", () => {
  const config = affiliates.configFromEnv({
    BOOKING_AFFILIATE_ID: "testaid",
    EXPEDIA_AFFILIATE_ID: "testaffcid",
    VIATOR_PARTNER_ID: "testpid",
    GETYOURGUIDE_PARTNER_ID: "testgyg",
    TICKETMASTER_IMPACT_PUBLISHER_ID: "pub123",
    TICKETMASTER_IMPACT_AD_ID: "ad456",
    OPENTABLE_REF: "testref",
  });
  const hotel = affiliates.hotelLinks("Bellagio", config);
  assert.match(hotel[0].href, /[?&]aid=testaid/);
  assert.match(hotel[1].href, /[?&]affcid=testaffcid/);
  const shows = affiliates.experienceLinks("Cirque Las Vegas", config);
  assert.match(shows[0].href, /[?&]pid=testpid/);
  assert.match(shows[1].href, /[?&]partner_id=testgyg/);
  assert.match(shows[2].href, /^https:\/\/ticketmaster\.evyy\.net\/c\/pub123\/ad456\//);
  assert.match(affiliates.restaurantLinks("Carbone", config)[0].href, /[?&]ref=testref/);
  assert.equal(affiliates.hasAny(config), true);

  const half = affiliates.configFromEnv({ TICKETMASTER_IMPACT_PUBLISHER_ID: "pub123" });
  assert.match(affiliates.ticketmasterUrl("Cirque", half), /^https:\/\/www\.ticketmaster\.com\/search/);
  assert.equal(affiliates.hasAny(half), false);
});

test("affiliate config is public and omits stripe secrets", async () => {
  const plain = await api("/api/affiliates");
  assert.equal(plain.status, 200);
  assert.equal(plain.json.disclosure, "");
  assert.equal(plain.json.bookingAid, "");
  assert.equal(plain.text.includes("sk_test_placeholder"), false);
  assert.equal(plain.text.includes("whsec_test"), false);

  process.env.BOOKING_AFFILIATE_ID = "testaid";
  const tagged = await api("/api/affiliates");
  delete process.env.BOOKING_AFFILIATE_ID;
  assert.equal(tagged.json.bookingAid, "testaid");
  assert.match(tagged.json.disclosure, /affiliate links/);
  assert.equal(tagged.text.includes("sk_test_placeholder"), false);

  const script = await api("/affiliates.js");
  assert.equal(script.status, 200);
  assert.match(script.text, /VegasAffiliates/);
  const hidden = await api("/billing.js");
  assert.equal(hidden.status, 404);
});

test("missing stripe keys keep sharing free and warn once", async () => {
  const saved = {
    key: process.env.STRIPE_SECRET_KEY,
    price: process.env.STRIPE_PRICE_ID,
    hook: process.env.STRIPE_WEBHOOK_SECRET,
  };
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PRICE_ID;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  billing.resetDevWarningForTests();
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    const status = await api("/api/billing");
    assert.equal(status.json.paymentsEnabled, false);
    assert.equal(status.json.priceLabel, "$7.99");
    const owner = await signup(`dev-${Date.now()}@example.com`);
    const invite = await api(`/api/vault/${owner.json.activeVaultId}/invite`, {
      method: "POST",
      cookie: owner.cookie,
      ip: nextIp(),
    });
    assert.equal(invite.status, 201);
    assert.match(warnings.join("\n"), /dev mode/);
    const again = await api("/api/billing");
    assert.equal(again.json.paymentsEnabled, false);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = original;
    process.env.STRIPE_SECRET_KEY = saved.key;
    process.env.STRIPE_PRICE_ID = saved.price;
    process.env.STRIPE_WEBHOOK_SECRET = saved.hook;
  }
});

test("a solo vault can be edited, and group features require unlock", async () => {
  const owner = await signup(`solo-${Date.now()}@example.com`);
  const vaultId = owner.json.activeVaultId;
  const loaded = await api(`/api/vault/${vaultId}`, { cookie: owner.cookie });
  assert.equal(loaded.json.groupUnlocked, false);
  assert.equal(loaded.json.version, 1);

  const renamed = await api(`/api/vault/${vaultId}`, {
    method: "PUT",
    cookie: owner.cookie,
    body: { baseVersion: 1, state: { tripName: "Just me", people: [{ name: "Matt" }], expenses: [], polls: [] } },
  });
  assert.equal(renamed.status, 200);

  const secondPerson = await api(`/api/vault/${vaultId}`, {
    method: "PUT",
    cookie: owner.cookie,
    body: {
      baseVersion: renamed.json.version,
      state: { tripName: "Just me", people: [{ name: "Matt" }, { name: "Alex" }], expenses: [], polls: [] },
    },
  });
  assert.equal(secondPerson.status, 402);
  assert.equal(secondPerson.json.code, "group_locked");
  assert.equal(secondPerson.json.price, "7.99");

  const oneExpense = await api(`/api/vault/${vaultId}`, {
    method: "PUT",
    cookie: owner.cookie,
    body: {
      baseVersion: renamed.json.version,
      state: {
        tripName: "Just me",
        people: [{ name: "Matt" }],
        expenses: [{ label: "Coffee", amount: 6, paidBy: "Matt", participants: ["Matt"] }],
        polls: [],
      },
    },
  });
  assert.equal(oneExpense.status, 200);

  const split = await api(`/api/vault/${vaultId}`, {
    method: "PUT",
    cookie: owner.cookie,
    body: {
      baseVersion: oneExpense.json.version,
      state: {
        tripName: "Just me",
        people: [{ name: "Matt" }],
        expenses: [{ label: "Dinner", amount: 80, paidBy: "Matt", participants: ["Matt", "Alex"] }],
        polls: [],
      },
    },
  });
  assert.equal(split.status, 402);

  const poll = await api(`/api/vault/${vaultId}`, {
    method: "PUT",
    cookie: owner.cookie,
    body: {
      baseVersion: oneExpense.json.version,
      state: { tripName: "Just me", people: [{ name: "Matt" }], polls: [{ question: "Which show?" }] },
    },
  });
  assert.equal(poll.status, 402);
  const still = await api(`/api/vault/${vaultId}`, { cookie: owner.cookie });
  assert.equal(still.json.version, oneExpense.json.version);
  assert.deepEqual(still.json.state.polls, []);

  const invite = await api(`/api/vault/${vaultId}/invite`, { method: "POST", cookie: owner.cookie, ip: nextIp() });
  assert.equal(invite.status, 402);
  assert.equal(vaults.listInvites(vaultId).length, 0);
});

test("checkout is owner-only and does not send payment method types", async () => {
  checkoutCalls = [];
  const owner = await signup(`pay-${Date.now()}@example.com`);
  const vaultId = owner.json.activeVaultId;
  const friend = await signup(`friend-${Date.now()}@example.com`);
  vaults.addMembership(vaultId, friend.json.user.id, "member");

  const denied = await api(`/api/vault/${vaultId}/checkout`, {
    method: "POST",
    cookie: friend.cookie,
    body: {},
  });
  assert.equal(denied.status, 403);
  assert.equal(checkoutCalls.length, 0);

  const session = await api(`/api/vault/${vaultId}/checkout`, {
    method: "POST",
    cookie: owner.cookie,
    body: {},
  });
  assert.equal(session.status, 200);
  assert.equal(session.json.url, "https://checkout.stripe.com/c/pay/cs_test_123");
  assert.equal(checkoutCalls.length, 1);
  const params = checkoutCalls[0];
  assert.equal(params.mode, "payment");
  assert.equal(params.payment_method_types, undefined);
  assert.equal(params.automatic_tax, undefined);
  assert.equal(params.line_items[0].price, "price_test_vault_unlock");
  assert.equal(params.line_items[0].quantity, 1);
  assert.equal(params.metadata.vaultId, vaultId);
  assert.equal(params.client_reference_id, vaultId);
  assert.match(params.success_url, /\?unlock=success$/);
  assert.match(params.cancel_url, /\?unlock=cancel$/);
  assert.match(params.integration_identifier, /^vegasvault[a-z]{8}$/);
});

test("the webhook unlocks only a paid checkout and ignores a bad signature", async () => {
  const owner = await signup(`hook-${Date.now()}@example.com`);
  const vaultId = owner.json.activeVaultId;

  const bad = await api("/api/stripe/webhook", {
    method: "POST",
    raw: JSON.stringify({ type: "checkout.session.completed" }),
    headers: { "stripe-signature": "t=1,v1=nope" },
  });
  assert.equal(bad.status, 400);
  assert.equal(vaults.getVault(vaultId).groupUnlocked, false);

  const unpaid = signedEvent({
    id: "evt_unpaid",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_unpaid",
        object: "checkout.session",
        payment_status: "unpaid",
        metadata: { vaultId },
        client_reference_id: vaultId,
      },
    },
  });
  const pending = await api("/api/stripe/webhook", {
    method: "POST",
    raw: unpaid.payload,
    headers: { "stripe-signature": unpaid.header },
  });
  assert.equal(pending.status, 200);
  assert.equal(pending.json.unlocked, undefined);
  assert.equal(vaults.getVault(vaultId).groupUnlocked, false);

  const failed = signedEvent({
    id: "evt_failed",
    object: "event",
    type: "checkout.session.async_payment_failed",
    data: { object: { id: "cs_failed", payment_status: "unpaid", metadata: { vaultId } } },
  });
  const failure = await api("/api/stripe/webhook", {
    method: "POST",
    raw: failed.payload,
    headers: { "stripe-signature": failed.header },
  });
  assert.equal(failure.status, 200);
  assert.equal(failure.json.failed, true);
  assert.equal(vaults.getVault(vaultId).groupUnlocked, false);

  const paid = signedEvent({
    id: "evt_paid",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_paid",
        object: "checkout.session",
        payment_status: "paid",
        metadata: { vaultId },
        client_reference_id: vaultId,
      },
    },
  });
  const done = await api("/api/stripe/webhook", {
    method: "POST",
    raw: paid.payload,
    headers: { "stripe-signature": paid.header },
  });
  assert.equal(done.status, 200);
  assert.equal(done.json.unlocked, true);
  assert.equal(vaults.getVault(vaultId).groupUnlocked, true);

  const again = await api("/api/stripe/webhook", {
    method: "POST",
    raw: paid.payload,
    headers: { "stripe-signature": paid.header },
  });
  assert.equal(again.status, 200);
  assert.equal(vaults.getVault(vaultId).groupUnlocked, true);

  const loaded = await api(`/api/vault/${vaultId}`, { cookie: owner.cookie });
  assert.equal(loaded.json.groupUnlocked, true);
  const invite = await api(`/api/vault/${vaultId}/invite`, { method: "POST", cookie: owner.cookie, ip: nextIp() });
  assert.equal(invite.status, 201);

  checkoutCalls = [];
  const repeat = await api(`/api/vault/${vaultId}/checkout`, { method: "POST", cookie: owner.cookie, body: {} });
  assert.equal(repeat.json.alreadyUnlocked, true);
  assert.equal(checkoutCalls.length, 0);
});

test("an async payment unlocks when Stripe later marks it paid", async () => {
  const owner = await signup(`async-${Date.now()}@example.com`);
  const vaultId = owner.json.activeVaultId;
  const event = signedEvent({
    id: "evt_async",
    object: "event",
    type: "checkout.session.async_payment_succeeded",
    data: {
      object: {
        id: "cs_async",
        payment_status: "paid",
        metadata: {},
        client_reference_id: vaultId,
      },
    },
  });
  const response = await api("/api/stripe/webhook", {
    method: "POST",
    raw: event.payload,
    headers: { "stripe-signature": event.header },
  });
  assert.equal(response.status, 200);
  assert.equal(response.json.vaultId, vaultId);
  assert.equal(vaults.getVault(vaultId).groupUnlocked, true);
});

test("a poll saved before billing was turned on can still be edited", async () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  const owner = await signup(`keep-${Date.now()}@example.com`);
  const vaultId = owner.json.activeVaultId;
  const first = await api(`/api/vault/${vaultId}`, {
    method: "PUT",
    cookie: owner.cookie,
    body: { baseVersion: 1, state: { polls: [{ id: "p1", question: "Pool?" }] } },
  });
  assert.equal(first.status, 200);
  process.env.STRIPE_SECRET_KEY = saved;

  const renamed = await api(`/api/vault/${vaultId}`, {
    method: "PUT",
    cookie: owner.cookie,
    body: { baseVersion: first.json.version, state: { tripName: "Same poll", polls: [{ id: "p1", question: "Pool?" }] } },
  });
  assert.equal(renamed.status, 200);
  const added = await api(`/api/vault/${vaultId}`, {
    method: "PUT",
    cookie: owner.cookie,
    body: {
      baseVersion: renamed.json.version,
      state: { polls: [{ id: "p1" }, { id: "p2" }] },
    },
  });
  assert.equal(added.status, 402);
});

test("vaults that were already shared are grandfathered on startup", async () => {
  const owner = await signup(`old-${Date.now()}@example.com`);
  const vaultId = owner.json.activeVaultId;
  const guest = await signup(`guest-${Date.now()}@example.com`);
  getDb().prepare("UPDATE vaults SET group_unlocked = 0 WHERE id = ?").run(vaultId);
  vaults.addMembership(vaultId, guest.json.user.id, "member");
  assert.equal(vaults.getVault(vaultId).groupUnlocked, false);

  const solo = await signup(`still-solo-${Date.now()}@example.com`);
  closeDb();
  getDb();

  assert.equal(vaults.getVault(vaultId).groupUnlocked, true);
  assert.equal(vaults.getVault(solo.json.activeVaultId).groupUnlocked, false);
  const invite = await api(`/api/vault/${vaultId}/invite`, { method: "POST", cookie: owner.cookie, ip: nextIp() });
  assert.equal(invite.status, 201);
});
