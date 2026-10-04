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

function availabilityLabel(value) {
  switch (value) {
    case 'available': return 'Available';
    case 'busy': return 'Busy';
    default: return 'Offline';
  }
}

function availabilityClass(value) {
  return value === 'available' ? 'active' : (value === 'busy' ? 'inactive' : 'inactive');
}

function renderCollectors(collectors) {
  const list = document.getElementById('collectors-body');
  if (!collectors.length) {
    list.innerHTML = '<div class="admin-empty">No collectors yet. Add your first collection partner.</div>';
    return;
  }

  list.innerHTML = collectors.map((collector) => {
    const active = collector.isActive !== false;
    const availability = collector.availability || 'offline';
    const initials = escapeAdminHtml(collector.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase());
    return `
      <article class="collector-row">
        <div class="collector-identity"><span class="collector-avatar">${initials}</span><div><strong>${escapeAdminHtml(collector.name)}</strong><span>${escapeAdminHtml(collector.email)}</span></div></div>
        <div class="collector-detail"><span class="collector-label">Phone</span><strong>${escapeAdminHtml(collector.phone)}</strong></div>
        <div class="collector-detail"><span class="collector-label">Status</span><span class="collector-status ${availability === 'available' ? 'active' : 'inactive'}"><i></i>${availabilityLabel(availability)}</span></div>
        <div class="collector-detail"><span class="collector-label">Account</span><strong>${active ? 'Active' : 'Deactivated'}</strong></div>
        <div class="collector-detail"><span class="collector-label">Pickups</span><strong>${collector.pickupCount || 0}</strong></div>
        <div class="collector-detail"><span class="collector-label">Created</span><strong>${formatAdminDate(collector.createdAt)}</strong></div>
        <button class="collector-toggle ${active ? 'deactivate' : 'activate'}" type="button" data-collector-id="${collector.id}" data-next-active="${!active}">${active ? 'Deactivate' : 'Activate'}</button>
      </article>
    `;
  }).join('');
}

function renderApplications(applications) {
  const list = document.getElementById('applications-body');
  if (!applications.length) {
    list.innerHTML = '<div class="admin-empty">No pending collector applications.</div>';
    return;
  }
  list.innerHTML = applications.map((application) => `
    <article class="application-row">
      <div><strong>${escapeAdminHtml(application.name)}</strong><span>${escapeAdminHtml(application.email)} · ${escapeAdminHtml(application.phone)}</span></div>
      <span class="application-status ${application.status}">${application.status}</span>
      <span class="application-meta">${formatAdminDate(application.createdAt)}</span>
      <div class="application-actions">
        ${application.status === 'pending' ? `<button class="collector-toggle activate" type="button" data-application-id="${application._id}" data-application-status="approved">Approve</button><button class="collector-toggle deactivate" type="button" data-application-id="${application._id}" data-application-status="rejected">Reject</button>` : ''}
        ${application.status === 'approved' ? `<button class="collector-toggle deactivate" type="button" data-application-id="${application._id}" data-application-status="suspended">Suspend</button>` : ''}
        ${application.status === 'suspended' ? `<button class="collector-toggle activate" type="button" data-application-id="${application._id}" data-application-status="approved">Reactivate</button>` : ''}
      </div>
    </article>
  `).join('');
}

async function loadCollectorsData() {
  const [{ collectors }, { applications }] = await Promise.all([API.adminCollectors(), API.adminApplications()]);
  renderCollectors(collectors);
  renderApplications(applications);
}

function closeCollectorModal() {
  document.getElementById('collector-modal').classList.add('hidden');
}

async function initAdminCollectors() {
  installAuthGuard('admin');
  const user = await requireAuth('admin');
  if (!user) return;

  try {
    await loadCollectorsData();
  } catch (err) {
    showAdminMessage(err.message);
  }

  document.getElementById('open-collector-modal').addEventListener('click', () => {
    document.getElementById('collector-modal').classList.remove('hidden');
    document.getElementById('collector-name').focus();
  });
  document.getElementById('close-collector-modal').addEventListener('click', closeCollectorModal);
  document.getElementById('cancel-collector').addEventListener('click', closeCollectorModal);

  document.getElementById('collector-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.getElementById('collector-password').value;
    const confirmation = document.getElementById('collector-confirm-password').value;
    if (password !== confirmation) {
      showAdminMessage('Passwords must match', 'error', 'collector-form-alert');
      return;
    }

    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Creating collector...';
    try {
      await API.createCollector({
        name: document.getElementById('collector-name').value,
        email: document.getElementById('collector-email').value,
        phone: document.getElementById('collector-phone').value,
        password,
        address: document.getElementById('collector-address').value
      });
      closeCollectorModal();
      event.target.reset();
      showAdminMessage('Collector created successfully', 'success');
      await loadCollectorsData();
    } catch (err) {
      showAdminMessage(err.message, 'error', 'collector-form-alert');
    } finally {
      button.disabled = false;
      button.textContent = 'Create Collector';
    }
  });

  document.getElementById('collectors-body').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-collector-id]');
    if (!button) return;
    button.disabled = true;
    try {
      await API.updateCollectorStatus(button.dataset.collectorId, button.dataset.nextActive === 'true');
      showAdminMessage(`Collector ${button.dataset.nextActive === 'true' ? 'activated' : 'deactivated'}`, 'success');
      await loadCollectorsData();
    } catch (err) {
      showAdminMessage(err.message);
      button.disabled = false;
    }
  });

  document.getElementById('applications-body').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-application-id]');
    if (!button) return;
    button.disabled = true;
    try {
      await API.updateApplicationStatus(button.dataset.applicationId, button.dataset.applicationStatus);
      showAdminMessage(`Application ${button.dataset.applicationStatus}`, 'success');
      await loadCollectorsData();
    } catch (err) {
      showAdminMessage(err.message);
      button.disabled = false;
    }
  });
}

initAdminCollectors();
