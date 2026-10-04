const express = require('express');
const PaymentDetails = require('../models/PaymentDetails');
const { auth, requireCustomer } = require('../middleware/auth');

const router = express.Router();

const UPI_RE = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^\d{9,18}$/;

function safeDetails(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;
  return {
    id: obj._id,
    userId: obj.userId,
    method: obj.method,
    upiId: obj.upiId || null,
    accountHolderName: obj.accountHolderName || null,
    bankName: obj.bankName || null,
    accountNumber: obj.accountNumber || null,
    ifscCode: obj.ifscCode || null,
    isVerified: obj.isVerified === true,
    verifiedBy: obj.verifiedBy || null,
    verifiedAt: obj.verifiedAt || null,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt
  };
}

function detailsSignature(doc) {
  if (!doc) return '';
  return [doc.method, doc.upiId, doc.accountHolderName, doc.bankName, doc.accountNumber, doc.ifscCode]
    .map((v) => String(v || ''))
    .join('|');
}

// The authenticated resident's own payout details. Never accepts a user id
// from the request — ownership always comes from the JWT.
router.get('/', auth, requireCustomer, async (req, res) => {
  try {
    const details = await PaymentDetails.findOne({ userId: req.user._id }).lean();
    return res.json({ details: safeDetails(details) });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not load payment details' });
  }
});

// Create or replace the caller's payout details (one document per user).
// Any content change resets internal verification. Stale method fields are
// cleared so switching UPI <-> bank never leaks the old method's data.
router.put('/', auth, requireCustomer, async (req, res) => {
  try {
    const method = String(req.body.method || '').toLowerCase().trim();
    if (!['upi', 'bank'].includes(method)) {
      return res.status(400).json({ error: 'Choose a payout method: UPI or Bank Account' });
    }

    const next = { method, upiId: null, accountHolderName: null, bankName: null, accountNumber: null, ifscCode: null };

    if (method === 'upi') {
      const upiId = String(req.body.upiId || '').trim();
      if (!upiId) return res.status(400).json({ error: 'UPI ID is required' });
      if (!UPI_RE.test(upiId)) return res.status(400).json({ error: 'Enter a valid UPI ID (e.g. name@bank)' });
      next.upiId = upiId;
    } else {
      const accountHolderName = String(req.body.accountHolderName || '').trim();
      const bankName = String(req.body.bankName || '').trim();
      const accountNumber = String(req.body.accountNumber || '').replace(/[\s-]/g, '');
      const confirmAccountNumber = String(req.body.confirmAccountNumber || '').replace(/[\s-]/g, '');
      const ifscCode = String(req.body.ifscCode || '').trim().toUpperCase();
      if (!accountHolderName) return res.status(400).json({ error: 'Account holder name is required' });
      if (!bankName) return res.status(400).json({ error: 'Bank name is required' });
      if (!ACCOUNT_RE.test(accountNumber)) return res.status(400).json({ error: 'Enter a valid bank account number (9-18 digits)' });
      if (confirmAccountNumber && confirmAccountNumber !== accountNumber) {
        return res.status(400).json({ error: 'Account numbers do not match' });
      }
      if (!IFSC_RE.test(ifscCode)) return res.status(400).json({ error: 'Enter a valid IFSC code (e.g. SBIN0001234)' });
      next.accountHolderName = accountHolderName;
      next.bankName = bankName;
      next.accountNumber = accountNumber;
      next.ifscCode = ifscCode;
    }

    const existing = await PaymentDetails.findOne({ userId: req.user._id });
    const changed = !existing || detailsSignature(existing) !== detailsSignature(next);

    const details = await PaymentDetails.findOneAndUpdate(
      { userId: req.user._id },
      {
        $set: {
          ...next,
          isVerified: existing && !changed ? existing.isVerified : false,
          verifiedBy: existing && !changed ? existing.verifiedBy : null,
          verifiedAt: existing && !changed ? existing.verifiedAt : null
        }
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    return res.json({ details: safeDetails(details) });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Payment details already exist for this user' });
    }
    return res.status(500).json({ error: 'Could not save payment details' });
  }
});

// Remove the caller's own payout details.
router.delete('/', auth, requireCustomer, async (req, res) => {
  try {
    await PaymentDetails.deleteOne({ userId: req.user._id });
    return res.json({ success: true });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not delete payment details' });
  }
});

module.exports = { router, safeDetails };
