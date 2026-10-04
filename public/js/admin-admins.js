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

let currentAdminId = null;
let pendingAdminAction = null;

function renderAdmins(admins) {
  const list = document.getElementById('admins-body');
  if (!admins.length) {
    list.innerHTML = '<div class="admin-empty">No admin accounts found.</div>';
    return;
  }
  list.innerHTML = admins.map((admin) => {
    const active = admin.isActive !== false;
    const isSelf = String(admin.id) === String(currentAdminId);
    return `
      <article class="admin-row">
        <div class="admin-identity"><span class="collector-avatar">${escapeAdminHtml(admin.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase())}</span><div><strong>${escapeAdminHtml(admin.name)}</strong><span>${escapeAdminHtml(admin.email)}</span></div></div>
        <div class="admin-detail"><span class="collector-label">Phone</span><strong>${escapeAdminHtml(admin.phone)}</strong></div>
        <div class="admin-detail"><span class="collector-label">Status</span><span class="collector-status ${active ? 'active' : 'inactive'}"><i></i>${active ? 'Active' : 'Inactive'}</span></div>
        <div class="admin-detail"><span class="collector-label">Created</span><strong>${formatAdminDate(admin.createdAt)}</strong></div>
        <div class="admin-action-cell">${isSelf ? '<span class="admin-protected">Protected</span>' : active ? `<button class="collector-toggle deactivate" type="button" data-admin-id="${admin.id}" data-next-active="false">Deactivate</button>` : `<button class="collector-toggle activate" type="button" data-admin-id="${admin.id}" data-next-active="true">Activate</button>`}</div>
      </article>
    `;
  }).join('');
}

async function loadAdminsData() {
  const { admins } = await API.adminAdmins();
  renderAdmins(admins);
}

async function initAdmins() {
  installAuthGuard('admin');
  const user = await requireAuth('admin');
  if (!user) return;
  currentAdminId = user.id;

  try {
    await loadAdminsData();
  } catch (err) {
    showAdminMessage(err.message);
  }

  const adminModal = document.getElementById('admin-modal');
  const closeAdminModal = () => adminModal.classList.add('hidden');
  document.getElementById('open-admin-modal').addEventListener('click', () => {
    adminModal.classList.remove('hidden');
    document.getElementById('new-admin-name').focus();
  });
  document.getElementById('close-admin-modal').addEventListener('click', closeAdminModal);
  document.getElementById('cancel-admin').addEventListener('click', closeAdminModal);

  document.getElementById('admin-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.getElementById('new-admin-password').value;
    if (password !== document.getElementById('new-admin-confirm-password').value) {
      showAdminMessage('Passwords must match', 'error', 'admin-form-alert');
      return;
    }
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Creating admin...';
    try {
      await API.createAdmin({
        name: document.getElementById('new-admin-name').value,
        email: document.getElementById('new-admin-email').value,
        phone: document.getElementById('new-admin-phone').value,
        password
      });
      event.target.reset();
      closeAdminModal();
      showAdminMessage('Admin created successfully.', 'success');
      await loadAdminsData();
    } catch (err) {
      showAdminMessage(err.message, 'error', 'admin-form-alert');
    } finally {
      button.disabled = false;
      button.textContent = 'Create Admin';
    }
  });

  const confirmModal = document.getElementById('admin-confirm-modal');
  const closeConfirm = () => { pendingAdminAction = null; confirmModal.classList.add('hidden'); };
  document.getElementById('close-admin-confirm').addEventListener('click', closeConfirm);
  document.getElementById('cancel-admin-confirm').addEventListener('click', closeConfirm);
  document.getElementById('confirm-admin-deactivate').addEventListener('click', async () => {
    if (!pendingAdminAction) return;
    const button = document.getElementById('confirm-admin-deactivate');
    button.disabled = true;
    try {
      await API.updateAdminStatus(pendingAdminAction, false);
      closeConfirm();
      showAdminMessage('Admin deactivated', 'success');
      await loadAdminsData();
    } catch (err) {
      showAdminMessage(err.message);
      button.disabled = false;
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('admins-body').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-admin-id]');
    if (!button) return;
    const isActive = button.dataset.nextActive === 'true';
    if (!isActive) {
      pendingAdminAction = button.dataset.adminId;
      confirmModal.classList.remove('hidden');
      return;
    }
    button.disabled = true;
    try {
      await API.updateAdminStatus(button.dataset.adminId, true);
      showAdminMessage('Admin activated', 'success');
      await loadAdminsData();
    } catch (err) {
      showAdminMessage(err.message);
      button.disabled = false;
    }
  });
}

initAdmins();
