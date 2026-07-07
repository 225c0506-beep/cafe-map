const STORAGE_KEY = 'cafe-map:cafes';

const map = L.map('map').setView([35.6812, 139.7671], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="http://openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

let editingId = null;

function loadCafes() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveCafes(cafes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cafes));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function buildPopupContent(cafe) {
  const lines = [
    `<b>${escapeHtml(cafe.name)}</b>`,
    `📍 ${escapeHtml(cafe.address)}`
  ];
  if (cafe.comment) {
    lines.push(`💬 ${escapeHtml(cafe.comment)}`);
  }
  lines.push(
    `<div class="popup-actions">`,
    `  <button class="popup-btn edit-btn" data-id="${cafe.id}">編集</button>`,
    `  <button class="popup-btn delete-btn" data-id="${cafe.id}">削除</button>`,
    `</div>`
  );
  return lines.join('<br>');
}

function addMarker(cafe) {
  const marker = L.marker([cafe.lat, cafe.lng])
    .addTo(map)
    .bindPopup(buildPopupContent(cafe));
  return marker;
}

function renderAllCafes() {
  map.eachLayer(layer => {
    if (layer instanceof L.Marker) {
      map.removeLayer(layer);
    }
  });

  const cafes = loadCafes();
  cafes.forEach(cafe => addMarker(cafe));
}

function getNextId() {
  const cafes = loadCafes();
  return cafes.length ? Math.max(...cafes.map(c => c.id)) + 1 : 1;
}

function setFormMode(mode, cafe) {
  const btn = document.getElementById('register-btn');
  const title = document.querySelector('#form-area h2');
  const cancelBtn = document.getElementById('cancel-btn');

  if (mode === 'edit' && cafe) {
    editingId = cafe.id;
    document.getElementById('name').value = cafe.name;
    document.getElementById('address').value = cafe.address;
    document.getElementById('lat').value = cafe.lat;
    document.getElementById('lng').value = cafe.lng;
    document.getElementById('comment').value = cafe.comment || '';
    btn.textContent = '更新';
    title.textContent = 'カフェを編集';
    cancelBtn.style.display = 'block';
  } else {
    editingId = null;
    document.getElementById('cafe-form').reset();
    btn.textContent = '登録';
    title.textContent = 'カフェを登録';
    cancelBtn.style.display = 'none';
  }
}

function deleteCafe(id) {
  if (!confirm('このカフェを削除してもよろしいですか？')) return;
  let cafes = loadCafes();
  cafes = cafes.filter(c => c.id !== id);
  saveCafes(cafes);
  renderAllCafes();
}

map.on('click', function (e) {
  document.getElementById('lat').value = e.latlng.lat.toFixed(6);
  document.getElementById('lng').value = e.latlng.lng.toFixed(6);
});

document.getElementById('map').addEventListener('click', function (e) {
  const btn = e.target.closest('.popup-btn');
  if (!btn) return;

  const id = parseInt(btn.dataset.id, 10);
  const cafes = loadCafes();
  const cafe = cafes.find(c => c.id === id);
  if (!cafe) return;

  if (btn.classList.contains('edit-btn')) {
    setFormMode('edit', cafe);
  } else if (btn.classList.contains('delete-btn')) {
    deleteCafe(id);
  }
});

document.getElementById('cafe-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const name = document.getElementById('name').value.trim();
  const address = document.getElementById('address').value.trim();
  const lat = parseFloat(document.getElementById('lat').value);
  const lng = parseFloat(document.getElementById('lng').value);
  const comment = document.getElementById('comment').value.trim();

  if (!name || !address || isNaN(lat) || isNaN(lng)) return;

  let cafes = loadCafes();

  if (editingId) {
    const idx = cafes.findIndex(c => c.id === editingId);
    if (idx !== -1) {
      cafes[idx] = { ...cafes[idx], name, address, lat, lng, comment };
    }
    saveCafes(cafes);
    renderAllCafes();
    setFormMode('create');
  } else {
    const cafe = { id: getNextId(), name, address, lat, lng, comment };
    cafes.push(cafe);
    saveCafes(cafes);
    addMarker(cafe);
    this.reset();
  }
});

document.getElementById('cancel-btn').addEventListener('click', function () {
  setFormMode('create');
});

renderAllCafes();
