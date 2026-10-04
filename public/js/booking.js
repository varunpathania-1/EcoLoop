async function initBooking() {
  installAuthGuard('resident');
  const user = await requireAuth('resident');
  if (!user) return;

  const dateInput = document.getElementById('date');
  const categoryInputs = [...document.querySelectorAll('input[name="category"]')];
  const locationBox = document.getElementById('selected-location-box');
  const locationAddressEl = document.getElementById('selected-location-address');
  const locationHintEl = document.getElementById('selected-location-hint');
  const locationConfirmEl = document.getElementById('location-status');
  const locationLine = document.getElementById('pickup-location-line');
  const submitButton = document.querySelector('#pickup-form button[type="submit"]');

  let selectedPickupLocation = {
    latitude: null,
    longitude: null,
    address: ''
  };
  let geocodeToken = 0;

  function hasLocation() {
    return Number.isFinite(selectedPickupLocation.latitude) &&
      Number.isFinite(selectedPickupLocation.longitude);
  }

  function formValues() {
    return {
      categories: [...document.querySelectorAll('input[name="category"]:checked')].map((el) => el.value),
      date: document.getElementById('date').value,
      time: document.getElementById('time').value,
      unit: document.getElementById('detail-unit').value.trim()
    };
  }

  function refreshSubmitState() {
    if (!submitButton) return;
    const v = formValues();
    const valid = v.categories.length > 0 && v.date !== '' && v.time !== '' && hasLocation() && v.unit !== '';
    submitButton.disabled = !valid;
  }

  function renderSelectedLocation(state) {
    if (!locationBox) return;
    if (state === 'locating') {
      if (locationAddressEl) locationAddressEl.textContent = 'Finding address…';
      if (locationHintEl) locationHintEl.textContent = 'Please wait while we look up this point.';
      if (locationConfirmEl) locationConfirmEl.hidden = true;
    } else if (state === 'selected') {
      if (locationAddressEl) locationAddressEl.textContent = selectedPickupLocation.address || 'Selected pickup location';
      if (locationHintEl) locationHintEl.textContent = 'This is where your collector will come.';
      if (locationConfirmEl) locationConfirmEl.hidden = false;
    } else {
      if (locationAddressEl) locationAddressEl.textContent = 'No pickup location selected';
      if (locationHintEl) locationHintEl.textContent = 'Use your current location or pick a point on the map.';
      if (locationConfirmEl) locationConfirmEl.hidden = true;
    }
    if (locationLine) {
      locationLine.textContent = hasLocation() && selectedPickupLocation.address
        ? `Pickup location: ${selectedPickupLocation.address}`
        : 'Pickup location: not selected';
    }
    refreshSubmitState();
  }

  async function reverseGeocode(lat, lng) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18`, {
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) return '';
      const data = await res.json().catch(() => ({}));
      return typeof data.display_name === 'string' ? data.display_name : '';
    } catch (_err) {
      return '';
    }
  }

  async function selectPickupLocation(lat, lng) {
    const myToken = ++geocodeToken;
    selectedPickupLocation.latitude = Number(lat);
    selectedPickupLocation.longitude = Number(lng);
    selectedPickupLocation.address = '';
    if (pickupMap) pickupMap.setPoint(selectedPickupLocation.latitude, selectedPickupLocation.longitude);
    renderSelectedLocation('locating');
    const address = await reverseGeocode(selectedPickupLocation.latitude, selectedPickupLocation.longitude);
    if (myToken !== geocodeToken) return;
    selectedPickupLocation.address = address;
    renderSelectedLocation('selected');
  }

  function refreshDetailsUI() {
    const line = document.getElementById('pickup-details-line');
    if (!line) return;
    const building = document.getElementById('detail-building').value.trim();
    const unit = document.getElementById('detail-unit').value.trim();
    const floor = document.getElementById('detail-floor').value.trim();
    const landmark = document.getElementById('detail-landmark').value.trim();
    const parts = [];
    if (building) parts.push(building);
    if (unit) parts.push(`Room ${unit}`);
    if (floor) parts.push(floor);
    if (landmark) parts.push(landmark);
    line.textContent = parts.length ? parts.join(' · ') : 'No pickup details entered yet.';
  }

  ['detail-unit', 'detail-building', 'detail-floor', 'detail-landmark'].forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.addEventListener('input', refreshDetailsUI);
  });

  let pickupMap = null;
  if (window.PickupMap && window.PickupMap.ready()) {
    pickupMap = window.PickupMap.create(document.getElementById('pickup-map'), {
      interactive: true,
      onPick: (lat, lng) => selectPickupLocation(lat, lng)
    });
  }

  const GEO_FAIL_MSG =
  'Unable to get your current location. Please check that Location is enabled and try again.';

function renderGeolocationError(message) {
  renderSelectedLocation(hasLocation() ? 'selected' : 'none');

  if (locationHintEl) {
    locationHintEl.textContent = message;
  }
}

const useLocationBtn = document.getElementById('use-location');

if (useLocationBtn) {
  useLocationBtn.addEventListener('click', () => {

    if (!navigator.geolocation) {
      renderGeolocationError(
        'Location is not supported on this device.'
      );
      return;
    }

    if (locationAddressEl) {
      locationAddressEl.textContent = 'Finding your location...';
    }

    if (locationHintEl) {
      locationHintEl.textContent =
        'Please wait while we get your GPS location.';
    }

    if (locationConfirmEl) {
      locationConfirmEl.hidden = true;
    }

    useLocationBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      async (position) => {

        console.log(
          '[EcoLoop] Location found:',
          position.coords.latitude,
          position.coords.longitude,
          'accuracy:',
          position.coords.accuracy
        );

        await selectPickupLocation(
          position.coords.latitude,
          position.coords.longitude
        );

        useLocationBtn.disabled = false;
      },

      (error) => {

        console.error(
          '[EcoLoop] Geolocation error:',
          error.code,
          error.message
        );

        let message;

        switch (error.code) {
          case error.PERMISSION_DENIED:
            message =
              'Location permission was denied. Please allow location access for EcoLoop.';
            break;

          case error.POSITION_UNAVAILABLE:
            message =
              'GPS location is currently unavailable. Please make sure Location is enabled.';
            break;

          case error.TIMEOUT:
            message =
              'GPS is taking too long to respond. Please try again.';
            break;

          default:
            message = GEO_FAIL_MSG;
        }

        renderGeolocationError(message);

        useLocationBtn.disabled = false;
      },

      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0
      }
    );
  });
}

  const pickOnMapBtn = document.getElementById('pick-on-map');
  if (pickOnMapBtn) {
    pickOnMapBtn.addEventListener('click', () => {
      // Re-picking invalidates the previous selection: the button stays
      // disabled until the user explicitly confirms a new map point.
      if (hasLocation()) {
        selectedPickupLocation = { latitude: null, longitude: null, address: '' };
        renderSelectedLocation('none');
      }
      const mapEl = document.getElementById('pickup-map');
      if (mapEl) {
        mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (pickupMap) window.setTimeout(() => pickupMap.map.invalidateSize(), 400);
      }
    });
  }

  renderSelectedLocation('none');

  function getLocalDateString() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }

  function updatePickupSummary() {
    const selected = categoryInputs.filter((input) => input.checked);
    const list = document.getElementById('selected-category-list');
    const empty = document.getElementById('selected-category-empty');
    document.getElementById('selected-category-count').textContent = selected.length;
    list.innerHTML = selected.map((input) => {
      const name = input.closest('.category-option').querySelector('strong').textContent;
      return `<li><span>${name}</span><strong>₹${input.dataset.rate} / kg</strong></li>`;
    }).join('');
    empty.classList.toggle('hidden', selected.length > 0);
    refreshPickupDatetime();
  }

  function refreshPickupDatetime() {
    const line = document.getElementById('pickup-datetime-line');
    if (!line) return;
    const date = document.getElementById('date').value;
    const time = document.getElementById('time').value;
    if (!date || !time) {
      line.textContent = '';
      return;
    }
    try {
      const d = new Date(`${date}T${time}`);
      const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      line.textContent = `${datePart} · ${timePart}`;
    } catch (_err) {
      line.textContent = `${date} · ${time}`;
    }
  }

  const today = getLocalDateString();
  dateInput.min = today;
  if (!dateInput.value) dateInput.value = today;
  categoryInputs.forEach((input) => input.addEventListener('change', () => { updatePickupSummary(); refreshSubmitState(); }));
  updatePickupSummary();

  document.getElementById('date').addEventListener('change', () => { refreshPickupDatetime(); refreshSubmitState(); });
  document.getElementById('time').addEventListener('change', () => { refreshPickupDatetime(); refreshSubmitState(); });
  document.getElementById('detail-unit').addEventListener('input', refreshSubmitState);

  document.getElementById('pickup-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const alertEl = document.getElementById('alert');
    const categories = [...document.querySelectorAll('input[name="category"]:checked')].map((el) => el.value);
    const date = document.getElementById('date').value;
    const time = document.getElementById('time').value;

    if (!categories.length) {
      showAlert(alertEl, 'Select at least one waste category');
      return;
    }
    if (!date || date < getLocalDateString()) {
      showAlert(alertEl, 'Please choose today or a future date');
      return;
    }
    if (!time) {
      showAlert(alertEl, 'Please choose a preferred time');
      return;
    }
    if (!hasLocation()) {
      showAlert(alertEl, 'Please select your pickup location.');
      return;
    }
    const unit = document.getElementById('detail-unit').value.trim();
    if (!unit) {
      showAlert(alertEl, 'Please enter your flat, house, or room number.');
      return;
    }

    const submitBtn = document.querySelector('#pickup-form button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      await API.createPickup({
        requestedCategories: categories,
        datetime: `${date}T${time}`,
        address: selectedPickupLocation.address || 'Selected pickup location',
        latitude: selectedPickupLocation.latitude,
        longitude: selectedPickupLocation.longitude,
        pickupDetails: {
          unit,
          building: document.getElementById('detail-building').value.trim(),
          floor: document.getElementById('detail-floor').value.trim(),
          landmark: document.getElementById('detail-landmark').value.trim(),
          instructions: document.getElementById('detail-instructions').value.trim()
        }
      });
      showAlert(alertEl, 'Pickup booked successfully', 'success');
      setTimeout(() => {
        window.location.href = '/';
      }, 700);
    } catch (err) {
      showAlert(alertEl, err.message);
    } finally {
      refreshSubmitState();
    }
  });
}

initBooking();
