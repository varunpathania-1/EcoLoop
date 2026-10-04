/* EcoLoop shared pickup-location map helper (Leaflet, vendored locally).
 * No tracking, no routing, no streaming — shows a single pickup point
 * and optionally lets the resident choose it. Uses a CSS pin (no images).
 */
(function () {
  var TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  var DEFAULT_CENTER = [20.5937, 78.9629];
  var DEFAULT_ZOOM = 5;
  var FOCUS_ZOOM = 15;

  function leafletReady() {
    return typeof window.L !== 'undefined';
  }

  function createPinIcon() {
    return window.L.divIcon({
      className: 'eco-pin-wrap',
      html: '<span class="eco-pin" aria-hidden="true"></span>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
  }

  function directionsUrl(lat, lng) {
    return 'https://www.google.com/maps/dir/?api=1&destination=' +
      encodeURIComponent(Number(lat).toFixed(6) + ',' + Number(lng).toFixed(6));
  }

  // options: { lat, lng, interactive, zoom, onPick(lat, lng) }
  // returns { map, marker, setPoint(lat, lng, zoom?), destroy() } or null
  function createPickupMap(el, options) {
    if (!el || !leafletReady()) return null;
    var opts = options || {};
    var map = window.L.map(el, { scrollWheelZoom: !!opts.interactive }).setView(
      [Number(opts.lat) || DEFAULT_CENTER[0], Number(opts.lng) || DEFAULT_CENTER[1]],
      opts.zoom || (opts.lat != null ? FOCUS_ZOOM : DEFAULT_ZOOM)
    );
    window.L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);
    var marker = null;
    function setPoint(lat, lng, zoom) {
      if (marker) map.removeLayer(marker);
      marker = window.L.marker([lat, lng], { icon: createPinIcon() }).addTo(map);
      map.setView([lat, lng], zoom || Math.max(map.getZoom(), FOCUS_ZOOM));
    }
    if (opts.lat != null && opts.lng != null) setPoint(Number(opts.lat), Number(opts.lng), opts.zoom);
    if (opts.interactive && typeof opts.onPick === 'function') {
      map.on('click', function (event) {
        setPoint(event.latlng.lat, event.latlng.lng);
        opts.onPick(event.latlng.lat, event.latlng.lng);
      });
    }
    window.setTimeout(function () { map.invalidateSize(); }, 100);
    return {
      map: map,
      setPoint: setPoint,
      destroy: function () { try { map.remove(); } catch (_ignored) {} }
    };
  }

  window.PickupMap = {
    create: createPickupMap,
    directionsUrl: directionsUrl,
    ready: leafletReady
  };
})();
