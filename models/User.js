const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    phone: { type: String, required: true, trim: true },
    address: { type: String, default: '', trim: true },
    role: { type: String, enum: ['resident', 'customer', 'collector', 'admin'], default: 'resident' },
    isActive: { type: Boolean, default: true },
    accountStatus: { type: String, enum: ['active', 'pending', 'rejected', 'suspended'], default: 'active' },
    availability: { type: String, enum: ['available', 'offline', 'busy'], default: 'offline' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collectorApplication: {
      vehicleType: { type: String, default: '' },
      verificationInfo: { type: String, default: '' },
      profilePhoto: { type: String, default: '' },
      submittedAt: { type: Date, default: null },
      reviewedAt: { type: Date, default: null },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    },
    totals: {
      kg: { type: Number, default: 0 },
      earned: { type: Number, default: 0 },
      points: { type: Number, default: 0 },
      pickupCount: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone,
    address: this.address,
    role: this.role,
    isActive: this.isActive,
    accountStatus: this.accountStatus,
    availability: this.availability,
    createdBy: this.createdBy,
    totals: this.totals
  };
};

module.exports = mongoose.model('User', userSchema);
