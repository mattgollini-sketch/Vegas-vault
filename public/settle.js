(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.VaultSettle = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function roundCents(amount) {
    return Math.round(Number(amount) * 100);
  }

  function dollars(cents) {
    return (cents / 100).toFixed(2);
  }

  // Even split of group expenses into the fewest who-owes-whom payments.
  // Amounts stay in cents so $10 split three ways doesn't lose a penny.
  function settle(people, expenses) {
    const names = (people || []).map((person) => person.name).filter(Boolean);
    const balances = {};
    names.forEach((name) => {
      balances[name] = 0;
    });

    (expenses || []).forEach((expense) => {
      const cents = roundCents(expense.amount);
      if (!cents || cents <= 0 || !expense.paidBy) return;
      const participants = (expense.participants && expense.participants.length
        ? expense.participants
        : names
      ).filter(Boolean);
      if (!participants.length) return;
      if (balances[expense.paidBy] == null) balances[expense.paidBy] = 0;
      participants.forEach((name) => {
        if (balances[name] == null) balances[name] = 0;
      });

      const base = Math.floor(cents / participants.length);
      let remainder = cents - base * participants.length;
      balances[expense.paidBy] += cents;
      participants.forEach((name) => {
        const share = base + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder -= 1;
        balances[name] -= share;
      });
    });

    const debtors = [];
    const creditors = [];
    Object.keys(balances).forEach((name) => {
      const cents = balances[name];
      if (cents <= -1) debtors.push({ name, cents: -cents });
      else if (cents >= 1) creditors.push({ name, cents });
    });
    debtors.sort((a, b) => b.cents - a.cents);
    creditors.sort((a, b) => b.cents - a.cents);

    const transfers = [];
    let debtorIndex = 0;
    let creditorIndex = 0;
    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const pay = Math.min(debtors[debtorIndex].cents, creditors[creditorIndex].cents);
      if (pay > 0) {
        transfers.push({
          from: debtors[debtorIndex].name,
          to: creditors[creditorIndex].name,
          cents: pay,
          amount: dollars(pay),
        });
      }
      debtors[debtorIndex].cents -= pay;
      creditors[creditorIndex].cents -= pay;
      if (debtors[debtorIndex].cents === 0) debtorIndex += 1;
      if (creditors[creditorIndex].cents === 0) creditorIndex += 1;
    }

    return { balances, transfers };
  }

  function venmoUrl(username, amount, note) {
    const handle = String(username || "").replace(/^@/, "").trim();
    if (!handle) return "";
    const params = new URLSearchParams({
      txn: "pay",
      audience: "private",
      recipients: handle,
      amount: Number(amount).toFixed(2),
      note: note || "Vegas Vault",
    });
    return `https://venmo.com/?${params.toString()}`;
  }

  return { settle, venmoUrl, roundCents };
});
