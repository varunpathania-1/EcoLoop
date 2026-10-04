const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const CollectorApplication = require('../models/CollectorApplication');
const PendingRegistration = require('../models/PendingRegistration');
const { auth } = require('../middleware/auth');
const {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_LIMIT,
  OTP_RESEND_WINDOW_MINUTES,
  generateOtp,
  hashOtp,
  otpMatches,
  otpExpiryDate
} = require('../services/otp');
const { sendEmailOtp, isEmailConfigured } = require('../services/email');

const router = express.Router();

function signToken(user, expiresIn = '7d') {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

// Session lifetimes for the login page Remember Me checkbox:
// unchecked -> short-lived 2h JWT, checked -> persistent 30d JWT.
// Callers that predate the flag (admin login form, scripts) get the
// historical 7d default so their behavior is unchanged.
function sessionTTL(rememberMe) {
  if (rememberMe === true) return '30d';
  if (rememberMe === false) return '2h';
  return '7d';
}

async function loginUser(email, password, rememberMe) {
  const user = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (!user) return { error: 'Invalid email or password' };
  if (user.isActive === false || ['rejected', 'suspended'].includes(user.accountStatus)) {
    if (user.role === 'admin') return { error: 'Your admin account has been deactivated. Please contact another administrator.' };
    return { error: 'Your account has been deactivated. Please contact the administrator.' };
  }
  if (user.role === 'collector' && user.accountStatus === 'pending') return { error: 'Your collector application is pending admin approval.' };

  const match = await user.comparePassword(password);
  if (!match) return { error: 'Invalid email or password' };
  const expiresIn = sessionTTL(rememberMe);
  return { user, token: signToken(user, expiresIn), expiresIn, remember: expiresIn === '30d' };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s().-]{6,}$/;

function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '***';
  if (local.length <= 1) return `*...@${domain}`;
  return `${local[0]}***@${domain}`;
}

function isOtpServiceError(err) {
  return err && err.code === 'OTP_NOT_CONFIGURED';
}

// Resident email-OTP registration: validates details, stores a
// hashed-password PendingRegistration with a hashed email OTP, and sends
// the OTP to the email address. Phone is stored for the user profile only
// and is never SMS-verified. The final User is created only by
// POST /verify-registration. Always role "resident".
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, address } = req.body;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const normalizedPhone = String(phone).trim();

    if (!EMAIL_RE.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    if (!PHONE_RE.test(normalizedPhone)) {
      return res.status(400).json({ error: 'Enter a valid phone number' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    if (await User.findOne({ phone: normalizedPhone })) {
      return res.status(409).json({ error: 'An account with this phone number already exists.' });
    }
    const pendingPhoneClash = await PendingRegistration.findOne({
      phone: normalizedPhone,
      email: { $ne: normalizedEmail }
    });
    if (pendingPhoneClash) {
      return res.status(409).json({ error: 'An account with this phone number already exists.' });
    }

    const emailOtp = generateOtp();
    const passwordHash = await bcrypt.hash(String(password), 10);

    const pending = await PendingRegistration.findOneAndUpdate(
      { email: normalizedEmail },
      {
        $set: {
          name: String(name).trim(),
          passwordHash,
          phone: normalizedPhone,
          address: String(address || '').trim(),
          emailOtpHash: hashOtp(emailOtp),
          otpExpiresAt: otpExpiryDate(),
          failedAttempts: 0,
          resendCount: 0,
          resendWindowStart: new Date()
        }
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    // Email is the identity channel: if delivery fails, nothing usable was
    // sent, so the pending record is discarded and the client gets a
    // truthful error. No SMS is involved anywhere in this flow.
    try {
      await sendEmailOtp(normalizedEmail, emailOtp);
    } catch (err) {
      await PendingRegistration.deleteOne({ _id: pending._id });
      if (isOtpServiceError(err)) {
        return res.status(503).json({ error: err.message });
      }
      throw err;
    }

    return res.status(201).json({
      success: true,
      message: 'Verification code sent to your email',
      email: normalizedEmail,
      maskedEmail: maskEmail(normalizedEmail),
      expiresAt: pending.otpExpiresAt
    });
  } catch (err) {
    return res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/verify-registration', async (req, res) => {
  try {
    const normalizedEmail = String(req.body.email || '').toLowerCase().trim();
    const { emailOtp } = req.body;

    if (!normalizedEmail || !emailOtp) {
      return res.status(400).json({ error: 'Email and verification code are required' });
    }

    const pending = await PendingRegistration.findOne({ email: normalizedEmail });
    if (!pending) {
      return res.status(404).json({ error: 'No pending registration found. Please register again.' });
    }

    if (pending.otpExpiresAt.getTime() < Date.now()) {
      await PendingRegistration.deleteOne({ _id: pending._id });
      return res.status(400).json({ error: 'Your verification code has expired. Request a new code.' });
    }

    if (pending.failedAttempts >= OTP_MAX_ATTEMPTS) {
      await PendingRegistration.deleteOne({ _id: pending._id });
      return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
    }

    const emailOk = otpMatches(emailOtp, pending.emailOtpHash);

    if (!emailOk) {
      pending.failedAttempts += 1;
      await pending.save();
      if (pending.failedAttempts >= OTP_MAX_ATTEMPTS) {
        await PendingRegistration.deleteOne({ _id: pending._id });
        return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
      }
      return res.status(400).json({ error: 'Incorrect email verification code.' });
    }

    if (await User.findOne({ email: pending.email })) {
      await PendingRegistration.deleteOne({ _id: pending._id });
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    if (await User.findOne({ phone: pending.phone })) {
      await PendingRegistration.deleteOne({ _id: pending._id });
      return res.status(409).json({ error: 'An account with this phone number already exists.' });
    }

    // Insert the pre-hashed password directly so the User pre-save hook
    // does not double-hash it.
    const now = new Date();
    const created = await User.collection.insertOne({
      name: pending.name,
      email: pending.email,
      password: pending.passwordHash,
      phone: pending.phone,
      address: pending.address || '',
      role: 'resident',
      isActive: true,
      accountStatus: 'active',
      availability: 'offline',
      createdBy: null,
      collectorApplication: {
        vehicleType: '',
        verificationInfo: '',
        profilePhoto: '',
        submittedAt: null,
        reviewedAt: null,
        reviewedBy: null
      },
      totals: { kg: 0, earned: 0, points: 0, pickupCount: 0 },
      createdAt: now,
      updatedAt: now
    });

    await PendingRegistration.deleteOne({ _id: pending._id });

    return res.status(201).json({
      success: true,
      message: 'Account verified successfully!',
      userId: created.insertedId
    });
  } catch (err) {
    return res.status(500).json({ error: 'Verification failed' });
  }
});

router.post('/resend-registration-otp', async (req, res) => {
  try {
    const normalizedEmail = String(req.body.email || '').toLowerCase().trim();
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const pending = await PendingRegistration.findOne({ email: normalizedEmail });
    if (!pending) {
      return res.status(404).json({ error: 'No pending registration found. Please register again.' });
    }

    const windowElapsed = Date.now() - new Date(pending.resendWindowStart).getTime();
    if (windowElapsed > OTP_RESEND_WINDOW_MINUTES * 60 * 1000) {
      pending.resendCount = 0;
      pending.resendWindowStart = new Date();
    }
    if (pending.resendCount >= OTP_RESEND_LIMIT) {
      return res.status(429).json({ error: 'Too many OTP requests. Please try again later.' });
    }

    const emailOtp = generateOtp();
    pending.emailOtpHash = hashOtp(emailOtp);
    pending.otpExpiresAt = otpExpiryDate();
    pending.failedAttempts = 0;
    pending.resendCount += 1;
    await pending.save();

    try {
      await sendEmailOtp(pending.email, emailOtp);
    } catch (err) {
      if (isOtpServiceError(err)) {
        return res.status(503).json({ error: err.message });
      }
      throw err;
    }

    return res.json({
      success: true,
      message: 'Verification code sent to your email',
      maskedEmail: maskEmail(pending.email),
      expiresAt: pending.otpExpiresAt
    });
  } catch (err) {
    return res.status(500).json({ error: 'Could not resend verification codes' });
  }
});

router.post('/collector/apply', async (req, res) => {
  try {
    const { name, email, password, phone, address, vehicleType, verificationInfo, profilePhoto } = req.body;
    const normalizedEmail = String(email || '').toLowerCase().trim();
    if (!name || !normalizedEmail || !password || !phone || !address) {
      return res.status(400).json({ error: 'Name, email, password, phone and address are required' });
    }
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (await User.findOne({ email: normalizedEmail }) || await CollectorApplication.findOne({ email: normalizedEmail })) {
      return res.status(409).json({ error: 'Email already registered or application already submitted' });
    }
    const application = await CollectorApplication.create({
      name: String(name).trim(), email: normalizedEmail, password,
      phone: String(phone).trim(), address: String(address).trim(),
      vehicleType: String(vehicleType || '').trim(), verificationInfo: String(verificationInfo || '').trim(),
      profilePhoto: String(profilePhoto || '')
    });
    return res.status(201).json({ application: { id: application._id, email: application.email, status: application.status } });
  } catch (_err) {
    return res.status(500).json({ error: 'Could not submit collector application' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await loginUser(email, password, rememberMe);
    if (result.error) return res.status(401).json({ error: result.error });
    return res.json({ token: result.token, user: result.user.toSafeObject(), expiresIn: result.expiresIn, remember: result.remember });
  } catch (err) {
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/admin/login', async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await loginUser(email, password, rememberMe);
    if (result.error) return res.status(401).json({ error: result.error });
    if (result.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
    return res.json({ token: result.token, user: result.user.toSafeObject(), expiresIn: result.expiresIn, remember: result.remember });
  } catch (err) {
    return res.status(500).json({ error: 'Admin login failed' });
  }
});

router.get('/me', auth, async (req, res) => {
  return res.json({ user: req.user.toSafeObject() });
});

// Live email-OTP service status for diagnostics. Returns booleans only —
// never credential values — so it is safe to query without exposing secrets.
router.get('/otp-status', async (_req, res) => {
  return res.json({
    emailConfigured: isEmailConfigured(),
    devMode: String(process.env.OTP_DEV_MODE || '').toLowerCase() === 'true'
  });
});

module.exports = router;
