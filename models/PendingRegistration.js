const mongoose = require('mongoose');

// Temporary record for resident registrations awaiting email OTP
// verification. The final User document is created only after the email OTP
// verifies successfully. Phone is stored for the user profile only and is
// never SMS-verified. Never stores plaintext passwords or raw OTPs.
const pendingRegistrationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, default: '', trim: true },
    emailOtpHash: { type: String, required: true },
    otpExpiresAt: { type: Date, required: true },
    failedAttempts: { type: Number, default: 0 },
    resendCount: { type: Number, default: 0 },
    resendWindowStart: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Auto-clean stale pending registrations after 24h so the collection
// cannot grow unbounded if users abandon verification.
pendingRegistrationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports = mongoose.model('PendingRegistration', pendingRegistrationSchema);
