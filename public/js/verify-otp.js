let countdownTimer = null;

function getPendingEmail() {
  return sessionStorage.getItem('ecoloop_pending_email') || '';
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `Code expires in ${minutes}:${seconds}`;
}

function startCountdown(expiresAt) {
  const el = document.getElementById('otp-countdown');
  if (countdownTimer) clearInterval(countdownTimer);
  if (!expiresAt) {
    if (el) el.textContent = 'Code expires in 10:00';
    return;
  }
  const target = new Date(expiresAt).getTime();
  const tick = () => {
    const remaining = target - Date.now();
    if (el) el.textContent = remaining <= 0 ? 'Code expired. Request a new code.' : formatCountdown(remaining);
    if (remaining <= 0) clearInterval(countdownTimer);
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

function initVerifyPage() {
  const email = getPendingEmail();
  if (!email) {
    showAlert(document.getElementById('alert'), 'No pending registration found. Please register first.');
    setTimeout(() => { window.location.href = '/register.html'; }, 1200);
    return;
  }

  const maskedEmail = sessionStorage.getItem('ecoloop_masked_email') || '';
  if (maskedEmail) {
    document.getElementById('masked-email').textContent = maskedEmail;
    document.getElementById('masked-email-hint').textContent = maskedEmail;
  }
  startCountdown(sessionStorage.getItem('ecoloop_otp_expires_at'));

  document.getElementById('verify-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const emailOtp = document.getElementById('email-otp').value.trim();
    if (!/^\d{6}$/.test(emailOtp)) {
      showAlert(document.getElementById('alert'), 'Enter the 6-digit email verification code.');
      return;
    }
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    button.innerHTML = '<span>Verifying...</span>';
    try {
      await API.verifyRegistration({ email, emailOtp });
      ['ecoloop_pending_email', 'ecoloop_otp_expires_at', 'ecoloop_masked_email']
        .forEach((key) => sessionStorage.removeItem(key));
      showAlert(document.getElementById('alert'), 'Account verified successfully!', 'success');
      setTimeout(() => { window.location.href = '/login.html'; }, 800);
    } catch (err) {
      showAlert(document.getElementById('alert'), err.message);
      button.disabled = false;
      button.innerHTML = '<span>Verify Account</span><span aria-hidden="true">→</span>';
    }
  });

  document.getElementById('resend-otp').addEventListener('click', async (event) => {
    event.preventDefault();
    const link = event.target;
    link.textContent = 'Sending...';
    try {
      const data = await API.resendRegistrationOtp(email);
      if (data.expiresAt) sessionStorage.setItem('ecoloop_otp_expires_at', data.expiresAt);
      if (data.maskedEmail) sessionStorage.setItem('ecoloop_masked_email', data.maskedEmail);
      startCountdown(data.expiresAt);
      showAlert(document.getElementById('alert'), 'New verification code sent to your email.', 'success');
    } catch (err) {
      showAlert(document.getElementById('alert'), err.message);
    } finally {
      link.textContent = 'Resend OTP';
    }
  });
}

initVerifyPage();
