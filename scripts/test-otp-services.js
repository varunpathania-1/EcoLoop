// Checks the email-OTP service configuration and optionally sends a live
// test message. Phone numbers are profile data only; no SMS is involved.
// Usage:
//   node scripts/test-otp-services.js                 (config check only)
//   node scripts/test-otp-services.js --email-to=a@b.c (also send test email)
require('dotenv').config();

const { isEmailConfigured, sendEmailOtp } = require('../services/email');

function flag(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

async function main() {
  console.log(`Email configured: ${isEmailConfigured()}`);

  const emailTo = flag('--email-to');
  if (emailTo) {
    try {
      await sendEmailOtp(emailTo, '123456');
      console.log(`Test email sent to ${emailTo} (code 123456 is NOT a real OTP).`);
    } catch (err) {
      console.error(`Test email failed: ${err.message}`);
      process.exitCode = 1;
    }
  } else {
    console.log('No live test requested. Pass --email-to to send one.');
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
