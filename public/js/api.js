const API_BASE = 'https://ecoloop-wayl.onrender.com';

const API = {
  async request(path, options = {}) {
    const { auth: authOption, ...fetchOptions } = options;
    const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('ecoloop_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (token && authOption !== false) headers.Authorization = `Bearer ${token}`;

    console.log('API REQUEST:', `${API_BASE}${path}`);

const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers
});
console.log('API RESPONSE:', res.status, res.url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if ((res.status === 401 || res.status === 403) && token && authOption !== false && typeof handleAuthFailure === 'function') {
        handleAuthFailure();
      }
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      throw err;
    }
    return data;
  },

  register(body) {
    return this.request('/api/auth/register', { method: 'POST', body: JSON.stringify(body), auth: false });
  },
  verifyRegistration(body) {
    return this.request('/api/auth/verify-registration', { method: 'POST', body: JSON.stringify(body), auth: false });
  },
  resendRegistrationOtp(email) {
    return this.request('/api/auth/resend-registration-otp', { method: 'POST', body: JSON.stringify({ email }), auth: false });
  },
  login(body) {
    return this.request('/api/auth/login', { method: 'POST', body: JSON.stringify(body), auth: false });
  },
  adminLogin(body) {
    return this.request('/api/auth/admin/login', { method: 'POST', body: JSON.stringify(body), auth: false });
  },
  collectorApply(body) {
    return this.request('/api/auth/collector/apply', { method: 'POST', body: JSON.stringify(body), auth: false });
  },
  me() {
    return this.request('/api/auth/me');
  },
  dashboard() {
    return this.request('/api/dashboard');
  },
  createPickup(body) {
    return this.request('/api/pickups', { method: 'POST', body: JSON.stringify(body) });
  },
  myPickups() {
    return this.request('/api/pickups/mine');
  },
  collectorPickups(status = 'scheduled') {
    return this.request(`/api/pickups/collector?status=${encodeURIComponent(status)}`);
  },
  collectorSummary() {
    return this.request('/api/pickups/collector/summary');
  },
  updateCollectorAvailability(availability) {
    return this.request('/api/pickups/collector/availability', { method: 'PATCH', body: JSON.stringify({ availability }) });
  },
  adminDashboard() {
    return this.request('/api/admin/dashboard');
  },
  adminCollectors() {
    return this.request('/api/admin/collectors');
  },
  adminAdmins() {
    return this.request('/api/admin/admins');
  },
  createAdmin(body) {
    return this.request('/api/admin/admins', { method: 'POST', body: JSON.stringify(body) });
  },
  updateAdminStatus(id, isActive) {
    return this.request(`/api/admin/admins/${id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) });
  },
  adminApplications() {
    return this.request('/api/admin/applications');
  },
  updateApplicationStatus(id, status) {
    return this.request(`/api/admin/applications/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  },
  createCollector(body) {
    return this.request('/api/admin/collectors', { method: 'POST', body: JSON.stringify(body) });
  },
  updateCollectorStatus(id, isActive) {
    return this.request(`/api/admin/collectors/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive })
    });
  },
  acceptPickup(id) {
    return this.request(`/api/pickups/${id}/accept`, { method: 'POST' });
  },
  startPickup(id) {
    return this.request(`/api/pickups/${id}/start`, { method: 'POST' });
  },
  adminCustomers() {
    return this.request('/api/admin/customers');
  },
  adminPickups(params = '') {
    return this.request(`/api/admin/pickups${params}`);
  },
  assignPickup(id, collectorId) {
    return this.request(`/api/admin/pickups/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ collectorId }) });
  },
  adminPayPickup(id, transactionId) {
    return this.request(`/api/pickups/${id}/admin-pay`, {
      method: 'POST',
      body: JSON.stringify(transactionId ? { transactionId } : {})
    });
  },
  getPaymentDetails() {
    return this.request('/api/payment-details');
  },
  savePaymentDetails(body) {
    return this.request('/api/payment-details', { method: 'PUT', body: JSON.stringify(body) });
  },
  deletePaymentDetails() {
    return this.request('/api/payment-details', { method: 'DELETE' });
  },
  adminUserPaymentDetails(userId) {
    return this.request(`/api/admin/users/${userId}/payment-details`);
  },
  verifyUserPaymentDetails(userId, isVerified) {
    return this.request(`/api/admin/users/${userId}/payment-details/verify`, {
      method: 'PATCH',
      body: JSON.stringify({ isVerified })
    });
  },
  weigh(id, items, collectorNotes = '') {
    return this.request(`/api/pickups/${id}/weigh`, { method: 'POST', body: JSON.stringify({ items, collectorNotes }) });
  },
  pay(id) {
    return this.request(`/api/pickups/${id}/pay`, { method: 'POST' });
  }
};

const CATEGORY_RATES = {
  paper: 8,
  cardboard: 7,
  plastic: 12,
  metal: 25,
  'e-waste': 15,
  other: 5
};
