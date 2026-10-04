const express = require('express');
const mongoose = require('mongoose');
const Pickup = require('../models/Pickup');
const { auth, requireCustomer } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, requireCustomer, async (req, res) => {
  try {
    const userId = req.user._id;
    const objectId = new mongoose.Types.ObjectId(userId);

    const [recentPickups, monthly, pending] = await Promise.all([
      Pickup.find({ user: userId }).sort({ datetime: -1 }).limit(5).lean(),
      Pickup.aggregate([
        {
          $match: {
            user: objectId,
            status: { $in: ['collected', 'paid'] }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$datetime' } },
            kg: { $sum: '$totals.kg' },
            amount: { $sum: '$totals.amount' },
            pickups: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      // Owed but not yet paid: the user's pickups awaiting admin payment.
      Pickup.aggregate([
        {
          $match: {
            user: objectId,
            status: { $in: ['payment_pending', 'collected'] },
            'payment.status': { $in: ['pending', 'none'] }
          }
        },
        { $group: { _id: null, amount: { $sum: '$totals.amount' } } }
      ])
    ]);

    return res.json({
      totals: req.user.totals,
      pendingAmount: (pending[0] && pending[0].amount) || 0,
      recentPickups,
      monthlyHistory: monthly.map((row) => ({
        month: row._id,
        kg: row.kg,
        amount: row.amount,
        pickups: row.pickups
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: 'Could not load dashboard' });
  }
});

module.exports = router;
