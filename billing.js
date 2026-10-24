"use strict";

const crypto = require("crypto");
const vaults = require("./vaults");

const DEFAULT_PRICE = "7.99";
let warned = false;
let stripeFactory = null;

function setStripeFactory(factory) {
  stripeFactory = typeof factory === "function" ? factory : null;
}

function resetDevWarningForTests() {
  warned = false;
}

function paymentsConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID && process.env.STRIPE_WEBHOOK_SECRET);
}

function paywallActive() {
  if (!paymentsConfigured()) {
    if (!warned) {
      warned = true;
      console.warn(
        "Stripe keys are missing (STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET). Group Vault unlock stays free in dev mode."
      );
    }
    return false;
  }
  return true;
}

function displayPrice() {
  const amount = Number(String(process.env.GROUP_UNLOCK_PRICE || DEFAULT_PRICE).trim());
  if (!Number.isFinite(amount) || amount < 0) return DEFAULT_PRICE;
  return amount.toFixed(2);
}

function priceLabel() {
  return `$${displayPrice()}`;
}

function publicBilling() {
  return {
    paymentsEnabled: paywallActive(),
    price: displayPrice(),
    priceLabel: priceLabel(),
    currency: "usd",
  };
}

function vaultUnlocked(vault) {
  if (!paywallActive()) return true;
  return Boolean(vault && vault.groupUnlocked);
}

function participantCount(expense) {
  if (!expense || typeof expense !== "object") return 0;
  if (Array.isArray(expense.participants)) return expense.participants.filter(Boolean).length;
  if (Array.isArray(expense.split)) return expense.split.filter(Boolean).length;
  return 0;
}

function maxParticipants(state) {
  const expenses = state && Array.isArray(state.expenses) ? state.expenses : [];
  return expenses.reduce((max, expense) => Math.max(max, participantCount(expense)), 0);
}

function groupFeatureIncrease(previousState, nextState) {
  const prev = previousState && typeof previousState === "object" ? previousState : {};
  const next = nextState && typeof nextState === "object" ? nextState : {};
  const prevPolls = Array.isArray(prev.polls) ? prev.polls.length : 0;
  const nextPolls = Array.isArray(next.polls) ? next.polls.length : 0;
  if (nextPolls > prevPolls) return "polls";

  const prevPeople = Array.isArray(prev.people) ? prev.people.length : 0;
  const nextPeople = Array.isArray(next.people) ? next.people.length : 0;
  if (nextPeople > 1 && nextPeople > prevPeople) return "expenses";

  const prevParts = maxParticipants(prev);
  const nextParts = maxParticipants(next);
  if (nextParts > 1 && nextParts > prevParts) return "expenses";
  return null;
}

function lockedResponse() {
  return {
    error: `Sharing this Vault is a one-time unlock (${priceLabel()}). A trip you keep to yourself stays free.`,
    code: "group_locked",
    price: displayPrice(),
    priceLabel: priceLabel(),
  };
}

function assertGroupSaveAllowed(vault, nextState) {
  if (!vault || vaultUnlocked(vault)) return null;
  if (!groupFeatureIncrease(vault.state, nextState)) return null;
  return lockedResponse();
}

function randomLetters(count) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.randomBytes(count);
  let out = "";
  for (let i = 0; i < count; i += 1) out += alphabet[bytes[i] % 26];
  return out;
}

function getStripe() {
  if (stripeFactory) return stripeFactory();
  const Stripe = require("stripe");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function createCheckoutSession({ vaultId, successUrl, cancelUrl }) {
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    client_reference_id: vaultId,
    metadata: { vaultId },
    success_url: successUrl,
    cancel_url: cancelUrl,
    integration_identifier: `vegasvault${randomLetters(8)}`,
  });
}

function fulfillCheckoutSession(session) {
  if (!session || session.payment_status === "unpaid") return { ignored: true };
  const vaultId = (session.metadata && session.metadata.vaultId) || session.client_reference_id;
  if (!vaultId) return { ignored: true };
  const unlocked = vaults.unlockVault(vaultId);
  if (!unlocked) return { ignored: true };
  return { unlocked: true, vaultId };
}

function handleStripeEvent(event) {
  if (!event || !event.type) return { ignored: true };
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    return fulfillCheckoutSession(event.data && event.data.object);
  }
  if (event.type === "checkout.session.async_payment_failed") return { failed: true };
  return { ignored: true };
}

function constructEvent(rawBody, signature) {
  const Stripe = require("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

module.exports = {
  setStripeFactory,
  resetDevWarningForTests,
  paymentsConfigured,
  paywallActive,
  displayPrice,
  publicBilling,
  vaultUnlocked,
  groupFeatureIncrease,
  lockedResponse,
  assertGroupSaveAllowed,
  createCheckoutSession,
  handleStripeEvent,
  constructEvent,
};
