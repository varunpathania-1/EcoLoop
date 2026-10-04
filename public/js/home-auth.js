/* EcoLoop personalized homepage (shared).
 * Same URL (/) renders public or role-specific home content based on the
 * verified session. Data comes from existing dashboard/collector/admin
 * APIs only. Auth primitives (getToken/API.me/clearAuth) are reused.
 */
(function () {
  var refreshing = false;
  var queued = false;

  function $(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    var el = $(id);
    if (el) el.textContent = value;
  }

  function greetingWord() {
    var hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function formatShortDate(value) {
    try {
      var d = new Date(value);
      var date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      var time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return date + ' · ' + time;
    } catch (_err) {
      return '';
    }
  }

  function formatMoney(value) {
    return '₹' + Number(value || 0).toFixed(2);
  }

  function showView(role) {
    var pub = $('home-public');
    var auth = $('home-auth');
    var hero = $('home-hero');
    var sections = $('public-home-sections');
    if (!pub || !auth) return;
    var views = auth.querySelectorAll('[data-home-view]');
    Array.prototype.forEach.call(views, function (view) {
      view.hidden = view.getAttribute('data-home-view') !== role;
    });
    var loggedIn = role !== 'public';
    document.body.classList.toggle('dash-resident', loggedIn && role === 'resident');
    pub.hidden = loggedIn;
    auth.hidden = !loggedIn;
    if (hero) hero.hidden = loggedIn;
    if (sections) sections.hidden = loggedIn;
    if (loggedIn) {
      auth.classList.remove('home-auth-enter');
      void auth.offsetWidth;
      auth.classList.add('home-auth-enter');
    }
  }

  function refreshCachedUser(user) {
    try {
      var token = typeof getToken === 'function' ? getToken() : null;
      if (!token) return;
      var raw = null;
      try { raw = localStorage.getItem('ecoloop_user'); } catch (_e) { raw = null; }
      if (raw !== JSON.stringify(user)) saveSession(token, user);
    } catch (_ignored) {}
  }

  async function renderResident(user, data) {
    var totals = (data && data.totals) || {};
    document.body.classList.add('dash-resident');
    setText('ha-name', user.name || 'friend');
    setText('ha-kg', Number(totals.kg || 0).toFixed(2) + ' kg');
    setText('ha-earned', formatMoney(totals.earned));
    setText('ha-pickups', totals.pickupCount || 0);
    setText('ha-pending', formatMoney(data && data.pendingAmount));
    var recent = data && data.recentPickups && data.recentPickups[0];
    var empty = $('ha-recent-empty');
    var full = $('ha-recent-full');
    if (!recent) {
      if (empty) empty.hidden = false;
      if (full) full.hidden = true;
    } else {
      if (empty) empty.hidden = true;
      if (full) full.hidden = false;
      setText('ha-r-date', formatShortDate(recent.datetime));
      var cats = (recent.requestedCategories || []).map(function (c) {
        return String(c).charAt(0).toUpperCase() + String(c).slice(1);
      }).join(' · ');
      setText('ha-r-cats', cats);
      setText('ha-r-kg', Number((recent.totals && recent.totals.kg) || 0).toFixed(2) + ' kg');
      setText('ha-r-amt', formatMoney(recent.totals && recent.totals.amount));
      setText('ha-r-pts', '+' + (recent.pointsAwarded || 0));
      var status = $('ha-r-status');
      if (status) {
        status.hidden = false;
        status.textContent = '✓ ' + String(recent.status || '').replace(/_/g, ' ');
      }
    }
    var kg = Number(totals.kg || 0).toFixed(2);
    setText('ha-impact-kg', kg + ' kg');
    setText('ha-impact-sub', Number(totals.pickupCount || 0) > 0
      ? "You've recycled " + kg + ' kg through EcoLoop. Keep your recycling going.'
      : 'Book your first pickup to start building your impact.');
    try {
      var payout = await API.getPaymentDetails();
      var hasPayout = !!(payout && payout.details);
      var pendingCount = (data && data.recentPickups || []).filter(function (p) {
        return p && (p.status === 'payment_pending' || (p.payment && p.payment.status === 'pending'));
      }).length;
      var payoutEmpty = $('ha-payout-empty');
      var payoutFull = $('ha-payout-full');
      var payoutBadge = $('ha-payout-badge');
      var payoutPending = $('ha-payout-pending');
      var payoutCta = $('ha-payout-cta');
      if (payoutEmpty) payoutEmpty.hidden = hasPayout;
      if (payoutFull) payoutFull.hidden = !hasPayout;
      if (payoutBadge) payoutBadge.hidden = !hasPayout;
      if (hasPayout) {
        var d = payout.details;
        if (d.method === 'upi') {
          setText('ha-payout-method', 'Method: UPI');
          setText('ha-payout-value', 'UPI ID: ' + (d.upiId || ''));
        } else {
          var digits = String(d.accountNumber || '').replace(/\D/g, '');
          setText('ha-payout-method', 'Method: Bank Account');
          setText('ha-payout-value', 'Account: ' + (digits.length > 4 ? '******' + digits.slice(-4) : '******'));
        }
        if (payoutPending) payoutPending.hidden = true;
        if (payoutCta) payoutCta.textContent = 'Manage Payment Details';
      } else {
        if (payoutPending) payoutPending.hidden = pendingCount === 0;
        if (payoutCta) payoutCta.textContent = 'Add Payment Details';
      }
    } catch (_payoutErr) {
      // Payout card stays in its default "add details" state.
    }
    showView('resident');
  }

  function renderAdmin(user, stats) {
    stats = stats || {};
    setText('ha-a-name', user.name || 'friend');
    setText('ha-a-active', stats.activeCollectors || 0);
    setText('ha-a-colls', stats.totalCollectors || 0);
    setText('ha-a-pickups', stats.totalPickups || 0);
    setText('ha-a-done', stats.completedPickups || 0);
    showView('admin');
  }

  function renderNavbar(user) {
    if (typeof window.renderNavbarState === 'function') {
      try { window.renderNavbarState(user); } catch (_ignored) {}
    }
  }

  async function initHomeAuth() {
    if (typeof window.ensureNavbarBindings === 'function') {
      try { window.ensureNavbarBindings(); } catch (_ignored) {}
    }
    if (refreshing) {
      queued = true;
      return;
    }
    var pub = $('home-public');
    var auth = $('home-auth');
    if (!pub || !auth) return;
    refreshing = true;
    try {
      var token = typeof getToken === 'function' ? getToken() : null;
      if (!token) {
        renderNavbar(null);
        showView('public');
        return;
      }
      pub.hidden = true;
      var me;
      try {
        me = await API.me();
      } catch (err) {
        if (err && (err.status === 401 || err.status === 403)) {
          try { clearAuth(); } catch (_ignored) {}
        }
        renderNavbar(null);
        showView('public');
        return;
      }
      var user = me && me.user;
      if (!user || !user.role) {
        try { clearAuth(); } catch (_ignored) {}
        renderNavbar(null);
        showView('public');
        return;
      }
      refreshCachedUser(user);
      renderNavbar(user);
      if (user.role === 'collector') {
        // Collectors have no home experience on /: the Collector Dashboard
        // (collector.html) is their landing page. Bounce them there instead
        // of rendering the public landing.
        window.location.replace('/collector.html');
        return;
      } else if (user.role === 'admin') {
        var dash = await API.adminDashboard();
        renderAdmin(user, dash && dash.stats);
      } else {
        var data = await API.dashboard();
        await renderResident(user, data);
      }
    } catch (_err) {
      renderNavbar(null);
      showView('public');
    } finally {
      refreshing = false;
      if (queued) {
        queued = false;
        initHomeAuth();
      }
    }
  }

  window.addEventListener('storage', function (event) {
    if (!event || event.key !== 'ecoloop_token') return;
    initHomeAuth();
  });

  window.addEventListener('pageshow', function (event) {
    if (event.persisted) initHomeAuth();
  });

  window.initHomeAuth = initHomeAuth;
  window.initHomePage = initHomeAuth;
})();
