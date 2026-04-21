const SEARCH_RADIUS = 5000;
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const LOCATION_CACHE_KEY = "cachedLocation";
const SAVED_CAFES_KEY = "savedCafes";
const LOCATION_CACHE_TTL = 10 * 60 * 1000;

let currentSearchLocation = null;
let currentDeck = [];
let currentViewMode = "Ready";
let leafletMapInstance = null;
let userLocationMarker = null;
let cafeMarkers = [];

function getCardsContainer() {
  return document.querySelector(".cards");
}

function getStatusElement() {
  return document.getElementById("status");
}

function getSavedCountElement() {
  return document.getElementById("saved-count");
}

function getRadiusSelect() {
  return document.getElementById("radius-select");
}

function getDeckCountElement() {
  return document.getElementById("deck-count");
}

function getMapElement() {
  return document.getElementById("map");
}

function getViewModeElement() {
  return document.getElementById("view-mode");
}

function setStatus(message, isError = false) {
  const status = getStatusElement();
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function updateSavedCount() {
  const saved = JSON.parse(localStorage.getItem(SAVED_CAFES_KEY) || "[]");
  const label = `${saved.length} saved`;
  getSavedCountElement().textContent = label;
}

function updateDeckCount() {
  const deckCountElement = getDeckCountElement();
  if (deckCountElement) {
    deckCountElement.textContent = String(currentDeck.length);
  }
}

function setViewMode(mode) {
  currentViewMode = mode;
  const viewModeElement = getViewModeElement();
  if (viewModeElement) {
    viewModeElement.textContent = mode;
  }
}

function getSearchRadius() {
  return Number(getRadiusSelect()?.value || SEARCH_RADIUS);
}

function getLocationCachedOrNew() {
  const cache = JSON.parse(localStorage.getItem(LOCATION_CACHE_KEY) || "{}");
  const now = Date.now();

  setStatus("Checking your location...");
  setViewMode("Loading");

  if (cache.timestamp && now - cache.timestamp < LOCATION_CACHE_TTL) {
    useLocation(cache.lat, cache.lng);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      localStorage.setItem(
        LOCATION_CACHE_KEY,
        JSON.stringify({ lat, lng, timestamp: now })
      );

      currentSearchLocation = { lat, lng };
      useLocation(lat, lng);
    },
    () => {
      setStatus("Location access was denied or unavailable.", true);
      setViewMode("Location Error");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

async function useLocation(lat, lng) {
  currentSearchLocation = { lat, lng };
  const container = getCardsContainer();
  container.classList.remove("saved-view");
  container.innerHTML = "";
  setStatus("Loading nearby cafes...");
  setViewMode("Loading");

  try {
    initializeLeafletMap(lat, lng);
    const cafes = await fetchNearbyCafes(lat, lng, getSearchRadius());
    renderCafeMarkers(cafes);

    if (cafes.length === 0) {
      currentDeck = [];
      updateDeckCount();
      setStatus("No cafes found in this area.");
      setViewMode("No Results");
      return;
    }

    currentDeck = cafes;
    updateDeckCount();
    setStatus(`Found ${cafes.length} cafes. Swipe right to save your favorites.`);
    setViewMode("Browsing");
    displayCards(cafes);
  } catch (error) {
    console.error("Error loading nearby cafes:", error);
    clearCafeMarkers();
    setStatus("Cafe search failed. Please try again in a moment.", true);
    setViewMode("Error");
  }
}

function initializeLeafletMap(lat, lng) {
  const mapElement = getMapElement();
  if (!mapElement) {
    throw new Error("Map element not found");
  }

  if (!leafletMapInstance) {
    leafletMapInstance = L.map(mapElement).setView([lat, lng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(leafletMapInstance);
  } else {
    leafletMapInstance.setView([lat, lng], 14);
  }

  if (!userLocationMarker) {
    userLocationMarker = L.circleMarker([lat, lng], {
      radius: 8,
      color: "#ad3f22",
      weight: 2,
      fillColor: "#d86a37",
      fillOpacity: 0.95
    });
    userLocationMarker.addTo(leafletMapInstance);
  } else {
    userLocationMarker.setLatLng([lat, lng]);
  }
}

async function fetchNearbyCafes(lat, lon, radius) {
  const query = `
    [out:json][timeout:25];
    node["amenity"="cafe"](around:${radius},${lat},${lon});
    out body;
  `;

  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8"
    },
    body: query
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed with status ${response.status}`);
  }

  const data = await response.json();
  const cafes = await enrichCafes(normalizeFallbackCafes(data.elements || []));
  return cafes;
}

function clearCafeMarkers() {
  cafeMarkers.forEach((marker) => marker.remove());
  cafeMarkers = [];
}

function renderCafeMarkers(cafes) {
  clearCafeMarkers();

  cafes.forEach((cafe) => {
    if (cafe.lat == null || cafe.lng == null || !leafletMapInstance) {
      return;
    }

    const marker = L.marker([cafe.lat, cafe.lng], { title: cafe.name || "Cafe" });
    marker.addTo(leafletMapInstance);
    marker.bindPopup(cafe.name || "Cafe");
    cafeMarkers.push(marker);
  });
}

function normalizeFallbackCafes(elements) {
  const mapped = elements
    .map((element) => {
      const tags = element.tags || {};
      const cafeLat = element.lat ?? element.center?.lat;
      const cafeLng = element.lon ?? element.center?.lon;

      if (cafeLat == null || cafeLng == null) {
        return null;
      }

      const addressParts = [
        tags["addr:housenumber"],
        tags["addr:street"],
        tags["addr:city"] || tags["addr:suburb"]
      ].filter(Boolean);

      return {
        place_id: `${element.type}-${element.id}`,
        name: tags.name || "Cafe",
        address: addressParts.join(", "),
        rating: "",
        ratingCount: 0,
        photo: getFallbackImageUrl(tags, tags.name || "Cafe"),
        photoAttribution: null,
        mapsUrl: `https://www.openstreetmap.org/?mlat=${encodeURIComponent(cafeLat)}&mlon=${encodeURIComponent(cafeLng)}#map=18/${encodeURIComponent(cafeLat)}/${encodeURIComponent(cafeLng)}`,
        lat: cafeLat,
        lng: cafeLng
      };
    })
    .filter(Boolean);

  const unique = [];
  const seen = new Set();

  mapped.forEach((cafe) => {
    const key = `${cafe.name}-${cafe.address}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(cafe);
    }
  });

  return unique.slice(0, 20);
}

function getFallbackImageUrl(tags, name) {
  if (tags.image) {
    return tags.image;
  }

  if (tags["image:0"]) {
    return tags["image:0"];
  }

  if (tags.wikimedia_commons) {
    const fileName = tags.wikimedia_commons.replace(/^File:/i, "");
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}`;
  }

  return `https://placehold.co/1080x720?text=${encodeURIComponent(name)}`;
}

async function enrichCafes(cafes) {
  const enriched = await Promise.all(
    cafes.map(async (cafe) => {
      if (cafe.address) {
        return cafe;
      }

      return {
        ...cafe,
        address: await fetchAddress(cafe.lat, cafe.lng)
      };
    })
  );

  return enriched;
}

async function fetchAddress(lat, lng) {
  try {
    const url = `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Reverse geocode failed with status ${response.status}`);
    }

    const data = await response.json();
    const address = data.address || {};
    const addressParts = [
      address.house_number,
      address.road,
      address.suburb || address.neighbourhood,
      address.city || address.town || address.village
    ].filter(Boolean);

    return addressParts.join(", ") || "Address not available";
  } catch (error) {
    console.error("Error fetching address:", error);
    return "Address not available";
  }
}

function renderRating(rating) {
  return rating ? `<p class="detail-line"><span>Rating</span><strong>${rating}</strong></p>` : "";
}

function renderRatingCount(ratingCount) {
  return ratingCount ? `<p class="detail-line"><span>Reviews</span><strong>${ratingCount}</strong></p>` : "";
}

function renderPhoto(photoUrl, cafeName) {
  const src = photoUrl || "https://placehold.co/1080x720?text=No+Image";
  return `<img src="${src}" alt="${cafeName}" onerror="this.src='https://placehold.co/1080x720?text=No+Image'" />`;
}

function renderPhotoAttribution(photoAttribution) {
  if (!photoAttribution?.displayName || !photoAttribution?.uri) {
    return "";
  }

  return `<p class="photo-credit">Photo by <a href="${photoAttribution.uri}" target="_blank" rel="noopener noreferrer">${photoAttribution.displayName}</a></p>`;
}

function renderMapsLink(mapsUrl) {
  if (!mapsUrl) {
    return "";
  }

  return `<a class="maps-link" href="${mapsUrl}" target="_blank" rel="noopener noreferrer">Open in OpenStreetMap</a>`;
}

function displayCards(cafes) {
  const container = getCardsContainer();
  container.innerHTML = "";
  container.classList.remove("saved-view");
  updateDeckCount();

  cafes.forEach((cafe, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "swipe-wrapper";
    wrapper.style.zIndex = 200 - index;

    const card = document.createElement("article");
    card.className = "location-card";
    card.innerHTML = `
      <div class="image-wrap">
        ${renderPhoto(cafe.photo, cafe.name)}
      </div>
      <div class="card-body">
        <div class="card-topline">
          <p class="section-label">Cafe Pick</p>
          ${renderMapsLink(cafe.mapsUrl)}
        </div>
        <h3>${cafe.name}</h3>
        <p class="address">${cafe.address}</p>
        <div class="detail-grid">
          ${renderRating(cafe.rating)}
          ${renderRatingCount(cafe.ratingCount)}
        </div>
        ${renderPhotoAttribution(cafe.photoAttribution)}
        <p class="swipe-hint">Swipe right to save it, or swipe left to skip and see the next cafe.</p>
      </div>
    `;

    wrapper.appendChild(card);
    container.appendChild(wrapper);

    const hammer = new Hammer(wrapper);

    hammer.on("swipeleft", () => {
      dismissCard(wrapper, cafe, false);
    });

    hammer.on("swiperight", () => {
      dismissCard(wrapper, cafe, true);
    });
  });
}

function dismissCard(wrapper, cafe, shouldSave) {
  if (shouldSave) {
    saveCafe(cafe, { silent: true });
  }

  currentDeck = currentDeck.filter((item) => item.place_id !== cafe.place_id);
  updateDeckCount();
  wrapper.style.transform = shouldSave
    ? "translateX(150%) rotate(12deg)"
    : "translateX(-150%) rotate(-12deg)";
  wrapper.style.opacity = "0";
  setTimeout(() => {
    wrapper.remove();
    handleDeckCompletion();
  }, 180);
}

function getTopCardWrapper() {
  return getCardsContainer().querySelector(".swipe-wrapper");
}

function skipTopCard() {
  const wrapper = getTopCardWrapper();
  if (!wrapper) {
    setStatus("No more cafes left in this list. Refresh to load more.");
    return;
  }

  const card = currentDeck[0];
  if (!card) {
    setStatus("No more cafes left in this list. Refresh to load more.");
    return;
  }

  dismissCard(wrapper, card, false);
}

function saveTopCard() {
  const wrapper = getTopCardWrapper();
  if (!wrapper) {
    setStatus("No more cafes left in this list. Refresh to load more.");
    return;
  }

  const card = currentDeck[0];
  if (!card) {
    setStatus("No more cafes left in this list. Refresh to load more.");
    return;
  }

  dismissCard(wrapper, card, true);
}

function handleDeckCompletion() {
  if (currentDeck.length > 0) {
    return;
  }

  const container = getCardsContainer();
  if (!container.classList.contains("saved-view") && !container.querySelector(".empty-state")) {
    container.innerHTML = '<p class="empty-state">You checked all the cafes in this list. Refresh the list or change the distance to explore more places.</p>';
    setStatus("List complete. Refresh the list or change the distance to see more cafes.");
    setViewMode("Completed");
  }
}

function saveCafe(cafe, options = {}) {
  const { silent = false } = options;
  const saved = JSON.parse(localStorage.getItem(SAVED_CAFES_KEY) || "[]");

  if (saved.find((item) => item.place_id === cafe.place_id)) {
    if (!silent) {
      setStatus(`${cafe.name} is already in your saved list.`);
    }
    return;
  }

  saved.push(cafe);
  localStorage.setItem(SAVED_CAFES_KEY, JSON.stringify(saved));
  updateSavedCount();
  setStatus(`${cafe.name} was saved to your list.`);
}

function showSaved() {
  clearCafeMarkers();

  const container = getCardsContainer();
  const saved = JSON.parse(localStorage.getItem(SAVED_CAFES_KEY) || "[]");

  container.classList.add("saved-view");
  container.innerHTML = "";
  currentDeck = [];
  updateDeckCount();
  setViewMode("Saved");

  if (saved.length === 0) {
    container.innerHTML = '<p class="empty-state">No saved cafes yet. Start exploring and save the ones you like.</p>';
    setStatus("You have not saved any cafes yet.");
    return;
  }

  setStatus(`Showing ${saved.length} saved cafes.`);

  saved.forEach((cafe) => {
    const card = document.createElement("article");
    card.className = "location-card saved-card";
    card.innerHTML = `
      <div class="image-wrap">
        ${renderPhoto(cafe.photo, cafe.name)}
      </div>
      <div class="card-body">
        <div class="card-topline">
          <p class="section-label">Saved Cafe</p>
          ${renderMapsLink(cafe.mapsUrl)}
        </div>
        <h3>${cafe.name}</h3>
        <p class="address">${cafe.address}</p>
        <div class="detail-grid">
          ${renderRating(cafe.rating)}
          ${renderRatingCount(cafe.ratingCount)}
        </div>
        ${renderPhotoAttribution(cafe.photoAttribution)}
        <div class="saved-actions">
          <button class="ghost-button small-button" onclick="removeSavedCafe('${cafe.place_id}')">Remove</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function removeSavedCafe(placeId) {
  const saved = JSON.parse(localStorage.getItem(SAVED_CAFES_KEY) || "[]");
  const nextSaved = saved.filter((cafe) => cafe.place_id !== placeId);

  localStorage.setItem(SAVED_CAFES_KEY, JSON.stringify(nextSaved));
  updateSavedCount();
  setStatus("Cafe removed from your saved list.");
  showSaved();
}

function clearSavedCafes() {
  localStorage.setItem(SAVED_CAFES_KEY, JSON.stringify([]));
  updateSavedCount();
  setStatus("Saved cafes cleared.");
  if (!getCardsContainer().classList.contains("saved-view")) {
    setViewMode(currentDeck.length ? "Browsing" : "Ready");
  }

  const container = getCardsContainer();
  if (container.classList.contains("saved-view")) {
    showSaved();
  }
}

function refreshCurrentSearch() {
  if (currentSearchLocation) {
    useLocation(currentSearchLocation.lat, currentSearchLocation.lng);
    return;
  }

  getLocationCachedOrNew();
}

updateSavedCount();
updateDeckCount();
setViewMode(currentViewMode);
