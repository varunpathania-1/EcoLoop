function formatMoney(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function renderPickupProgress(status) {
  const statuses = ['scheduled', 'accepted', 'in_progress', 'collected', 'payment_pending', 'paid'];
  const labels = { scheduled: 'Scheduled', accepted: 'Accepted', in_progress: 'In Progress', collected: 'Collected', payment_pending: 'Payment Pending', paid: 'Paid' };
  const currentIndex = statuses.indexOf(status);
  return `
    <div class="pickup-progress compact" aria-label="Pickup status: ${status}">
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

async function initDashboard() {
  installAuthGuard('resident');
  const user = await requireAuth('resident');
  if (!user) return;

  const greeting = document.getElementById('greeting');
  if (greeting) greeting.textContent = `Welcome, ${user.name}`;

  try {
    const data = await API.dashboard();
    document.getElementById('stat-kg').textContent = `${Number(data.totals.kg || 0).toFixed(2)} kg`;
    document.getElementById('stat-earned').textContent = formatMoney(data.totals.earned);
    document.getElementById('stat-points').textContent = data.totals.points || 0;
    document.getElementById('stat-pickups').textContent = data.totals.pickupCount || 0;
    document.getElementById('redemption-points').textContent = data.totals.points || 0;

    const tbody = document.getElementById('recent-body');
    tbody.innerHTML = '';
    if (!data.recentPickups.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">No pickups yet. Book your first pickup.</td></tr>';
    } else {
      data.recentPickups.forEach((pickup) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${formatDate(pickup.datetime)}</td>
          <td>${pickup.requestedCategories.join(', ')}</td>
          <td>${Number(pickup.totals.kg || 0).toFixed(2)} kg</td>
          <td>${renderPickupProgress(pickup.status)}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    const monthly = document.getElementById('monthly-body');
    monthly.innerHTML = '';
    if (!data.monthlyHistory.length) {
      monthly.innerHTML = '<tr><td colspan="3" class="muted">No recycling history yet.</td></tr>';
    } else {
      data.monthlyHistory.forEach((row) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${row.month}</td><td>${Number(row.kg).toFixed(2)} kg</td><td>${formatMoney(row.amount)}</td>`;
        monthly.appendChild(tr);
      });
    }
  } catch (err) {
    showAlert(document.getElementById('alert'), err.message);
  }
}

initDashboard();
