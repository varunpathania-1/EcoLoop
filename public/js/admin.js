function formatAdminDate(value) {
  return value ? new Date(value).toLocaleDateString() : '-';
}

function escapeAdminHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));
}

function showAdminMessage(message, type = 'error', target = 'admin-alert') {
  showAlert(document.getElementById(target), message, type);
}

function maskAdminAccount(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (digits.length <= 4) return '******';
  return '******' + digits.slice(-4);
}

function renderPayoutSummary(details) {
  if (!details) {
    return '<div><span class="collector-label">Payment Details</span><strong>Not Added</strong></div>';
  }
  const method = details.method === 'upi' ? 'UPI' : 'Bank Account';
  const id = 'pd-' + String(details.id || details._id || Math.random());
  if (details.method === 'upi') {
    return `<div><span class="collector-label">Payment Method</span><strong>${method}</strong></div>` +
      `<div><span class="collector-label">UPI ID</span><strong>${escapeAdminHtml(details.upiId)}</strong></div>` +
      `<div><span class="collector-label">Status</span><strong>${details.isVerified ? '✓ Verified' : 'Added'}</strong></div>`;
  }
  return `<div><span class="collector-label">Payment Method</span><strong>${method}</strong></div>` +
    `<div><span class="collector-label">Account Holder</span><strong>${escapeAdminHtml(details.accountHolderName)}</strong></div>` +
    `<div><span class="collector-label">Bank</span><strong>${escapeAdminHtml(details.bankName)}</strong></div>` +
    `<div><span class="collector-label">Account</span><strong><span data-masked="${escapeAdminHtml(maskAdminAccount(details.accountNumber))}" data-full="${escapeAdminHtml(details.accountNumber)}">${escapeAdminHtml(maskAdminAccount(details.accountNumber))}</span> <button class="collector-toggle" type="button" data-payout-show="${id}">Show</button></strong></div>` +
    `<div><span class="collector-label">IFSC</span><strong>${escapeAdminHtml(details.ifscCode)}</strong></div>` +
    `<div><span class="collector-label">Status</span><strong>${details.isVerified ? '✓ Verified' : 'Added'}</strong></div>`;
}

let adminPickupsCache = [];

function hasAdminPickupLocation(pickup) {
  return pickup && pickup.location != null &&
    Number.isFinite(Number(pickup.location.latitude)) &&
    Number.isFinite(Number(pickup.location.longitude));
}

function pickupMapUrl(pickup) {
  if (hasAdminPickupLocation(pickup)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickup.location.latitude + ',' + pickup.location.longitude)}`;
  }
  if (pickup && pickup.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickup.address)}`;
  }
  return null;
}

function renderAdminLocationCell(pickup) {
  const address = pickup && pickup.address ? String(pickup.address).trim() : '';
  if (hasAdminPickupLocation(pickup)) {
    const lat = Number(pickup.location.latitude);
    const lng = Number(pickup.location.longitude);
    return `
      <div><span class="collector-label">Pickup Location</span>
        <strong>${escapeAdminHtml(address || 'Selected pickup location')}</strong>
        <span class="muted">Latitude: ${lat.toFixed(6)}<br>Longitude: ${lng.toFixed(6)}</span>
        <a class="collector-toggle" style="display:inline-block;margin-top:6px;" href="${pickupMapUrl(pickup)}" target="_blank" rel="noopener">View on Map</a>
      </div>`;
  }
  if (address) {
    return `
      <div><span class="collector-label">Pickup Location</span>
        <strong>${escapeAdminHtml(address)}</strong>
        <a class="collector-toggle" style="display:inline-block;margin-top:6px;" href="${pickupMapUrl(pickup)}" target="_blank" rel="noopener">View on Map</a>
      </div>`;
  }
  return `<div><span class="collector-label">Pickup Location</span><span class="muted">Location not available</span></div>`;
}

function renderAdminPickups(pickups) {
  const list = document.getElementById('admin-pickups-body');
  if (!pickups.length) {
    list.innerHTML = '<div class="admin-empty">No pickups found.</div>';
    return;
  }
  list.innerHTML = pickups.map((pickup) => `
    <article class="admin-pickup-row">
      <div><strong>${escapeAdminHtml(pickup.user?.name || 'Customer')}</strong><span>${escapeAdminHtml(pickup.collectorId?.name || 'Unassigned')}</span></div>
      <div><span class="collector-label">Materials</span><strong>${escapeAdminHtml(pickup.requestedCategories.join(', '))}</strong></div>
      <div><span class="collector-label">Scheduled</span><strong>${formatAdminDate(pickup.datetime)}</strong></div>
      <div><span class="collector-label">Weight</span><strong>${Number(pickup.totals?.kg || 0).toFixed(2)} kg</strong></div>
      <div><span class="collector-label">Status</span><span class="application-status ${pickup.status}">${pickup.status.replace('_', ' ')}</span></div>
      <div class="admin-action-cell">${pickup.status === 'payment_pending' ? `<button class="collector-toggle" type="button" data-payout-toggle="${pickup._id}" data-payout-user="${pickup.user?._id || ''}">Payout Details</button> <button class="collector-toggle activate" type="button" data-pay-pickup="${pickup._id}">Mark as Paid</button>` : `<strong>${pickup.payment?.status === 'paid' ? 'Paid' : `₹${Number(pickup.totals?.amount || 0).toFixed(2)}`}</strong>`}</div>
      ${renderAdminLocationCell(pickup)}
      <div class="admin-payout-drawer" data-payout-drawer="${pickup._id}" hidden></div>
    </article>
  `).join('');
}

function filteredPickups() {
  const select = document.getElementById('pickup-status-filter');
  const status = select ? select.value : 'all';
  if (status === 'all') return adminPickupsCache;
  return adminPickupsCache.filter((pickup) => pickup.status === status);
}

function applyPickupFilter() {
  renderAdminPickups(filteredPickups());
}

async function loadAdminData() {
  const [{ stats }, { pickups }] = await Promise.all([API.adminDashboard(), API.adminPickups()]);
  document.getElementById('total-customers').textContent = stats.totalCustomers || 0;
  document.getElementById('total-collectors').textContent = stats.totalCollectors;
  document.getElementById('active-collectors').textContent = stats.activeCollectors;
  document.getElementById('inactive-collectors').textContent = stats.inactiveCollectors;
  document.getElementById('completed-pickups').textContent = stats.completedPickups;
  document.getElementById('pending-applications').textContent = stats.pendingApplications || 0;
  document.getElementById('total-pickups').textContent = stats.totalPickups || 0;
  document.getElementById('total-waste').textContent = `${Number(stats.totalWasteCollected || 0).toFixed(2)} kg`;
  document.getElementById('total-rewards').textContent = `₹${Number(stats.totalRewards || 0).toFixed(2)}`;
  document.getElementById('total-admins').textContent = stats.totalAdmins || 0;
  document.getElementById('active-admins').textContent = stats.activeAdmins || 0;
  adminPickupsCache = Array.isArray(pickups) ? pickups : [];
  applyPickupFilter();
}

async function initAdmin() {
  installAuthGuard('admin');
  const user = await requireAuth('admin');
  if (!user) return;

  try {
    await loadAdminData();
  } catch (err) {
    showAdminMessage(err.message);
  }

  const filterSelect = document.getElementById('pickup-status-filter');
  if (filterSelect) filterSelect.addEventListener('change', applyPickupFilter);

  document.getElementById('admin-pickups-body').addEventListener('click', async (event) => {
    const showButton = event.target.closest('[data-payout-show]');
    if (showButton) {
      const holder = showButton.closest('[data-masked]') || showButton.parentElement.querySelector('[data-masked]');
      const shown = showButton.textContent === 'Hide';
      if (holder) holder.textContent = shown ? holder.dataset.masked : holder.dataset.full;
      showButton.textContent = shown ? 'Show' : 'Hide';
      return;
    }

    const verifyButton = event.target.closest('[data-payout-verify]');
    if (verifyButton) {
      verifyButton.disabled = true;
      try {
        const { details } = await API.verifyUserPaymentDetails(
          verifyButton.dataset.payoutVerify,
          verifyButton.dataset.payoutNext === 'true'
        );
        showAdminMessage(details.isVerified ? 'Payout details marked verified.' : 'Verification removed.', 'success');
        await openPayoutDrawer(verifyButton.dataset.payoutPickup, verifyButton.dataset.payoutVerify, true);
      } catch (err) {
        showAdminMessage(err.message || 'Unable to update verification.');
        verifyButton.disabled = false;
      }
      return;
    }

    const drawerPayButton = event.target.closest('[data-payout-pay]');
    if (drawerPayButton) {
      const drawer = drawerPayButton.closest('[data-payout-drawer]');
      const txnInput = drawer ? drawer.querySelector('[data-payout-txn]') : null;
      const transactionId = txnInput ? txnInput.value.trim() : '';
      drawerPayButton.disabled = true;
      try {
        await API.adminPayPickup(drawerPayButton.dataset.payoutPay, transactionId || undefined);
        showAdminMessage('Payment completed.', 'success');
        await loadAdminData();
      } catch (err) {
        showAdminMessage(err.message || 'Unable to update pickup. Please try again.');
        drawerPayButton.disabled = false;
      }
      return;
    }

    const payoutButton = event.target.closest('[data-payout-toggle]');
    if (payoutButton) {
      await openPayoutDrawer(payoutButton.dataset.payoutToggle, payoutButton.dataset.payoutUser, false);
      return;
    }

    const button = event.target.closest('[data-pay-pickup]');
    if (!button) return;
    button.disabled = true;
    try {
      await API.adminPayPickup(button.dataset.payPickup);
      showAdminMessage('Payment completed.', 'success');
      await loadAdminData();
    } catch (err) {
      showAdminMessage(err.message || 'Unable to update pickup. Please try again.');
      button.disabled = false;
    }
  });
}

async function openPayoutDrawer(pickupId, userId, force) {
  const drawer = document.querySelector(`[data-payout-drawer="${pickupId}"]`);
  if (!drawer) return;
  if (!force && !drawer.hidden && drawer.dataset.userId === String(userId)) {
    drawer.hidden = true;
    return;
  }
  drawer.hidden = false;
  drawer.dataset.userId = String(userId || '');
  drawer.innerHTML = '<div class="admin-empty">Loading payout details…</div>';
  try {
    const { user, details } = await API.adminUserPaymentDetails(userId);
    const pickup = adminPickupsCache.find((p) => String(p._id) === String(pickupId));
    const amount = pickup ? Number(pickup.totals?.amount || pickup.payment?.amount || 0).toFixed(2) : '0.00';
    drawer.innerHTML =
      `<div><strong>${escapeAdminHtml(user?.name || 'Customer')}</strong><span> · ₹${amount} due</span></div>` +
      renderPayoutSummary(details) +
      (details
        ? `<div class="admin-action-cell"><button class="collector-toggle" type="button" data-payout-verify="${escapeAdminHtml(String(userId))}" data-payout-next="${!details.isVerified}" data-payout-pickup="${escapeAdminHtml(String(pickupId))}">${details.isVerified ? 'Remove Verification' : 'Mark Verified'}</button></div>` +
          `<div><span class="collector-label">Transaction / Reference ID</span><input data-payout-txn placeholder="e.g. UPI123456 (optional)" style="width:100%"></div>` +
          `<div class="admin-action-cell"><button class="collector-toggle activate" type="button" data-payout-pay="${escapeAdminHtml(String(pickupId))}">Mark Paid</button></div>`
        : `<div><span class="muted">Ask the customer to add payout details from their dashboard.</span></div>`);
  } catch (err) {
    drawer.innerHTML = `<div class="admin-empty">${escapeAdminHtml(err.message || 'Could not load payout details.')}</div>`;
  }
}

initAdmin();
