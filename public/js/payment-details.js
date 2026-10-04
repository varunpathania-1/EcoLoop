async function initPaymentDetails() {
  if (typeof initNavbar === 'function') initNavbar();
  installAuthGuard('resident');
  const user = await requireAuth('resident');
  if (!user) return;

  const alertEl = document.getElementById('alert');
  const methodInputs = Array.prototype.slice.call(document.querySelectorAll('input[name="payout-method"]'));
  const upiFields = document.getElementById('upi-fields');
  const bankFields = document.getElementById('bank-fields');

  function selectedMethod() {
    const checked = methodInputs.filter((input) => input.checked)[0];
    return checked ? checked.value : 'upi';
  }

  function showMethod(method) {
    upiFields.hidden = method !== 'upi';
    bankFields.hidden = method !== 'bank';
    methodInputs.forEach((input) => {
      input.checked = input.value === method;
    });
  }

  methodInputs.forEach((input) => {
    input.addEventListener('change', () => showMethod(input.value));
  });

  function fieldError(id, message) {
    const input = document.getElementById(id);
    const error = document.getElementById(id + '-error');
    if (input) input.classList.toggle('has-error', Boolean(message));
    if (error) error.textContent = message || '';
  }

  function clearFieldErrors() {
    ['upi-id', 'account-holder', 'bank-name', 'ifsc-code', 'account-number'].forEach((id) => fieldError(id, ''));
  }

  function maskAccount(number) {
    const digits = String(number || '').replace(/\D/g, '');
    if (digits.length <= 4) return '******';
    return '******' + digits.slice(-4);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function renderSummary(details) {
    const empty = document.getElementById('payout-summary-empty');
    const full = document.getElementById('payout-summary-full');
    const edit = document.getElementById('payout-edit');
    const remove = document.getElementById('payout-delete');
    document.getElementById('payout-summary-note').hidden = !details;
    if (!details) {
      empty.hidden = false;
      full.hidden = true;
      edit.hidden = true;
      remove.hidden = true;
      return;
    }
    empty.hidden = true;
    full.hidden = false;
    edit.hidden = false;
    remove.hidden = false;
    document.getElementById('payout-summary-method').textContent =
      details.method === 'upi' ? 'UPI' : 'Bank Account';
    document.getElementById('payout-summary-lines').innerHTML = details.method === 'upi'
      ? escapeHtml(details.upiId)
      : [
        escapeHtml(details.accountHolderName),
        escapeHtml(details.bankName),
        'A/c ' + escapeHtml(maskAccount(details.accountNumber)),
        escapeHtml(details.ifscCode)
      ].join('<br>');
    document.getElementById('payout-summary-verified').textContent =
      details.isVerified ? '✓ Verified' : 'Unverified';
    const added = document.getElementById('payout-summary-added');
    if (added) {
      const when = details.createdAt ? new Date(details.createdAt).toLocaleDateString() : '';
      added.textContent = when ? 'Added: ' + when : '';
    }
  }

  function fillForm(details) {
    showMethod(details.method === 'bank' ? 'bank' : 'upi');
    document.getElementById('upi-id').value = details.method === 'upi' ? details.upiId || '' : '';
    document.getElementById('account-holder').value = details.accountHolderName || '';
    document.getElementById('bank-name').value = details.bankName || '';
    document.getElementById('account-number').value = '';
    document.getElementById('account-number-confirm').value = '';
    document.getElementById('ifsc-code').value = details.ifscCode || '';
  }

  async function loadDetails() {
    try {
      const data = await API.getPaymentDetails();
      renderSummary(data.details);
      return data.details;
    } catch (err) {
      showAlert(alertEl, err.message);
      return null;
    }
  }

  let current = await loadDetails();

  document.getElementById('payout-edit').addEventListener('click', () => {
    if (!current) return;
    fillForm(current);
    document.getElementById('upi-id').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.getElementById('payout-delete').addEventListener('click', async () => {
    if (!window.confirm('Remove your saved payout details?')) return;
    try {
      await API.deletePaymentDetails();
      current = null;
      renderSummary(null);
      showAlert(alertEl, 'Payout details removed.', 'success');
    } catch (err) {
      showAlert(alertEl, err.message);
    }
  });

  document.getElementById('payout-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors();
    const method = selectedMethod();
    const body = { method };
    if (method === 'upi') {
      body.upiId = document.getElementById('upi-id').value.trim();
      if (!body.upiId) {
        fieldError('upi-id', 'UPI ID is required');
        showAlert(alertEl, 'UPI ID is required');
        return;
      }
      if (!/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(body.upiId)) {
        fieldError('upi-id', 'Enter a valid UPI ID (e.g. name@bank)');
        showAlert(alertEl, 'Enter a valid UPI ID (e.g. name@bank)');
        return;
      }
    } else {
      body.accountHolderName = document.getElementById('account-holder').value.trim();
      body.bankName = document.getElementById('bank-name').value.trim();
      body.accountNumber = document.getElementById('account-number').value.replace(/[\s-]/g, '');
      body.confirmAccountNumber = document.getElementById('account-number-confirm').value.replace(/[\s-]/g, '');
      body.ifscCode = document.getElementById('ifsc-code').value.trim().toUpperCase();
      if (!body.accountHolderName) {
        fieldError('account-holder', 'Account holder name is required');
        showAlert(alertEl, 'Account holder name is required');
        return;
      }
      if (!body.bankName) {
        fieldError('bank-name', 'Bank name is required');
        showAlert(alertEl, 'Bank name is required');
        return;
      }
      if (!/^\d{9,18}$/.test(body.accountNumber)) {
        fieldError('account-number', 'Enter a valid bank account number (9-18 digits)');
        showAlert(alertEl, 'Enter a valid bank account number (9-18 digits)');
        return;
      }
      if (body.accountNumber !== body.confirmAccountNumber) {
        fieldError('account-number', 'Account numbers do not match');
        showAlert(alertEl, 'Account numbers do not match');
        return;
      }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(body.ifscCode)) {
        fieldError('ifsc-code', 'Enter a valid IFSC code (e.g. SBIN0001234)');
        showAlert(alertEl, 'Enter a valid IFSC code (e.g. SBIN0001234)');
        return;
      }
    }

    try {
      const data = await API.savePaymentDetails(body);
      current = data.details;
      renderSummary(current);
      showAlert(alertEl, '✓ Payment details saved successfully.', 'success');
    } catch (err) {
      showAlert(alertEl, err.message);
    }
  });
}

initPaymentDetails();
