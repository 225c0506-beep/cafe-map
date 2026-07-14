const SUPABASE_URL = 'https://blsfojnxwwyzjrunqlfg.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_vCzIleUkZIZLkBXIAjmn_g_FQCCG8i0'

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const map = L.map('map').setView([35.6812, 139.7671], 13)

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="http://openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map)

let editingId = null

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function label(val) {
  if (val === 'yes') return 'あり'
  if (val === 'no') return 'なし'
  return '不明'
}

function buildPopupContent(cafe) {
  const lines = [
    `<b>${escapeHtml(cafe.name)}</b>`,
    `📍 ${escapeHtml(cafe.address)}`
  ]
  if (cafe.comment) {
    lines.push(`💬 ${escapeHtml(cafe.comment)}`)
  }
  if (cafe.hours) {
    lines.push(`🕐 ${escapeHtml(cafe.hours)}`)
  }
  lines.push(`📶 Wifi: ${label(cafe.wifi)}`)
  lines.push(`🔌 電源: ${label(cafe.power)}`)
  lines.push(`🚗 駐車場: ${label(cafe.parking)}`)
  lines.push(
    `<div class="popup-actions">`,
    `  <button class="popup-btn edit-btn" data-id="${cafe.id}">編集</button>`,
    `  <button class="popup-btn delete-btn" data-id="${cafe.id}">削除</button>`,
    `</div>`
  )
  return lines.join('<br>')
}

function addMarker(cafe) {
  const marker = L.marker([cafe.lat, cafe.lng])
    .addTo(map)
    .bindPopup(buildPopupContent(cafe))
  return marker
}

function clearMarkers() {
  map.eachLayer(layer => {
    if (layer instanceof L.Marker) {
      map.removeLayer(layer)
    }
  })
}

async function renderAllCafes() {
  clearMarkers()
  const { data: cafes, error } = await supabase.from('cafes').select('*')
  if (error) {
    console.error('Failed to load cafes:', error)
    return
  }
  cafes.forEach(cafe => addMarker(cafe))
}

function setFormMode(mode, cafe) {
  const btn = document.getElementById('register-btn')
  const title = document.querySelector('#form-area h2')
  const cancelBtn = document.getElementById('cancel-btn')

  if (mode === 'edit' && cafe) {
    editingId = cafe.id
    document.getElementById('name').value = cafe.name
    document.getElementById('address').value = cafe.address
    document.getElementById('lat').value = cafe.lat
    document.getElementById('lng').value = cafe.lng
    document.getElementById('comment').value = cafe.comment || ''
    document.getElementById('hours').value = cafe.hours || ''
    document.getElementById('wifi').value = cafe.wifi || ''
    document.getElementById('power').value = cafe.power || ''
    document.getElementById('parking').value = cafe.parking || ''
    btn.textContent = '更新'
    title.textContent = 'カフェを編集'
    cancelBtn.style.display = 'block'
  } else {
    editingId = null
    document.getElementById('cafe-form').reset()
    btn.textContent = '登録'
    title.textContent = 'カフェを登録'
    cancelBtn.style.display = 'none'
  }
}

map.on('click', function (e) {
  document.getElementById('lat').value = e.latlng.lat.toFixed(6)
  document.getElementById('lng').value = e.latlng.lng.toFixed(6)
})

document.getElementById('map').addEventListener('click', async function (e) {
  const btn = e.target.closest('.popup-btn')
  if (!btn) return

  const id = parseInt(btn.dataset.id, 10)

  if (btn.classList.contains('edit-btn')) {
    const { data: cafe, error } = await supabase
      .from('cafes').select('*').eq('id', id).single()
    if (error || !cafe) return
    setFormMode('edit', cafe)
  } else if (btn.classList.contains('delete-btn')) {
    if (!confirm('このカフェを削除してもよろしいですか？')) return
    const { error } = await supabase.from('cafes').delete().eq('id', id)
    if (error) {
      console.error('Failed to delete cafe:', error)
      return
    }
    renderAllCafes()
  }
})

document.getElementById('cafe-form').addEventListener('submit', async function (e) {
  e.preventDefault()

  const name = document.getElementById('name').value.trim()
  const address = document.getElementById('address').value.trim()
  const lat = parseFloat(document.getElementById('lat').value)
  const lng = parseFloat(document.getElementById('lng').value)
  const comment = document.getElementById('comment').value.trim()
  const hours = document.getElementById('hours').value.trim()
  const wifi = document.getElementById('wifi').value || null
  const power = document.getElementById('power').value || null
  const parking = document.getElementById('parking').value || null

  if (!name || !address || isNaN(lat) || isNaN(lng)) return

  if (editingId) {
    const { error } = await supabase.from('cafes').update({
      name, address, lat, lng, comment, hours, wifi, power, parking
    }).eq('id', editingId)
    if (error) {
      console.error('Failed to update cafe:', error)
      return
    }
    renderAllCafes()
    setFormMode('create')
  } else {
    const { data, error } = await supabase.from('cafes').insert({
      name, address, lat, lng, comment, hours, wifi, power, parking
    }).select()
    if (error) {
      console.error('Failed to add cafe:', error)
      return
    }
    addMarker(data[0])
    this.reset()
  }
})

document.getElementById('cancel-btn').addEventListener('click', function () {
  setFormMode('create')
})

renderAllCafes()
