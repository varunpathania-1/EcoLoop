const { isDevMode, OTP_EXPIRY_MINUTES } = require('./otp');

function isEmailConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY ||
    (process.env.EMAIL_HOST &&
     process.env.EMAIL_USER &&
     process.env.EMAIL_PASSWORD)
  );
}

function buildTransport() {
  // Lazy require so the app boots even when nodemailer is absent.
  const nodemailer = require('nodemailer');
  const port = Number(process.env.EMAIL_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port,
    secure: port === 465,
    auth: {
  user: process.env.EMAIL_USER,
  pass: process.env.EMAIL_PASSWORD
},
connectionTimeout: 10000,
greetingTimeout: 10000,
socketTimeout: 20000
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
  const message = buildMessage(to, otp);

  // Use Resend on Render (HTTPS API)
  if (process.env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'EcoLoop <onboarding@resend.dev>',
        to: [to],
        subject: message.subject,
        text: message.text
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[RESEND] Email failed:', result);
      const err = new Error(
        result.message || 'Resend could not send the verification email.'
      );
      err.code = 'RESEND_API_ERROR';
      throw err;
    }

    console.log('[RESEND] OTP email accepted:', result.id);
    return { delivered: true, provider: 'resend' };
  }

  // Keep SMTP as a fallback for local development
  if (!isEmailConfigured()) {
    if (isDevMode()) {
      console.log(`[DEV OTP] Email OTP for ${to}: ${otp}`);
      return { delivered: false, devMode: true };
    }

    const err = new Error('OTP service is not configured.');
    err.code = 'OTP_NOT_CONFIGURED';
    throw err;
  }

  const transporter = buildTransport();
  await transporter.sendMail(message);
  return { delivered: true, provider: 'smtp' };
}

const transporter = buildTransport();

try {
  await transporter.sendMail(buildMessage(to, otp));
  console.log('[EMAIL] OTP email accepted by SMTP provider');
} catch (err) {
  console.error('[EMAIL] OTP send failed:', {
    code: err.code,
    command: err.command,
    responseCode: err.responseCode,
    message: err.message
  });
  throw err;
}
  if (isDevMode()) console.log(`[DEV OTP] Email OTP sent to ${to} (see inbox)`);
  return { delivered: true, devMode: false };
}

module.exports = { isEmailConfigured, sendEmailOtp };
