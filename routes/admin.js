const express = require('express');
const mongoose = require('mongoose');
const Pickup = require('../models/Pickup');
const User = require('../models/User');
const CollectorApplication = require('../models/CollectorApplication');
const PaymentDetails = require('../models/PaymentDetails');
const { safeDetails } = require('./paymentDetails');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
const adminOnly = [auth, requireRole('admin')];

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function safeCollector(user, pickupCount = 0) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    address: user.address,
    role: user.role,
    isActive: user.isActive !== false,
    availability: user.availability || 'offline',
    createdBy: user.createdBy,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    totals: user.totals,
    pickupCount
  };
}

function safeAdmin(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive !== false,
    createdBy: user.createdBy,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

async function collectorWithCount(user) {
  const pickupCount = await Pickup.countDocuments({
    collectorId: user._id,
    status: { $in: ['collected', 'paid'] }
  });
  return safeCollector(user, pickupCount);
}

router.get('/dashboard', ...adminOnly, async (_req, res) => {
  try {
    const [totalCustomers, totalCollectors, totalAdmins, activeAdmins, pendingApplications, totalPickups, pendingPickups, activeCollectors, completedPickups, wasteTotals] = await Promise.all([
      User.countDocuments({ role: { $in: ['resident', 'customer'] } }),
      User.countDocuments({ role: 'collector' }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'admin', isActive: { $ne: false } }),
      CollectorApplication.countDocuments({ status: 'pending' }),
      Pickup.countDocuments(),
      Pickup.countDocuments({ status: { $in: ['scheduled', 'requested', 'assigned', 'accepted', 'in_progress'] } }),
      User.countDocuments({ role: 'collector', availability: 'available' }),
      Pickup.countDocuments({ status: { $in: ['collected', 'payment_pending', 'paid', 'completed'] }, collectorId: { $ne: null } }),
      Pickup.aggregate([{ $match: { status: { $in: ['collected', 'payment_pending', 'paid', 'completed'] } } }, { $group: { _id: null, kg: { $sum: '$totals.kg' }, amount: { $sum: '$totals.amount' } } }])
    ]);

    return res.json({
      stats: {
        totalCustomers,
        totalCollectors,
        totalAdmins,
        activeAdmins,
        pendingApplications,
        totalPickups,
        pendingPickups,
        activeCollectors,
        inactiveCollectors: totalCollectors - activeCollectors,
        completedPickups,
        totalWasteCollected: wasteTotals[0]?.kg || 0,
        totalRewards: wasteTotals[0]?.amount || 0
      }
    });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not load admin dashboard' });
  }
});

router.get('/admins', ...adminOnly, async (_req, res) => {
  try {
    const admins = await User.find({ role: 'admin' }).sort({ createdAt: -1 }).lean();
    return res.json({ admins: admins.map(safeAdmin) });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not load admins' });
  }
});

router.post('/admins', ...adminOnly, async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    if (!name || !normalizedEmail || !phone || !password) {
      return res.status(400).json({ error: 'Name, email, phone and password are required' });
    }
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (await User.findOne({ email: normalizedEmail })) return res.status(409).json({ error: 'Email already registered' });

    const admin = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      password,
      phone: String(phone).trim(),
      address: 'EcoLoop Admin Office',
      role: 'admin',
      isActive: true,
      accountStatus: 'active',
      createdBy: req.user._id
    });
    return res.status(201).json({ admin: safeAdmin(admin) });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not create admin' });
  }
});

router.patch('/admins/:id/status', ...adminOnly, async (req, res) => {
  try {
    if (typeof req.body.isActive !== 'boolean') return res.status(400).json({ error: 'isActive must be a boolean' });
    if (String(req.params.id) === String(req.user._id) && req.body.isActive === false) {
      return res.status(403).json({ error: 'You cannot deactivate your own account.' });
    }

    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ error: 'Admin not found' });
    if (!req.body.isActive && admin.isActive !== false) {
      const activeCount = await User.countDocuments({ role: 'admin', isActive: { $ne: false } });
      if (activeCount <= 1) return res.status(400).json({ error: 'At least one active administrator must remain.' });
    }

    admin.isActive = req.body.isActive;
    admin.accountStatus = req.body.isActive ? 'active' : 'suspended';
    await admin.save();
    return res.json({ admin: safeAdmin(admin) });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not update admin status' });
  }
});

router.get('/applications', ...adminOnly, async (_req, res) => {
  try {
    const applications = await CollectorApplication.find().select('-password').sort({ createdAt: -1 }).lean();
    return res.json({ applications });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not load collector applications' });
  }
});

router.patch('/applications/:id/status', ...adminOnly, async (req, res) => {
  try {
    const allowedStatuses = ['approved', 'rejected', 'suspended', 'pending'];
    const { status } = req.body;
    if (!allowedStatuses.includes(status)) return res.status(400).json({ error: 'Invalid application status' });
    const application = await CollectorApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });

    if (status === 'approved') {
      const existing = await User.findOne({ email: application.email });
      if (existing && existing.role !== 'collector') return res.status(409).json({ error: 'Email already belongs to another account' });
      if (!existing) {
        const collector = new User({
          name: application.name, email: application.email, password: 'application-password-placeholder',
          phone: application.phone, address: application.address, role: 'collector', isActive: true,
          accountStatus: 'active', createdBy: req.user._id,
          collectorApplication: {
            vehicleType: application.vehicleType, verificationInfo: application.verificationInfo,
            profilePhoto: application.profilePhoto, submittedAt: application.createdAt,
            reviewedAt: new Date(), reviewedBy: req.user._id
          }
        });
        await collector.save();
        await User.collection.updateOne({ _id: collector._id }, { $set: { password: application.password } });
      } else {
        existing.isActive = true;
        existing.accountStatus = 'active';
        existing.collectorApplication = { ...existing.collectorApplication?.toObject?.(), reviewedAt: new Date(), reviewedBy: req.user._id };
        await existing.save();
      }
    } else {
      const existing = await User.findOne({ email: application.email, role: 'collector' });
      if (existing) {
        existing.isActive = false;
        existing.accountStatus = status;
        await existing.save();
      }
    }

    application.status = status;
    application.reviewedBy = req.user._id;
    application.reviewedAt = new Date();
    await application.save();
    return res.json({ application: application.toObject({ transform: (_doc, ret) => { delete ret.password; return ret; } }) });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not update application status' });
  }
});

router.get('/collectors', ...adminOnly, async (_req, res) => {
  try {
    const collectors = await User.find({ role: 'collector' }).sort({ createdAt: -1 }).lean();
    const counts = await Pickup.aggregate([
      {
        $match: {
          collectorId: { $ne: null },
          status: { $in: ['collected', 'payment_pending', 'paid'] }
        }
      },
      { $group: { _id: '$collectorId', count: { $sum: 1 } } }
    ]);
    const countByCollector = new Map(counts.map((row) => [String(row._id), row.count]));

    return res.json({
      collectors: collectors.map((collector) => safeCollector(collector, countByCollector.get(String(collector._id)) || 0))
    });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not load collectors' });
  }
});

router.get('/customers', ...adminOnly, async (_req, res) => {
  try {
    const customers = await User.find({ role: { $in: ['resident', 'customer'] } }).select('-password').sort({ createdAt: -1 }).lean();
    return res.json({ customers });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not load customers' });
  }
});

// Admin view of one user's payout details (for payment processing).
// Collectors can never reach this router: every route requires role admin.
router.get('/users/:userId/payment-details', ...adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('_id name email').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const details = await PaymentDetails.findOne({ userId: user._id }).lean();
    return res.json({ user, details: safeDetails(details) });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not load payout details' });
  }
});

// Internal verification flag for reviewed payout details (NOT an external
// bank/UPI ownership check). Records who verified and when.
router.patch('/users/:userId/payment-details/verify', ...adminOnly, async (req, res) => {
  try {
    if (typeof req.body.isVerified !== 'boolean') {
      return res.status(400).json({ error: 'isVerified must be a boolean' });
    }
    const details = await PaymentDetails.findOne({ userId: req.params.userId });
    if (!details) return res.status(404).json({ error: 'Payment details not found' });
    details.isVerified = req.body.isVerified;
    details.verifiedBy = req.body.isVerified ? req.user._id : null;
    details.verifiedAt = req.body.isVerified ? new Date() : null;
    await details.save();
    return res.json({ details: safeDetails(details) });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not update verification status' });
  }
});

router.get('/pickups', ...adminOnly, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.collectorId) filter.collectorId = req.query.collectorId;
    if (req.query.customerId) filter.user = req.query.customerId;
    const pickups = await Pickup.find(filter).populate('user', 'name email phone').populate('collectorId', 'name email').sort({ datetime: -1 }).lean();
    return res.json({ pickups });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not load pickups' });
  }
});

router.patch('/pickups/:id/assign', ...adminOnly, async (req, res) => {
  try {
    const collector = await User.findOne({ _id: req.body.collectorId, role: 'collector', isActive: { $ne: false }, accountStatus: { $nin: ['rejected', 'suspended'] } });
    if (!collector) return res.status(404).json({ error: 'Active collector not found' });
    const pickup = await Pickup.findByIdAndUpdate(req.params.id, {
      $set: { collectorId: collector._id, workflowStatus: 'assigned', assignedAt: new Date() }
    }, { returnDocument: 'after' }).populate('user', 'name email phone').populate('collectorId', 'name email');
    if (!pickup) return res.status(404).json({ error: 'Pickup not found' });
    return res.json({ pickup });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not assign pickup' });
  }
});

router.post('/collectors', ...adminOnly, async (req, res) => {
  try {
    const { name, email, phone, password, address } = req.body;
    const normalizedEmail = normalizeEmail(email);
    if (!name || !normalizedEmail || !phone || !password) {
      return res.status(400).json({ error: 'Name, email, phone and password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const collector = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      password,
      phone: String(phone).trim(),
      address: String(address || '').trim() || 'EcoLoop Collection Hub',
      role: 'collector',
      isActive: true,
      createdBy: req.user._id
    });

    return res.status(201).json({ collector: safeCollector(collector) });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not create collector' });
  }
});

router.patch('/collectors/:id/status', ...adminOnly, async (req, res) => {
  try {
    if (typeof req.body.isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }
    const collector = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'collector' },
      { $set: { isActive: req.body.isActive } },
      { returnDocument: 'after' }
    );
    if (!collector) return res.status(404).json({ error: 'Collector not found' });
    return res.json({ collector: await collectorWithCount(collector) });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not update collector status' });
  }
});

router.patch('/collectors/:id', ...adminOnly, async (req, res) => {
  try {
    const allowed = ['name', 'email', 'phone', 'address'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = String(req.body[field]).trim();
    }
    if (updates.email) {
      updates.email = normalizeEmail(updates.email);
      const existing = await User.findOne({ email: updates.email, _id: { $ne: req.params.id } });
      if (existing) return res.status(409).json({ error: 'Email already registered' });
    }
    if (req.body.password !== undefined) {
      if (String(req.body.password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      updates.password = req.body.password;
    }

    const collector = await User.findOne({ _id: req.params.id, role: 'collector' });
    if (!collector) return res.status(404).json({ error: 'Collector not found' });
    Object.assign(collector, updates);
    await collector.save();
    return res.json({ collector: await collectorWithCount(collector) });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not update collector' });
  }
});

router.delete('/collectors/:id', ...adminOnly, async (req, res) => {
  try {
    const collector = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'collector' },
      { $set: { isActive: false } },
      { returnDocument: 'after' }
    );
    if (!collector) return res.status(404).json({ error: 'Collector not found' });
    return res.json({ collector: await collectorWithCount(collector) });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not deactivate collector' });
  }
});

module.exports = router;
