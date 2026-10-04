async function initAdminLogin() {
  guardPublicPage();

  document.getElementById('admin-login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const alertEl = document.getElementById('admin-login-alert');
    try {
      const data = await API.adminLogin({
        email: document.getElementById('admin-email').value,
        password: document.getElementById('admin-password').value
      });
      saveSession(data.token, data.user);
      window.location.replace('/');
    } catch (err) {
      showAlert(alertEl, err.message);
    }
  });
}

initAdminLogin();
