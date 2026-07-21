const STORAGE_KEY = "vegasVaultData";

const defaultData = {
  tripDate: "",
  tripName: "",
  hotel: {
    name: "",
    conf: "",
    checkIn: "",
    checkOut: "",
    room: "",
    notes: "",
  },
  lists: {
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
      "Reservation confirmations",
      "Rideshare app set up",
      "Refillable water bottle",
    ].map(makeItem),
    restaurants: [
      "Gordon Ramsay Hell's Kitchen",
      "Joël Robuchon",
      "Carbone",
      "e by José Andrés",
    ].map(makeItem),
    shows: [
      "Cirque du Soleil — O",
      "Absinthe",
      "David Copperfield",
    ].map(makeItem),
    spas: [
      "Qua Baths & Spa (Caesars Palace)",
      "Sahra Spa (Wynn)",
    ].map(makeItem),
    nightclubs: [
      "Omnia (Caesars Palace)",
      "Hakkasan (MGM Grand)",
      "XS (Wynn)",
    ].map(makeItem),
  },
};

function makeItem(text) {
  return { id: crypto.randomUUID(), text, checked: false };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultData);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(defaultData),
      ...parsed,
      hotel: { ...defaultData.hotel, ...(parsed.hotel || {}) },
      lists: { ...structuredClone(defaultData.lists), ...(parsed.lists || {}) },
    };
  } catch (e) {
    console.warn("Failed to load saved data, starting fresh.", e);
    return structuredClone(defaultData);
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadData();

// ---------- Trip setup ----------
const tripDateInput = document.getElementById("tripDateInput");
const tripNameInput = document.getElementById("tripNameInput");

tripDateInput.value = state.tripDate || "";
tripNameInput.value = state.tripName || "";

tripDateInput.addEventListener("change", () => {
  state.tripDate = tripDateInput.value;
  saveData();
  updateCountdown();
});
tripNameInput.addEventListener("input", () => {
  state.tripName = tripNameInput.value;
  saveData();
});

// ---------- Countdown ----------
const els = {
  days: document.getElementById("days"),
  hours: document.getElementById("hours"),
  minutes: document.getElementById("minutes"),
  seconds: document.getElementById("seconds"),
  status: document.getElementById("countdownStatus"),
};

function updateCountdown() {
  if (!state.tripDate) {
    els.days.textContent = "00";
    els.hours.textContent = "00";
    els.minutes.textContent = "00";
    els.seconds.textContent = "00";
    els.status.textContent = "Set your trip date to start the countdown.";
    return;
  }

  const target = new Date(state.tripDate).getTime();
  const now = Date.now();
  const diff = target - now;
  const name = state.tripName ? state.tripName : "your Vegas trip";

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
updateCountdown();

// ---------- Tabs ----------
const tabButtons = document.querySelectorAll(".tab-btn");
const panels = document.querySelectorAll(".panel");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    panels.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
  });
});

// ---------- Hotel ----------
const hotelFields = {
  hotelName: "name",
  hotelConf: "conf",
  hotelCheckIn: "checkIn",
  hotelCheckOut: "checkOut",
  hotelRoom: "room",
  hotelNotes: "notes",
};

Object.entries(hotelFields).forEach(([elId, key]) => {
  const el = document.getElementById(elId);
  el.value = state.hotel[key] || "";
  el.addEventListener("input", () => {
    state.hotel[key] = el.value;
    saveData();
  });
});

// ---------- Generic checklists ----------
function renderList(listName) {
  const container = document.getElementById(`${listName}List`);
  container.innerHTML = "";
  state.lists[listName].forEach((item) => {
    const li = document.createElement("li");
    li.className = item.checked ? "checked" : "";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.checked;
    checkbox.addEventListener("change", () => {
      item.checked = checkbox.checked;
      saveData();
      renderList(listName);
    });

    const span = document.createElement("span");
    span.className = "item-text";
    span.textContent = item.text;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "✕";
    removeBtn.title = "Remove";
    removeBtn.addEventListener("click", () => {
      state.lists[listName] = state.lists[listName].filter((i) => i.id !== item.id);
      saveData();
      renderList(listName);
    });

    li.appendChild(checkbox);
    li.appendChild(span);
    li.appendChild(removeBtn);
    container.appendChild(li);
  });
}

function addToList(listName, text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  state.lists[listName].push(makeItem(trimmed));
  saveData();
  renderList(listName);
}

// Essentials add
const essentialsInput = document.getElementById("essentialsInput");
document.getElementById("essentialsAdd").addEventListener("click", () => {
  addToList("essentials", essentialsInput.value);
  essentialsInput.value = "";
});
essentialsInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    addToList("essentials", essentialsInput.value);
    essentialsInput.value = "";
  }
});

// Bucket-list categories add
["restaurants", "shows", "spas", "nightclubs"].forEach((listName) => {
  const input = document.getElementById(`${listName}Input`);
  const btn = document.querySelector(`.listAdd[data-list="${listName}"]`);
  btn.addEventListener("click", () => {
    addToList(listName, input.value);
    input.value = "";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      addToList(listName, input.value);
      input.value = "";
    }
  });
});

Object.keys(state.lists).forEach(renderList);

// ---------- Reset ----------
document.getElementById("resetBtn").addEventListener("click", () => {
  if (!confirm("Reset all Vegas Vault data? This can't be undone.")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = loadData();
  tripDateInput.value = state.tripDate;
  tripNameInput.value = state.tripName;
  Object.entries(hotelFields).forEach(([elId, key]) => {
    document.getElementById(elId).value = state.hotel[key] || "";
  });
  Object.keys(state.lists).forEach(renderList);
  updateCountdown();
});
