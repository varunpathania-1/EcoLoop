process.env.MONGODB_URI = process.env.E2E_MONGODB_URI || 'mongodb://127.0.0.1:27017/ecoloop_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.OTP_DEV_MODE = process.env.OTP_DEV_MODE || 'true';
// E2E must never send real emails: blank the SMTP keys so dotenv cannot
// repopulate them and the dev-mode OTP path is used instead.
process.env.EMAIL_HOST = '';
process.env.EMAIL_USER = '';
process.env.EMAIL_PASSWORD = '';

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { app } = require('../server');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const { hashOtp } = require('../services/otp');

async function listen(serverApp) {
  return new Promise((resolve) => {
    const server = serverApp.listen(0, () => resolve(server));
  });
}

async function request(base, path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} ${res.status}: ${data.error || 'failed'}`);
  }
  return data;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  await mongoose.connection.dropDatabase();

  const server = await listen(app);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  await User.create({
    name: 'EcoLoop Admin',
    email: 'admin@ecoloop.com',
    password: 'admin123',
    phone: '9999999998',
    address: 'EcoLoop Admin Office',
    role: 'admin'
  });

  const admin = await request(base, '/api/auth/admin/login', {
    method: 'POST',
    body: { email: 'admin@ecoloop.com', password: 'admin123' }
  });
  if (admin.user.role !== 'admin') throw new Error('Admin login did not return admin role');

  const createdAdmin = await request(base, '/api/admin/admins', {
    method: 'POST',
    token: admin.token,
    body: {
      name: 'Test Admin',
      email: 'testadmin@ecoloop.com',
      phone: '9876543200',
      password: 'test123'
    }
  });
  if (createdAdmin.admin.role !== 'admin' || !createdAdmin.admin.isActive || createdAdmin.admin.password) {
    throw new Error('Admin creation did not return a safe active admin');
  }
  const testAdminId = createdAdmin.admin.id;
  const adminList = await request(base, '/api/admin/admins', { token: admin.token });
  if (!adminList.admins.some((item) => item.id === testAdminId)) throw new Error('Created admin missing from admin list');
  const testAdmin = await request(base, '/api/auth/admin/login', {
    method: 'POST', body: { email: 'testadmin@ecoloop.com', password: 'test123' }
  });
  if (testAdmin.user.role !== 'admin') throw new Error('Created admin could not log in');

  try {
    await request(base, `/api/admin/admins/${admin.user.id}/status`, {
      method: 'PATCH', token: admin.token, body: { isActive: false }
    });
    throw new Error('Admin should not deactivate themselves');
  } catch (err) {
    if (!String(err.message).includes('cannot deactivate your own')) throw err;
  }

  await request(base, `/api/admin/admins/${testAdminId}/status`, {
    method: 'PATCH', token: admin.token, body: { isActive: false }
  });
  try {
    await request(base, '/api/auth/admin/login', {
      method: 'POST', body: { email: 'testadmin@ecoloop.com', password: 'test123' }
    });
    throw new Error('Deactivated admin should not log in');
  } catch (err) {
    if (!String(err.message).includes('admin account has been deactivated')) throw err;
  }
  await request(base, `/api/admin/admins/${testAdminId}/status`, {
    method: 'PATCH', token: admin.token, body: { isActive: true }
  });
  const reactivatedAdmin = await request(base, '/api/auth/admin/login', {
    method: 'POST', body: { email: 'testadmin@ecoloop.com', password: 'test123' }
  });
  await request(base, `/api/admin/admins/${admin.user.id}/status`, {
    method: 'PATCH', token: reactivatedAdmin.token, body: { isActive: false }
  });
  try {
    await request(base, `/api/admin/admins/${testAdminId}/status`, {
      method: 'PATCH', token: reactivatedAdmin.token, body: { isActive: false }
    });
    throw new Error('The last active admin should not be deactivated');
  } catch (err) {
    if (!String(err.message).includes('cannot deactivate your own')) throw err;
  }
  await request(base, `/api/admin/admins/${admin.user.id}/status`, {
    method: 'PATCH', token: reactivatedAdmin.token, body: { isActive: true }
  });

  const initialAdminDashboard = await request(base, '/api/admin/dashboard', { token: admin.token });
  if (initialAdminDashboard.stats.totalCollectors !== 0) throw new Error('Unexpected initial collector count');

  const createdCollector = await request(base, '/api/admin/collectors', {
    method: 'POST',
    token: admin.token,
    body: {
      name: 'Test Collector',
      email: 'collector@test.com',
      phone: '9876543210',
      password: 'test123',
      address: 'Test Collection Hub'
    }
  });
  if (createdCollector.collector.role !== 'collector' || !createdCollector.collector.isActive) {
    throw new Error('Admin did not create an active collector');
  }
  if (createdCollector.collector.password) throw new Error('Collector password was returned');

  const application = await request(base, '/api/auth/collector/apply', {
    method: 'POST',
    body: {
      name: 'Applicant Collector',
      email: 'applicant@ecoloop.com',
      phone: '9876543211',
      password: 'applicant123',
      address: 'Applicant Hub',
      vehicleType: 'Van',
      verificationInfo: 'ID-12345'
    }
  });
  if (application.application.status !== 'pending') throw new Error('Collector application was not pending');
  const applications = await request(base, '/api/admin/applications', { token: admin.token });
  const pendingApplication = applications.applications.find((item) => item.email === 'applicant@ecoloop.com');
  if (!pendingApplication || pendingApplication.status !== 'pending') throw new Error('Admin did not see pending application');
  await request(base, `/api/admin/applications/${pendingApplication._id}/status`, {
    method: 'PATCH', token: admin.token, body: { status: 'approved' }
  });
  const approvedCollector = await request(base, '/api/auth/login', {
    method: 'POST', body: { email: 'applicant@ecoloop.com', password: 'applicant123' }
  });
  if (approvedCollector.user.role !== 'collector') throw new Error('Approved applicant did not become a collector');
  const collectorId = approvedCollector.user.id;

  // ---- Resident OTP registration flow ----
  const residentBody = {
    name: 'Test Resident',
    email: 'resident@example.com',
    password: 'resident123',
    phone: '8888888888',
    address: '12 Green Street'
  };

  const registered = await request(base, '/api/auth/register', {
    method: 'POST',
    body: residentBody
  });
  if (registered.success !== true) throw new Error('Register did not return success');
  if (registered.token || registered.user) throw new Error('Register must not create a session before verification');
  const pendingAfterRegister = await PendingRegistration.findOne({ email: 'resident@example.com' });
  if (!pendingAfterRegister) throw new Error('Pending registration was not stored');
  if (!pendingAfterRegister.passwordHash || pendingAfterRegister.passwordHash === 'resident123') {
    throw new Error('Pending registration must store a hashed password');
  }
  if (await User.findOne({ email: 'resident@example.com' })) {
    throw new Error('User must not exist before OTP verification');
  }
  try {
    await request(base, '/api/auth/login', {
      method: 'POST', body: { email: 'resident@example.com', password: 'resident123' }
    });
    throw new Error('Login should fail before verification');
  } catch (err) {
    if (!String(err.message).includes('401')) throw err;
  }

  async function setKnownOtp(emailOtp = '111111') {
    await PendingRegistration.updateOne(
      { email: 'resident@example.com' },
      { $set: { emailOtpHash: hashOtp(emailOtp) } }
    );
  }
  await setKnownOtp();

  try {
    await request(base, '/api/auth/verify-registration', {
      method: 'POST', body: { email: 'resident@example.com', emailOtp: '000000' }
    });
    throw new Error('Wrong email OTP should fail');
  } catch (err) {
    if (!String(err.message).includes('Incorrect email verification code')) throw err;
  }

  // Expired OTP.
  await PendingRegistration.updateOne(
    { email: 'resident@example.com' },
    { $set: { otpExpiresAt: new Date(Date.now() - 1000) } }
  );
  try {
    await request(base, '/api/auth/verify-registration', {
      method: 'POST', body: { email: 'resident@example.com', emailOtp: '111111' }
    });
    throw new Error('Expired OTP should fail');
  } catch (err) {
    if (!String(err.message).includes('expired')) throw err;
  }

  // Re-register after expiry, then resend invalidates old OTPs.
  await request(base, '/api/auth/register', { method: 'POST', body: residentBody });
  await setKnownOtp();
  const resent = await request(base, '/api/auth/resend-registration-otp', {
    method: 'POST', body: { email: 'resident@example.com' }
  });
  if (resent.success !== true) throw new Error('Resend did not return success');
  if (resent.maskedEmail !== 'r***@example.com') throw new Error('Resend must return masked email');
  try {
    await request(base, '/api/auth/verify-registration', {
      method: 'POST', body: { email: 'resident@example.com', emailOtp: '111111' }
    });
    throw new Error('Old OTP should be invalid after resend');
  } catch (err) {
    if (!String(err.message).includes('Incorrect email verification code')) throw err;
  }

  // Resend rate limit: 3 max per 15 minutes (1 used above).
  await request(base, '/api/auth/resend-registration-otp', { method: 'POST', body: { email: 'resident@example.com' } });
  await request(base, '/api/auth/resend-registration-otp', { method: 'POST', body: { email: 'resident@example.com' } });
  try {
    await request(base, '/api/auth/resend-registration-otp', { method: 'POST', body: { email: 'resident@example.com' } });
    throw new Error('Resend rate limit should trigger');
  } catch (err) {
    if (!String(err.message).includes('429')) throw err;
  }

  // Attempt limit: 5 failures invalidate the pending registration.
  await setKnownOtp();
  for (let i = 0; i < 4; i++) {
    try {
      await request(base, '/api/auth/verify-registration', {
        method: 'POST', body: { email: 'resident@example.com', emailOtp: '000000' }
      });
      throw new Error('Wrong OTP should fail');
    } catch (err) {
      if (!String(err.message).includes('Incorrect email verification code')) throw err;
    }
  }
  try {
    await request(base, '/api/auth/verify-registration', {
      method: 'POST', body: { email: 'resident@example.com', emailOtp: '000000' }
    });
    throw new Error('Attempt limit should trigger');
  } catch (err) {
    if (!String(err.message).includes('Too many incorrect attempts')) throw err;
  }

  // Fresh registration, then successful verification.
  await request(base, '/api/auth/register', { method: 'POST', body: residentBody });
  await setKnownOtp();
  const verified = await request(base, '/api/auth/verify-registration', {
    method: 'POST', body: { email: 'resident@example.com', emailOtp: '111111' }
  });
  if (verified.success !== true) throw new Error('Verification did not succeed');
  if (await PendingRegistration.findOne({ email: 'resident@example.com' })) {
    throw new Error('Pending registration must be deleted after verification');
  }
  const createdUser = await User.findOne({ email: 'resident@example.com' });
  if (!createdUser || createdUser.role !== 'resident') throw new Error('Verified user must exist with role resident');

  // Duplicate email and phone rejected after account exists.
  try {
    await request(base, '/api/auth/register', { method: 'POST', body: residentBody });
    throw new Error('Duplicate email should be rejected');
  } catch (err) {
    if (!String(err.message).includes('already exists')) throw err;
  }
  try {
    await request(base, '/api/auth/register', {
      method: 'POST',
      body: { ...residentBody, email: 'another@example.com' }
    });
    throw new Error('Duplicate phone should be rejected');
  } catch (err) {
    if (!String(err.message).includes('already exists')) throw err;
  }

  const resident = await request(base, '/api/auth/login', {
    method: 'POST', body: { email: 'resident@example.com', password: 'resident123' }
  });
  if (!resident.token) throw new Error('Verified resident could not log in');

  // ---- Remember Me session durations (JWT exp, server-enforced) ----
  function tokenLifetime(token) {
    const payload = jwt.decode(token);
    if (!payload || typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
      throw new Error('Login token is missing exp/iat claims');
    }
    return payload.exp - payload.iat;
  }

  const shortSession = await request(base, '/api/auth/login', {
    method: 'POST', body: { email: 'resident@example.com', password: 'resident123', rememberMe: false }
  });
  if (tokenLifetime(shortSession.token) !== 2 * 60 * 60) throw new Error('Unchecked Remember Me must issue a 2h token');
  if (shortSession.expiresIn !== '2h' || shortSession.remember !== false) throw new Error('Short session response flags mismatch');

  const longSession = await request(base, '/api/auth/login', {
    method: 'POST', body: { email: 'resident@example.com', password: 'resident123', rememberMe: true }
  });
  if (tokenLifetime(longSession.token) !== 30 * 24 * 60 * 60) throw new Error('Checked Remember Me must issue a 30d token');
  if (longSession.expiresIn !== '30d' || longSession.remember !== true) throw new Error('Long session response flags mismatch');

  // Callers predating the flag (admin/collector flows) keep the 7d default.
  if (tokenLifetime(resident.token) !== 7 * 24 * 60 * 60) throw new Error('Login without rememberMe must keep the 7d default');

  // An expired token is rejected by protected APIs with 401.
  const expiredToken = jwt.sign({ id: resident.user.id, role: 'resident' }, process.env.JWT_SECRET, { expiresIn: '-1h' });
  try {
    await request(base, '/api/auth/me', { token: expiredToken });
    throw new Error('Expired token should be rejected');
  } catch (err) {
    if (!String(err.message).includes('401')) throw err;
  }
  try {
    await request(base, '/api/dashboard', { token: expiredToken });
    throw new Error('Expired token should be rejected on dashboard');
  } catch (err) {
    if (!String(err.message).includes('401')) throw err;
  }

  // The login page checkbox must default to OFF.
  const loginHtml = await (await fetch(`${base}/login.html`)).text();
  const rememberTag = loginHtml.match(/<input[^>]*id="remember-me"[^>]*>/);
  if (!rememberTag || /\bchecked\b/.test(rememberTag[0])) throw new Error('Remember Me checkbox must default to unchecked');

  // ---- Payout details flow ----
  async function putPayout(token, body, expectStatus) {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const res = await fetch(`${base}/api/payment-details`, { method: 'PUT', headers, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (expectStatus && res.status !== expectStatus) {
      throw new Error(`PUT /api/payment-details: expected ${expectStatus}, got ${res.status} (${data.error || 'no error'})`);
    }
    return { status: res.status, data };
  }

  const emptyPayout = await request(base, '/api/payment-details', { token: resident.token });
  if (emptyPayout.details !== null) throw new Error('New resident should have no payout details');

  await putPayout(resident.token, { method: 'upi', upiId: 'bad-upi!!' }, 400);
  await putPayout(resident.token, { method: 'bank', accountHolderName: 'T', bankName: 'SBI', accountNumber: '123', confirmAccountNumber: '123', ifscCode: 'SBIN0001234' }, 400);
  await putPayout(resident.token, { method: 'bank', accountHolderName: 'T', bankName: 'SBI', accountNumber: '1234567890', confirmAccountNumber: '1234567890', ifscCode: 'NOPE' }, 400);
  await putPayout(resident.token, { method: 'bank', accountHolderName: 'T', bankName: 'SBI', accountNumber: '1234567890', confirmAccountNumber: '9999999999', ifscCode: 'SBIN0001234' }, 400);
  await putPayout(resident.token, { method: 'cash' }, 400);

  const savedUpi = await putPayout(resident.token, { method: 'upi', upiId: 'resident@upi' });
  if (savedUpi.data.details.upiId !== 'resident@upi' || savedUpi.data.details.isVerified !== false) {
    throw new Error('UPI payout was not saved correctly');
  }
  const reloaded = await request(base, '/api/payment-details', { token: resident.token });
  if (reloaded.details.upiId !== 'resident@upi') throw new Error('Payout details did not persist');

  // Second user isolation: B cannot see or touch A's details (no userId param exists).
  const userB = await User.create({ name: 'Second Resident', email: 'second@example.com', password: 'second123', phone: '7777777777', address: '7 Other Street', role: 'resident' });
  const loginB = await request(base, '/api/auth/login', { method: 'POST', body: { email: 'second@example.com', password: 'second123' } });
  const bPayout = await request(base, '/api/payment-details', { token: loginB.token });
  if (bPayout.details !== null) throw new Error('User B must not see user A payout details');
  await putPayout(loginB.token, { method: 'upi', upiId: 'second@upi' });
  const aAgain = await request(base, '/api/payment-details', { token: resident.token });
  if (aAgain.details.upiId !== 'resident@upi') throw new Error('User A payout was disturbed by user B');

  // Collector and anonymous access are forbidden everywhere payout-related.
  for (const [label, fn] of [
    ['collector payout GET', () => request(base, '/api/payment-details', { token: approvedCollector.token })],
    ['collector payout PUT', async () => {
      const r = await putPayout(approvedCollector.token, { method: 'upi', upiId: 'x@yBank' });
      if (r.status === 403) throw new Error('403 as expected');
      throw new Error('expected 403, got ' + r.status);
    }],
    ['collector admin payout', () => request(base, `/api/admin/users/${resident.user.id}/payment-details`, { token: approvedCollector.token })],
    ['anon payout GET', () => request(base, '/api/payment-details')]
  ]) {
    try {
      await fn();
      throw new Error(label + ' should be rejected');
    } catch (err) {
      if (!/401|403/.test(err.message)) throw err;
    }
  }

  // Admin can view; verify flag round-trips; edits reset verification.
  const adminView = await request(base, `/api/admin/users/${resident.user.id}/payment-details`, { token: admin.token });
  if (!adminView.details || adminView.details.upiId !== 'resident@upi') throw new Error('Admin could not view payout details');
  try {
    await request(base, '/api/admin/users/000000000000000000000000/payment-details', { token: admin.token });
    throw new Error('Missing user should 404');
  } catch (err) {
    if (!String(err.message).includes('404')) throw err;
  }
  const verifiedPayout = await request(base, `/api/admin/users/${resident.user.id}/payment-details/verify`, {
    method: 'PATCH', token: admin.token, body: { isVerified: true }
  });
  if (verifiedPayout.details.isVerified !== true || !verifiedPayout.details.verifiedBy) throw new Error('Verify flag did not persist with audit');
  await putPayout(resident.token, { method: 'upi', upiId: 'resident-new@upi' });
  const afterEdit = await request(base, '/api/payment-details', { token: resident.token });
  if (afterEdit.details.isVerified !== false) throw new Error('Editing payout details must reset verification');

  // Method switch clears the stale method's fields.
  await putPayout(resident.token, { method: 'bank', accountHolderName: 'Test Resident', bankName: 'SBI', accountNumber: '1234567890', confirmAccountNumber: '1234567890', ifscCode: 'sbin0001234' });
  const banked = await request(base, '/api/payment-details', { token: resident.token });
  if (banked.details.method !== 'bank' || banked.details.upiId !== null || banked.details.ifscCode !== 'SBIN0001234') {
    throw new Error('Bank switch did not clear UPI fields or normalize IFSC');
  }
  await putPayout(resident.token, { method: 'upi', upiId: 'resident@upi' });
  const backToUpi = await request(base, '/api/payment-details', { token: resident.token });
  if (backToUpi.details.accountNumber !== null) throw new Error('UPI switch did not clear bank fields');

  // Delete then re-add for the payment leg below.
  const delRes = await fetch(`${base}/api/payment-details`, { method: 'DELETE', headers: { Authorization: `Bearer ${resident.token}` } });
  if (delRes.status !== 200) throw new Error('DELETE payout failed');
  const afterDelete = await request(base, '/api/payment-details', { token: resident.token });
  if (afterDelete.details !== null) throw new Error('Deleted payout details still returned');
  await putPayout(resident.token, { method: 'upi', upiId: 'resident@upi' });

  try {
    await request(base, '/api/admin/admins', { token: resident.token });
    throw new Error('Resident should not access admin management');
  } catch (err) {
    if (!String(err.message).includes('403')) throw err;
  }


  try {
    await request(base, '/api/auth/admin/login', {
      method: 'POST',
      body: { email: 'resident@example.com', password: 'resident123' }
    });
    throw new Error('Resident should not receive admin access');
  } catch (err) {
    if (!String(err.message).includes('403')) throw err;
  }

  await request(base, `/api/admin/collectors/${collectorId}/status`, {
    method: 'PATCH',
    token: admin.token,
    body: { isActive: false }
  });
  try {
    await request(base, '/api/auth/login', {
      method: 'POST',
      body: { email: 'applicant@ecoloop.com', password: 'applicant123' }
    });
    throw new Error('Deactivated collector should not log in');
  } catch (err) {
    if (!String(err.message).includes('deactivated')) throw err;
  }

  await request(base, `/api/admin/collectors/${collectorId}/status`, {
    method: 'PATCH',
    token: admin.token,
    body: { isActive: true }
  });

  const collector = approvedCollector;
  if (collector.user.id !== collectorId) throw new Error('Collector login returned the wrong account');

  // Booking without explicit coordinates is rejected, even with everything else valid.
  try {
    await request(base, '/api/pickups', {
      method: 'POST',
      token: resident.token,
      body: {
        datetime: new Date(Date.now() + 3600000).toISOString(),
        address: '12 Green Street',
        pickupDetails: { unit: '204' },
        requestedCategories: ['paper']
      }
    });
    throw new Error('Booking without coordinates should be rejected');
  } catch (err) {
    if (!String(err.message).includes('400')) throw err;
  }

  const booked = await request(base, '/api/pickups', {
    method: 'POST',
    token: resident.token,
    body: {
      datetime: new Date(Date.now() + 3600000).toISOString(),
      address: '12 Green Street',
      latitude: 12.9716,
      longitude: 77.5946,
      pickupDetails: { unit: '204', building: 'Green Valley Apartments', floor: '2nd Floor', landmark: 'Near main gate', instructions: 'Call on arrival' },
      requestedCategories: ['paper', 'plastic']
    }
  });
  if (booked.pickup.status !== 'scheduled') throw new Error('Pickup was not scheduled');
  if (booked.pickup.location?.latitude !== 12.9716 || booked.pickup.location?.longitude !== 77.5946) {
    throw new Error('Pickup location was not stored');
  }

  const queue = await request(base, '/api/pickups/collector', { token: collector.token });
  if (!queue.pickups.length) throw new Error('Collector did not see scheduled pickup');
  const queuedPickup = queue.pickups.find((pickup) => pickup._id === booked.pickup._id);
  if (!queuedPickup || queuedPickup.status !== 'scheduled') {
    throw new Error('Scheduled pickup was missing from the collector queue');
  }

  const accepted = await request(base, `/api/pickups/${booked.pickup._id}/accept`, {
    method: 'POST', token: collector.token
  });
  if (accepted.pickup.workflowStatus !== 'accepted') throw new Error('Pickup was not accepted');
  const started = await request(base, `/api/pickups/${booked.pickup._id}/start`, {
    method: 'POST', token: collector.token
  });
  if (started.pickup.workflowStatus !== 'in_progress') throw new Error('Pickup was not started');

  try {
    await request(base, '/api/admin/dashboard', { token: collector.token });
    throw new Error('Collector should not access admin routes');
  } catch (err) {
    if (!String(err.message).includes('403')) throw err;
  }

  const weighed = await request(base, `/api/pickups/${booked.pickup._id}/weigh`, {
    method: 'POST',
    token: collector.token,
    body: {
      items: [
        { category: 'paper', kg: 2 },
        { category: 'plastic', kg: 1 }
      ]
    }
  });

  const expectedAmount = 2 * 8 + 1 * 12;
  if (weighed.pickup.totals.amount !== expectedAmount) {
    throw new Error(`Amount mismatch: ${weighed.pickup.totals.amount}`);
  }
  if (weighed.pickup.status !== 'payment_pending') throw new Error('Pickup was not marked payment pending');
  if (String(weighed.pickup.collectorId) !== String(collectorId)) throw new Error('Pickup owner was not recorded');
  if (weighed.pickup.pointsAwarded !== 30) {
    throw new Error(`Points mismatch: ${weighed.pickup.pointsAwarded}`);
  }
  if (weighed.pickup.payment.status !== 'pending' || !weighed.pickup.payment.transactionId) {
    throw new Error('Mock UPI was not created');
  }

  const pendingDash = await request(base, '/api/dashboard', { token: resident.token });
  if (pendingDash.pendingAmount !== expectedAmount) {
    throw new Error(`Pending amount mismatch: ${pendingDash.pendingAmount}`);
  }

  try {
    await request(base, `/api/pickups/${booked.pickup._id}/pay`, { method: 'POST', token: collector.token });
    throw new Error('Collector should not mark pickup as paid');
  } catch (err) {
    if (!String(err.message).includes('403')) throw err;
  }

  // Admin reviews payout details while the payment is pending, then pays
  // with a recorded transaction reference.
  const pendingPayout = await request(base, `/api/admin/users/${resident.user.id}/payment-details`, { token: admin.token });
  if (!pendingPayout.details || pendingPayout.details.upiId !== 'resident@upi') {
    throw new Error('Admin could not see payout details for pending payment');
  }
  try {
    await request(base, `/api/pickups/${booked.pickup._id}/admin-pay`, {
      method: 'POST', token: admin.token, body: { transactionId: '' }
    });
    throw new Error('Empty transaction ID should be rejected');
  } catch (err) {
    if (!String(err.message).includes('400')) throw err;
  }

  const paid = await request(base, `/api/pickups/${booked.pickup._id}/admin-pay`, {
    method: 'POST',
    token: admin.token,
    body: { transactionId: 'E2ETXN001' }
  });
  if (paid.pickup.status !== 'paid') throw new Error('Pickup was not marked paid');
  if (paid.pickup.payment.status !== 'paid') throw new Error('Payment was not marked paid');
  if (paid.pickup.payment.transactionId !== 'E2ETXN001') throw new Error('Admin transaction ID was not recorded');

  const dashboard = await request(base, '/api/dashboard', { token: resident.token });
  if (dashboard.totals.kg !== 3) throw new Error('Resident kg total not updated');
  if (dashboard.totals.earned !== expectedAmount) throw new Error('Resident earnings not updated');
  if (dashboard.totals.points !== 30) throw new Error('Resident points not updated');
  const dashboardPickup = dashboard.recentPickups.find((pickup) => pickup._id === booked.pickup._id);
  if (!dashboardPickup || dashboardPickup.status !== 'paid') {
    throw new Error('Paid pickup missing from resident dashboard');
  }

  const history = await request(base, '/api/pickups/mine', { token: resident.token });
  if (history.pickups[0].status !== 'paid') throw new Error('History status not paid');
  if (history.pickups[0].payment.status !== 'paid') throw new Error('Paid pickup missing paid history status');

  const adminCollectors = await request(base, '/api/admin/collectors', { token: admin.token });
  const managedCollector = adminCollectors.collectors.find((item) => item.id === collectorId);
  if (!managedCollector || managedCollector.pickupCount !== 1) {
    throw new Error('Admin did not see collector completed pickup count');
  }
  const finalAdminDashboard = await request(base, '/api/admin/dashboard', { token: admin.token });
  if (finalAdminDashboard.stats.completedPickups !== 1) throw new Error('Admin completed pickup count mismatch');

  try {
    await request(base, '/api/pickups/collector', { token: resident.token });
    throw new Error('Resident should not access collector routes');
  } catch (err) {
    if (!String(err.message).includes('403')) throw err;
  }

  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  console.log('E2E flow passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
