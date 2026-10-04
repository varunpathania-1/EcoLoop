const mongoose = require('mongoose');

// Payout destination for a resident's recycling earnings. Exactly one
// document per user. Never stores card numbers, CVVs, PINs, OTPs or
// passwords — UPI ID or basic bank account details only.
const paymentDetailsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    method: { type: String, enum: ['upi', 'bank'], required: true },
    upiId: { type: String, default: null, trim: true },
    accountHolderName: { type: String, default: null, trim: true },
    bankName: { type: String, default: null, trim: true },
    accountNumber: { type: String, default: null, trim: true },
    ifscCode: { type: String, default: null, trim: true, uppercase: true },
    isVerified: { type: Boolean, default: false },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaymentDetails', paymentDetailsSchema);
