/* EcoLoop global loading screen.
 * Shows once per full page load, holds during the initial auth check and
 * across Back/Forward restores while revalidation runs, then fades out.
 * Never triggers on anchors, modals, or form submits.
 * Auth, APIs, and page logic are untouched (promise passthrough only).
 */
(function () {
  var MAX_MS = 5000;
  var SETTLE_MS = 250;
  var FADE_MS = 300;

  var state = { pending: 0, initial: true, hidden: false, loadFired: false, timer: null, usesAuth: false, restoring: false };

  function getOverlay() {
    return document.getElementById('eco-loader');
  }

  function inject() {
    if (getOverlay()) return;
    var overlay = document.createElement('div');
    overlay.id = 'eco-loader';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-label', 'Loading EcoLoop');
    overlay.innerHTML =
      '<div class="eco-loader-box">' +
        '<div class="eco-loader-ringwrap" aria-hidden="true">' +
          '<div class="eco-loader-ring"></div>' +
          '<div class="eco-loader-mark">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<line x1="12" y1="22" x2="12" y2="12"/>' +
              '<path d="M12 12C12 7 8 4 3 4c0 5 4 8 9 8z"/>' +
              '<path d="M12 12c0-5 4-8 9-8 0 5-4 8-9 8z"/>' +
            '</svg>' +
          '</div>' +
        '</div>' +
        '<div class="eco-loader-brand">EcoLoop</div>' +
        '<div class="eco-loader-text">Loading<span class="eco-loader-dots" aria-hidden="true"><i></i><i></i><i></i></span></div>' +
      '</div>';
    document.body.insertBefore(overlay, document.body.firstChild);
  }

  function hide() {
    if (state.hidden) return;
    state.hidden = true;
    state.initial = false;
    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
    document.documentElement.classList.remove('eco-boot');
    var overlay = getOverlay();
    if (overlay) {
      overlay.classList.add('eco-loader-hide');
      // Only remove the exact node this hide() call faded, and only if no
      // newer restore has re-shown it since (fast Back/Forward).
      window.setTimeout(function () {
        if (state.hidden && getOverlay() === overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, FADE_MS + 100);
    }
  }

  function maybeHide() {
    if (state.hidden || !state.loadFired || state.pending > 0) return;
    state.timer = window.setTimeout(hide, SETTLE_MS);
  }

  function onReady() {
    state.loadFired = true;
    maybeHide();
  }

  // Hold the loader across auth checks that gate page visibility: the
  // initial check, plus Back/Forward restores. Pure passthrough: same
  // arguments in, same promise out. Later background calls (e.g. storage
  // revalidation after the page is visible) never retrigger the loader.
  function wrapAuthGate(name) {
    if (typeof window[name] !== 'function') return;
    var original = window[name];
    window[name] = function () {
      var shouldHold = state.initial || state.restoring;
      if (!shouldHold) return original.apply(this, arguments);
      state.usesAuth = true;
      state.pending += 1;
      if (state.timer) {
        window.clearTimeout(state.timer);
        state.timer = null;
      }
      var done = function () {
        state.pending = Math.max(0, state.pending - 1);
        if (state.pending === 0) state.restoring = false;
        maybeHide();
      };
      try {
        var result = original.apply(this, arguments);
        if (result && typeof result.then === 'function') result.then(done, done);
        else done();
        return result;
      } catch (err) {
        done();
        throw err;
      }
    };
  }

  function wrapInitialAuth() {
    wrapAuthGate('requireAuth');
    wrapAuthGate('redirectAuthenticatedUser');
  }

  // Back/Forward restore of a cached page: cover content again and hold
  // until the auth guard revalidates. Runs before page-level pageshow
  // listeners (this script loads first), so the hold is always in place.
  function beginRestore() {
    state.hidden = false;
    state.restoring = true;
    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
    document.documentElement.classList.add('eco-boot');
    inject();
    var overlay = getOverlay();
    if (overlay) overlay.classList.remove('eco-loader-hide');
    state.timer = window.setTimeout(hide, MAX_MS);
  }

  inject();
  wrapInitialAuth();

  if (document.readyState === 'complete') {
    onReady();
  } else {
    window.addEventListener('load', onReady);
  }
  // Back/Forward cache restores: re-cover and revalidate auth-gated pages,
  // never leave the loader up, never fight browser history.
  window.addEventListener('pageshow', function (event) {
    if (document.readyState !== 'complete') return;
    if (event.persisted && state.usesAuth) beginRestore();
    else hide();
  });
  // Absolute safety fallback: never stuck on Loading.
  window.setTimeout(hide, MAX_MS);
})();
