/* EcoLoop authenticated homepage navbar (shared, dependency-light).
 * Renders a profile menu when a verified session exists, otherwise the
 * public Login / Get Started actions. Auth itself lives in auth.js;
 * logout reuses the existing [data-logout] delegated handler.
 */
(function () {
  var ROLE_LABELS = { resident: 'Resident', collector: 'Collector', admin: 'Admin' };

  var ICONS = {
    grid: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    plus: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
    history: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 13.5"/></svg>',
    list: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    users: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    shield: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    logout: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    chevron: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>',
    payout: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>'
  };

  var MENUS = {
    resident: [
      { label: 'Dashboard', href: '/', icon: 'grid' },
      { label: 'Book Pickup', href: '/book-pickup.html', icon: 'plus' },
      { label: 'Pickup History', href: '/history.html', icon: 'history' },
      { label: 'Payment Details', href: '/payment-details.html', icon: 'payout' }
    ],
    collector: [
      { label: 'Collector Dashboard', href: '/collector.html', icon: 'grid' },
      { label: 'Scheduled Pickups', href: '/collector-pickups.html', icon: 'list' }
    ],
    admin: [
      { label: 'Home', href: '/', icon: 'grid' },
      { label: 'Admin Dashboard', href: '/admin.html', icon: 'grid' },
      { label: 'Manage Collectors', href: '/admin-collectors.html', icon: 'users' },
      { label: 'Manage Admins', href: '/admin-admins.html', icon: 'shield' }
    ]
  };

  var refreshing = false;

  function els() {
    return {
      profile: document.getElementById('home-profile'),
      button: document.getElementById('home-profile-button'),
      menu: document.getElementById('home-profile-menu'),
      avatar: document.getElementById('home-profile-avatar'),
      name: document.getElementById('home-profile-name'),
      fullname: document.getElementById('home-profile-fullname'),
      role: document.getElementById('home-profile-role'),
      links: document.getElementById('home-profile-links'),
      loginBtn: document.querySelector('.home-actions-nav .home-login-button'),
      ctaBtn: document.querySelector('.home-actions-nav .home-cta-button'),
      adminLink: document.querySelector('.home-actions-nav .home-admin-link'),
      mobileProfile: document.getElementById('home-mobile-profile'),
      centerLinks: document.querySelector('.home-center-links'),
      quickLinks: document.getElementById('home-quick-links'),
      mobileAuthLinks: Array.prototype.slice.call(
        document.querySelectorAll('.home-mobile-menu .home-mobile-muted, .home-mobile-menu .home-mobile-login, .home-mobile-menu .home-mobile-cta')
      ),
      mobileSectionLinks: Array.prototype.slice.call(
        document.querySelectorAll('.home-mobile-menu a[href^="#"]')
      )
    };
  }

  var NAVBAR_LINKS = {
    resident: [
      { label: 'Dashboard', href: '/', icon: 'grid' },
      { label: 'Book Pickup', href: '/book-pickup.html', icon: 'plus' },
      { label: 'Pickup History', href: '/history.html', icon: 'history' }
    ],
    collector: [
      { label: 'Collector Dashboard', href: '/collector.html', icon: 'grid' },
      { label: 'Scheduled Pickups', href: '/collector-pickups.html', icon: 'list' }
    ],
    admin: [
      { label: 'Home', href: '/' },
      { label: 'Admin Dashboard', href: '/admin.html', icon: 'grid' },
      { label: 'Manage Collectors', href: '/admin-collectors.html', icon: 'users' },
      { label: 'Manage Admins', href: '/admin-admins.html', icon: 'shield' }
    ]
  };

  function menuItems(role) {
    return MENUS[role] || MENUS.resident;
  }

  // Single source of truth for the active top-bar item. Compares each
  // link's exact href (path + optional hash) against the current URL:
  // at most one link is ever active. Never matches by text or substring.
  function updateActiveNav() {
    var e = els();
    if (!e.quickLinks) return;
    var links = Array.prototype.slice.call(e.quickLinks.querySelectorAll('a'));
    links.forEach(function (link) { link.classList.remove('active'); });
    var path = window.location.pathname || '/';
    if (path === '/' || path === '/index.html') return;
    var hash = window.location.hash || '';
    var full = path + hash;
    var match = links.filter(function (link) {
      return link.getAttribute('href') === full;
    })[0];
    if (!match && !hash) {
      match = links.filter(function (link) {
        var href = link.getAttribute('href') || '';
        return href.split('#')[0] === path && href.indexOf('#') === -1;
      })[0];
    }
    if (match) match.classList.add('active');
  }

  function navItems(role) {
    return NAVBAR_LINKS[role] || NAVBAR_LINKS.resident;
  }

  function esc(text) {
    var div = document.createElement('div');
    div.textContent = String(text == null ? '' : text);
    return div.innerHTML;
  }

  function closeMenu() {
    var e = els();
    if (!e.menu || !e.button) return;
    e.menu.hidden = true;
    e.button.setAttribute('aria-expanded', 'false');
  }

  function openMenu() {
    var e = els();
    if (!e.menu || !e.button) return;
    e.menu.hidden = false;
    e.button.setAttribute('aria-expanded', 'true');
  }

  function renderLoggedOut() {
    var e = els();
    if (!e.profile) return;
    closeMenu();
    e.profile.hidden = true;
    e.profile.classList.add('hidden');
    if (e.loginBtn) e.loginBtn.hidden = false;
    if (e.ctaBtn) e.ctaBtn.hidden = false;
    if (e.adminLink) e.adminLink.hidden = false;
    if (e.centerLinks) e.centerLinks.hidden = false;
    if (e.quickLinks) {
      e.quickLinks.hidden = true;
      e.quickLinks.innerHTML = '';
    }
    e.mobileSectionLinks.forEach(function (link) { link.hidden = false; });
    if (e.mobileProfile) {
      e.mobileProfile.hidden = true;
      e.mobileProfile.classList.add('hidden');
      e.mobileProfile.innerHTML = '';
    }
    e.mobileAuthLinks.forEach(function (link) { link.hidden = false; });
  }

  function renderLoggedIn(user) {
    var e = els();
    if (!e.profile) return;
    var name = user.name || 'Account';
    var role = user.role || 'resident';
    var items = menuItems(role);
    var navs = navItems(role);
    if (e.avatar) e.avatar.textContent = name.trim().charAt(0).toUpperCase() || '•';
    if (e.name) e.name.textContent = name;
    if (e.button) e.button.setAttribute('aria-label', 'Account menu for ' + name);
    if (e.fullname) e.fullname.textContent = name;
    if (e.role) e.role.textContent = ROLE_LABELS[role] || role;
    if (e.links) {
      e.links.innerHTML = items.map(function (item) {
        return '<a class="home-profile-item" role="menuitem" href="' + item.href + '"><span aria-hidden="true">' +
          (ICONS[item.icon] || ICONS.grid) + '</span><span>' + esc(item.label) + '</span></a>';
      }).join('');
    }
    closeMenu();
    e.profile.hidden = false;
    e.profile.classList.remove('hidden');
    if (e.loginBtn) e.loginBtn.hidden = true;
    if (e.ctaBtn) e.ctaBtn.hidden = true;
    if (e.adminLink) e.adminLink.hidden = true;
    if (e.centerLinks) e.centerLinks.hidden = true;
    if (e.quickLinks) {
      e.quickLinks.innerHTML = navs.map(function (item) {
        return '<a class="home-center-link" href="' + item.href + '"><span>' + esc(item.label) + '</span></a>';
      }).join('');
      e.quickLinks.hidden = false;
      updateActiveNav();
    }
    e.mobileSectionLinks.forEach(function (link) { link.hidden = true; });
    if (e.mobileProfile) {
      e.mobileProfile.hidden = false;
      e.mobileProfile.classList.remove('hidden');
      e.mobileProfile.innerHTML =
        '<div class="home-mobile-profile-meta"><strong>' + esc(name) + '</strong><span>' + esc(ROLE_LABELS[role] || role) + '</span></div>' +
        items.map(function (item) {
          return '<a class="home-mobile-link" href="' + item.href + '">' + esc(item.label) + '</a>';
        }).join('') +
        '<button class="home-mobile-link home-mobile-logout" type="button" data-logout>Logout</button>';
    }
    e.mobileAuthLinks.forEach(function (link) { link.hidden = true; });
  }

  async function refreshNavbar() {
    if (refreshing) return;
    var e = els();
    if (!e.profile) return;
    var hasToken = typeof getToken === 'function' && !!getToken();
    // eslint-disable-next-line no-console
    console.info('[EcoLoop Navbar] initialized, token exists:', hasToken);
    if (!hasToken) {
      // eslint-disable-next-line no-console
      console.info('[EcoLoop Navbar] rendering logged-out navbar');
      renderLoggedOut();
      return;
    }
    // Token present but not yet verified: conceal public auth actions now so
    // Login / Admin / Get Started never flash before the profile renders.
    if (e.loginBtn) e.loginBtn.hidden = true;
    if (e.ctaBtn) e.ctaBtn.hidden = true;
    if (e.adminLink) e.adminLink.hidden = true;
    e.mobileAuthLinks.forEach(function (link) { link.hidden = true; });
    refreshing = true;
    try {
      var data = await API.me();
      if (data && data.user && data.user.role) {
        // eslint-disable-next-line no-console
        console.info('[EcoLoop Navbar] authenticated user:', data.user.name, '(' + data.user.role + ')');
        // eslint-disable-next-line no-console
        console.info('[EcoLoop Navbar] rendering logged-in navbar');
        try { saveSession(getToken(), data.user); } catch (_ignored) {}
        renderLoggedIn(data.user);
      } else {
        // eslint-disable-next-line no-console
        console.info('[EcoLoop Navbar] rendering logged-out navbar');
        clearAuth();
        renderLoggedOut();
      }
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        try { clearAuth(); } catch (_ignored) {}
      }
      // eslint-disable-next-line no-console
      console.info('[EcoLoop Navbar] rendering logged-out navbar');
      renderLoggedOut();
    } finally {
      refreshing = false;
    }
  }

  function bindOnce() {
    var e = els();
    if (!e.profile || e.profile.dataset.bound) return;
    e.profile.dataset.bound = 'true';
    e.button.addEventListener('click', function (event) {
      event.stopPropagation();
      if (e.menu.hidden) openMenu();
      else closeMenu();
    });
    document.addEventListener('click', function (event) {
      if (!e.menu.hidden && !e.profile.contains(event.target)) closeMenu();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !e.menu.hidden) {
        closeMenu();
        e.button.focus();
      }
    });
    e.menu.addEventListener('click', function (event) {
      if (event.target.closest('a,button')) closeMenu();
    });
    var menuButton = document.getElementById('home-menu-button');
    var mobileMenu = document.getElementById('home-mobile-menu');
    var nav = document.querySelector('.home-nav');
    if (nav && !nav.dataset.scrolled) {
      nav.dataset.scrolled = 'true';
      var onScroll = function () {
        nav.classList.toggle('scrolled', window.scrollY > 8);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    if (menuButton && mobileMenu && !menuButton.dataset.bound) {
      menuButton.dataset.bound = 'true';
      menuButton.addEventListener('click', function () {
        var open = !mobileMenu.classList.contains('open');
        mobileMenu.classList.toggle('open', open);
        menuButton.setAttribute('aria-expanded', String(open));
        menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      });
      mobileMenu.addEventListener('click', function (event) {
        if (event.target.closest('a,button')) {
          mobileMenu.classList.remove('open');
          menuButton.setAttribute('aria-expanded', 'false');
          menuButton.setAttribute('aria-label', 'Open menu');
        }
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && mobileMenu.classList.contains('open')) {
          mobileMenu.classList.remove('open');
          menuButton.setAttribute('aria-expanded', 'false');
          menuButton.setAttribute('aria-label', 'Open menu');
          menuButton.focus();
        }
      });
    }
    window.addEventListener('storage', function (event) {
      if (!event || event.key !== 'ecoloop_token') return;
      if (!event.newValue) renderLoggedOut();
      else refreshNavbar();
    });
    window.addEventListener('hashchange', function () {
      updateActiveNav();
    });
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) refreshNavbar();
    });
  }

  // Pure render driven by an already-verified user (or null). Used by the
  // homepage single-state init so /api/auth/me runs exactly once per load.
  function renderNavbarState(user) {
    var e = els();
    if (!e.profile) return;
    bindOnce();
    if (user && user.role) renderLoggedIn(user);
    else renderLoggedOut();
  }

  function initNavbar() {
    var e = els();
    if (!e.profile) return;
    bindOnce();
    refreshNavbar();
  }

  window.initNavbar = initNavbar;
  window.refreshNavbar = refreshNavbar;
  window.renderNavbarState = renderNavbarState;
  window.ensureNavbarBindings = function () {
    var e = els();
    if (!e.profile) return;
    bindOnce();
  };
})();
