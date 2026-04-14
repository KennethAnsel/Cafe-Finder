// ─── Overpass API (OpenStreetMap) — no key needed ───────────────────────────

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const RADIUS = 1500; // meters

let cafes = [];
let currentIndex = 0;

// ─── Geolocation ─────────────────────────────────────────────────────────────

function getLocation() {
  setStatus("Getting your location...");

  if (!navigator.geolocation) {
    setStatus("Geolocation is not supported by your browser.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      setStatus("Searching for cafes nearby...");
      fetchCafes(latitude, longitude);
    },
    () => {
      setStatus("Could not get your location. Please allow access.");
    }
  );
}

// ─── Fetch Cafes from Overpass ───────────────────────────────────────────────

async function fetchCafes(lat, lon) {
  const query = `
    [out:json][timeout:25];
    node["amenity"="cafe"](around:${RADIUS},${lat},${lon});
    out body;
  `;

  try {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const data = await response.json();
    cafes = data.elements.filter((el) => el.tags && el.tags.name);

    if (cafes.length === 0) {
      setStatus("No cafes found nearby. Try a wider area.");
      return;
    }

    setStatus(`Found ${cafes.length} cafes near you!`);
    currentIndex = 0;
    renderCards();
  } catch (err) {
    console.error(err);
    setStatus("Something went wrong. Please try again.");
  }
}

// ─── Render Cards ─────────────────────────────────────────────────────────────

function renderCards() {
  const container = document.getElementById("cards");
  container.innerHTML = "";

  const visible = cafes.slice(currentIndex, currentIndex + 3);

  if (visible.length === 0) {
    container.innerHTML = `<div class="empty-state">You've seen all cafes!<br>Try searching again.</div>`;
    return;
  }

  // Render in reverse so top card is last in DOM (highest z-index)
  [...visible].reverse().forEach((cafe, i) => {
    const card = createCard(cafe);
    container.appendChild(card);
  });

  // Attach swipe to the top card only
  attachSwipe(container.lastChild, cafes[currentIndex]);
}

// ─── Build a Card ─────────────────────────────────────────────────────────────

function createCard(cafe) {
  const tags = cafe.tags || {};
  const name = tags.name || "Unknown Cafe";
  const address = buildAddress(tags);
  const hours = tags["opening_hours"] || "";
  const cuisine = tags["cuisine"] || "";
  const website = tags["website"] || tags["contact:website"] || "";
  const wifi = tags["internet_access"] ? "WiFi" : "";
  const outdoor = tags["outdoor_seating"] === "yes" ? "Outdoor" : "";
  const wheelchair = tags["wheelchair"] === "yes" ? "Accessible" : "";

  const tagList = [cuisine, wifi, outdoor, wheelchair].filter(Boolean);

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <span class="nope-label">NOPE</span>
    <span class="like-label">SAVE</span>
    <div>
      <div class="card-emoji"></div>
      <h2>${name}</h2>
      <div class="card-tags">
        ${tagList.map((t) => `<span class="tag">${t}</span>`).join("")}
      </div>
      ${address ? `<p class="card-address"> ${address}</p>` : ""}
      ${hours ? `<p class="card-hours"> ${hours}</p>` : ""}
      ${website ? `<p class="card-address"><a href="${website}" target="_blank">Website</a></p>` : ""}
    </div>
    <div class="card-actions">
      <button class="skip-btn" onclick="skipCafe(event)"> Skip</button>
      <button class="save-btn" onclick="saveCafe(event, ${cafe.id})">Save</button>
    </div>
  `;

  return card;
}

function buildAddress(tags) {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:city"],
  ].filter(Boolean);
  return parts.join(", ");
}

// ─── Swipe with Hammer.js ─────────────────────────────────────────────────────

function attachSwipe(card, cafe) {
  if (!card) return;

  const hammer = new Hammer(card);
  hammer.get("pan").set({ direction: Hammer.DIRECTION_HORIZONTAL });

  hammer.on("pan", (e) => {
    const rotate = e.deltaX * 0.08;
    card.style.transform = `translateX(${e.deltaX}px) rotate(${rotate}deg)`;

    const nope = card.querySelector(".nope-label");
    const like = card.querySelector(".like-label");

    if (e.deltaX > 0) {
      like.style.opacity = Math.min(e.deltaX / 100, 1);
      nope.style.opacity = 0;
    } else {
      nope.style.opacity = Math.min(-e.deltaX / 100, 1);
      like.style.opacity = 0;
    }
  });

  hammer.on("panend", (e) => {
    if (e.deltaX > 100) {
      flyOut(card, "right");
      saveById(cafe.id);
    } else if (e.deltaX < -100) {
      flyOut(card, "left");
      nextCard();
    } else {
      card.style.transform = "";
      card.querySelector(".nope-label").style.opacity = 0;
      card.querySelector(".like-label").style.opacity = 0;
    }
  });
}

function flyOut(card, direction) {
  const x = direction === "right" ? 800 : -800;
  card.style.transition = "transform 0.4s ease";
  card.style.transform = `translateX(${x}px) rotate(${direction === "right" ? 30 : -30}deg)`;
  setTimeout(() => {
    if (direction === "right") {
      // saved — next card renders after small delay
    }
    nextCard();
  }, 350);
}

// ─── Skip / Save ──────────────────────────────────────────────────────────────

function skipCafe(event) {
  event.stopPropagation();
  const card = document.querySelector(".cards .card:last-child");
  if (card) flyOut(card, "left");
}

function saveCafe(event, id) {
  event.stopPropagation();
  const card = document.querySelector(".cards .card:last-child");
  saveById(id);
  if (card) flyOut(card, "right");
}

function saveById(id) {
  const cafe = cafes.find((c) => c.id === id);
  if (!cafe) return;

  const saved = getSaved();
  if (!saved.find((c) => c.id === id)) {
    saved.push(cafe);
    localStorage.setItem("savedCafes", JSON.stringify(saved));
    setStatus(`Saved: ${cafe.tags?.name || "Cafe"}`);
  }
}

function nextCard() {
  currentIndex++;
  setTimeout(renderCards, 400);
}

// ─── Saved List ───────────────────────────────────────────────────────────────

function getSaved() {
  return JSON.parse(localStorage.getItem("savedCafes") || "[]");
}

function showSaved() {
  const saved = getSaved();
  const section = document.getElementById("saved-section");
  const list = document.getElementById("saved-list");

  list.innerHTML = "";

  if (saved.length === 0) {
    list.innerHTML = "<li>No saved cafes yet. Start swiping! </li>";
  } else {
    saved.forEach((cafe) => {
      const name = cafe.tags?.name || "Unknown";
      const address = buildAddress(cafe.tags || {});
      const li = document.createElement("li");
      li.innerHTML = `${name}${address ? `<span>${address}</span>` : ""}`;
      list.appendChild(li);
    });
  }

  section.classList.remove("hidden");
}

function hideSaved() {
  document.getElementById("saved-section").classList.add("hidden");
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}