(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.VaultTime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_TZ = "America/Los_Angeles";

  function safeZone(timeZone) {
    if (!timeZone) return DEFAULT_TZ;
    try {
      Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
      return timeZone;
    } catch (e) {
      return DEFAULT_TZ;
    }
  }

  function todayStr(timeZone, now) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: safeZone(timeZone),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now || new Date());
  }

  function partsInZone(date, timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: safeZone(timeZone),
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);
    const map = {};
    parts.forEach((part) => {
      if (part.type !== "literal") map[part.type] = part.value;
    });
    let hour = Number(map.hour);
    if (hour === 24) hour = 0;
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour,
      minute: Number(map.minute),
      second: Number(map.second),
    };
  }

  // Wall-clock date and time in a timezone, as a UTC millisecond timestamp.
  function zonedDateTimeToUtc(dateStr, timeStr, timeZone) {
    if (!dateStr) return null;
    const dateBits = String(dateStr).split("-").map(Number);
    const timeBits = String(timeStr || "00:00").split(":").map(Number);
    const year = dateBits[0];
    const month = dateBits[1];
    const day = dateBits[2];
    const hour = timeBits[0] || 0;
    const minute = timeBits[1] || 0;
    const second = timeBits[2] || 0;
    if (!year || !month || !day) return null;
    const zone = safeZone(timeZone);
    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    let timestamp = desired;
    for (let i = 0; i < 4; i++) {
      const wall = partsInZone(new Date(timestamp), zone);
      const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
      const next = timestamp + (desired - asUtc);
      if (next === timestamp) break;
      timestamp = next;
    }
    return timestamp;
  }

  function daysUntil(dateStr, timeZone, now) {
    if (!dateStr) return null;
    const today = todayStr(timeZone, now);
    const todayBits = today.split("-").map(Number);
    const dateBits = String(dateStr).slice(0, 10).split("-").map(Number);
    const from = Date.UTC(todayBits[0], todayBits[1] - 1, todayBits[2]);
    const to = Date.UTC(dateBits[0], dateBits[1] - 1, dateBits[2]);
    return Math.round((to - from) / 86400000);
  }

  return { DEFAULT_TZ, safeZone, todayStr, zonedDateTimeToUtc, daysUntil };
});
