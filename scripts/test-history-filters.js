// Unit tests for the client-side Pickup History filters.
// Run: npm run test:filters
const assert = require('assert');
const {
  applyPickupFilters,
  matchesStatus,
  matchesPayment,
  matchesCategory,
  matchesDate,
  matchesSearch
} = require('../public/js/history');

const NOW = new Date('2026-10-04T12:00:00');
const pickups = [
  { _id: 'a1', datetime: '2026-10-04T08:00:00', address: '12 Green Street, Bangalore', status: 'scheduled', payment: { status: 'none' }, requestedCategories: ['paper', 'plastic'] },
  { _id: 'b2', datetime: '2026-10-01T09:00:00', address: '99 Lake Road', status: 'paid', payment: { status: 'paid' }, requestedCategories: ['metal'] },
  { _id: 'c3', datetime: '2026-09-15T10:00:00', address: '5 Hill View', status: 'payment_pending', payment: { status: 'pending' }, requestedCategories: ['plastic', 'cardboard'] },
  { _id: 'd4', datetime: '2026-08-01T10:00:00', address: 'Old Town', status: 'cancelled', payment: { status: 'none' }, requestedCategories: ['paper'] }
];

function ids(list) {
  return list.map((p) => p._id).sort();
}

let n = 0;
function check(name, actual, expected) {
  n++;
  assert.deepStrictEqual(actual, expected, name);
  console.log('ok - ' + name);
}

// Status
check('status all', ids(applyPickupFilters(pickups, { status: 'all' }, NOW)), ['a1', 'b2', 'c3', 'd4']);
check('status paid (absent value matches none)', ids(applyPickupFilters(pickups, { status: 'paid' }, NOW)), ['b2']);
check('status uses exact backend values', matchesStatus({ status: 'payment_pending' }, 'payment_pending'), true);

// Payment (existing payment.status values)
check('payment pending', ids(applyPickupFilters(pickups, { payment: 'pending' }, NOW)), ['c3']);
check('payment paid', ids(applyPickupFilters(pickups, { payment: 'paid' }, NOW)), ['b2']);
check('payment ignores none', matchesPayment({ payment: { status: 'none' } }, 'pending'), false);

// Category (anywhere in the pickup, case-insensitive)
check('category plastic matches multi-category', ids(applyPickupFilters(pickups, { category: 'plastic' }, NOW)), ['a1', 'c3']);
check('category case-insensitive', ids(applyPickupFilters(pickups, { category: 'PAPER' }, NOW)), ['a1', 'd4']);

// Date ranges anchored to 2026-10-04 (a Sunday)
check('today', ids(applyPickupFilters(pickups, { date: 'today' }, NOW)), ['a1']);
check('week (Mon Sep 28+)', ids(applyPickupFilters(pickups, { date: 'week' }, NOW)), ['a1', 'b2']);
check('month (October)', ids(applyPickupFilters(pickups, { date: 'month' }, NOW)), ['a1', 'b2']);
check('last30', ids(applyPickupFilters(pickups, { date: 'last30' }, NOW)), ['a1', 'b2', 'c3']);
check('custom range', ids(applyPickupFilters(pickups, { date: 'custom', from: '2026-09-01', to: '2026-09-30' }, NOW)), ['c3']);
check('invalid datetime excluded when dated', matchesDate({ datetime: 'nope' }, 'month', null, null, NOW), false);

// Search (id, address, phone-like, category, status — case-insensitive)
check('search address', ids(applyPickupFilters(pickups, { search: 'BANGALORE' }, NOW)), ['a1']);
check('search category', ids(applyPickupFilters(pickups, { search: 'plastic' }, NOW)), ['a1', 'c3']);
check('search id', ids(applyPickupFilters(pickups, { search: 'c3' }, NOW)), ['c3']);
check('search status', ids(applyPickupFilters(pickups, { search: 'cancelled' }, NOW)), ['d4']);
check('blank search matches all', ids(applyPickupFilters(pickups, { search: '   ' }, NOW)), ['a1', 'b2', 'c3', 'd4']);

// AND-combination across every dimension
check('combined filters', ids(applyPickupFilters(pickups, {
  status: 'payment_pending', payment: 'pending', category: 'plastic', date: 'last30', search: 'hill'
}, NOW)), ['c3']);
check('combined mismatch', ids(applyPickupFilters(pickups, {
  status: 'paid', payment: 'pending'
}, NOW)), []);

console.log(`\nAll ${n} filter tests passed`);
