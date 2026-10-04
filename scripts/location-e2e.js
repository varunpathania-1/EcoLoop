process.env.MONGODB_URI = process.env.E2E_MONGODB_URI || 'mongodb://127.0.0.1:27017/ecoloop_location_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.OTP_DEV_MODE = 'true';
process.env.EMAIL_HOST = '';
process.env.EMAIL_USER = '';
process.env.EMAIL_PASSWORD = '';

const mongoose = require('mongoose');
const { app } = require('../server');
const User = require('../models/User');
const Pickup = require('../models/Pickup');

async function listen(serverApp) {
  return new Promise((resolve) => {
    const server = serverApp.listen(0, () => resolve(server));
  });
}

async function request(base, path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function expectStatus(label, promise, want, match) {
  const { status, data } = await promise;
  const ok = status === want && (!match || String(data.error || '').includes(match));
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + label + ` (got ${status})`);
  if (!ok) { console.log('  body:', JSON.stringify(data).slice(0, 200)); process.exitCode = 1; }
  return data;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  await mongoose.connection.dropDatabase();
  const server = await listen(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (path, opts) => request(base, path, opts);

  const resident = await User.create({ name: 'Loc Resident', email: 'locres@example.com', password: 'resident123', phone: '8111111111', address: 'Loc Street', role: 'resident' });
  const collector = await User.create({ name: 'Loc Collector', email: 'loccoll@example.com', password: 'test123', phone: '8222222222', address: 'Hub', role: 'collector' });
  const residentLogin = await req('/api/auth/login', { method: 'POST', body: { email: 'locres@example.com', password: 'resident123' } });
  const collectorLogin = await req('/api/auth/login', { method: 'POST', body: { email: 'loccoll@example.com', password: 'test123' } });
  const rTok = residentLogin.data.token;
  const cTok = collectorLogin.data.token;
  const payload = (over = {}) => ({
    datetime: new Date(Date.now() + 3600000).toISOString(),
    address: '12 Green Street', requestedCategories: ['paper'],
    pickupDetails: { unit: '204' }, ...over
  });

  await expectStatus('missing unit -> 400', req('/api/pickups', { method: 'POST', token: rTok, body: payload({ latitude: 12.9, longitude: 77.5, pickupDetails: {} }) }), 400, 'flat, house, or room number');
  await expectStatus('blank unit -> 400', req('/api/pickups', { method: 'POST', token: rTok, body: payload({ latitude: 12.9, longitude: 77.5, pickupDetails: { unit: '   ' } }) }), 400, 'flat, house, or room number');
  await expectStatus('missing location -> 400', req('/api/pickups', { method: 'POST', token: rTok, body: payload() }), 400, 'location');
  await expectStatus('missing latitude only -> 400', req('/api/pickups', { method: 'POST', token: rTok, body: payload({ longitude: 77.5 }) }), 400);
  await expectStatus('lat out of range -> 400', req('/api/pickups', { method: 'POST', token: rTok, body: payload({ latitude: 91, longitude: 77.5 }) }), 400);
  await expectStatus('lng out of range -> 400', req('/api/pickups', { method: 'POST', token: rTok, body: payload({ latitude: 12.9, longitude: 181 }) }), 400);
  await expectStatus('non-numeric coords -> 400', req('/api/pickups', { method: 'POST', token: rTok, body: payload({ latitude: 'abc', longitude: 'def' }) }), 400);
  await expectStatus('unauthenticated -> 401', req('/api/pickups', { method: 'POST', body: payload({ latitude: 12.9, longitude: 77.5 }) }), 401);

  const created = await req('/api/pickups', { method: 'POST', token: rTok, body: payload({ latitude: 12.9716, longitude: 77.5946, pickupDetails: { unit: '204', building: 'Green Valley Apartments', floor: '2nd Floor', landmark: 'Near main gate', instructions: 'Call me when you arrive' } }) });
  const locOk = created.status === 201 && created.data.pickup.location?.latitude === 12.9716 && created.data.pickup.location?.longitude === 77.5946 && created.data.pickup.address === '12 Green Street';
  console.log((locOk ? 'PASS' : 'FAIL') + ' - valid booking stores address+location');
  if (!locOk) process.exitCode = 1;
  const det = created.data.pickup.pickupDetails || {};
  const detOk = det.unit === '204' && det.building === 'Green Valley Apartments' && det.floor === '2nd Floor' && det.landmark === 'Near main gate' && det.instructions === 'Call me when you arrive';
  console.log((detOk ? 'PASS' : 'FAIL') + ' - valid booking stores pickupDetails');
  if (!detOk) process.exitCode = 1;
  const minimal = await req('/api/pickups', { method: 'POST', token: rTok, body: payload({ latitude: 13.0, longitude: 77.6 }) });
  console.log((minimal.status === 201 ? 'PASS' : 'FAIL') + ' - unit-only details accepted (optionals empty)');
  if (minimal.status !== 201) process.exitCode = 1;

  const queue = await req('/api/pickups/collector', { token: cTok });
  const seen = queue.data.pickups.find((p) => p._id === created.data.pickup._id);
  console.log((seen && seen.location ? 'PASS' : 'FAIL') + ' - collector queue includes location');
  if (!seen || !seen.location) process.exitCode = 1;

  // Old pickup without location: still readable + weighable (no destructive migration).
  const legacy = await Pickup.create({ user: resident._id, status: 'scheduled', workflowStatus: 'requested', datetime: new Date(), address: 'Old Street', requestedCategories: ['paper'] });
  const mine = await req('/api/pickups/mine', { token: rTok });
  const legacySeen = mine.data.pickups.find((p) => p._id === String(legacy._id));
  console.log((legacySeen && legacySeen.location == null ? 'PASS' : 'FAIL') + ' - legacy pickup readable without location');
  if (!legacySeen || legacySeen.location != null) process.exitCode = 1;
  await req(`/api/pickups/${legacy._id}/accept`, { method: 'POST', token: cTok });
  await req(`/api/pickups/${legacy._id}/start`, { method: 'POST', token: cTok });
  const weighed = await req(`/api/pickups/${legacy._id}/weigh`, { method: 'POST', token: cTok, body: { items: [{ category: 'paper', kg: 1 }] } });
  console.log((weighed.status === 200 ? 'PASS' : 'FAIL') + ' - legacy pickup weigh flow still works');
  if (weighed.status !== 200) process.exitCode = 1;

  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  console.log('Location API tests done');
}

run().catch((err) => { console.error(err); process.exit(1); });
