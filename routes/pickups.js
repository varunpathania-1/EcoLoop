const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Pickup = require('../models/Pickup');
const User = require('../models/User');
const { auth, requireRole, requireCustomer } = require('../middleware/auth');
const { CATEGORIES, getRate, calculatePoints } = require('../config/rates');

const router = express.Router();

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

router.post('/', auth, requireCustomer, async (req, res) => {
  try {
    const { datetime, address, requestedCategories, notes, latitude, longitude, pickupDetails } = req.body;

    if (!datetime || !address || !Array.isArray(requestedCategories) || requestedCategories.length === 0) {
      return res.status(400).json({ error: 'Date/time, address and at least one category are required' });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'A valid pickup location (latitude and longitude) is required' });
    }

    const details = pickupDetails && typeof pickupDetails === 'object' ? pickupDetails : {};
    const unit = String(details.unit || '').trim();
    if (!unit) {
      return res.status(400).json({ error: 'Please enter your flat, house, or room number.' });
    }

    const categories = [...new Set(requestedCategories.map((c) => String(c).toLowerCase().trim()))];
    const invalid = categories.filter((c) => !CATEGORIES.includes(c));
    if (invalid.length) {
      return res.status(400).json({ error: `Invalid categories: ${invalid.join(', ')}` });
    }

    const when = new Date(datetime);
    if (Number.isNaN(when.getTime())) {
      return res.status(400).json({ error: 'Invalid date/time' });
    }

    const pickup = await Pickup.create({
      user: req.user._id,
      status: 'scheduled',
      workflowStatus: 'requested',
      datetime: when,
      address: String(address).trim(),
      location: { latitude: lat, longitude: lng },
      pickupDetails: {
        unit,
        building: String(details.building || '').trim(),
        floor: String(details.floor || '').trim(),
        landmark: String(details.landmark || '').trim(),
        instructions: String(details.instructions || '').trim()
      },
      notes: String(notes || '').trim(),
      requestedCategories: categories
    });

    return res.status(201).json({ pickup });
  } catch (err) {
    return res.status(500).json({ error: 'Could not book pickup' });
  }
});

router.get('/mine', auth, requireCustomer, async (req, res) => {
  try {
    const pickups = await Pickup.find({ user: req.user._id })
      .sort({ datetime: -1 })
      .lean();
    return res.json({ pickups });
  } catch (err) {
    return res.status(500).json({ error: 'Could not load pickups' });
  }
});

router.get('/collector', auth, requireRole('collector'), async (req, res) => {
  try {
    const status = req.query.status || 'scheduled';
    const filter = {};
    if (status === 'all') {
      filter.$or = [
        { status: 'scheduled' },
        { collectorId: req.user._id }
      ];
      // Paid pickups are complete from the collector's perspective; keep
      // them out of the collector queue. Admin endpoints are unaffected.
      filter.status = { $ne: 'paid' };
    } else if (status === 'scheduled') {
      filter.status = 'scheduled';
    } else {
      filter.status = status;
      filter.collectorId = req.user._id;
    }

    const pickups = await Pickup.find(filter)
      .populate('user', 'name phone email address')
      .sort({ datetime: 1 })
      .lean();

    return res.json({ pickups });
  } catch (err) {
    return res.status(500).json({ error: 'Could not load collector pickups' });
  }
});

router.get('/collector/summary', auth, requireRole('collector'), async (req, res) => {
  try {
    const collectorId = req.user._id;
    const [scheduledPickups, completedPickups, totals] = await Promise.all([
      Pickup.countDocuments({ status: 'scheduled' }),
      Pickup.countDocuments({ collectorId, status: { $in: ['collected', 'payment_pending', 'paid'] } }),
      Pickup.aggregate([
        { $match: { collectorId: new mongoose.Types.ObjectId(collectorId), status: { $in: ['collected', 'payment_pending', 'paid'] } } },
        { $group: { _id: null, kg: { $sum: '$totals.kg' }, amount: { $sum: '$totals.amount' } } }
      ])
    ]);

    return res.json({
      stats: {
        scheduledPickups,
        completedPickups,
        totalKg: totals[0]?.kg || 0,
        totalAmount: totals[0]?.amount || 0
      }
    });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not load collector summary' });
  }
});

router.get('/collector/profile', auth, requireRole('collector'), async (req, res) => {
  return res.json({ user: req.user.toSafeObject() });
});

router.patch('/collector/availability', auth, requireRole('collector'), async (req, res) => {
  const allowed = ['available', 'offline', 'busy'];
  if (!allowed.includes(req.body.availability)) return res.status(400).json({ error: 'Invalid availability' });
  req.user.availability = req.body.availability;
  await req.user.save();
  return res.json({ user: req.user.toSafeObject() });
});

router.post('/:id/accept', auth, requireRole('collector'), async (req, res) => {
  return updateCollectorWorkflow(req, res, 'accepted');
});

router.post('/:id/start', auth, requireRole('collector'), async (req, res) => {
  return updateCollectorWorkflow(req, res, 'in_progress');
});

async function updateCollectorWorkflow(req, res, workflowStatus) {
  try {
    const pickup = await Pickup.findOne({ _id: req.params.id, $or: [{ collectorId: req.user._id }, { collectorId: null }] });
    if (!pickup) return res.status(404).json({ error: 'Pickup not found' });
    if (workflowStatus === 'accepted' && pickup.status !== 'scheduled' && !['requested', 'assigned'].includes(pickup.workflowStatus)) {
      return res.status(400).json({ error: 'Pickup cannot be accepted in its current state' });
    }
    if (workflowStatus === 'in_progress' && pickup.status !== 'accepted' && pickup.workflowStatus !== 'accepted') {
      return res.status(400).json({ error: 'Pickup must be accepted before starting' });
    }
    pickup.collectorId = req.user._id;
    pickup.workflowStatus = workflowStatus;
    pickup.status = workflowStatus;
    if (workflowStatus === 'in_progress') pickup.startedAt = new Date();
    await pickup.save();
    return res.json({ pickup });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not update pickup workflow' });
  }
}

router.post('/:id/weigh', auth, requireRole('collector'), async (req, res) => {
  try {
    const pickup = await Pickup.findOne({ _id: req.params.id, collectorId: req.user._id });
    if (!pickup) {
      return res.status(404).json({ error: 'Pickup not found' });
    }
    if (!['in_progress'].includes(pickup.status) && !['in_progress'].includes(pickup.workflowStatus)) {
      return res.status(400).json({ error: 'Pickup has already been processed' });
    }

    const submitted = Array.isArray(req.body.items) ? req.body.items : [];
    if (!submitted.length) {
      return res.status(400).json({ error: 'Enter kg for at least one category' });
    }

    const items = [];
    for (const entry of submitted) {
      const category = String(entry.category || '').toLowerCase().trim();
      const kg = Number(entry.kg);

      if (!CATEGORIES.includes(category)) {
        return res.status(400).json({ error: `Invalid category: ${category}` });
      }
      if (!Number.isFinite(kg) || kg < 0) {
        return res.status(400).json({ error: `Invalid kg for ${category}` });
      }
      if (kg === 0) continue;

      const rate = getRate(category);
      const amount = roundMoney(kg * rate);
      items.push({ category, kg, rate, amount });
    }

    if (!items.length) {
      return res.status(400).json({ error: 'Collected weight must be greater than 0' });
    }

    const totalKg = roundMoney(items.reduce((sum, item) => sum + item.kg, 0));
    const totalAmount = roundMoney(items.reduce((sum, item) => sum + item.amount, 0));
    const pointsAwarded = calculatePoints(totalKg);

    pickup.items = items;
    pickup.totals = { kg: totalKg, amount: totalAmount };
    pickup.pointsAwarded = pointsAwarded;
    pickup.status = 'payment_pending';
    pickup.workflowStatus = 'completed';
    pickup.completedAt = new Date();
    pickup.collectorNotes = String(req.body.collectorNotes || '').trim();
    pickup.collectorId = req.user._id;
    pickup.payment = {
      amount: totalAmount,
      status: 'pending',
      timestamp: new Date(),
      transactionId: `UPI${crypto.randomBytes(6).toString('hex').toUpperCase()}`
    };

    await pickup.save();

    await User.findByIdAndUpdate(pickup.user, {
      $inc: {
        'totals.kg': totalKg,
        'totals.earned': totalAmount,
        'totals.points': pointsAwarded,
        'totals.pickupCount': 1
      }
    });

    const populated = await Pickup.findById(pickup._id).populate('user', 'name phone email address');
    return res.json({ pickup: populated });
  } catch (err) {
    return res.status(500).json({ error: 'Could not record collected weight' });
  }
});

router.post('/:id/pay', auth, requireRole('collector'), async (_req, res) => {
  return res.status(403).json({ error: 'Only an admin can mark a pickup as paid' });
});

router.post('/:id/admin-pay', auth, requireRole('admin'), async (req, res) => {
  try {
    const pickup = await Pickup.findById(req.params.id);
    if (!pickup) {
      return res.status(404).json({ error: 'Pickup not found' });
    }
    if (!['payment_pending', 'collected'].includes(pickup.status)) {
      return res.status(400).json({ error: 'Pickup must be collected before payment' });
    }

    // Optional admin-recorded payment reference. When omitted, the mock
    // reference generated at weigh time is kept (backward compatible).
    if (req.body.transactionId !== undefined) {
      const reference = String(req.body.transactionId).trim();
      if (!reference || reference.length > 64) {
        return res.status(400).json({ error: 'Enter a valid transaction/reference ID (1-64 characters)' });
      }
      pickup.payment.transactionId = reference;
    }

    pickup.payment.status = 'paid';
    pickup.payment.timestamp = new Date();
    pickup.status = 'paid';
    pickup.workflowStatus = 'completed';
    await pickup.save();

    const populated = await Pickup.findById(pickup._id).populate('user', 'name phone email address');
    return res.json({ pickup: populated });
  } catch (err) {
    return res.status(500).json({ error: 'Could not mark pickup as paid' });
  }
});

module.exports = router;
