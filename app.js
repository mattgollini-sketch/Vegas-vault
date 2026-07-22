const STORAGE_KEY = "vegasVaultData";

const CATEGORY_META = {
  restaurants: { label: "🍽️ Restaurants", hint: "Your favorite spots to eat." },
  shows: { label: "🎭 Shows", hint: "Shows you want to catch." },
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
  version: 2,
  tripName: "",
  tripDate: "",
  hotel: { name: "", conf: "", checkIn: "", checkOut: "", room: "", notes: "" },
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
    makeReservation("spas", "Qua Baths & Spa (Caesars Palace)"),
    makeReservation("spas", "Sahra Spa (Wynn)"),
    makeReservation("nightclubs", "Omnia (Caesars Palace)"),
    makeReservation("nightclubs", "Hakkasan (MGM Grand)"),
    makeReservation("nightclubs", "XS (Wynn)"),
  ],
  bankroll: { starting: 0, entries: [] },
  outfits: [],
  weather: { fetchedAt: "", days: [] },
};

function makeChecklistItem(text) {
  return { id: crypto.randomUUID(), text, checked: false };
}

function makeReservation(category, name) {
  return { id: crypto.randomUUID(), category, name, date: "", time: "", conf: "", checked: false };
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
    bankroll: { ...defaultData.bankroll, ...(parsed.bankroll || {}) },
    outfits: parsed.outfits || [],
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
  if ((s.bankroll && s.bankroll.entries || []).length) return true;
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

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (currentVaultId) {
    clearTimeout(serverSyncTimer);
    serverSyncTimer = setTimeout(syncStateToServer, 800);
  }
}

async function syncStateToServer() {
  if (!currentVaultId) return;
  try {
    await fetch(`/api/vault/${currentVaultId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
  } catch (e) {
    console.warn("Vault sync failed", e);
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

  renderEssentials();
  renderReservations();
  renderBankroll();
  renderOutfits();
  renderItinerary();
  updateCountdown();
  refreshDerived();
}

// ---------- Date / format helpers ----------
function todayStr() {
  return formatDateKey(new Date());
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
  if (state.tripDate) return new Date(state.tripDate).getTime();
  if (state.hotel.checkIn) return new Date(`${state.hotel.checkIn}T00:00`).getTime();
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
  els.status.textContent = `Counting down to ${name}`;
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
    }
  });
});

// ---------- Hotel ----------
const hotelFieldMap = {
  hotelName: "name", hotelConf: "conf", hotelCheckIn: "checkIn",
  hotelCheckOut: "checkOut", hotelRoom: "room", hotelNotes: "notes",
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
      saveData();
      renderEssentials();
    });

    const span = document.createElement("span");
    span.className = "item-text";
    span.textContent = item.text;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      state.essentials = state.essentials.filter((i) => i.id !== item.id);
      saveData();
      renderEssentials();
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

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = item.checked ? "checked" : "";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.checked;
    checkbox.addEventListener("change", () => {
      item.checked = checkbox.checked;
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
    if (item.time) metaParts.push(formatTime12(item.time));
    if (item.conf) metaParts.push(`Conf# ${item.conf}`);
    if (metaParts.length) {
      const metaSpan = document.createElement("span");
      metaSpan.className = "item-meta";
      metaSpan.textContent = metaParts.join(" · ");
      body.appendChild(metaSpan);
    }

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      state.reservations = state.reservations.filter((r) => r.id !== item.id);
      saveData();
      renderReservations();
      refreshDerived();
      renderItinerary();
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
    checked: false,
  });
  saveData();
  renderReservations();
  refreshDerived();
  renderItinerary();
  resNameInput.value = "";
  resDateInput.value = "";
  resTimeInput.value = "";
  resConfInput.value = "";
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

function renderBankroll() {
  const sum = state.bankroll.entries.reduce((s, e) => s + e.amount, 0);
  const total = (Number(state.bankroll.starting) || 0) + sum;
  const totalEl = document.getElementById("bankrollTotal");
  totalEl.textContent = `Current bankroll: $${total.toFixed(0)} (${sum >= 0 ? "+" : ""}${sum.toFixed(0)} so far)`;
  totalEl.className = `bankroll-total ${sum >= 0 ? "positive" : "negative"}`;

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
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      state.bankroll.entries = state.bankroll.entries.filter((e) => e.id !== entry.id);
      saveData();
      renderBankroll();
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
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      state.outfits = state.outfits.filter((o) => o.id !== outfit.id);
      saveData();
      renderOutfits();
      renderItinerary();
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
  container.innerHTML = state.weather.days.map((d) => `
    <div class="weather-card ${d.date === today ? "today" : ""}">
      <div class="wc-date">${formatDateHuman(d.date)}</div>
      <div class="wc-icon">${weatherIcon(d.code)}</div>
      <div class="wc-temps"><span class="wc-hi">${d.hi}°</span> / <span class="wc-lo">${d.lo}°</span></div>
    </div>
  `).join("");
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
    vaultSwitcher.innerHTML = currentVaults
      .map((v) => `<option value="${v.id}" ${v.id === currentVaultId ? "selected" : ""}>${escapeHtml(v.name)} (${v.role})</option>`)
      .join("");
    document.getElementById("inviteLinkWrap").hidden = true;
  } else {
    authSubmitBtn.textContent = authMode === "signup" ? "Sign up" : "Log in";
    authToggleBtn.textContent =
      authMode === "signup" ? "Already have an account? Log in" : "New here? Sign up";
  }
  renderAccountBar();
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
    const serverState = mergeWithDefaults(data.state);

    if (!hasMeaningfulData(serverState) && hasMeaningfulData(pendingImportSnapshot)) {
      importBanner.hidden = false;
    } else {
      importBanner.hidden = true;
      pendingImportSnapshot = null;
    }

    state = serverState;
    populateAllFields();
  } catch (e) {
    console.warn("Failed to load Vault from server", e);
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
  try {
    const res = await fetch(`/api/vault/${currentVaultId}/invite`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create invite");
    const wrap = document.getElementById("inviteLinkWrap");
    const input = document.getElementById("inviteLinkInput");
    input.value = `${location.origin}${data.path}`;
    wrap.hidden = false;
    input.select();
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
  } catch (e) {
    document.execCommand("copy");
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

// ---------- Initial render ----------
renderEssentials();
renderReservations();
renderBankroll();
renderOutfits();
renderTipOfDay();
updateCountdown();
refreshDerived();
refreshMe();
