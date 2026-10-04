document.getElementById('collector-application-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Submitting application...';
  try {
    await API.collectorApply({
      name: document.getElementById('application-name').value,
      email: document.getElementById('application-email').value,
      phone: document.getElementById('application-phone').value,
      address: document.getElementById('application-address').value,
      vehicleType: document.getElementById('application-vehicle').value,
      verificationInfo: document.getElementById('application-verification').value,
      password: document.getElementById('application-password').value
    });
    showAlert(document.getElementById('collector-application-alert'), 'Application submitted successfully. Your account is waiting for admin approval.', 'success');
    event.target.reset();
  } catch (err) {
    showAlert(document.getElementById('collector-application-alert'), err.message);
  } finally {
    button.disabled = false;
    button.innerHTML = 'Submit application <span aria-hidden="true">→</span>';
  }
});
