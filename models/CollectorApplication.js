const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const collectorApplicationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    vehicleType: { type: String, default: '', trim: true },
    verificationInfo: { type: String, default: '', trim: true },
    profilePhoto: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'suspended'], default: 'pending' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

collectorApplicationSchema.index({ email: 1 }, { unique: true });

collectorApplicationSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

module.exports = mongoose.model('CollectorApplication', collectorApplicationSchema);
