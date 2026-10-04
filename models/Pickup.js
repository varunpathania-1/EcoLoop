const mongoose = require('mongoose');

const pickupItemSchema = new mongoose.Schema(
  {
    category: { type: String, required: true },
    kg: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const pickupSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['scheduled', 'accepted', 'in_progress', 'collected', 'payment_pending', 'paid', 'requested', 'assigned', 'completed', 'cancelled', 'rejected'],
      default: 'scheduled'
    },
    workflowStatus: {
      type: String,
      enum: ['requested', 'assigned', 'accepted', 'in_progress', 'completed', 'cancelled', 'rejected'],
      default: 'requested'
    },
    datetime: { type: Date, required: true },
    address: { type: String, required: true, trim: true },
    pickupDetails: {
      unit: { type: String, trim: true, default: '' },
      building: { type: String, trim: true, default: '' },
      floor: { type: String, trim: true, default: '' },
      landmark: { type: String, trim: true, default: '' },
      instructions: { type: String, trim: true, default: '' }
    },
    location: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 }
    },
    notes: { type: String, default: '', trim: true },
    collectorNotes: { type: String, default: '', trim: true },
    proofPhoto: { type: String, default: '' },
    assignedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    requestedCategories: [{ type: String, required: true }],
    items: [pickupItemSchema],
    totals: {
      kg: { type: Number, default: 0 },
      amount: { type: Number, default: 0 }
    },
    pointsAwarded: { type: Number, default: 0 },
    collectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    payment: {
      amount: { type: Number, default: 0 },
      status: { type: String, enum: ['none', 'pending', 'paid'], default: 'none' },
      timestamp: { type: Date, default: null },
      transactionId: { type: String, default: null }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Pickup', pickupSchema);
