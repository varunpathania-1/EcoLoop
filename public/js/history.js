function formatMoney(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

// Version marker read by the inline stale-script guard in history.html.
// Guarded so Node unit tests can require this file.
if (typeof window !== 'undefined') window.__historyFilters = 'popup-v1';

function formatHistoryDate(value) {
  const d = new Date(value);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `<span class="history-date">${date}</span><span class="history-time">${time}</span>`;
}

function formatMaterials(categories) {
  return categories
    .map((c) => String(c).charAt(0).toUpperCase() + String(c).slice(1))
    .join(' · ');
}

function prettyCategory(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function matchesStatus(pickup, status) {
  if (!status || status === 'all') return true;
  return String(pickup.status || '') === status;
}

function matchesPayment(pickup, payment) {
  if (!payment || payment === 'all') return true;
  const actual = pickup.payment && pickup.payment.status;
  if (payment === 'paid') return actual === 'paid';
  if (payment === 'pending') return actual === 'pending';
  return true;
}

function matchesCategory(pickup, category) {
  if (!category || category === 'all') return true;
  const cats = Array.isArray(pickup.requestedCategories) ? pickup.requestedCategories : [];
  return cats.map((c) => String(c).toLowerCase()).includes(String(category).toLowerCase());
}

function matchesDate(pickup, range, from, to, now) {
  if (!range || range === 'all') return true;
  const when = new Date(pickup.datetime);
  if (Number.isNaN(when.getTime())) return false;
  const ref = now instanceof Date ? now : new Date();
  const dayStart = startOfDay(ref);
  if (range === 'today') return when >= dayStart;
  if (range === 'week') {
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    return when >= weekStart;
  }
  if (range === 'month') {
    return when.getFullYear() === ref.getFullYear() && when.getMonth() === ref.getMonth();
  }
  if (range === 'last30') {
    return when >= new Date(ref.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  if (range === 'custom') {
    if (from) {
      const fromStart = startOfDay(new Date(from + 'T00:00:00'));
      if (when < fromStart) return false;
    }
    if (to) {
      const toEnd = new Date(to + 'T00:00:00');
      toEnd.setHours(23, 59, 59, 999);
      if (when > toEnd) return false;
    }
    return true;
  }
  return true;
}

function matchesSearch(pickup, term) {
  if (!term || !String(term).trim()) return true;
  const haystack = [
    pickup._id,
    pickup.datetime,
    pickup.address,
    pickup.status,
    pickup.payment && pickup.payment.status,
    (Array.isArray(pickup.requestedCategories) ? pickup.requestedCategories : []).join(' ')
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(String(term).trim().toLowerCase());
}

function applyPickupFilters(pickups, filters, now) {
  const list = Array.isArray(pickups) ? pickups : [];
  const f = filters || {};
  return list.filter((pickup) =>
    matchesStatus(pickup, f.status) &&
    matchesPayment(pickup, f.payment) &&
    matchesCategory(pickup, f.category) &&
    matchesDate(pickup, f.date, f.from, f.to, now) &&
    matchesSearch(pickup, f.search)
  );
}

function renderHistoryProgress(status) {
  const steps = [
    ['scheduled', 'Scheduled'],
    ['accepted', 'Accepted'],
    ['in_progress', 'In Prog'],
    ['collected', 'Collected'],
    ['payment_pending', 'Pay Pend'],
    ['paid', 'Paid']
  ];
  const currentIndex = steps.findIndex(([key]) => key === status);
  return `
    <div class="history-progress" role="img" aria-label="Pickup status: ${status}">
      ${steps.map(([key, label], index) => `
        <div class="history-progress-step ${index < currentIndex ? 'done' : ''} ${index === currentIndex ? 'now' : ''}">
          <span class="history-progress-dot" aria-hidden="true">${index < currentIndex ? '✓' : index + 1}</span>
          <span class="history-progress-label">${label}</span>
        </div>
        ${index < steps.length - 1 ? `<span class="history-progress-line ${index < currentIndex ? 'done' : ''}" aria-hidden="true"></span>` : ''}
      `).join('')}
    </div>
  `;
}

function renderPaymentPill(status) {
  if (!status || status === 'none') return '<span class="muted">-</span>';
  if (status === 'paid') return '<span class="pay-pill pay-paid">Paid</span>';
  const label = String(status).charAt(0).toUpperCase() + String(status).slice(1);
  return `<span class="pay-pill pay-pending">${label}</span>`;
}

function renderHistoryRows(pickups) {
  return pickups.map((pickup) => `
    <tr>
      <td>${formatHistoryDate(pickup.datetime)}</td>
      <td>${formatMaterials(pickup.requestedCategories)}</td>
      <td><strong>${Number(pickup.totals.kg || 0).toFixed(2)} kg</strong></td>
      <td><strong>${formatMoney(pickup.totals.amount)}</strong></td>
      <td><strong>${pickup.pointsAwarded || 0}</strong> pts</td>
      <td>${renderHistoryProgress(pickup.status)}</td>
      <td>${renderPaymentPill(pickup.payment?.status)}</td>
    </tr>
  `).join('');
}

async function initHistory() {
  installAuthGuard('resident');
  const user = await requireAuth('resident');
  if (!user) return;

  const searchEl = document.getElementById('history-search');
  const statusEl = document.getElementById('pickupFilterStatus');
  const paymentEl = document.getElementById('pickupFilterPayment');
  const categoryEl = document.getElementById('pickupFilterCategory');
  const dateEl = document.getElementById('pickupFilterDate');
  const fromEl = document.getElementById('pickupFilterFrom');
  const toEl = document.getElementById('pickupFilterTo');
  const customDates = document.getElementById('pickupCustomDateFields');
  const clearBtn = document.getElementById('pickupHistoryFilterClear');
  const applyBtn = document.getElementById('pickupHistoryFilterApply');
  const chipsEl = document.getElementById('history-chips');
  const countEl = document.getElementById('history-count');
  const tbody = document.getElementById('history-body');
  const filtersBtn = document.getElementById('pickupHistoryFilterButton');
  const filtersBadge = document.getElementById('history-filters-badge');
  const overlay = document.getElementById('pickupHistoryFilterOverlay');
  const panel = document.getElementById('pickupHistoryFilterPanel');
  const popupClose = document.getElementById('pickupHistoryFilterClose');

  let allPickups = [];

  function defaultFilters() {
    return { search: '', status: 'all', payment: 'all', category: 'all', date: 'all', from: '', to: '' };
  }

  let applied = defaultFilters();

  function readControls() {
    return {
      search: searchEl.value,
      status: statusEl.value,
      payment: paymentEl.value,
      category: categoryEl.value,
      date: dateEl.value,
      from: fromEl.value,
      to: toEl.value
    };
  }

  function syncControls(f) {
    searchEl.value = f.search;
    statusEl.value = f.status;
    paymentEl.value = f.payment;
    categoryEl.value = f.category;
    dateEl.value = f.date;
    fromEl.value = f.from;
    toEl.value = f.to;
    customDates.hidden = f.date !== 'custom';
  }

  function activeCategoryCount(f) {
    let n = 0;
    if (f.status !== 'all') n++;
    if (f.payment !== 'all') n++;
    if (f.category !== 'all') n++;
    if (f.date !== 'all') n++;
    return n;
  }

  function hasActiveFilters(f) {
    return Boolean((f.search || '').trim()) || f.status !== 'all' || f.payment !== 'all' ||
      f.category !== 'all' || f.date !== 'all' || f.from || f.to;
  }

  function chipLabel(kind, value) {
    if (kind === 'search') return `Search: ${value.trim()}`;
    if (kind === 'status') return `Status: ${value.replace(/_/g, ' ')}`;
    if (kind === 'payment') return value === 'paid' ? 'Payment: Paid' : 'Payment: Pending';
    if (kind === 'category') return `Category: ${prettyCategory(value)}`;
    if (kind === 'date') {
      const names = { today: 'Today', week: 'This Week', month: 'This Month', last30: 'Last 30 Days', custom: 'Custom Date' };
      return `Date: ${names[value] || value}`;
    }
    return value;
  }

  function renderChips(f) {
    const chips = [];
    if ((f.search || '').trim()) chips.push(['search', chipLabel('search', f.search)]);
    if (f.status !== 'all') chips.push(['status', chipLabel('status', f.status)]);
    if (f.payment !== 'all') chips.push(['payment', chipLabel('payment', f.payment)]);
    if (f.category !== 'all') chips.push(['category', chipLabel('category', f.category)]);
    if (f.date !== 'all') chips.push(['date', chipLabel('date', f.date)]);
    chipsEl.innerHTML = chips.map(([kind, label]) =>
      `<button type="button" class="history-chip" data-chip-kind="${kind}">${label} <span aria-hidden="true">×</span></button>`
    ).join('');
  }

  function clearChip(kind) {
    if (kind === 'search') applied.search = '';
    if (kind === 'status') applied.status = 'all';
    if (kind === 'payment') applied.payment = 'all';
    if (kind === 'category') applied.category = 'all';
    if (kind === 'date') {
      applied.date = 'all';
      applied.from = '';
      applied.to = '';
    }
    syncControls(applied);
    refresh();
  }

  function clearAll() {
    applied = defaultFilters();
    syncControls(applied);
    refresh();
  }

  function refresh() {
    const f = applied;
    const filtered = applyPickupFilters(allPickups, f);
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="history-empty"><strong>No pickups found</strong><p>No pickups match your current filters.</p><button type="button" class="btn secondary" data-empty-clear>Clear Filters</button></div></td></tr>`;
    } else {
      tbody.innerHTML = renderHistoryRows(filtered);
    }
    countEl.textContent = hasActiveFilters(f)
      ? `Showing ${filtered.length} of ${allPickups.length} pickups`
      : `Showing ${allPickups.length} pickup${allPickups.length === 1 ? '' : 's'}`;
    renderChips(f);
    const n = activeCategoryCount(f);
    filtersBadge.hidden = n === 0;
    filtersBadge.textContent = n === 0 ? '' : String(n);
  }

  function openPopup() {
    syncControls(applied);
    panel.hidden = false;
    overlay.hidden = false;
    filtersBtn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
      panel.classList.add('is-open');
      overlay.classList.add('is-open');
    });
    document.body.classList.add('pickup-filter-open');
  }

  function closePopup() {
    panel.classList.remove('is-open');
    overlay.classList.remove('is-open');
    setTimeout(() => {
      panel.hidden = true;
      overlay.hidden = true;
    }, 200);
    document.body.classList.remove('pickup-filter-open');
    filtersBtn.focus();
  }

  function initPickupHistoryFilters() {
    console.log('[EcoLoop] Pickup filter initialization', {
      button: !!filtersBtn,
      panel: !!panel,
      overlay: !!overlay,
      closeButton: !!popupClose,
      applyButton: !!applyBtn,
      clearButton: !!clearBtn
    });
    if (!filtersBtn || !panel || !overlay) {
      console.error('[EcoLoop] Pickup filter elements are missing.');
      return;
    }
    searchEl.addEventListener('input', () => {
      applied.search = searchEl.value;
      refresh();
    });
    filtersBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPopup();
    });
    if (popupClose) {
      popupClose.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closePopup();
      });
    }
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closePopup();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) closePopup();
    });
    dateEl.addEventListener('change', () => {
      customDates.hidden = dateEl.value !== 'custom';
    });
    if (applyBtn) {
      // Reuses the existing pickup filtering (applyPickupFilters) below.
      applyBtn.addEventListener('click', (event) => {
        event.preventDefault();
        applied = readControls();
        closePopup();
        refresh();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', (event) => {
        event.preventDefault();
        clearAll();
      });
    }
    chipsEl.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-chip-kind]');
      if (chip) clearChip(chip.dataset.chipKind);
    });
    tbody.addEventListener('click', (event) => {
      if (event.target.closest('[data-empty-clear]')) clearAll();
    });
  }

  initPickupHistoryFilters();

  try {
    const { pickups } = await API.myPickups();
    allPickups = Array.isArray(pickups) ? pickups : [];
    const seen = [];
    allPickups.forEach((pickup) => {
      (Array.isArray(pickup.requestedCategories) ? pickup.requestedCategories : []).forEach((c) => {
        const key = String(c).toLowerCase();
        if (key && !seen.includes(key)) seen.push(key);
      });
    });
    seen.sort().forEach((key) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = prettyCategory(key);
      categoryEl.appendChild(option);
    });
    if (!allPickups.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No pickup or payment history yet.</td></tr>';
      countEl.textContent = 'Showing 0 pickups';
      return;
    }
    refresh();
  } catch (err) {
    showAlert(document.getElementById('alert'), err.message);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applyPickupFilters, matchesStatus, matchesPayment, matchesCategory, matchesDate, matchesSearch };
} else {
  initHistory();
}
