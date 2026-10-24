const STORAGE_KEY = "vegasVaultData";

const CATEGORY_META = {
  restaurants: { label: "🍽️ Restaurants", hint: "Your favorite spots to eat." },
  shows: { label: "🎭 Shows", hint: "Shows you want to catch." },
  tours: { label: "🎟️ Tours", hint: "Tours and experiences to book." },
  spas: { label: "💆 Spas", hint: "Spa appointments to book or track." },
  nightclubs: { label: "🥂 Nightclubs", hint: "Club reservations and tables." },
  pool: { label: "🏊 Pool", hint: "Pool / dayclub plans and status." },
};

const VEGAS_TIPS = [
  "Casino floors are designed with no clocks or windows — set a phone alarm if you need to keep track of time.",
  "Rideshare pickup at the airport and big Strip resorts can involve a walk to a dedicated lot — budget extra time.",
  "Tap water is safe to drink, but hotel minibar bottles are pricey — grab a case at a nearby CVS or Walgreens instead.",
  "The Strip looks walkable on a map, but one 'block' can take 15+ minutes on foot — factor that into show and dinner timing.",
  "Ask about resort fees before you book elsewhere — they're charged nightly on top of the room rate almost everywhere.",
  "Most pool clubs and dayclubs are 21+ with a dress code — check swimwear rules before you pack.",
  "Sportsbooks get packed during major games — arrive early if you want a seat to watch and bet.",
  "Buffet and show tickets are often cheaper same-day through the box office or official hotel app than pre-booking.",
  "Keep a photo of your ID and reservation confirmations saved offline in case your phone dies or loses signal.",
  "Nightclub tables and bottle service require reservations well in advance for weekends — don't wait until you land.",
  "Fremont Street downtown has a different, cheaper vibe than the Strip — worth a night if you want a break from resort prices.",
  "Elevators in mega-resorts can take a while at peak times — build in buffer time before dinner reservations.",
  "Comfortable shoes matter more than they sound — you'll likely walk several miles a day between casinos alone.",
  "Set a gambling budget before you sit down, and treat it as the cost of entertainment, not an investment.",
  "Vegas is desert heat — even 'mild' days can hit 90°F+, so sunscreen and water matter even on indoors-heavy itineraries.",
  "Many shows sell rush or last-minute discounted tickets — check the day-of if you're flexible.",
  "If you're gambling, ask about a players card at the casino cage — comps and discounts add up fast.",
  "Late checkout isn't guaranteed — call the front desk the morning of if you want a shot at extra time.",
];

const defaultData = {
  version: 3,
  tripName: "",
  tripDate: "",
  timezone: "America/Los_Angeles",
  spendingBudget: 0,
  hotel: { name: "", conf: "", checkIn: "", checkOut: "", room: "", notes: "", address: "", phone: "", lat: null, lng: null },
  flights: {
    outbound: { airline: "", flightNum: "", date: "", depTime: "", arrTime: "", from: "", to: "", conf: "" },
    return: { airline: "", flightNum: "", date: "", depTime: "", arrTime: "", from: "", to: "", conf: "" },
  },
  essentials: [
    "ID / passport",
    "Cash + backup card",
    "Comfortable walking shoes",
    "Phone charger + portable battery",
    "Sunscreen",
    "Sunglasses",
    "Party outfit",
    "Swimsuit",
    "Earplugs (for the room)",
    "Rideshare app set up",
    "Refillable water bottle",
  ].map(makeChecklistItem),
  reservations: [
    makeReservation("restaurants", "Gordon Ramsay Hell's Kitchen"),
    makeReservation("restaurants", "Joël Robuchon"),
    makeReservation("restaurants", "Carbone"),
    makeReservation("restaurants", "e by José Andrés"),
    makeReservation("shows", "Cirque du Soleil — O"),
    makeReservation("shows", "Absinthe"),
    makeReservation("shows", "David Copperfield"),
    makeReservation("tours", "Grand Canyon day tour"),
    makeReservation("spas", "Qua Baths & Spa (Caesars Palace)"),
    makeReservation("spas", "Sahra Spa (Wynn)"),
    makeReservation("nightclubs", "Omnia (Caesars Palace)"),
    makeReservation("nightclubs", "Hakkasan (MGM Grand)"),
    makeReservation("nightclubs", "XS (Wynn)"),
  ],
  bankroll: { starting: 0, gamblingBudget: 0, entries: [] },
  outfits: [],
  people: [],
  expenses: [],
  polls: [],
  weather: { fetchedAt: "", days: [] },
};

function makeChecklistItem(text) {
  return { id: crypto.randomUUID(), text, checked: false };
}

function makeReservation(category, name) {
  return {
    id: crypto.randomUUID(),
    category,
    name,
    date: "",
    time: "",
    conf: "",
    address: "",
    phone: "",
    link: "",
    lat: null,
    lng: null,
    rsvps: {},
    checked: false,
    updatedAt: new Date().toISOString(),
  };
}

// ---------- Load / migrate / save ----------
// Shared by localStorage-loaded data and server-loaded Vault data, so both
// paths always end up with the same well-formed shape.
function mergeWithDefaults(parsed) {
  if (!parsed || typeof parsed !== "object") return structuredClone(defaultData);

  // Migrate from v1 shape (lists.essentials / lists.restaurants etc, no categories)
  if (parsed.lists && !parsed.reservations) {
    const reservations = [];
    ["restaurants", "shows", "spas", "nightclubs"].forEach((cat) => {
      (parsed.lists[cat] || []).forEach((item) => {
        reservations.push({
          id: item.id || crypto.randomUUID(),
          category: cat,
          name: item.text,
          date: "",
          time: "",
          conf: "",
          checked: !!item.checked,
        });
      });
    });
    parsed = {
      tripName: parsed.tripName,
      tripDate: parsed.tripDate,
      hotel: parsed.hotel,
      essentials: parsed.lists.essentials,
      reservations,
    };
  }

  return {
    ...structuredClone(defaultData),
    ...parsed,
    hotel: { ...defaultData.hotel, ...(parsed.hotel || {}) },
    flights: {
      outbound: { ...defaultData.flights.outbound, ...((parsed.flights || {}).outbound || {}) },
      return: { ...defaultData.flights.return, ...((parsed.flights || {}).return || {}) },
    },
    essentials: parsed.essentials || structuredClone(defaultData.essentials),
    reservations: parsed.reservations || structuredClone(defaultData.reservations),
    bankroll: {
      ...defaultData.bankroll,
      ...(parsed.bankroll || {}),
      entries: (parsed.bankroll && parsed.bankroll.entries) || [],
    },
    outfits: parsed.outfits || [],
    people: parsed.people || [],
    expenses: parsed.expenses || [],
    polls: parsed.polls || [],
    spendingBudget: Number(parsed.spendingBudget) || 0,
    timezone: parsed.timezone || defaultData.timezone,
    weather: { ...defaultData.weather, ...(parsed.weather || {}) },
  };
}

// True once real (non-default) trip info exists, used for the "import your
// local data" prompt after signing in.
function hasMeaningfulData(s) {
  if (!s) return false;
  if (s.tripDate || s.tripName) return true;
  if (s.hotel && (s.hotel.name || s.hotel.checkIn || s.hotel.checkOut)) return true;
  if ((s.reservations || []).some((r) => r.date || r.conf)) return true;
  if ((s.outfits || []).length) return true;
  if ((s.people || []).length || (s.expenses || []).length || (s.polls || []).length) return true;
  if ((s.bankroll && s.bankroll.entries || []).length) return true;
  if (s.bankroll && Number(s.bankroll.gamblingBudget) > 0) return true;
  if (Number(s.spendingBudget) > 0) return true;
  return false;
}

function loadLocalData() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return structuredClone(defaultData);
  }
  if (!raw) return structuredClone(defaultData);
  try {
    return mergeWithDefaults(JSON.parse(raw));
  } catch (e) {
    console.warn("Failed to parse saved data, starting fresh.", e);
    return structuredClone(defaultData);
  }
}

let serverSyncTimer = null;
let knownVersion = null;
let billingConfig = { paymentsEnabled: false, price: "7.99", priceLabel: "$7.99", currency: "usd" };
let affiliateConfig = {};
let currentVaultUnlocked = true;
let currentVaultRole = "";
let groupSyncBlocked = false;
let lastSyncedSnapshot = null;
let syncInFlight = false;
let syncQueued = false;
let syncFailures = 0;
const SYNC_META_KEY = "vegasVaultSyncMeta";

function setSyncStatus(mode, text) {
  const el = document.getElementById("syncPill");
  if (!el) return;
  el.className = `sync-pill ${mode}`;
  el.textContent = text;
  const note = document.getElementById("footerSaveNote");
  if (note) note.textContent = text;
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Could not save locally", e);
  }
  renderBudgetBanner();
  if (!currentVaultId) {
    setSyncStatus("ok", "Saved on this device");
    return;
  }
  if (!navigator.onLine) {
    setSyncStatus("pending", "Offline — will sync");
    rememberOutbox();
    queueBackgroundSync();
    return;
  }
  setSyncStatus("pending", "Saving…");
  clearTimeout(serverSyncTimer);
  serverSyncTimer = setTimeout(syncStateToServer, 800);
}

function openOutbox() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("vegas-vault", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("outbox")) {
        request.result.createObjectStore("outbox", { keyPath: "vaultId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function outboxRecord() {
  return {
    vaultId: currentVaultId,
    state,
    baseVersion: knownVersion,
    baseSnapshot: lastSyncedSnapshot,
    updatedAt: new Date().toISOString(),
  };
}

async function rememberOutbox() {
  if (!currentVaultId) return;
  const record = outboxRecord();
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(record));
  } catch (e) {
    console.warn("Could not queue sync in local storage", e);
  }
  try {
    const db = await openOutbox();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("outbox", "readwrite");
      tx.objectStore("outbox").put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn("Could not queue sync in IndexedDB", e);
  }
}

async function readOutbox(vaultId) {
  try {
    const db = await openOutbox();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction("outbox", "readonly");
      const request = tx.objectStore("outbox").get(vaultId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (record) return record;
  } catch (e) {
    console.warn("Could not read the sync queue", e);
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_META_KEY) || "null");
    if (parsed && parsed.vaultId === vaultId) return parsed;
  } catch (e) {
    return null;
  }
  return null;
}

async function clearOutbox(vaultId) {
  try {
    const db = await openOutbox();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("outbox", "readwrite");
      tx.objectStore("outbox").delete(vaultId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn("Could not clear the sync queue", e);
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_META_KEY) || "null");
    if (parsed && parsed.vaultId === vaultId) localStorage.removeItem(SYNC_META_KEY);
  } catch (e) {
    localStorage.removeItem(SYNC_META_KEY);
  }
}

async function queueBackgroundSync() {
  try {
    const registration = await navigator.serviceWorker.ready;
    if (registration.sync) await registration.sync.register("vault-sync");
  } catch (e) {
    // Background Sync is optional. The online event and the retry timer still flush the queue.
  }
}

async function syncStateToServer() {
  if (!currentVaultId || groupSyncBlocked) return;
  if (!navigator.onLine) {
    setSyncStatus("pending", "Offline — will sync");
    await rememberOutbox();
    queueBackgroundSync();
    return;
  }
  if (knownVersion == null) {
    setSyncStatus("pending", "Waiting to load the shared Vault…");
    return;
  }
  if (syncInFlight) {
    syncQueued = true;
    return;
  }
  syncInFlight = true;
  setSyncStatus("pending", "Syncing…");
  let attempts = 0;
  try {
    let keepGoing = true;
    while (keepGoing && attempts < 4) {
      attempts += 1;
      keepGoing = false;
      syncQueued = false;
      await rememberOutbox();
      const res = await fetch(`/api/vault/${currentVaultId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, baseVersion: knownVersion }),
      });
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        const merged = window.VaultMerge.mergeVaultState(lastSyncedSnapshot || {}, state, data.state || {});
        state = mergeWithDefaults(merged);
        knownVersion = data.version;
        lastSyncedSnapshot = structuredClone(mergeWithDefaults(data.state || {}));
        populateAllFields();
        showToast("Someone else edited this Vault. Your changes were merged.");
        keepGoing = true;
        continue;
      }
      if (res.status === 402) {
        const data = await res.json().catch(() => ({}));
        currentVaultUnlocked = false;
        groupSyncBlocked = true;
        syncQueued = false;
        renderUnlockChrome();
        setSyncStatus("bad", "Group tools need a one-time unlock before this can sync.");
        showToast(data.error || unlockMessage());
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Sync failed (${res.status})`);
      }
      const data = await res.json();
      knownVersion = data.version;
      lastSyncedSnapshot = structuredClone(state);
      await clearOutbox(currentVaultId);
      syncFailures = 0;
      setSyncStatus("ok", "Saved");
      if (data.updatedAt) updateEditedLabel(data.updatedAt, currentUser && currentUser.email);
    }
    if (attempts >= 4 && syncInFlight) {
      setSyncStatus("bad", "Couldn't finish merging — will retry");
    }
  } catch (e) {
    syncFailures += 1;
    console.warn("Vault sync failed", e);
    await rememberOutbox();
    setSyncStatus(navigator.onLine ? "bad" : "pending", navigator.onLine ? "Couldn't sync — will retry" : "Offline — will sync");
    if (syncFailures === 1) showToast(e.message || "Couldn't sync. We'll retry when you're back online.");
    queueBackgroundSync();
  } finally {
    syncInFlight = false;
    if (syncQueued) syncStateToServer();
  }
}

let state = loadLocalData();

// Re-reads every field/list from `state` — used after loading a different
// Vault (login, vault switch, import) so the whole UI reflects it.
function populateAllFields() {
  tripDateInput.value = state.tripDate || "";
  tripNameInput.value = state.tripName || "";
  Object.entries(hotelFieldMap).forEach(([elId, key]) => {
    document.getElementById(elId).value = state.hotel[key] || "";
  });
  Object.entries(flightFieldMap).forEach(([elId, [leg, key]]) => {
    document.getElementById(elId).value = state.flights[leg][key] || "";
  });
  bankrollStartInput.value = state.bankroll.starting || 0;
  const gamblingBudgetInput = document.getElementById("gamblingBudget");
  if (gamblingBudgetInput) gamblingBudgetInput.value = state.bankroll.gamblingBudget || 0;
  const spendingBudgetInput = document.getElementById("spendingBudget");
  if (spendingBudgetInput) spendingBudgetInput.value = state.spendingBudget || 0;

  renderEssentials();
  renderReservations();
  renderBankroll();
  renderOutfits();
  renderItinerary();
  renderExpenses();
  renderPolls();
  renderFlightLinks();
  renderHotelLinks();
  renderMapIfVisible();
  updateCountdown();
  refreshDerived();
}

// ---------- Date / format helpers ----------
function todayStr() {
  const zone = (typeof state !== "undefined" && state && state.timezone) || "America/Los_Angeles";
  return window.VaultTime.todayStr(zone);
}

function formatDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateHuman(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d) return "";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTime12(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function categoryLabel(cat) {
  return (CATEGORY_META[cat] && CATEGORY_META[cat].label) || cat;
}

// ---------- Trip setup ----------
const tripDateInput = document.getElementById("tripDateInput");
const tripNameInput = document.getElementById("tripNameInput");

tripDateInput.value = state.tripDate || "";
tripNameInput.value = state.tripName || "";

tripDateInput.addEventListener("change", () => {
  state.tripDate = tripDateInput.value;
  saveData();
  updateCountdown();
  refreshDerived();
});
tripNameInput.addEventListener("input", () => {
  state.tripName = tripNameInput.value;
  saveData();
  updateCountdown();
});

// ---------- Countdown ----------
const els = {
  days: document.getElementById("days"),
  hours: document.getElementById("hours"),
  minutes: document.getElementById("minutes"),
  seconds: document.getElementById("seconds"),
  status: document.getElementById("countdownStatus"),
};

function getTripTargetMs() {
  const zone = state.timezone || "America/Los_Angeles";
  if (state.tripDate) {
    const [date, time] = String(state.tripDate).split("T");
    return window.VaultTime.zonedDateTimeToUtc(date, time || "00:00", zone);
  }
  if (state.hotel.checkIn) return window.VaultTime.zonedDateTimeToUtc(state.hotel.checkIn, "00:00", zone);
  return null;
}

function updateCountdown() {
  const target = getTripTargetMs();
  const name = state.tripName ? state.tripName : "your Vegas trip";

  if (target == null) {
    els.days.textContent = "00";
    els.hours.textContent = "00";
    els.minutes.textContent = "00";
    els.seconds.textContent = "00";
    els.status.textContent = "Set your trip date to start the countdown.";
    return;
  }

  const diff = target - Date.now();

  if (diff <= 0) {
    els.days.textContent = "00";
    els.hours.textContent = "00";
    els.minutes.textContent = "00";
    els.seconds.textContent = "00";
    els.status.textContent = `🎉 ${name} has arrived — enjoy Vegas!`;
    return;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  els.days.textContent = String(days).padStart(2, "0");
  els.hours.textContent = String(hours).padStart(2, "0");
  els.minutes.textContent = String(minutes).padStart(2, "0");
  els.seconds.textContent = String(seconds).padStart(2, "0");
  els.status.textContent = `Counting down to ${name} · Las Vegas time`;
}

setInterval(updateCountdown, 1000);

// ---------- Hype banner / tonight / tip ----------
function computeTripPhase() {
  const today = todayStr();
  const { checkIn, checkOut } = state.hotel;
  if (checkIn && checkOut) {
    if (today < checkIn) return "before";
    if (today > checkOut) return "after";
    return "during";
  }
  if (state.tripDate) {
    const tripDateOnly = state.tripDate.slice(0, 10);
    if (today < tripDateOnly) return "before";
    if (today > tripDateOnly) return "after";
    return "during";
  }
  return "unknown";
}

function getDaysLeft() {
  const target = getTripTargetMs();
  if (target == null) return null;
  return (target - Date.now()) / (1000 * 60 * 60 * 24);
}

function renderHypeBanner() {
  const banner = document.getElementById("hypeBanner");
  const phase = computeTripPhase();
  const daysLeft = getDaysLeft();

  let level = "low";
  let msg = "";

  if (phase === "unknown") {
    msg = "Set your trip date to start building the hype 🎲";
  } else if (phase === "during") {
    level = "live";
    msg = "🌴 You're in Vegas right now — go make it legendary!";
  } else if (phase === "after") {
    msg = "✅ Trip complete. Hope Vegas treated you right — check your itinerary to relive it.";
  } else if (daysLeft !== null) {
    if (daysLeft <= 0) { level = "high"; msg = "🎉 TODAY'S THE DAY — Vegas, baby!"; }
    else if (daysLeft <= 1) { level = "high"; msg = "⚡ Less than 24 hours! Time to double-check that packing list."; }
    else if (daysLeft <= 7) { level = "high"; msg = `🔥 Trip week! Only ${Math.ceil(daysLeft)} days left.`; }
    else if (daysLeft <= 30) { level = "mid"; msg = `🎲 Trip month! ${Math.ceil(daysLeft)} days to go.`; }
    else { msg = `📅 ${Math.ceil(daysLeft)} days until Vegas.`; }
  }

  banner.textContent = msg;
  banner.className = `hype-banner level-${level}`;
}

function tonightItemHtml(r) {
  const when = r.date ? formatDateHuman(r.date) : "";
  const time = r.time ? formatTime12(r.time) : "";
  const metaParts = [categoryLabel(r.category)];
  if (when) metaParts.push(when);
  if (time) metaParts.push(time);
  return `<div class="tonight-item">
    <span>${escapeHtml(r.name)}</span>
    <span class="cat-tag">${escapeHtml(metaParts.join(" · "))}</span>
  </div>`;
}

function renderTonight() {
  const titleEl = document.getElementById("tonightTitle");
  const bodyEl = document.getElementById("tonightBody");
  const phase = computeTripPhase();
  const today = todayStr();

  if (phase === "during") {
    titleEl.textContent = "🌃 Tonight in Vegas";
    const todays = state.reservations
      .filter((r) => r.date === today)
      .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
    bodyEl.innerHTML = todays.length
      ? todays.map(tonightItemHtml).join("")
      : '<p class="hype-empty">Nothing booked for today — a blank slate. Go find trouble.</p>';
    return;
  }

  if (phase === "before") {
    titleEl.textContent = "🔮 Coming Up";
    const upcoming = state.reservations
      .filter((r) => r.date && r.date >= today)
      .sort((a, b) => (a.date + (a.time || "99:99")).localeCompare(b.date + (b.time || "99:99")))
      .slice(0, 3);
    bodyEl.innerHTML = upcoming.length
      ? upcoming.map(tonightItemHtml).join("")
      : '<p class="hype-empty">No dated reservations yet — add some so we can preview your trip here.</p>';
    return;
  }

  if (phase === "after") {
    titleEl.textContent = "✅ Trip Complete";
    const doneCount = state.reservations.filter((r) => r.checked).length;
    bodyEl.innerHTML = `<p>You checked off ${doneCount} of ${state.reservations.length} planned reservations. Hope it was legendary.</p>`;
    return;
  }

  titleEl.textContent = "🌃 Tonight in Vegas";
  bodyEl.innerHTML = '<p class="hype-empty">Set your hotel dates (or trip date) to see a preview here.</p>';
}

function renderTipOfDay() {
  const d = new Date();
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  document.getElementById("tipBody").textContent = VEGAS_TIPS[dayOfYear % VEGAS_TIPS.length];
}

function refreshDerived() {
  renderHypeBanner();
  renderTonight();
  renderBudgetBanner();
}

// ---------- Tabs ----------
const tabButtons = document.querySelectorAll(".tab-btn");
const panels = document.querySelectorAll(".panel");
let currentCategory = "restaurants";

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    panels.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");

    if (btn.dataset.category) {
      currentCategory = btn.dataset.category;
      document.getElementById("panel-reservations").classList.add("active");
      renderReservations();
    } else {
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
      if (btn.dataset.tab === "itinerary") renderItinerary();
      if (btn.dataset.tab === "weather") fetchWeather();
      if (btn.dataset.tab === "map") renderMap();
      if (btn.dataset.tab === "expenses") renderExpenses();
      if (btn.dataset.tab === "polls") renderPolls();
      if (btn.dataset.tab === "account") loadMembers();
    }
  });
});

// ---------- Hotel ----------
const hotelFieldMap = {
  hotelName: "name", hotelConf: "conf", hotelCheckIn: "checkIn",
  hotelCheckOut: "checkOut", hotelRoom: "room", hotelNotes: "notes",
  hotelAddress: "address", hotelPhone: "phone",
};
Object.entries(hotelFieldMap).forEach(([elId, key]) => {
  const el = document.getElementById(elId);
  el.value = state.hotel[key] || "";
  el.addEventListener("input", () => {
    state.hotel[key] = el.value;
    saveData();
    updateCountdown();
    refreshDerived();
    renderItinerary();
    renderHotelLinks();
  });
});

// ---------- Flights ----------
const flightFieldMap = {
  outAirline: ["outbound", "airline"], outFlightNum: ["outbound", "flightNum"],
  outDate: ["outbound", "date"], outDepTime: ["outbound", "depTime"],
  outArrTime: ["outbound", "arrTime"], outFrom: ["outbound", "from"],
  outTo: ["outbound", "to"], outConf: ["outbound", "conf"],
  retAirline: ["return", "airline"], retFlightNum: ["return", "flightNum"],
  retDate: ["return", "date"], retDepTime: ["return", "depTime"],
  retArrTime: ["return", "arrTime"], retFrom: ["return", "from"],
  retTo: ["return", "to"], retConf: ["return", "conf"],
};
Object.entries(flightFieldMap).forEach(([elId, [leg, key]]) => {
  const el = document.getElementById(elId);
  el.value = state.flights[leg][key] || "";
  el.addEventListener("input", () => {
    state.flights[leg][key] = el.value;
    saveData();
    renderItinerary();
    renderFlightLinks();
  });
});

// ---------- Essentials ----------
function renderEssentials() {
  const container = document.getElementById("essentialsList");
  container.innerHTML = "";
  state.essentials.forEach((item) => {
    const li = document.createElement("li");
    li.className = item.checked ? "checked" : "";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.checked;
    checkbox.addEventListener("change", () => {
      item.checked = checkbox.checked;
      item.updatedAt = new Date().toISOString();
      saveData();
      renderEssentials();
    });

    const span = document.createElement("span");
    span.className = "item-text";
    span.textContent = item.text;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.type = "button";
    removeBtn.textContent = "✕";
    removeBtn.setAttribute("aria-label", `Remove ${item.text}`);
    removeBtn.addEventListener("click", () => {
      removeWithUndo(item.text || "item", () => {
        state.essentials = state.essentials.filter((entry) => entry.id !== item.id);
      }, renderEssentials);
    });

    li.appendChild(checkbox);
    li.appendChild(span);
    li.appendChild(removeBtn);
    container.appendChild(li);
  });
}

const essentialsInput = document.getElementById("essentialsInput");
function addEssential() {
  const trimmed = essentialsInput.value.trim();
  if (!trimmed) return;
  state.essentials.push(makeChecklistItem(trimmed));
  saveData();
  renderEssentials();
  essentialsInput.value = "";
}
document.getElementById("essentialsAdd").addEventListener("click", addEssential);
essentialsInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addEssential(); });

// ---------- Reservations (restaurants / shows / spas / nightclubs / pool) ----------
function renderReservations() {
  const meta = CATEGORY_META[currentCategory];
  document.getElementById("resTitle").textContent = meta.label;
  document.getElementById("resHint").textContent = meta.hint;

  const container = document.getElementById("resList");
  container.innerHTML = "";

  const items = state.reservations
    .filter((r) => r.category === currentCategory)
    .slice()
    .sort((a, b) => ((a.date || "9999") + (a.time || "99:99")).localeCompare((b.date || "9999") + (b.time || "99:99")));

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "hype-empty";
    empty.textContent = "Nothing here yet.";
    const addFirst = document.createElement("button");
    addFirst.type = "button";
    addFirst.className = "empty-add";
    addFirst.textContent = "+ Add first reservation";
    addFirst.addEventListener("click", () => document.getElementById("resNameInput").focus());
    container.appendChild(empty);
    container.appendChild(addFirst);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = item.checked ? "checked" : "";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.checked;
    checkbox.setAttribute("aria-label", `Mark ${item.name} done`);
    checkbox.addEventListener("change", () => {
      item.checked = checkbox.checked;
      item.updatedAt = new Date().toISOString();
      saveData();
      renderReservations();
      refreshDerived();
    });

    const body = document.createElement("div");
    body.className = "item-body";
    const nameSpan = document.createElement("span");
    nameSpan.className = "item-text";
    nameSpan.textContent = item.name;
    body.appendChild(nameSpan);

    const metaParts = [];
    if (item.date) metaParts.push(formatDateHuman(item.date));
    if (item.time) metaParts.push(`${formatTime12(item.time)} PT`);
    if (item.conf) metaParts.push(`Conf# ${item.conf}`);
    if (item.address) metaParts.push(item.address);
    if (metaParts.length) {
      const metaSpan = document.createElement("span");
      metaSpan.className = "item-meta";
      metaSpan.textContent = metaParts.join(" · ");
      body.appendChild(metaSpan);
    }

    const links = document.createElement("div");
    links.className = "link-row";
    const suggestion = window.VegasAffiliates && window.VegasAffiliates.bookSuggestion(item.category);
    if (suggestion) {
      const hint = document.createElement("span");
      hint.className = "book-suggest";
      hint.textContent = suggestion;
      links.appendChild(hint);
    }
    bookingLinks(item).forEach((link) => links.appendChild(makeExternalLink(link.href, link.label)));
    if (item.phone) links.appendChild(makeExternalLink(`tel:${item.phone.replace(/[^\d+]/g, "")}`, "Call"));
    if (links.childNodes.length) body.appendChild(links);

    const actions = document.createElement("div");
    actions.className = "item-actions";
    const calendarBtn = document.createElement("button");
    calendarBtn.type = "button";
    calendarBtn.textContent = "Add to calendar";
    calendarBtn.addEventListener("click", () => downloadReservationIcs(item));
    actions.appendChild(calendarBtn);
    ["yes", "maybe", "no"].forEach((choice) => {
      const labels = { yes: "I'm in", maybe: "Maybe", no: "Can't" };
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = labels[choice];
      const mine = displayName();
      button.setAttribute("aria-pressed", String(item.rsvps && item.rsvps[mine] === choice));
      button.addEventListener("click", () => setRsvp(item, choice));
      actions.appendChild(button);
    });
    body.appendChild(actions);
    const rsvpLine = document.createElement("span");
    rsvpLine.className = "item-meta";
    rsvpLine.textContent = rsvpSummary(item);
    body.appendChild(rsvpLine);

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.type = "button";
    removeBtn.textContent = "✕";
    removeBtn.setAttribute("aria-label", `Remove ${item.name}`);
    removeBtn.addEventListener("click", () => {
      removeWithUndo(item.name || "reservation", () => {
        state.reservations = state.reservations.filter((reservation) => reservation.id !== item.id);
      }, () => {
        renderReservations();
        refreshDerived();
        renderItinerary();
      });
    });

    li.appendChild(checkbox);
    li.appendChild(body);
    li.appendChild(removeBtn);
    container.appendChild(li);
  });
}

const resNameInput = document.getElementById("resNameInput");
const resDateInput = document.getElementById("resDateInput");
const resTimeInput = document.getElementById("resTimeInput");
const resConfInput = document.getElementById("resConfInput");

function addReservation() {
  const name = resNameInput.value.trim();
  if (!name) return;
  state.reservations.push({
    id: crypto.randomUUID(),
    category: currentCategory,
    name,
    date: resDateInput.value,
    time: resTimeInput.value,
    conf: resConfInput.value.trim(),
    address: document.getElementById("resAddressInput").value.trim(),
    phone: document.getElementById("resPhoneInput").value.trim(),
    link: document.getElementById("resLinkInput").value.trim(),
    lat: null,
    lng: null,
    rsvps: {},
    checked: false,
    updatedAt: new Date().toISOString(),
  });
  saveData();
  renderReservations();
  refreshDerived();
  renderItinerary();
  resNameInput.value = "";
  resDateInput.value = "";
  resTimeInput.value = "";
  resConfInput.value = "";
  document.getElementById("resAddressInput").value = "";
  document.getElementById("resPhoneInput").value = "";
  document.getElementById("resLinkInput").value = "";
}
document.getElementById("resAdd").addEventListener("click", addReservation);
resNameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addReservation(); });

// ---------- Bankroll ----------
const bankrollStartInput = document.getElementById("bankrollStart");
bankrollStartInput.value = state.bankroll.starting || 0;
bankrollStartInput.addEventListener("input", () => {
  state.bankroll.starting = Number(bankrollStartInput.value) || 0;
  saveData();
  renderBankroll();
});
document.getElementById("gamblingBudget").addEventListener("input", () => {
  state.bankroll.gamblingBudget = Number(document.getElementById("gamblingBudget").value) || 0;
  saveData();
  renderBankroll();
});

function renderBankroll() {
  const sum = state.bankroll.entries.reduce((s, e) => s + e.amount, 0);
  const total = (Number(state.bankroll.starting) || 0) + sum;
  const totalEl = document.getElementById("bankrollTotal");
  totalEl.textContent = `Current bankroll: $${total.toFixed(0)} (${sum >= 0 ? "+" : ""}${sum.toFixed(0)} so far)`;
  totalEl.className = `bankroll-total ${sum >= 0 ? "positive" : "negative"}`;
  const budgetNote = document.getElementById("gamblingBudgetStatus");
  const cap = Number(state.bankroll.gamblingBudget) || 0;
  const losses = Math.max(0, -sum);
  if (budgetNote) {
    budgetNote.textContent = cap > 0
      ? `Losses $${losses.toFixed(0)} of $${cap.toFixed(0)} budget (${Math.min(100, Math.round((losses / cap) * 100))}%). Alert at 80%.`
      : "Set a gambling budget cap to get an alert at 80%.";
  }

  const container = document.getElementById("bankrollList");
  container.innerHTML = "";
  const entries = state.bankroll.entries
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  entries.forEach((entry) => {
    const li = document.createElement("li");

    const body = document.createElement("div");
    body.className = "item-body";
    const nameSpan = document.createElement("span");
    nameSpan.className = "item-text";
    nameSpan.textContent = entry.label || "Session";
    body.appendChild(nameSpan);
    if (entry.date) {
      const metaSpan = document.createElement("span");
      metaSpan.className = "item-meta";
      metaSpan.textContent = formatDateHuman(entry.date);
      body.appendChild(metaSpan);
    }

    const amountSpan = document.createElement("span");
    amountSpan.className = `amount ${entry.amount >= 0 ? "positive" : "negative"}`;
    amountSpan.textContent = `${entry.amount >= 0 ? "+" : ""}$${entry.amount}`;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.type = "button";
    removeBtn.textContent = "✕";
    removeBtn.setAttribute("aria-label", `Remove ${entry.label || "bankroll entry"}`);
    removeBtn.addEventListener("click", () => {
      removeWithUndo(entry.label || "bankroll entry", () => {
        state.bankroll.entries = state.bankroll.entries.filter((row) => row.id !== entry.id);
      }, renderBankroll);
    });

    li.appendChild(body);
    li.appendChild(amountSpan);
    li.appendChild(removeBtn);
    container.appendChild(li);
  });
}

document.getElementById("bankrollAdd").addEventListener("click", () => {
  const amount = Number(document.getElementById("bankrollAmount").value);
  if (Number.isNaN(amount) || amount === 0) return;
  state.bankroll.entries.push({
    id: crypto.randomUUID(),
    date: document.getElementById("bankrollDate").value,
    label: document.getElementById("bankrollLabel").value.trim(),
    amount,
  });
  saveData();
  renderBankroll();
  document.getElementById("bankrollLabel").value = "";
  document.getElementById("bankrollAmount").value = "";
});

// ---------- Outfits ----------
function renderOutfits() {
  const container = document.getElementById("outfitsList");
  container.innerHTML = "";
  const outfits = state.outfits.slice().sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));

  outfits.forEach((outfit) => {
    const li = document.createElement("li");

    const body = document.createElement("div");
    body.className = "item-body";
    const nameSpan = document.createElement("span");
    nameSpan.className = "item-text";
    nameSpan.textContent = outfit.label || outfit.description || "Outfit";
    body.appendChild(nameSpan);
    const metaParts = [];
    if (outfit.date) metaParts.push(formatDateHuman(outfit.date));
    if (outfit.label && outfit.description) metaParts.push(outfit.description);
    if (metaParts.length) {
      const metaSpan = document.createElement("span");
      metaSpan.className = "item-meta";
      metaSpan.textContent = metaParts.join(" · ");
      body.appendChild(metaSpan);
    }

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.type = "button";
    removeBtn.textContent = "✕";
    removeBtn.setAttribute("aria-label", `Remove ${outfit.label || "outfit"}`);
    removeBtn.addEventListener("click", () => {
      removeWithUndo(outfit.label || "outfit", () => {
        state.outfits = state.outfits.filter((row) => row.id !== outfit.id);
      }, () => {
        renderOutfits();
        renderItinerary();
      });
    });

    li.appendChild(body);
    li.appendChild(removeBtn);
    container.appendChild(li);
  });
}

document.getElementById("outfitAdd").addEventListener("click", () => {
  const label = document.getElementById("outfitLabel").value.trim();
  const description = document.getElementById("outfitDesc").value.trim();
  if (!label && !description) return;
  state.outfits.push({
    id: crypto.randomUUID(),
    date: document.getElementById("outfitDate").value,
    label,
    description,
  });
  saveData();
  renderOutfits();
  renderItinerary();
  document.getElementById("outfitLabel").value = "";
  document.getElementById("outfitDesc").value = "";
});

// ---------- Itinerary (computed) ----------
function getAllRelevantDates() {
  const dates = new Set();
  if (state.hotel.checkIn) dates.add(state.hotel.checkIn);
  if (state.hotel.checkOut) dates.add(state.hotel.checkOut);
  if (state.flights.outbound.date) dates.add(state.flights.outbound.date);
  if (state.flights.return.date) dates.add(state.flights.return.date);
  state.reservations.forEach((r) => r.date && dates.add(r.date));
  state.outfits.forEach((o) => o.date && dates.add(o.date));
  return dates;
}

function renderItineraryDay(dateKey) {
  const events = [];
  if (state.hotel.checkIn === dateKey) events.push(`🏨 Check in to ${state.hotel.name || "your hotel"}`);
  if (state.hotel.checkOut === dateKey) events.push(`🏨 Check out of ${state.hotel.name || "your hotel"}`);

  const out = state.flights.outbound;
  if (out.date === dateKey) {
    events.push(`✈️ Outbound flight ${[out.airline, out.flightNum].filter(Boolean).join(" ")}${out.depTime ? ` at ${formatTime12(out.depTime)}` : ""}`.trim());
  }
  const ret = state.flights.return;
  if (ret.date === dateKey) {
    events.push(`✈️ Return flight ${[ret.airline, ret.flightNum].filter(Boolean).join(" ")}${ret.depTime ? ` at ${formatTime12(ret.depTime)}` : ""}`.trim());
  }

  state.reservations
    .filter((r) => r.date === dateKey)
    .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"))
    .forEach((r) => {
      events.push(`${categoryLabel(r.category)}: ${r.name}${r.time ? " at " + formatTime12(r.time) : ""}`);
    });

  const outfit = state.outfits.find((o) => o.date === dateKey);
  if (outfit) events.push(`👗 ${[outfit.label, outfit.description].filter(Boolean).join(": ")}`);

  if (events.length === 0) events.push("Nothing planned yet.");

  return `<div class="itinerary-day">
    <h4>${formatDateHuman(dateKey)}</h4>
    <ul>${events.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
  </div>`;
}

function renderItinerary() {
  const body = document.getElementById("itineraryBody");
  let start = state.hotel.checkIn;
  let end = state.hotel.checkOut;

  if (!start || !end) {
    const dates = Array.from(getAllRelevantDates()).sort();
    if (dates.length === 0) {
      body.innerHTML = '<p class="hype-empty">Add your hotel check-in/out dates (or a flight/reservation date) to build your itinerary.</p>';
      return;
    }
    start = start || dates[0];
    end = end || dates[dates.length - 1];
  }

  const startD = parseLocalDate(start);
  const endD = parseLocalDate(end);
  if (!startD || !endD || startD > endD) {
    body.innerHTML = '<p class="hype-empty">Check that your hotel check-in date is before check-out.</p>';
    return;
  }

  const days = [];
  for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
    days.push(formatDateKey(d));
  }

  body.innerHTML = days.map(renderItineraryDay).join("");
}

// ---------- Weather ----------
function weatherIcon(code) {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "🌨️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌡️";
}

function renderWeather() {
  const updatedEl = document.getElementById("weatherUpdated");
  const container = document.getElementById("weatherBody");
  if (!state.weather.days.length) {
    container.innerHTML = '<p class="hype-empty">No forecast loaded yet — click refresh.</p>';
    return;
  }
  updatedEl.textContent = `Updated ${formatDateHuman(state.weather.fetchedAt)} · Las Vegas, NV`;
  const today = todayStr();
  container.innerHTML = "";
  state.weather.days.forEach((day) => {
    const card = document.createElement("div");
    card.className = `weather-card${day.date === today ? " today" : ""}`;
    const date = document.createElement("div");
    date.className = "wc-date";
    date.textContent = formatDateHuman(day.date);
    const icon = document.createElement("div");
    icon.className = "wc-icon";
    icon.textContent = weatherIcon(Number(day.code));
    const temps = document.createElement("div");
    temps.className = "wc-temps";
    const hi = document.createElement("span");
    hi.className = "wc-hi";
    hi.textContent = `${Number(day.hi)}°`;
    const lo = document.createElement("span");
    lo.className = "wc-lo";
    lo.textContent = `${Number(day.lo)}°`;
    temps.append(hi, document.createTextNode(" / "), lo);
    card.append(date, icon, temps);
    container.appendChild(card);
  });
}

async function fetchWeather(force = false) {
  const updatedEl = document.getElementById("weatherUpdated");
  const today = todayStr();

  if (!force && state.weather.fetchedAt === today && state.weather.days.length) {
    renderWeather();
    return;
  }

  updatedEl.textContent = "Loading forecast...";
  try {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=36.17&longitude=-115.14&daily=temperature_2m_max,temperature_2m_min,weathercode&temperature_unit=fahrenheit&timezone=America%2FLos_Angeles&forecast_days=16";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Weather request failed");
    const json = await res.json();
    const days = json.daily.time.map((date, i) => ({
      date,
      hi: Math.round(json.daily.temperature_2m_max[i]),
      lo: Math.round(json.daily.temperature_2m_min[i]),
      code: json.daily.weathercode[i],
    }));
    state.weather = { fetchedAt: today, days };
    saveData();
    renderWeather();
  } catch (e) {
    console.warn("Weather fetch failed", e);
    if (state.weather.days.length) {
      renderWeather();
      updatedEl.textContent += " (showing last saved forecast — refresh failed)";
    } else {
      updatedEl.textContent = "Couldn't load forecast — check your connection and try again.";
    }
  }
}

document.getElementById("weatherRefresh").addEventListener("click", () => fetchWeather(true));

// ---------- PWA install + push notifications ----------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker registration failed", e));
}

const PUSH_FLAG_KEY = "vegasVaultPushSubscribed";
let pushSubscribed = localStorage.getItem(PUSH_FLAG_KEY) === "1";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function updateNotifyButton() {
  const btn = document.getElementById("notifyBtn");
  const status = document.getElementById("notifyStatus");
  if (!btn) return;
  btn.textContent = pushSubscribed ? "🔕 Disable daily notifications" : "🔔 Enable daily notifications";
  btn.classList.toggle("subscribed", pushSubscribed);
  if (status) {
    status.textContent = pushSubscribed
      ? "You'll get one push per day with your countdown + tonight's plans."
      : "";
  }
}

async function subscribeToPush() {
  if (!currentUser) {
    alert("Sign in first (Account tab) so we know which Vault to notify you about.");
    return;
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    alert("This browser doesn't support push notifications.");
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const keyRes = await fetch("/api/vapid-public-key");
    const { publicKey } = await keyRes.json();
    if (!publicKey) {
      alert(
        "Push notifications aren't set up on this server yet. Generate VAPID keys and set them in .env (see README)."
      );
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Subscribe request failed");
    }

    pushSubscribed = true;
    localStorage.setItem(PUSH_FLAG_KEY, "1");
    updateNotifyButton();
  } catch (e) {
    console.warn("Push subscription failed", e);
    alert("Could not enable notifications — see the browser console for details.");
  }
}

async function unsubscribeFromPush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
  } catch (e) {
    console.warn("Push unsubscribe failed", e);
  }
  pushSubscribed = false;
  localStorage.setItem(PUSH_FLAG_KEY, "0");
  updateNotifyButton();
}

const notifyBtn = document.getElementById("notifyBtn");
if (notifyBtn) {
  notifyBtn.addEventListener("click", () => {
    if (pushSubscribed) unsubscribeFromPush();
    else subscribeToPush();
  });
}
updateNotifyButton();

// ---------- Account (signup / login / shared Vaults) ----------
let currentUser = null; // { id, email } | null
let currentVaultId = null;
let currentVaults = []; // [{ id, name, role }]
let authMode = "signup";
let pendingImportSnapshot = null;
const pendingInviteToken = new URLSearchParams(location.search).get("invite");

const loggedOutView = document.getElementById("loggedOutView");
const loggedInView = document.getElementById("loggedInView");
const authForm = document.getElementById("authForm");
const authEmailInput = document.getElementById("authEmail");
const authPasswordInput = document.getElementById("authPassword");
const authError = document.getElementById("authError");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authToggleBtn = document.getElementById("authToggleBtn");
const vaultSwitcherWrap = document.getElementById("vaultSwitcherWrap");
const vaultSwitcher = document.getElementById("vaultSwitcher");
const importBanner = document.getElementById("importBanner");
const inviteBanner = document.getElementById("inviteBanner");

function renderAccountBar() {
  const bar = document.getElementById("accountBar");
  if (!currentUser) {
    bar.textContent = "Not signed in — this trip is only saved on this device.";
    return;
  }
  const vault = currentVaults.find((v) => v.id === currentVaultId);
  const vaultName = vault ? vault.name : "your Vault";
  bar.innerHTML = `Signed in as <strong>${escapeHtml(currentUser.email)}</strong> · syncing "${escapeHtml(vaultName)}"`;
}

function renderAccountView() {
  loggedOutView.hidden = !!currentUser;
  loggedInView.hidden = !currentUser;

  if (currentUser) {
    document.getElementById("accountEmail").textContent = currentUser.email;
    vaultSwitcherWrap.hidden = currentVaults.length < 2;
    vaultSwitcher.innerHTML = "";
    currentVaults.forEach((vault) => {
      const option = document.createElement("option");
      option.value = vault.id;
      option.textContent = `${vault.name} (${vault.role})`;
      option.selected = vault.id === currentVaultId;
      vaultSwitcher.appendChild(option);
    });
    document.getElementById("inviteLinkWrap").hidden = true;
    document.getElementById("displayNameInput").value = localStorage.getItem(DISPLAY_NAME_KEY) || "";
    document.getElementById("passwordUsername").value = currentUser.email;
    loadMembers();
  } else {
    authSubmitBtn.textContent = authMode === "signup" ? "Sign up" : "Log in";
    authToggleBtn.textContent =
      authMode === "signup" ? "Already have an account? Log in" : "New here? Sign up";
  }
  renderAccountBar();
  renderUnlockChrome();
}

function setAccountFromMeResponse(data) {
  currentUser = data.user;
  currentVaults = data.vaults || [];
  currentVaultId = data.activeVaultId || null;
}

async function loadActiveVaultFromServer() {
  if (!currentVaultId) return;
  try {
    const res = await fetch(`/api/vault/${currentVaultId}`);
    if (!res.ok) throw new Error("Failed to load Vault");
    const data = await res.json();
    knownVersion = data.version;
    currentVaultUnlocked = Boolean(data.groupUnlocked);
    currentVaultRole = data.role || currentVaultRole;
    if (currentVaultUnlocked) groupSyncBlocked = false;
    const serverState = mergeWithDefaults(data.state);
    lastSyncedSnapshot = structuredClone(serverState);
    updateEditedLabel(data.updatedAt, data.updatedByEmail);

    if (!hasMeaningfulData(serverState) && hasMeaningfulData(pendingImportSnapshot)) {
      importBanner.hidden = false;
    } else {
      importBanner.hidden = true;
      pendingImportSnapshot = null;
    }

    const pending = await readOutbox(currentVaultId);
    if (pending && pending.state) {
      state = mergeWithDefaults(window.VaultMerge.mergeVaultState(pending.baseSnapshot || serverState, pending.state, serverState));
      populateAllFields();
      syncStateToServer();
    } else {
      state = serverState;
      populateAllFields();
      setSyncStatus("ok", "Saved");
    }
  } catch (e) {
    console.warn("Failed to load Vault from server", e);
    setSyncStatus("bad", "Couldn't load the shared Vault — showing this device's copy");
  }
}

async function refreshMe() {
  try {
    const res = await fetch("/api/me");
    const data = await res.json();
    if (data.user) {
      setAccountFromMeResponse(data);
      await loadActiveVaultFromServer();
    }
  } catch (e) {
    console.warn("Failed to check sign-in state", e);
  }
  renderAccountView();
  await maybeShowInviteBanner();
}

authToggleBtn.addEventListener("click", () => {
  authMode = authMode === "signup" ? "login" : "signup";
  authError.textContent = "";
  renderAccountView();
});

async function handleAuthSubmit() {
  authError.textContent = "";
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  const endpoint = authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      authError.textContent = data.error || "Something went wrong.";
      return;
    }
    if (!data.user) {
      authError.textContent = data.message || "If you already have an account, log in with your password.";
      authMode = "login";
      renderAccountView();
      return;
    }

    pendingImportSnapshot = hasMeaningfulData(state) ? structuredClone(state) : null;
    setAccountFromMeResponse(data);
    await loadActiveVaultFromServer();
    renderAccountView();
    await maybeShowInviteBanner();
    authPasswordInput.value = "";
  } catch (e) {
    authError.textContent = "Couldn't reach the server. Is it running?";
  }
}

authForm.addEventListener("submit", (e) => {
  e.preventDefault();
  handleAuthSubmit();
});
authSubmitBtn.addEventListener("click", handleAuthSubmit);

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch (e) {
    console.warn("Logout request failed", e);
  }
  currentUser = null;
  currentVaultId = null;
  currentVaults = [];
  currentVaultUnlocked = true;
  currentVaultRole = "";
  groupSyncBlocked = false;
  state = loadLocalData();
  populateAllFields();
  renderAccountView();
});

vaultSwitcher.addEventListener("change", async () => {
  const vaultId = vaultSwitcher.value;
  try {
    const res = await fetch("/api/me/active-vault", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vaultId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to switch Vault");
    setAccountFromMeResponse(data);
    await loadActiveVaultFromServer();
    renderAccountView();
  } catch (e) {
    alert("Could not switch Vaults — see console for details.");
    console.warn(e);
  }
});

document.getElementById("inviteBtn").addEventListener("click", async () => {
  if (!currentVaultId) return;
  if (groupPaywallOn()) {
    promptUnlock();
    return;
  }
  try {
    const res = await fetch(`/api/vault/${currentVaultId}/invite`, { method: "POST" });
    const data = await res.json();
    if (res.status === 402) {
      currentVaultUnlocked = false;
      promptUnlock(data.error);
      return;
    }
    if (!res.ok) throw new Error(data.error || "Failed to create invite");
    const wrap = document.getElementById("inviteLinkWrap");
    const input = document.getElementById("inviteLinkInput");
    input.value = `${location.origin}${data.path}`;
    wrap.hidden = false;
    input.select();
    loadInvites();
  } catch (e) {
    alert("Could not create an invite link — see console for details.");
    console.warn(e);
  }
});

document.getElementById("inviteCopyBtn").addEventListener("click", async () => {
  const input = document.getElementById("inviteLinkInput");
  input.select();
  try {
    await navigator.clipboard.writeText(input.value);
    showToast("Invite link copied.");
  } catch (e) {
    document.execCommand("copy");
  }
});

document.getElementById("inviteShareBtn").addEventListener("click", async () => {
  const url = document.getElementById("inviteLinkInput").value;
  if (!url) return;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Join my Vegas Vault", url });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast("Invite link copied.");
  } catch (err) {
    showToast("Copy the link from the box.");
  }
});

document.getElementById("importAcceptBtn").addEventListener("click", () => {
  if (!pendingImportSnapshot) return;
  state = pendingImportSnapshot;
  pendingImportSnapshot = null;
  saveData();
  populateAllFields();
  importBanner.hidden = true;
});

document.getElementById("importDismissBtn").addEventListener("click", () => {
  pendingImportSnapshot = null;
  importBanner.hidden = true;
});

// ---------- Invite acceptance (?invite=TOKEN in the URL) ----------
async function maybeShowInviteBanner() {
  if (!pendingInviteToken) return;
  try {
    const res = await fetch(`/api/invite/${pendingInviteToken}`);
    const data = await res.json();
    if (!res.ok) {
      inviteBanner.hidden = true;
      return;
    }
    document.getElementById("inviteBannerText").textContent = currentUser
      ? `You've been invited to join "${data.vaultName}".`
      : `You've been invited to join "${data.vaultName}". Sign up or log in below, then click Join.`;
    inviteBanner.hidden = false;
    tabButtons.forEach((b) => b.dataset.tab === "account" && b.click());
  } catch (e) {
    console.warn("Failed to look up invite", e);
  }
}

document.getElementById("inviteAcceptBtn").addEventListener("click", async () => {
  if (!currentUser) {
    alert("Sign up or log in first, then click Join again.");
    return;
  }
  try {
    const res = await fetch(`/api/invite/${pendingInviteToken}/accept`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to join Vault");
    setAccountFromMeResponse(data);
    await loadActiveVaultFromServer();
    renderAccountView();
    inviteBanner.hidden = true;
    history.replaceState(null, "", location.pathname);
  } catch (e) {
    alert(e.message || "Could not join that Vault.");
  }
});

document.getElementById("inviteDismissBtn").addEventListener("click", () => {
  inviteBanner.hidden = true;
  history.replaceState(null, "", location.pathname);
});

// ---------- Reset ----------
document.getElementById("resetBtn").addEventListener("click", async () => {
  if (!confirm("Reset all Vegas Vault data on this device? This can't be undone.")) return;
  if (pushSubscribed) await unsubscribeFromPush();
  localStorage.removeItem(STORAGE_KEY);
  if (currentUser) {
    state = structuredClone(defaultData);
    saveData();
    populateAllFields();
  } else {
    location.reload();
  }
});

// ---------- Shared helpers used by the newer tabs ----------
const DISPLAY_NAME_KEY = "vegasVaultDisplayName";
let toastTimer = null;
let mapInstance = null;
let mapMarkers = null;

function showToast(message, actionLabel, actionFn) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.hidden = false;
  toast.querySelector("[data-toast-msg]").textContent = message;
  const action = toast.querySelector("[data-toast-action]");
  action.hidden = !actionLabel;
  action.textContent = actionLabel || "Undo";
  action.onclick = () => {
    hideToast();
    if (actionFn) actionFn();
  };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, actionLabel ? 8000 : 4000);
}

function hideToast() {
  const toast = document.getElementById("toast");
  if (toast) toast.hidden = true;
}

function removeWithUndo(label, mutate, rerender) {
  const snapshot = structuredClone(state);
  mutate();
  saveData();
  if (rerender) rerender();
  showToast(`Removed ${label}.`, "Undo", () => {
    state = snapshot;
    saveData();
    populateAllFields();
  });
}

function displayName() {
  return (localStorage.getItem(DISPLAY_NAME_KEY) || "").trim();
}

function requireDisplayName() {
  const name = displayName();
  if (name) return name;
  showToast("Add your name first so the group can see your vote.");
  const input = document.getElementById("displayNameInput") || document.getElementById("pollNameInput");
  if (input) input.focus();
  return "";
}

function setDisplayName(value) {
  const name = String(value || "").trim().slice(0, 40);
  if (name) localStorage.setItem(DISPLAY_NAME_KEY, name);
  else localStorage.removeItem(DISPLAY_NAME_KEY);
  const accountInput = document.getElementById("displayNameInput");
  const pollInput = document.getElementById("pollNameInput");
  if (accountInput && accountInput.value !== name) accountInput.value = name;
  if (pollInput && pollInput.value !== name) pollInput.value = name;
}

function updateEditedLabel(updatedAt, email) {
  const el = document.getElementById("vaultEdited");
  if (!el) return;
  if (!updatedAt) {
    el.textContent = "";
    return;
  }
  const when = new Date(updatedAt);
  const stamp = Number.isNaN(when.getTime()) ? updatedAt : when.toLocaleString();
  el.textContent = email ? `Last saved ${stamp} by ${email}` : `Last saved ${stamp}`;
}

function safeHttpUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text, window.location.href);
    if (url.protocol === "https:" || url.protocol === "http:" || url.protocol === "tel:") return url.href;
  } catch (e) {
    return "";
  }
  return "";
}

function makeExternalLink(href, label) {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = label;
  if (!href.startsWith("tel:")) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  return link;
}

function bookingLinks(item) {
  const links = [];
  const own = safeHttpUrl(item.link || "");
  if (own && !own.startsWith("tel:")) links.push({ href: own, label: "Confirmation" });
  if (window.VegasAffiliates) {
    window.VegasAffiliates.linksForReservation(item, affiliateConfig).forEach((link) => links.push(link));
  }
  const query = encodeURIComponent(`${item.name || "Las Vegas"} Las Vegas`);
  links.push({ href: `https://www.google.com/search?q=${query}`, label: "Search" });
  return links;
}

function setRsvp(item, choice) {
  const name = requireDisplayName();
  if (!name) return;
  if (!item.rsvps) item.rsvps = {};
  item.rsvps[name] = item.rsvps[name] === choice ? "" : choice;
  if (!item.rsvps[name]) delete item.rsvps[name];
  item.updatedAt = new Date().toISOString();
  saveData();
  renderReservations();
}

function rsvpSummary(item) {
  const groups = { yes: [], maybe: [], no: [] };
  Object.entries(item.rsvps || {}).forEach(([name, choice]) => {
    if (groups[choice]) groups[choice].push(name);
  });
  const parts = [];
  if (groups.yes.length) parts.push(`In: ${groups.yes.join(", ")}`);
  if (groups.maybe.length) parts.push(`Maybe: ${groups.maybe.join(", ")}`);
  if (groups.no.length) parts.push(`Can't: ${groups.no.join(", ")}`);
  return parts.join(" · ") || "No RSVPs yet.";
}

const AIRLINES = [
  { test: /american|\baa\b/, icao: "AAL", url: "https://www.aa.com/travelInformation/flights/status" },
  { test: /delta|\bdl\b/, icao: "DAL", url: "https://www.delta.com/flight-status" },
  { test: /united|\bua\b/, icao: "UAL", url: "https://www.united.com/en/us/fly/flight-status.html" },
  { test: /southwest|\bwn\b/, icao: "SWA", url: "https://www.southwest.com/air/flight-status/" },
  { test: /jet\s*blue|\bb6\b/, icao: "JBU", url: "https://www.jetblue.com/flight-status" },
  { test: /alaska|\bas\b/, icao: "ASA", url: "https://www.alaskaair.com/flight-status" },
  { test: /spirit|\bnk\b/, icao: "NKS", url: "https://www.spirit.com/flight-status" },
  { test: /frontier|\bf9\b/, icao: "FFT", url: "https://www.flyfrontier.com/flight-status" },
  { test: /hawaiian|\bha\b/, icao: "HAL", url: "https://www.hawaiianairlines.com/flight-status" },
  { test: /allegiant|\bg4\b/, icao: "AAY", url: "https://www.allegiantair.com/flight-status" },
];

function flightIdent(leg) {
  const airline = String(leg.airline || "").trim().toLowerCase();
  const raw = String(leg.flightNum || "").trim().toUpperCase().replace(/\s+/g, "");
  const match = AIRLINES.find((item) => item.test.test(airline));
  const digits = raw.replace(/^[A-Z]+/, "");
  const ident = match && digits ? `${match.icao}${digits}` : raw;
  return { match, ident };
}

function renderFlightLinks() {
  renderOneFlightLinks("outFlightLinks", state.flights.outbound);
  renderOneFlightLinks("retFlightLinks", state.flights.return);
}

function renderOneFlightLinks(elementId, leg) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = "";
  if (!leg.airline && !leg.flightNum) return;
  const note = document.createElement("p");
  note.className = "panel-hint";
  note.textContent = "Gate and delay info opens on FlightAware. Vegas Vault doesn't use a paid flight API, so this is a direct link rather than a live feed.";
  el.appendChild(note);
  const { match, ident } = flightIdent(leg);
  if (ident) {
    el.appendChild(makeExternalLink(`https://www.flightaware.com/live/flight/${encodeURIComponent(ident)}`, `Check status on FlightAware (${ident})`));
  }
  if (match) el.appendChild(makeExternalLink(match.url, `${leg.airline || "Airline"} status page`));
}

function renderHotelLinks() {
  const el = document.getElementById("hotelLinks");
  if (!el) return;
  el.innerHTML = "";
  if (state.hotel.phone) {
    el.appendChild(makeExternalLink(`tel:${state.hotel.phone.replace(/[^\d+]/g, "")}`, `Call ${state.hotel.name || "hotel"}`));
  }
  if (state.hotel.name || state.hotel.address) {
    const query = encodeURIComponent(state.hotel.address || `${state.hotel.name} Las Vegas`);
    el.appendChild(makeExternalLink(`https://www.google.com/maps/search/?api=1&query=${query}`, "Open address"));
    if (window.VegasAffiliates) {
      const hint = document.createElement("span");
      hint.className = "book-suggest";
      hint.textContent = window.VegasAffiliates.bookSuggestion("hotel");
      el.appendChild(hint);
      window.VegasAffiliates.hotelLinks(state.hotel.name || state.hotel.address, affiliateConfig).forEach((link) => {
        el.appendChild(makeExternalLink(link.href, link.label));
      });
    }
  }
}

function icsEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function icsStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:America/Los_Angeles",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0800",
  "TZOFFSETTO:-0700",
  "TZNAME:PDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0800",
  "TZNAME:PST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

function eventLines(event) {
  const lines = ["BEGIN:VEVENT", `UID:${icsEscape(event.uid)}`, `DTSTAMP:${icsStamp(new Date())}`, `SUMMARY:${icsEscape(event.summary)}`];
  if (event.time) {
    lines.push(`DTSTART;TZID=America/Los_Angeles:${event.date.replace(/-/g, "")}T${event.time.replace(":", "")}00`);
    lines.push("DURATION:PT2H");
  } else {
    const [year, month, day] = event.date.split("-").map(Number);
    const end = new Date(Date.UTC(year, month - 1, day));
    end.setUTCDate(end.getUTCDate() + 1);
    const endStamp = end.toISOString().slice(0, 10).replace(/-/g, "");
    lines.push(`DTSTART;VALUE=DATE:${event.date.replace(/-/g, "")}`);
    lines.push(`DTEND;VALUE=DATE:${endStamp}`);
  }
  if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`);
  lines.push("END:VEVENT");
  return lines;
}

function buildIcs(events) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Vegas Vault//EN", "CALSCALE:GREGORIAN", VTIMEZONE]
    .concat(events.flatMap(eventLines))
    .concat("END:VCALENDAR")
    .join("\r\n");
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function tripCalendarEvents() {
  const events = [];
  const hotel = state.hotel || {};
  if (hotel.checkIn) {
    events.push({
      uid: `hotel-in-${hotel.checkIn}@vegas-vault`,
      date: hotel.checkIn,
      summary: `Check in${hotel.name ? " · " + hotel.name : ""}`,
      location: hotel.address || hotel.name,
      description: hotel.conf ? `Confirmation ${hotel.conf}` : "",
    });
  }
  if (hotel.checkOut) {
    events.push({
      uid: `hotel-out-${hotel.checkOut}@vegas-vault`,
      date: hotel.checkOut,
      summary: `Check out${hotel.name ? " · " + hotel.name : ""}`,
      location: hotel.address || hotel.name,
    });
  }
  ["outbound", "return"].forEach((legName) => {
    const leg = state.flights[legName];
    if (!leg.date) return;
    const summary = `${legName === "outbound" ? "Flight to Vegas" : "Flight home"} ${[leg.airline, leg.flightNum].filter(Boolean).join(" ")}`.trim();
    events.push({
      uid: `flight-${legName}-${leg.date}@vegas-vault`,
      date: leg.date,
      time: leg.depTime || "",
      summary,
      location: leg.from || "",
      description: leg.conf ? `Confirmation ${leg.conf}` : "",
    });
  });
  state.reservations.forEach((reservation) => {
    if (!reservation.date) return;
    events.push(reservationEvent(reservation));
  });
  return events;
}

function reservationEvent(reservation) {
  return {
    uid: `${reservation.id}@vegas-vault`,
    date: reservation.date,
    time: reservation.time || "",
    summary: reservation.name,
    location: reservation.address || "",
    description: [reservation.conf ? `Confirmation ${reservation.conf}` : "", reservation.link || ""].filter(Boolean).join("\n"),
  };
}

function downloadReservationIcs(reservation) {
  if (!reservation.date) {
    showToast("Add a date before saving this to your calendar.");
    return;
  }
  downloadText(`${reservation.name || "reservation"}.ics`, buildIcs([reservationEvent(reservation)]), "text/calendar");
}

function budgetSnapshot() {
  const net = (state.bankroll.entries || []).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const losses = Math.max(0, -net);
  const spent = (state.expenses || []).reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0);
  const gamblingCap = Number(state.bankroll.gamblingBudget) || 0;
  const spendingCap = Number(state.spendingBudget) || 0;
  return {
    losses,
    spent,
    gamblingCap,
    spendingCap,
    gamblingPct: gamblingCap > 0 ? losses / gamblingCap : 0,
    spendingPct: spendingCap > 0 ? spent / spendingCap : 0,
  };
}

function renderBudgetBanner() {
  const banner = document.getElementById("budgetBanner");
  if (!banner || !state) return;
  const snapshot = budgetSnapshot();
  const messages = [];
  if (snapshot.gamblingCap > 0 && snapshot.gamblingPct >= 0.8) {
    messages.push(`Gambling alert: losses are $${Math.round(snapshot.losses)} of a $${Math.round(snapshot.gamblingCap)} budget (${Math.round(snapshot.gamblingPct * 100)}%).`);
  }
  if (snapshot.spendingCap > 0 && snapshot.spendingPct >= 0.8) {
    messages.push(`Spending alert: the group has spent $${Math.round(snapshot.spent)} of a $${Math.round(snapshot.spendingCap)} budget (${Math.round(snapshot.spendingPct * 100)}%).`);
  }
  banner.hidden = messages.length === 0;
  banner.textContent = messages.join(" ");
}

function renderExpenses() {
  const peopleList = document.getElementById("peopleList");
  const expenseList = document.getElementById("expenseList");
  const settleList = document.getElementById("settleList");
  const payer = document.getElementById("expensePayer");
  const split = document.getElementById("expenseSplit");
  if (!peopleList || !expenseList) return;

  peopleList.innerHTML = "";
  state.people.forEach((person) => {
    const li = document.createElement("li");
    const body = document.createElement("div");
    body.className = "item-body";
    const name = document.createElement("span");
    name.className = "item-text";
    name.textContent = person.name;
    body.appendChild(name);
    if (person.venmo) {
      const meta = document.createElement("span");
      meta.className = "item-meta";
      meta.textContent = `Venmo @${person.venmo}`;
      body.appendChild(meta);
    }
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "✕";
    removeBtn.setAttribute("aria-label", `Remove ${person.name}`);
    removeBtn.addEventListener("click", () => {
      removeWithUndo(person.name, () => {
        state.people = state.people.filter((row) => row.id !== person.id);
      }, renderExpenses);
    });
    li.append(body, removeBtn);
    peopleList.appendChild(li);
  });

  payer.innerHTML = "";
  state.people.forEach((person) => {
    const option = document.createElement("option");
    option.value = person.name;
    option.textContent = person.name;
    payer.appendChild(option);
  });

  split.innerHTML = "";
  state.people.forEach((person) => {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = person.name;
    box.checked = true;
    box.className = "split-person";
    label.append(box, document.createTextNode(` ${person.name}`));
    split.appendChild(label);
  });

  const cap = Number(state.spendingBudget) || 0;
  const spent = (state.expenses || []).reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0);
  const status = document.getElementById("spendingBudgetStatus");
  status.textContent = cap > 0
    ? `Spent $${spent.toFixed(0)} of $${cap.toFixed(0)} (${Math.min(100, Math.round((spent / cap) * 100))}%). Alert at 80%.`
    : "Set a spending budget to get an alert at 80%.";

  expenseList.innerHTML = "";
  state.expenses.forEach((expense) => {
    const li = document.createElement("li");
    const body = document.createElement("div");
    body.className = "item-body";
    const name = document.createElement("span");
    name.className = "item-text";
    name.textContent = expense.label || "Expense";
    body.appendChild(name);
    const meta = document.createElement("span");
    meta.className = "item-meta";
    meta.textContent = [`$${Number(expense.amount).toFixed(2)}`, expense.paidBy ? `paid by ${expense.paidBy}` : "", expense.date ? formatDateHuman(expense.date) : ""].filter(Boolean).join(" · ");
    body.appendChild(meta);
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "✕";
    removeBtn.setAttribute("aria-label", `Remove ${expense.label || "expense"}`);
    removeBtn.addEventListener("click", () => {
      removeWithUndo(expense.label || "expense", () => {
        state.expenses = state.expenses.filter((row) => row.id !== expense.id);
      }, renderExpenses);
    });
    li.append(body, removeBtn);
    expenseList.appendChild(li);
  });

  const result = window.VaultSettle.settle(state.people, state.expenses);
  settleList.innerHTML = "";
  if (!result.transfers.length) {
    const empty = document.createElement("p");
    empty.className = "hype-empty";
    empty.textContent = state.expenses.length ? "Everyone is settled up." : "Add an expense to see who owes whom.";
    settleList.appendChild(empty);
    return;
  }
  result.transfers.forEach((transfer) => {
    const row = document.createElement("p");
    row.textContent = `${transfer.from} owes ${transfer.to} $${transfer.amount}`;
    const payee = state.people.find((person) => person.name === transfer.to);
    if (payee && payee.venmo) {
      row.appendChild(document.createTextNode(" "));
      row.appendChild(makeExternalLink(window.VaultSettle.venmoUrl(payee.venmo, transfer.amount, "Vegas Vault"), `Pay ${transfer.to} on Venmo`));
    }
    settleList.appendChild(row);
  });
}

function renderPolls() {
  const list = document.getElementById("pollList");
  if (!list) return;
  list.innerHTML = "";
  if (!state.polls.length) {
    const empty = document.createElement("p");
    empty.className = "hype-empty";
    empty.textContent = "No polls yet. Ask the group which show, dinner, or pool day wins.";
    list.appendChild(empty);
    return;
  }
  state.polls.forEach((poll) => {
    const card = document.createElement("div");
    card.className = "poll-card";
    const title = document.createElement("h4");
    title.textContent = poll.question;
    card.appendChild(title);
    const mine = displayName();
    (poll.options || []).forEach((option) => {
      const votes = (poll.votes && poll.votes[option.id]) || [];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tiny-btn";
      button.textContent = `${option.text} (${votes.length})`;
      button.setAttribute("aria-pressed", String(votes.includes(mine)));
      button.addEventListener("click", () => voteOnPoll(poll, option.id));
      card.appendChild(button);
      if (votes.length) {
        const who = document.createElement("p");
        who.className = "item-meta";
        who.textContent = votes.join(", ");
        card.appendChild(who);
      }
    });
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "secondary-btn";
    removeBtn.textContent = "Remove poll";
    removeBtn.addEventListener("click", () => {
      removeWithUndo(poll.question || "poll", () => {
        state.polls = state.polls.filter((row) => row.id !== poll.id);
      }, renderPolls);
    });
    card.appendChild(removeBtn);
    list.appendChild(card);
  });
}

function voteOnPoll(poll, optionId) {
  const name = requireDisplayName();
  if (!name) return;
  if (!poll.votes) poll.votes = {};
  const wasSelected = (poll.votes[optionId] || []).includes(name);
  Object.keys(poll.votes).forEach((key) => {
    poll.votes[key] = (poll.votes[key] || []).filter((voter) => voter !== name);
  });
  if (!wasSelected) poll.votes[optionId] = (poll.votes[optionId] || []).concat(name);
  poll.updatedAt = new Date().toISOString();
  saveData();
  renderPolls();
}

const KNOWN_PLACES = {
  "mandalay bay": [36.0916, -115.1753],
  "new york-new york": [36.1024, -115.1746],
  "new york new york": [36.1024, -115.1746],
  "park mgm": [36.1044, -115.1761],
  "mgm grand": [36.1026, -115.1703],
  "t-mobile arena": [36.1028, -115.1783],
  "excalibur": [36.0989, -115.1756],
  "luxor": [36.0955, -115.1761],
  "cosmopolitan": [36.1099, -115.1753],
  "aria": [36.1072, -115.1765],
  "bellagio": [36.1126, -115.1767],
  "caesars palace": [36.1162, -115.1745],
  "caesars": [36.1162, -115.1745],
  "planet hollywood": [36.1096, -115.1703],
  "paris las vegas": [36.1125, -115.1707],
  "horseshoe": [36.1143, -115.1725],
  "flamingo": [36.1155, -115.1714],
  "linq": [36.1178, -115.1711],
  "harrah": [36.1194, -115.1715],
  "venetian": [36.1212, -115.1697],
  "palazzo": [36.1244, -115.1686],
  "treasure island": [36.1245, -115.1721],
  "wynn": [36.1264, -115.1654],
  "encore": [36.1294, -115.1647],
  "resorts world": [36.1336, -115.166],
  "fontainebleau": [36.1374, -115.1615],
  "circus circus": [36.1367, -115.1651],
  "sahara": [36.1424, -115.1563],
  "strat": [36.1475, -115.1566],
  "sphere": [36.1206, -115.1624],
  "fremont street": [36.1707, -115.144],
  "golden nugget": [36.1703, -115.1446],
  "circa": [36.1722, -115.1454],
  "harry reid": [36.084, -115.1537],
  "las vegas airport": [36.084, -115.1537],
  "hell's kitchen": [36.1162, -115.1745],
  "omnia": [36.1162, -115.1745],
  "absinthe": [36.1162, -115.1745],
  "hakkasan": [36.1026, -115.1703],
  "carbone": [36.1072, -115.1765],
  "joel robuchon": [36.1026, -115.1703],
  "joël robuchon": [36.1026, -115.1703],
  "qua baths": [36.1162, -115.1745],
  "sahra": [36.1264, -115.1654],
  "xs": [36.1264, -115.1654],
  "cirque du soleil — o": [36.1126, -115.1767],
  "cirque du soleil - o": [36.1126, -115.1767],
};

function lookupPlace(text) {
  const normalized = String(text || "").toLowerCase();
  const keys = Object.keys(KNOWN_PLACES).sort((a, b) => b.length - a.length);
  const match = keys.find((key) => normalized.includes(key));
  if (!match) return null;
  const [lat, lng] = KNOWN_PLACES[match];
  return { lat, lng };
}

async function locateQuery(query) {
  const known = lookupPlace(query);
  if (known) return known;
  if (!navigator.onLine) return null;
  try {
    const local = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    if (local.ok) {
      const data = await local.json();
      if (Number.isFinite(data.lat) && Number.isFinite(data.lng)) return { lat: data.lat, lng: data.lng };
    }
  } catch (e) {
    // Static hosting has no geocode route. Fall through to Nominatim.
  }
  try {
    const remote = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`);
    if (!remote.ok) return null;
    const matches = await remote.json();
    if (!matches[0]) return null;
    return { lat: Number(matches[0].lat), lng: Number(matches[0].lon) };
  } catch (e) {
    return null;
  }
}

function pointFrom(record, fallbackText) {
  if (Number.isFinite(record.lat) && Number.isFinite(record.lng)) return { lat: record.lat, lng: record.lng };
  return lookupPlace(record.address || fallbackText || record.name || "");
}

function mapPoints() {
  const points = [];
  const hotelCoords = pointFrom(state.hotel || {}, state.hotel && state.hotel.name ? `${state.hotel.name} Las Vegas` : "");
  if (hotelCoords && (state.hotel.name || state.hotel.address)) {
    points.push({ id: "hotel", name: state.hotel.name || "Hotel", ...hotelCoords, kind: "Hotel" });
  }
  state.reservations.forEach((reservation) => {
    const coords = pointFrom(reservation, reservation.name);
    if (!coords) return;
    points.push({
      id: reservation.id,
      name: reservation.name,
      ...coords,
      kind: categoryLabel(reservation.category),
      date: reservation.date,
      time: reservation.time,
    });
  });
  return points;
}

function estimateWalkMinutes(a, b) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const earth = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
  return Math.max(1, Math.round((meters * 1.35) / 80));
}

function renderMapIfVisible() {
  const panel = document.getElementById("panel-map");
  if (panel && panel.classList.contains("active")) renderMap();
}

function renderMap() {
  const status = document.getElementById("mapStatus");
  const points = mapPoints();
  renderWalkList(points);
  if (typeof L === "undefined") {
    if (status) status.textContent = "The map needs a connection to load. Walking estimates below still work for places this browser already knows.";
    return;
  }
  if (!mapInstance) {
    mapInstance = L.map("map").setView([36.1147, -115.1728], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(mapInstance);
    mapMarkers = L.layerGroup().addTo(mapInstance);
  }
  mapMarkers.clearLayers();
  const bounds = [];
  points.forEach((point) => {
    L.marker([point.lat, point.lng]).addTo(mapMarkers).bindPopup(`${point.kind}: ${point.name}`);
    bounds.push([point.lat, point.lng]);
  });
  if (bounds.length) mapInstance.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  else mapInstance.setView([36.1147, -115.1728], 13);
  setTimeout(() => mapInstance.invalidateSize(), 60);
  if (status) {
    status.textContent = points.length
      ? `${points.length} pin${points.length === 1 ? "" : "s"} on the map.`
      : "No pins yet. Add a known Strip hotel or click the button to look places up.";
  }
}

function renderWalkList(points) {
  const list = document.getElementById("walkList");
  if (!list) return;
  list.innerHTML = "";
  const hotel = points.find((point) => point.id === "hotel");
  const places = points.filter((point) => point.id !== "hotel");
  if (!hotel || !places.length) {
    const empty = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = "Add the hotel and at least one placed reservation to see walking times.";
    empty.appendChild(text);
    list.appendChild(empty);
    return;
  }
  places.forEach((place) => {
    const minutes = estimateWalkMinutes(hotel, place);
    const li = document.createElement("li");
    const body = document.createElement("div");
    body.className = "item-body";
    const name = document.createElement("span");
    name.className = "item-text";
    name.textContent = `${hotel.name} to ${place.name}`;
    const meta = document.createElement("span");
    meta.className = "item-meta";
    meta.textContent = `About ${minutes} min walk (straight-line estimate)`;
    body.append(name, meta);
    li.appendChild(body);
    list.appendChild(li);
    refineWalk(hotel, place, meta);
  });
}

async function refineWalk(from, to, meta) {
  if (!navigator.onLine) return;
  try {
    const url = `https://router.project-osrm.org/route/v1/foot/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    const response = await fetch(url);
    if (!response.ok) return;
    const data = await response.json();
    const seconds = data.routes && data.routes[0] && data.routes[0].duration;
    if (!seconds) return;
    meta.textContent = `About ${Math.max(1, Math.round(seconds / 60))} min walk`;
  } catch (e) {
    // The straight-line estimate stays on screen.
  }
}

async function placeOnMap() {
  const status = document.getElementById("mapStatus");
  if (status) status.textContent = "Looking up places…";
  const hotelQuery = state.hotel.address || (state.hotel.name ? `${state.hotel.name} Las Vegas` : "");
  if (hotelQuery) {
    const found = await locateQuery(hotelQuery);
    if (found) {
      state.hotel.lat = found.lat;
      state.hotel.lng = found.lng;
    }
  }
  for (const reservation of state.reservations) {
    const query = reservation.address || `${reservation.name} Las Vegas`;
    const found = await locateQuery(query);
    if (found) {
      reservation.lat = found.lat;
      reservation.lng = found.lng;
      reservation.updatedAt = new Date().toISOString();
    }
  }
  saveData();
  renderMap();
}

async function loadMembers() {
  const list = document.getElementById("memberList");
  if (!list) return;
  list.innerHTML = "";
  if (!currentUser || !currentVaultId) {
    const li = document.createElement("li");
    li.textContent = "Sign in to see who shares this Vault.";
    list.appendChild(li);
    return;
  }
  try {
    const response = await fetch(`/api/vault/${currentVaultId}/members`);
    if (!response.ok) return;
    const data = await response.json();
    updateEditedLabel(data.updatedAt, data.updatedByEmail);
    const mine = (data.members || []).find((member) => member.userId === currentUser.id);
    data.members.forEach((member) => {
      const li = document.createElement("li");
      const body = document.createElement("div");
      body.className = "item-body";
      const name = document.createElement("span");
      name.className = "item-text";
      name.textContent = member.email;
      const meta = document.createElement("span");
      meta.className = "item-meta";
      meta.textContent = member.role;
      body.append(name, meta);
      li.appendChild(body);
      if (mine && mine.role === "owner" && member.userId !== currentUser.id) {
        if (member.role !== "owner") {
          const promote = document.createElement("button");
          promote.type = "button";
          promote.className = "tiny-btn";
          promote.textContent = "Make owner";
          promote.addEventListener("click", () => changeMemberRole(member.userId, "owner"));
          li.appendChild(promote);
        }
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "remove-btn";
        removeBtn.textContent = "✕";
        removeBtn.setAttribute("aria-label", `Remove ${member.email}`);
        removeBtn.addEventListener("click", () => removeMember(member.userId, member.email));
        li.appendChild(removeBtn);
      }
      list.appendChild(li);
    });
    const owner = Boolean(mine && mine.role === "owner");
    document.getElementById("inviteBtn").hidden = !owner;
    if (owner) loadInvites();
    else document.getElementById("inviteList").innerHTML = "";
  } catch (e) {
    console.warn("Could not load members", e);
  }
}

async function loadInvites() {
  const list = document.getElementById("inviteList");
  if (!list || !currentVaultId) return;
  list.innerHTML = "";
  const response = await fetch(`/api/vault/${currentVaultId}/invites`);
  if (!response.ok) return;
  const data = await response.json();
  (data.invites || []).filter((invite) => invite.active).forEach((invite) => {
    const li = document.createElement("li");
    const body = document.createElement("div");
    body.className = "item-body";
    const name = document.createElement("span");
    name.className = "item-text";
    name.textContent = `Invite ending ${invite.hint}`;
    const meta = document.createElement("span");
    meta.className = "item-meta";
    meta.textContent = `Single-use · expires ${new Date(invite.expiresAt).toLocaleString()}`;
    body.append(name, meta);
    const revoke = document.createElement("button");
    revoke.type = "button";
    revoke.className = "tiny-btn";
    revoke.textContent = "Revoke";
    revoke.addEventListener("click", async () => {
      const result = await fetch(`/api/vault/${currentVaultId}/invites/${invite.id}`, { method: "DELETE" });
      if (!result.ok) {
        const body = await result.json().catch(() => ({}));
        showToast(body.error || "Could not revoke that invite.");
        return;
      }
      loadInvites();
    });
    li.append(body, revoke);
    list.appendChild(li);
  });
}

async function removeMember(userId, email) {
  const response = await fetch(`/api/vault/${currentVaultId}/members/${userId}`, { method: "DELETE" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    showToast(data.error || "Could not remove that person.");
    return;
  }
  showToast(`Removed ${email}.`);
  loadMembers();
}

async function changeMemberRole(userId, role) {
  const response = await fetch(`/api/vault/${currentVaultId}/members/${userId}/role`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    showToast(data.error || "Could not update that role.");
    return;
  }
  loadMembers();
}

function setupInstallPrompt() {
  const banner = document.getElementById("installBanner");
  const text = document.getElementById("installText");
  const button = document.getElementById("installBtn");
  if (!banner || localStorage.getItem("vegasVaultInstallDismissed") === "1") return;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (standalone) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let deferredPrompt = null;

  function show(message, canInstall) {
    text.textContent = message;
    button.hidden = !canInstall;
    banner.hidden = false;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    show("Install Vegas Vault so daily notifications can reach this phone, including the budget alerts.", true);
  });

  if (ios) {
    show("On iPhone, notifications only work after you install Vegas Vault. Tap Share, then Add to Home Screen.", false);
  }

  button.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    deferredPrompt = null;
    banner.hidden = true;
  });
  document.getElementById("installDismiss").addEventListener("click", () => {
    banner.hidden = true;
    localStorage.setItem("vegasVaultInstallDismissed", "1");
  });
}

function setupExtraControls() {
  document.getElementById("passwordToggle").addEventListener("click", () => {
    const input = document.getElementById("authPassword");
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    document.getElementById("passwordToggle").textContent = showing ? "Show" : "Hide";
  });

  document.getElementById("displayNameInput").addEventListener("change", (event) => setDisplayName(event.target.value));
  document.getElementById("pollNameInput").addEventListener("change", (event) => setDisplayName(event.target.value));
  document.getElementById("pollNameInput").value = displayName();

  document.getElementById("passwordSaveBtn").addEventListener("click", async () => {
    const error = document.getElementById("passwordError");
    error.textContent = "";
    const response = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: document.getElementById("currentPassword").value,
        newPassword: document.getElementById("newPassword").value,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      error.textContent = data.error || "Could not change the password.";
      return;
    }
    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
    showToast("Password updated. Other devices were signed out.");
  });

  document.getElementById("logoutAllBtn").addEventListener("click", async () => {
    await fetch("/api/auth/logout-all", { method: "POST" });
    currentUser = null;
    currentVaultId = null;
    currentVaults = [];
    currentVaultUnlocked = true;
    currentVaultRole = "";
    groupSyncBlocked = false;
    knownVersion = null;
    state = loadLocalData();
    populateAllFields();
    renderAccountView();
    setSyncStatus("ok", "Saved on this device");
  });

  document.getElementById("leaveVaultBtn").addEventListener("click", async () => {
    if (!currentVaultId) return;
    const response = await fetch(`/api/vault/${currentVaultId}/leave`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast(data.error || "Could not leave that Vault.");
      return;
    }
    setAccountFromMeResponse(data);
    await loadActiveVaultFromServer();
    renderAccountView();
    showToast("You left that Vault.");
  });

  document.getElementById("personAdd").addEventListener("click", () => {
    const name = document.getElementById("personName").value.trim();
    if (!name) return;
    if (groupPaywallOn() && state.people.length >= 1) {
      promptUnlock("Splitting with more than one person is part of the group unlock.");
      return;
    }
    state.people.push({
      id: crypto.randomUUID(),
      name,
      venmo: document.getElementById("personVenmo").value.trim().replace(/^@/, ""),
      updatedAt: new Date().toISOString(),
    });
    document.getElementById("personName").value = "";
    document.getElementById("personVenmo").value = "";
    saveData();
    renderExpenses();
  });

  document.getElementById("expenseAdd").addEventListener("click", () => {
    const amount = Number(document.getElementById("expenseAmount").value);
    const label = document.getElementById("expenseLabel").value.trim();
    if (!label || !amount || amount <= 0) return;
    if (!state.people.length) {
      showToast("Add the people on the trip first.");
      return;
    }
    const participants = Array.from(document.querySelectorAll(".split-person:checked")).map((box) => box.value);
    const previousMax = (state.expenses || []).reduce((max, expense) => {
      const count = Array.isArray(expense.participants) ? expense.participants.filter(Boolean).length : 0;
      return Math.max(max, count);
    }, 0);
    if (groupPaywallOn() && participants.length > 1 && participants.length > previousMax) {
      promptUnlock("Splitting an expense with more than one person is part of the group unlock.");
      return;
    }
    state.expenses.push({
      id: crypto.randomUUID(),
      date: document.getElementById("expenseDate").value,
      label,
      amount,
      paidBy: document.getElementById("expensePayer").value,
      participants,
      updatedAt: new Date().toISOString(),
    });
    document.getElementById("expenseLabel").value = "";
    document.getElementById("expenseAmount").value = "";
    saveData();
    renderExpenses();
  });

  document.getElementById("spendingBudget").addEventListener("input", (event) => {
    state.spendingBudget = Number(event.target.value) || 0;
    saveData();
    renderExpenses();
  });

  document.getElementById("pollAdd").addEventListener("click", () => {
    const question = document.getElementById("pollQuestion").value.trim();
    const options = document.getElementById("pollOptions").value.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!question || options.length < 2) {
      showToast("Add a question and at least two choices.");
      return;
    }
    if (groupPaywallOn()) {
      promptUnlock("Polls are part of the group unlock.");
      return;
    }
    state.polls.push({
      id: crypto.randomUUID(),
      question,
      options: options.map((text) => ({ id: crypto.randomUUID(), text })),
      votes: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    document.getElementById("pollQuestion").value = "";
    document.getElementById("pollOptions").value = "";
    saveData();
    renderPolls();
  });

  document.getElementById("tripCalendarBtn").addEventListener("click", () => {
    const events = tripCalendarEvents();
    if (!events.length) {
      showToast("Add a hotel date, flight, or reservation first.");
      return;
    }
    downloadText("vegas-vault.ics", buildIcs(events), "text/calendar");
  });

  document.getElementById("mapRefreshBtn").addEventListener("click", () => {
    placeOnMap().catch((error) => {
      console.warn(error);
      showToast("Couldn't look up every place. Known hotels still pin without a connection.");
    });
  });

  document.getElementById("exportBtn").addEventListener("click", () => {
    downloadText("vegas-vault-backup.json", JSON.stringify(state, null, 2), "application/json");
  });
  document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importFile").click());
  document.getElementById("importFile").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      state = mergeWithDefaults(JSON.parse(await file.text()));
      saveData();
      populateAllFields();
      showToast("Backup imported.");
    } catch (e) {
      showToast("That file isn't a Vegas Vault backup.");
    }
  });

  window.addEventListener("online", () => {
    if (currentVaultId) syncStateToServer();
  });
  window.addEventListener("offline", () => {
    if (currentVaultId) setSyncStatus("pending", "Offline — will sync");
  });
  setInterval(() => {
    const pill = document.getElementById("syncPill");
    if (currentVaultId && pill && (pill.classList.contains("pending") || pill.classList.contains("bad"))) {
      syncStateToServer();
    }
  }, 30000);
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data && event.data.type === "flush-sync") syncStateToServer();
    });
  }
  setupInstallPrompt();
  if (!currentVaultId) setSyncStatus("ok", "Saved on this device");

  document.getElementById("unlockBtn").addEventListener("click", startGroupCheckout);
}

function groupPaywallOn() {
  return Boolean(currentUser && billingConfig.paymentsEnabled && !currentVaultUnlocked);
}

function activeVaultRole() {
  const vault = (currentVaults || []).find((item) => item.id === currentVaultId);
  return (vault && vault.role) || currentVaultRole || "";
}

function unlockMessage() {
  const price = billingConfig.priceLabel || "$7.99";
  if (activeVaultRole() === "owner") {
    return `Sharing this Vault is a one-time unlock (${price}). Invites, polls, and splitting an expense with more than one person are included. A trip you keep to yourself stays free.`;
  }
  return `Ask the Vault owner to unlock group tools (${price}, one time). A trip you keep to yourself stays free.`;
}

function renderUnlockChrome() {
  const panel = document.getElementById("unlockPanel");
  const copy = document.getElementById("unlockCopy");
  const button = document.getElementById("unlockBtn");
  const locked = groupPaywallOn();
  if (panel) panel.hidden = !locked;
  if (copy) copy.textContent = locked ? unlockMessage() : "";
  if (button) {
    button.hidden = !locked || activeVaultRole() !== "owner";
    button.textContent = `Unlock group tools — ${billingConfig.priceLabel || "$7.99"}`;
  }
  const note = locked ? unlockMessage() : "";
  ["expenseUnlockNote", "pollUnlockNote"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = !locked;
    el.textContent = note;
  });
}

function promptUnlock(message) {
  renderUnlockChrome();
  showToast(message || unlockMessage());
  const panel = document.getElementById("unlockPanel");
  if (panel && !panel.hidden) panel.scrollIntoView({ block: "nearest" });
}

async function startGroupCheckout() {
  if (!currentVaultId) return;
  if (activeVaultRole() !== "owner") {
    showToast(unlockMessage());
    return;
  }
  try {
    const response = await fetch(`/api/vault/${currentVaultId}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast(data.error || "Checkout could not be started.");
      return;
    }
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    if (data.alreadyUnlocked || data.devMode) {
      currentVaultUnlocked = true;
      groupSyncBlocked = false;
      renderUnlockChrome();
      showToast("Group tools are unlocked.");
      syncStateToServer();
    }
  } catch (e) {
    showToast("Checkout could not be started.");
  }
}

function renderDisclosure() {
  const el = document.getElementById("affiliateDisclosure");
  if (!el || !window.VegasAffiliates) return;
  const text = affiliateConfig.disclosure || (window.VegasAffiliates.hasAny(affiliateConfig) ? window.VegasAffiliates.DISCLOSURE : "");
  el.hidden = !text;
  el.textContent = text;
}

async function loadPublicConfig() {
  try {
    const [billingRes, affiliateRes] = await Promise.all([fetch("/api/billing"), fetch("/api/affiliates")]);
    if (billingRes.ok) billingConfig = await billingRes.json();
    if (affiliateRes.ok) affiliateConfig = await affiliateRes.json();
  } catch (e) {
    // The static no-account mode has no API. Links stay plain and group tools stay local.
  }
  renderDisclosure();
  renderUnlockChrome();
  renderHotelLinks();
  renderReservations();
}

function consumeUnlockQuery() {
  const params = new URLSearchParams(location.search);
  if (!params.has("unlock")) return;
  const status = params.get("unlock");
  params.delete("unlock");
  const next = params.toString();
  history.replaceState({}, "", `${location.pathname}${next ? `?${next}` : ""}${location.hash}`);
  if (status === "cancel") {
    showToast("Checkout canceled. Planning on your own stays free.");
    return;
  }
  if (status !== "success") return;
  showToast("Payment received. Group tools turn on as soon as Stripe confirms the payment.");
  let tries = 0;
  const timer = setInterval(async () => {
    tries += 1;
    await refreshMe();
    if (currentVaultUnlocked || tries >= 6) {
      clearInterval(timer);
      if (currentVaultUnlocked) {
        groupSyncBlocked = false;
        renderUnlockChrome();
        showToast("Group tools are unlocked for this Vault.");
        syncStateToServer();
      }
    }
  }, 2000);
}

// ---------- Initial render ----------
renderEssentials();
renderReservations();
renderBankroll();
renderOutfits();
renderExpenses();
renderPolls();
renderFlightLinks();
renderHotelLinks();
renderTipOfDay();
updateCountdown();
refreshDerived();
setupExtraControls();
loadPublicConfig();
consumeUnlockQuery();
refreshMe();
