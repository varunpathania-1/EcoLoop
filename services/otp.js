const crypto = require('crypto');

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_LIMIT = 3;
const OTP_RESEND_WINDOW_MINUTES = 15;

function isDevMode() {
  return String(process.env.OTP_DEV_MODE || '').toLowerCase() === 'true';
}

// Cryptographically secure 6-digit OTP. Never Math.random() for OTPs.
function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

// SHA-256 hash for OTP storage so raw OTPs never touch MongoDB.
function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

// Constant-time comparison to avoid timing side channels.
function otpMatches(candidate, storedHash) {
  const candidateHash = hashOtp(candidate);
  const a = Buffer.from(candidateHash, 'hex');
  const b = Buffer.from(String(storedHash), 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function otpExpiryDate() {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
}

module.exports = {
  OTP_EXPIRY_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_LIMIT,
  OTP_RESEND_WINDOW_MINUTES,
  isDevMode,
  generateOtp,
  hashOtp,
  otpMatches,
  otpExpiryDate
};
