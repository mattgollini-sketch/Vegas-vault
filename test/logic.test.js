"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { todayStr, zonedDateTimeToUtc, daysUntil } = require("../public/time");
const { mergeVaultState } = require("../public/merge");
const { settle, venmoUrl } = require("../public/settle");
const { buildMessageForVault, budgetSnapshot } = require("../notify");

test("Las Vegas dates do not follow UTC", () => {
  const evening = new Date("2026-10-24T02:30:00Z");
  assert.equal(todayStr("America/Los_Angeles", evening), "2026-10-23");
  assert.equal(todayStr("UTC", evening), "2026-10-24");
  assert.equal(new Date(zonedDateTimeToUtc("2026-10-23", "19:30", "America/Los_Angeles")).toISOString(), "2026-10-24T02:30:00.000Z");
  assert.equal(daysUntil("2026-10-25", "America/Los_Angeles", evening), 2);
});

test("daily notification uses the trip timezone for today", () => {
  const state = {
    timezone: "America/Los_Angeles",
    tripName: "Bachelor weekend",
    hotel: { checkIn: "2026-10-23", checkOut: "2026-10-26" },
    reservations: [{ name: "Carbone", date: "2026-10-23", time: "19:30" }],
  };
  const message = buildMessageForVault(state, new Date("2026-10-24T02:30:00Z"));
  assert.match(message.body, /Carbone/);
  assert.match(message.title, /Tonight/);

  const utcMessage = buildMessageForVault(
    { ...state, timezone: "UTC", reservations: [{ name: "Carbone", date: "2026-10-24", time: "19:30" }] },
    new Date("2026-10-24T02:30:00Z")
  );
  assert.match(utcMessage.body, /Carbone/);
});

test("offline edits merge with a newer server copy instead of wiping it", () => {
  const base = {
    tripName: "Trip",
    reservations: [{ id: "r1", name: "Old dinner", date: "2026-10-23" }],
    polls: [{ id: "p1", question: "Show?", options: [{ id: "a", text: "O" }], votes: {} }],
  };
  const local = {
    ...base,
    reservations: [
      { id: "r1", name: "Old dinner", date: "2026-10-23" },
      { id: "r2", name: "Absinthe", date: "2026-10-24", updatedAt: "2026-10-01T00:00:00Z" },
    ],
    polls: [{ id: "p1", question: "Show?", options: [{ id: "a", text: "O" }], votes: { a: ["Matt"] } }],
  };
  const remote = {
    ...base,
    tripName: "Trip renamed",
    reservations: [{ id: "r1", name: "Carbone", date: "2026-10-23", updatedAt: "2026-10-02T00:00:00Z" }],
    polls: [{ id: "p1", question: "Show?", options: [{ id: "a", text: "O" }], votes: { a: ["Alex"] } }],
  };

  const merged = mergeVaultState(base, local, remote);
  assert.equal(merged.tripName, "Trip renamed");
  assert.deepEqual(
    merged.reservations.map((item) => item.name).sort(),
    ["Absinthe", "Carbone"]
  );
  assert.deepEqual(merged.polls[0].votes.a.sort(), ["Alex", "Matt"]);
});

test("settle-up splits cents and builds a Venmo link", () => {
  const people = [
    { name: "Matt", venmo: "mattg" },
    { name: "Alex", venmo: "alexv" },
  ];
  const expenses = [{ amount: 90, paidBy: "Matt", participants: ["Matt", "Alex"] }];
  const result = settle(people, expenses);
  assert.equal(result.transfers.length, 1);
  assert.equal(result.transfers[0].from, "Alex");
  assert.equal(result.transfers[0].to, "Matt");
  assert.equal(result.transfers[0].amount, "45.00");
  assert.match(venmoUrl("mattg", 45, "Dinner"), /venmo\.com\/\?/);
  assert.match(venmoUrl("mattg", 45, "Dinner"), /recipients=mattg/);
  assert.match(venmoUrl("mattg", 45, "Dinner"), /amount=45\.00/);

  const awkward = settle(
    [{ name: "A" }, { name: "B" }, { name: "C" }],
    [{ amount: 10, paidBy: "A", participants: ["A", "B", "C"] }]
  );
  const paid = awkward.transfers.reduce((sum, transfer) => sum + transfer.cents, 0);
  // $10.00 split three ways is 334 + 333 + 333 cents. The payer keeps the extra cent.
  assert.equal(paid, 666);
  assert.equal(awkward.balances.A + awkward.balances.B + awkward.balances.C, 0);
});

test("budget snapshot hits 80 percent from net losses and spending", () => {
  const under = budgetSnapshot({
    bankroll: { gamblingBudget: 100, entries: [{ amount: -79 }] },
    spendingBudget: 200,
    expenses: [{ amount: 50 }],
  });
  assert.equal(under.gamblingPct < 0.8, true);
  const over = budgetSnapshot({
    bankroll: { gamblingBudget: 100, entries: [{ amount: -50 }, { amount: -30 }] },
    spendingBudget: 100,
    expenses: [{ amount: 80 }],
  });
  assert.equal(over.gamblingPct >= 0.8, true);
  assert.equal(over.spendingPct >= 0.8, true);
});
