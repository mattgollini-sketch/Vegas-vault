(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.VaultMerge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function mergeScalar(base, local, remote) {
    const localChanged = !same(local, base);
    const remoteChanged = !same(remote, base);
    if (localChanged && !remoteChanged) return clone(local);
    if (remote === undefined) return clone(local);
    return clone(remote);
  }

  function mergeFields(base, local, remote, skip) {
    const skipSet = new Set(skip || []);
    const keys = new Set([...Object.keys(base || {}), ...Object.keys(local || {}), ...Object.keys(remote || {})]);
    const out = {};
    keys.forEach((key) => {
      if (skipSet.has(key)) return;
      out[key] = mergeScalar(base ? base[key] : undefined, local ? local[key] : undefined, remote ? remote[key] : undefined);
    });
    return out;
  }

  function mergeItemList(baseList, localList, remoteList) {
    const base = new Map((baseList || []).filter((item) => item && item.id).map((item) => [item.id, item]));
    const local = new Map((localList || []).filter((item) => item && item.id).map((item) => [item.id, item]));
    const remote = new Map((remoteList || []).filter((item) => item && item.id).map((item) => [item.id, item]));
    const orderedIds = [];
    (remoteList || []).forEach((item) => {
      if (item && item.id && !orderedIds.includes(item.id)) orderedIds.push(item.id);
    });
    (localList || []).forEach((item) => {
      if (item && item.id && !orderedIds.includes(item.id)) orderedIds.push(item.id);
    });

    const result = [];
    orderedIds.forEach((id) => {
      const b = base.get(id);
      const l = local.get(id);
      const r = remote.get(id);
      const localChanged = !same(l, b);
      const remoteChanged = !same(r, b);
      if (l && r) {
        if (localChanged && !remoteChanged) result.push(clone(l));
        else if (!localChanged && remoteChanged) result.push(clone(r));
        else if (!localChanged && !remoteChanged) result.push(clone(r));
        else {
          const localStamp = l.updatedAt || "";
          const remoteStamp = r.updatedAt || "";
          result.push(clone(localStamp >= remoteStamp ? l : r));
        }
      } else if (l && !r) {
        if (!b || localChanged) result.push(clone(l));
      } else if (r && !l) {
        if (!b || remoteChanged) result.push(clone(r));
      }
    });
    return result;
  }

  function mergeChoiceMap(baseMap, localMap, remoteMap) {
    const base = baseMap || {};
    const local = localMap || {};
    const remote = remoteMap || {};
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
    const out = {};
    keys.forEach((key) => {
      const localChanged = local[key] !== base[key];
      const remoteChanged = remote[key] !== base[key];
      let choice;
      if (localChanged && !remoteChanged) choice = local[key];
      else if (!localChanged && remoteChanged) choice = remote[key];
      else if (localChanged && remoteChanged) choice = local[key];
      else choice = remote[key] !== undefined ? remote[key] : local[key];
      if (choice != null && choice !== "") out[key] = choice;
    });
    return out;
  }

  function votesToChoices(votes) {
    const choices = {};
    Object.entries(votes || {}).forEach(([optionId, names]) => {
      (names || []).forEach((name) => {
        choices[name] = optionId;
      });
    });
    return choices;
  }

  function choicesToVotes(choices) {
    const votes = {};
    Object.entries(choices).forEach(([name, optionId]) => {
      if (!votes[optionId]) votes[optionId] = [];
      votes[optionId].push(name);
    });
    return votes;
  }

  function mergeVotes(baseVotes, localVotes, remoteVotes) {
    return choicesToVotes(
      mergeChoiceMap(votesToChoices(baseVotes), votesToChoices(localVotes), votesToChoices(remoteVotes))
    );
  }

  const LIST_KEYS = ["essentials", "reservations", "outfits", "expenses", "people", "polls"];

  function mergeVaultState(base, local, remote) {
    const safeBase = base || {};
    const safeLocal = local || {};
    const safeRemote = remote || {};
    const out = clone(safeRemote) || {};

    ["tripName", "tripDate", "timezone", "spendingBudget"].forEach((key) => {
      out[key] = mergeScalar(safeBase[key], safeLocal[key], safeRemote[key]);
    });

    out.hotel = mergeFields(safeBase.hotel, safeLocal.hotel, safeRemote.hotel);
    const baseFlights = safeBase.flights || {};
    const localFlights = safeLocal.flights || {};
    const remoteFlights = safeRemote.flights || {};
    out.flights = {
      outbound: mergeFields(baseFlights.outbound, localFlights.outbound, remoteFlights.outbound),
      return: mergeFields(baseFlights.return, localFlights.return, remoteFlights.return),
    };

    out.bankroll = mergeFields(safeBase.bankroll, safeLocal.bankroll, safeRemote.bankroll, ["entries"]);
    out.bankroll.entries = mergeItemList(
      (safeBase.bankroll || {}).entries,
      (safeLocal.bankroll || {}).entries,
      (safeRemote.bankroll || {}).entries
    );

    LIST_KEYS.forEach((key) => {
      out[key] = mergeItemList(safeBase[key], safeLocal[key], safeRemote[key]);
    });

    out.polls = (out.polls || []).map((poll) => {
      const basePoll = (safeBase.polls || []).find((item) => item.id === poll.id) || {};
      const localPoll = (safeLocal.polls || []).find((item) => item.id === poll.id) || {};
      const remotePoll = (safeRemote.polls || []).find((item) => item.id === poll.id) || {};
      if (localPoll.id && remotePoll.id) poll.votes = mergeVotes(basePoll.votes, localPoll.votes, remotePoll.votes);
      return poll;
    });

    out.reservations = (out.reservations || []).map((item) => {
      const baseItem = (safeBase.reservations || []).find((row) => row.id === item.id) || {};
      const localItem = (safeLocal.reservations || []).find((row) => row.id === item.id) || {};
      const remoteItem = (safeRemote.reservations || []).find((row) => row.id === item.id) || {};
      if (localItem.id && remoteItem.id) item.rsvps = mergeChoiceMap(baseItem.rsvps, localItem.rsvps, remoteItem.rsvps);
      return item;
    });

    const baseWeather = safeBase.weather && safeBase.weather.fetchedAt;
    const localWeather = safeLocal.weather && safeLocal.weather.fetchedAt;
    const remoteWeather = safeRemote.weather && safeRemote.weather.fetchedAt;
    if (localWeather !== baseWeather && remoteWeather === baseWeather && safeLocal.weather) out.weather = clone(safeLocal.weather);
    else out.weather = clone(safeRemote.weather || safeLocal.weather || { fetchedAt: "", days: [] });

    return out;
  }

  return { mergeVaultState, mergeItemList, mergeVotes, mergeChoiceMap };
});
