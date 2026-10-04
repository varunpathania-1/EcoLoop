const { isDevMode, OTP_EXPIRY_MINUTES } = require('./otp');

function isEmailConfigured() {
  return Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD);
}

function buildTransport() {
  // Lazy require so the app boots even when nodemailer is absent.
  const nodemailer = require('nodemailer');
  const port = Number(process.env.EMAIL_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD }
  });
}

function buildMessage(to, otp) {
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  return {
    from,
    to,
    subject: 'Verify your EcoLoop account',
    text: [
      'EcoLoop',
      '',
      'Verify your account',
      '',
      'Your verification code is:',
      '',
      String(otp),
      '',
      `This code expires in ${OTP_EXPIRY_MINUTES} minutes.`,
      '',
      'If you did not request this, you can ignore this email.'
    ].join('\n')
  };
}

async function sendEmailOtp(to, otp) {
  if (!isEmailConfigured()) {
    if (isDevMode()) {
      console.log(`[DEV OTP] Email OTP for ${to}: ${otp}`);
      return { delivered: false, devMode: true };
    }
    const err = new Error('OTP service is not configured. Add email/SMS credentials to .env.');
    err.code = 'OTP_NOT_CONFIGURED';
    throw err;
  }
  const transporter = buildTransport();
  await transporter.sendMail(buildMessage(to, otp));
  if (isDevMode()) console.log(`[DEV OTP] Email OTP sent to ${to} (see inbox)`);
  return { delivered: true, devMode: false };
}

module.exports = { isEmailConfigured, sendEmailOtp };
