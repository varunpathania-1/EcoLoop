function formatMoney(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

let selectedPickup = null;
const pickupMaps = [];
let lastCollectorPickups = [];
let activePickupFilter = 'all';

const PICKUP_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'collected', label: 'Collected' },
  { key: 'payment_pending', label: 'Payment Pending' }
];

const FILTER_EMPTY_MESSAGES = {
  all: ['No scheduled pickups', 'There are currently no pickups requiring collection.'],
  scheduled: ['No scheduled pickups', 'There are currently no pickups in this status.'],
  accepted: ['No accepted pickups', 'There are currently no pickups in this status.'],
  in_progress: ['No in-progress pickups', 'There are currently no pickups in this status.'],
  collected: ['No collected pickups', 'There are currently no pickups in this status.'],
  payment_pending: ['No payment-pending pickups', 'There are currently no pickups in this status.']
};

function pickupStatusKey(pickup) {
  return String(pickup && pickup.status ? pickup.status : '').toLowerCase().replace(/\s+/g, '_');
}

function actionablePickups() {
  return lastCollectorPickups.filter((pickup) => pickupStatusKey(pickup) !== 'paid');
}

function filteredVisiblePickups() {
  const actionable = actionablePickups();
  if (activePickupFilter === 'all') return actionable;
  return actionable.filter((pickup) => pickupStatusKey(pickup) === activePickupFilter);
}

function updateFilterCounts() {
  const actionable = actionablePickups();
  PICKUP_FILTERS.forEach(({ key, label }) => {
    const button = document.querySelector(`[data-pickup-filter="${key}"]`);
    if (!button) return;
    const count = key === 'all'
      ? actionable.length
      : actionable.filter((pickup) => pickupStatusKey(pickup) === key).length;
    button.textContent = `${label} (${count})`;
  });
}

function renderPickupList() {
  const list = document.getElementById('pickup-list');
  if (!list) return;
  destroyPickupMaps();
  list.innerHTML = '';
  const visible = filteredVisiblePickups();
  updateFilterCounts();
  PICKUP_FILTERS.forEach(({ key }) => {
    const button = document.querySelector(`[data-pickup-filter="${key}"]`);
    if (button) {
      const active = key === activePickupFilter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  });
  if (!visible.length) {
    const [title, subtitle] = FILTER_EMPTY_MESSAGES[activePickupFilter] || FILTER_EMPTY_MESSAGES.all;
    list.innerHTML = `<div class="card muted"><strong>${title}</strong><br>${subtitle}</div>`;
    return;
  }
  visible.forEach((pickup) => list.appendChild(renderPickupCard(pickup)));
  initPickupMaps(list);
}

function hasPickupLocation(pickup) {
  return pickup && pickup.location != null &&
    Number.isFinite(Number(pickup.location.latitude)) &&
    Number.isFinite(Number(pickup.location.longitude));
}

function formatPickupWhen(value) {
  try {
    const d = new Date(value);
    const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${date} · ${time}`;
  } catch (_err) {
    return String(value || '');
  }
}

function pickupDestination(pickup) {
  if (hasPickupLocation(pickup)) {
    return window.PickupMap
      ? window.PickupMap.directionsUrl(pickup.location.latitude, pickup.location.longitude)
      : '#';
  }
  if (pickup.address && String(pickup.address).trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(String(pickup.address).trim())}`;
  }
  return null;
}

function renderPickupLocation(pickup) {
  if (!hasPickupLocation(pickup)) {
    return '<p class="muted">Location not available</p>';
  }
  const mapId = `pickup-map-${pickup._id}`;
  const lat = Number(pickup.location.latitude).toFixed(6);
  const lng = Number(pickup.location.longitude).toFixed(6);
  return `
    <div class="pickup-map-wrap">
      <p class="pickup-map-label">Pickup location</p>
      <div class="pickup-map" id="${mapId}" data-lat="${lat}" data-lng="${lng}" role="application" aria-label="Pickup location map"></div>
      <div class="pickup-map-actions">
        <button class="btn secondary pickup-view-map" type="button" data-view-map="${pickup._id}">View on Map</button>
        <a class="btn pickup-directions" href="${pickupDestination(pickup)}" target="_blank" rel="noopener">Open Directions →</a>
      </div>
    </div>
  `;
}

function renderPickupNoLocation(pickup) {
  const address = pickup.address && String(pickup.address).trim();
  if (!address) return '<p class="muted">Location unavailable</p>';
  return `
    <div class="pickup-map-wrap">
      <p class="pickup-map-label">Pickup location</p>
      <p class="pickup-address-line">${address}</p>
      <div class="pickup-map-actions">
        <a class="btn pickup-directions" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}" target="_blank" rel="noopener">Open Directions →</a>
      </div>
    </div>
  `;
}

function initPickupMaps(root) {
  if (!window.PickupMap || !window.PickupMap.ready()) return;
  root.querySelectorAll('.pickup-map[data-lat]').forEach((el) => {
    const handle = window.PickupMap.create(el, {
      lat: Number(el.dataset.lat),
      lng: Number(el.dataset.lng),
      interactive: false,
      zoom: 15
    });
    if (handle) pickupMaps.push(handle);
  });
}

function destroyPickupMaps() {
  while (pickupMaps.length) {
    const handle = pickupMaps.pop();
    if (handle && typeof handle.destroy === 'function') handle.destroy();
  }
}

function renderPickupCompactLocation(pickup) {
  const d = pickup.pickupDetails || {};
  const parts = [];
  if (d.building) parts.push(d.building);
  if (d.unit) parts.push(`Room ${d.unit}`);
  if (!parts.length) return '';
  return `<p class="pickup-compact-location">${parts.join(' · ')}</p>`;
}

function renderPickupDetails(pickup) {
  const d = pickup.pickupDetails || {};
  const rows = [
    ['Flat / House / Room', d.unit],
    ['Building', d.building],
    ['Floor', d.floor],
    ['Landmark', d.landmark],
    ['Instructions', d.instructions]
  ].filter(([, value]) => value);
  if (!rows.length) return '<p class="muted">Pickup details not provided</p>';
  return `<div class="pickup-details-block"><p class="pickup-map-label">Pickup details</p><dl class="pickup-details-list">${
    rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')
  }</dl></div>`;
}

function renderPickupProgress(status) {
  const statuses = ['scheduled', 'accepted', 'in_progress', 'collected', 'payment_pending', 'paid'];
  const labels = { scheduled: 'Scheduled', accepted: 'Accepted', in_progress: 'In Progress', collected: 'Collected', payment_pending: 'Payment Pending', paid: 'Paid' };
  const currentIndex = statuses.indexOf(status);
  return `
    <div class="pickup-progress" aria-label="Pickup status: ${status}">
      ${statuses.map((item, index) => `
        <div class="progress-step ${index < currentIndex ? 'complete' : ''} ${index === currentIndex ? 'current' : ''}">
          <span class="progress-dot" aria-hidden="true">${index < currentIndex ? '✓' : index + 1}</span>
          <span>${labels[item]}</span>
        </div>
        ${index < statuses.length - 1 ? `<span class="progress-line ${index < currentIndex ? 'complete' : ''}" aria-hidden="true"></span>` : ''}
      `).join('')}
    </div>
  `;
}

function renderPickupCard(pickup) {
  const resident = pickup.user || {};
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="pickup-card-head">
      <h3>${resident.name || 'Resident'}</h3>
      <span class="badge pickup-status-pill">${String(pickup.status || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
    </div>
    <p class="muted">${resident.phone || ''} · ${formatPickupWhen(pickup.datetime)}</p>
    <p class="pickup-cats"><strong>Categories:</strong> ${pickup.requestedCategories.join(', ')}</p>
    ${renderPickupCompactLocation(pickup)}
    ${pickup.notes ? `<p class="muted"><strong>Customer note:</strong> ${pickup.notes}</p>` : ''}
    <div class="pickup-loc-grid">
      <div class="pickup-loc-info">
        <p class="pickup-map-label">Pickup location</p>
        <p class="pickup-address-line">${pickup.address || 'Address not provided'}</p>
        ${renderPickupDetails(pickup)}
      </div>
      <div class="pickup-loc-map">
        ${hasPickupLocation(pickup) ? renderPickupLocation(pickup).replace(/<p class="pickup-map-label">Pickup location<\/p>\s*/, '') : (pickup.address && String(pickup.address).trim() ? `<div class="pickup-map-actions"><a class="btn pickup-directions" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(String(pickup.address).trim())}" target="_blank" rel="noopener">Open Directions →</a></div>` : '<p class="muted">Location unavailable</p>')}
      </div>
    </div>
    ${renderPickupProgress(pickup.status)}
    ${pickup.status === 'scheduled' ? `<button class="btn" data-accept="${pickup._id}">Accept Pickup</button>` : ''}
    ${pickup.status === 'accepted' ? `<div class="pickup-accepted-actions">${pickupDestination(pickup) ? `<a class="btn" href="${pickupDestination(pickup)}" target="_blank" rel="noopener">Open Route in Google Maps →</a>` : ''}<button class="btn secondary" data-start="${pickup._id}">Start Trip</button></div>` : ''}
    ${pickup.status === 'in_progress' ? `<button class="btn" data-weigh="${pickup._id}">Enter Weight</button>` : ''}
    ${['payment_pending', 'paid'].includes(pickup.status) ? `
      <div class="pickup-totals">
        <div><span>Total</span><strong>${Number(pickup.totals.kg).toFixed(2)} kg</strong></div>
        <div><span>Amount</span><strong>${formatMoney(pickup.totals.amount)}</strong></div>
        <div><span>Eco Points</span><strong>${pickup.pointsAwarded} pts</strong></div>
      </div>
      <p class="pickup-payment-status"><span class="badge">Payment: ${pickup.status === 'paid' ? 'Paid' : 'Pending'}</span></p>
    ` : ''}
  `;
  return card;
}

function openWeighForm(pickup) {
  selectedPickup = pickup;
  const form = document.getElementById('weigh-form');
  const fields = document.getElementById('weight-fields');
  fields.innerHTML = '';
  pickup.requestedCategories.forEach((category) => {
    const rate = CATEGORY_RATES[category] || 0;
    const row = document.createElement('label');
    row.innerHTML = `${category} (₹${rate}/kg)<input type="number" min="0" step="0.1" data-category="${category}" value="0">`;
    fields.appendChild(row);
  });
  fields.insertAdjacentHTML('beforeend', '<label>Collection notes<textarea id="collector-notes" rows="2" placeholder="Add a note about this pickup"></textarea></label>');
  document.getElementById('calc-summary').textContent = 'Total KG 0 · Total Amount ₹0.00 · Points 0';
  form.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth' });
}

function currentItems() {
  return [...document.querySelectorAll('#weight-fields input')].map((input) => ({
    category: input.dataset.category,
    kg: Number(input.value || 0)
  }));
}

function updateSummary() {
  const items = currentItems();
  const totalKg = items.reduce((sum, item) => sum + item.kg, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.kg * (CATEGORY_RATES[item.category] || 0), 0);
  const points = Math.round(totalKg * 10);
  document.getElementById('calc-summary').textContent =
    `Total KG ${totalKg.toFixed(2)} · Total Amount ${formatMoney(totalAmount)} · Points ${points}`;
}

async function loadPickups() {
  const list = document.getElementById('pickup-list');
  if (!list) return;
  destroyPickupMaps();
  list.innerHTML = '';
  const { pickups } = await API.collectorPickups('all');
  lastCollectorPickups = (Array.isArray(pickups) ? pickups : []).filter(
    (pickup) => pickupStatusKey(pickup) !== 'paid'
  );
  renderPickupList();
}

async function loadCollectorSummary() {
  const target = document.getElementById('scheduled-pickups');
  if (!target) return;
  const { stats } = await API.collectorSummary();
  target.textContent = stats.scheduledPickups;
  document.getElementById('completed-pickups').textContent = stats.completedPickups;
  document.getElementById('total-kg').textContent = `${Number(stats.totalKg || 0).toFixed(2)} kg`;
  document.getElementById('total-amount').textContent = formatMoney(stats.totalAmount);
}

async function initCollector() {
  installAuthGuard('collector');
  const user = await requireAuth('collector');
  if (!user) return;

  const greetingEl = document.getElementById('greeting');
  if (greetingEl) greetingEl.textContent = `Collector: ${user.name}`;
  const availability = document.getElementById('collector-availability');
  if (availability) {
    availability.value = user.availability || 'offline';
    availability.addEventListener('change', async () => {
      try {
        await API.updateCollectorAvailability(availability.value);
        showAlert(document.getElementById('alert'), 'Availability updated', 'success');
      } catch (err) {
        showAlert(document.getElementById('alert'), err.message);
      }
    });
  }

  const hasSummary = Boolean(document.getElementById('scheduled-pickups'));
  const hasPickupList = Boolean(document.getElementById('pickup-list'));
  try {
    const jobs = [];
    if (hasPickupList) jobs.push(loadPickups());
    if (hasSummary) jobs.push(loadCollectorSummary());
    await Promise.all(jobs);
  } catch (err) {
    showAlert(document.getElementById('alert'), err.message);
  }

  const pickupListEl = document.getElementById('pickup-list');
  if (pickupListEl) pickupListEl.addEventListener('click', async (event) => {
    const viewMapId = event.target.closest('[data-view-map]')?.dataset.viewMap;
    if (viewMapId) {
      const pickup = lastCollectorPickups.find((p) => String(p._id) === String(viewMapId));
      const url = pickup ? pickupDestination(pickup) : null;
      if (url) window.open(url, '_blank', 'noopener');
      return;
    }
    const weighId = event.target.getAttribute('data-weigh');
    const acceptId = event.target.getAttribute('data-accept');
    const startId = event.target.getAttribute('data-start');
    if (acceptId) {
      event.target.disabled = true;
      try { await API.acceptPickup(acceptId); await loadPickups(); await loadCollectorSummary(); showAlert(document.getElementById('alert'), 'Pickup accepted successfully.', 'success'); } catch (err) { showAlert(document.getElementById('alert'), err.message || 'Unable to update pickup. Please try again.'); event.target.disabled = false; }
    }
    if (startId) {
      event.target.disabled = true;
      try { await API.startPickup(startId); await loadPickups(); showAlert(document.getElementById('alert'), 'Pickup started.', 'success'); } catch (err) { showAlert(document.getElementById('alert'), err.message || 'Unable to update pickup. Please try again.'); event.target.disabled = false; }
    }
    if (weighId) {
      const { pickups } = await API.collectorPickups('all');
      const pickup = pickups.find((p) => p._id === weighId);
      if (pickup) openWeighForm(pickup);
    }
  });

  const filtersEl = document.getElementById('pickup-filters');
  if (filtersEl) {
    filtersEl.addEventListener('click', (event) => {
      const button = event.target.closest('[data-pickup-filter]');
      if (!button) return;
      activePickupFilter = button.dataset.pickupFilter;
      renderPickupList();
    });
  }

  const weightFieldsEl = document.getElementById('weight-fields');
  if (weightFieldsEl) weightFieldsEl.addEventListener('input', updateSummary);

  const completePickupEl = document.getElementById('complete-pickup');
  if (completePickupEl) completePickupEl.addEventListener('click', async () => {
    if (!selectedPickup) return;
    const completeButton = document.getElementById('complete-pickup');
    completeButton.disabled = true;
    try {
      await API.weigh(selectedPickup._id, currentItems(), document.getElementById('collector-notes').value.trim());
      showAlert(document.getElementById('alert'), 'Pickup marked as collected.', 'success');
      document.getElementById('weigh-form').classList.add('hidden');
      selectedPickup = null;
      await loadPickups();
      await loadCollectorSummary();
    } catch (err) {
      showAlert(document.getElementById('alert'), err.message || 'Unable to update pickup. Please try again.');
    } finally {
      completeButton.disabled = false;
    }
  });
}

initCollector();
