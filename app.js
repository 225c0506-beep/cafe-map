const map = L.map('map').setView([35.6812, 139.7671], 13)

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="http://openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map)

const SUPABASE_URL = 'https://blsfojnxwwyzjrunqlfg.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_vCzIleUkZIZLkBXIAjmn_g_FQCCG8i0'

let supabaseClient
try {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
} catch (e) {
  console.warn('Supabase initialization failed:', e)
}

let editingId = null
const markerMap = {}
let currentUser = null

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
  const likeCount = cafe.like_count ?? 0
  const lines = [
    `<b>${escapeHtml(cafe.name)}</b>`,
    `📍 ${escapeHtml(cafe.address)}`
  ]
  if (cafe.photo_url) {
    lines.push(`<img class="popup-photo" src="${escapeHtml(cafe.photo_url)}" alt="${escapeHtml(cafe.name)}" />`)
  }
  if (cafe.comment) lines.push(`💬 ${escapeHtml(cafe.comment)}`)
  if (cafe.hours) lines.push(`🕐 ${escapeHtml(cafe.hours)}`)
  lines.push(`📶 Wifi: ${label(cafe.wifi)}`)
  lines.push(`🔌 電源: ${label(cafe.power)}`)
  lines.push(`🚗 駐車場: ${label(cafe.parking)}`)
  if (currentUser) {
    if (cafe.user_id === currentUser.id) {
      lines.push(
        `<div class="popup-actions">`,
        `  <button class="popup-btn edit-btn" data-id="${cafe.id}">編集</button>`,
        `  <button class="popup-btn delete-btn" data-id="${cafe.id}">削除</button>`,
        `</div>`
      )
    }
    lines.push(
      `<div class="popup-like">`,
      `  <span class="like-count" data-id="${cafe.id}">${likeCount}</span>`,
      `  <button class="like-btn" data-id="${cafe.id}">👍 いいね</button>`,
      `</div>`
    )
    lines.push(`<div class="comment-list" data-id="${cafe.id}"><div class="comment-empty">読込中...</div></div>`)
    lines.push(
      `<form class="comment-form" data-id="${cafe.id}">`,
      `  <input type="text" class="comment-nickname" placeholder="ニックネーム" required />`,
      `  <input type="text" class="comment-text" placeholder="コメントを入力" required />`,
      `  <button type="submit" class="comment-submit">送信</button>`,
      `</form>`
    )
  }
  return lines.join('<br>')
}

function addMarker(cafe) {
  const marker = L.marker([cafe.lat, cafe.lng])
    .addTo(map)
    .bindPopup(buildPopupContent(cafe))
  marker._cafeId = cafe.id
  markerMap[cafe.id] = marker
  marker.on('popupopen', function () {
    if (currentUser) loadCommentsIntoPopup(cafe.id)
  })
  return marker
}

function clearMarkers() {
  map.eachLayer(layer => {
    if (layer instanceof L.Marker) {
      map.removeLayer(layer)
    }
  })
  Object.keys(markerMap).forEach(k => delete markerMap[k])
}

async function renderAllCafes() {
  clearMarkers()
  if (!supabaseClient) return
  const { data: cafes, error } = await supabaseClient.from('cafes').select('*')
  if (error) {
    console.error('Failed to load cafes:', error)
    return
  }
  cafes.forEach(cafe => addMarker(cafe))
}

async function loadCommentsIntoPopup(cafeId) {
  const marker = markerMap[cafeId]
  if (!marker || !supabaseClient) return
  const popup = marker.getPopup()
  if (!popup) return
  const el = popup.getElement()
  if (!el) return
  const listEl = el.querySelector('.comment-list')
  if (!listEl) return

  const { data: comments, error } = await supabaseClient
    .from('comments')
    .select('*')
    .eq('cafe_id', cafeId)
    .order('created_at', { ascending: true })

  if (error) {
    listEl.innerHTML = '<div class="comment-empty">エラーが発生しました</div>'
    return
  }

  if (!comments || comments.length === 0) {
    listEl.innerHTML = '<div class="comment-empty">コメントはまだありません</div>'
    return
  }

  listEl.innerHTML = comments.map(c =>
    `<div class="comment-item"><b>${escapeHtml(c.nickname)}</b>: ${escapeHtml(c.text)}</div>`
  ).join('')
}

function updateAuthUI(user) {
  const loggedOut = document.getElementById('auth-logged-out')
  const loggedIn = document.getElementById('auth-logged-in')
  const emailDisplay = document.getElementById('auth-email-display')
  const formArea = document.getElementById('form-area')

  if (user) {
    currentUser = user
    loggedOut.style.display = 'none'
    loggedIn.style.display = 'block'
    emailDisplay.textContent = user.email
    formArea.style.display = 'block'
  } else {
    currentUser = null
    loggedOut.style.display = 'block'
    loggedIn.style.display = 'none'
    formArea.style.display = 'none'
    document.getElementById('auth-email').value = ''
    document.getElementById('auth-password').value = ''
  }
  renderAllCafes()
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
    document.getElementById('photo').value = ''
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
  const btn = e.target.closest('.popup-btn, .like-btn')
  if (!btn || !supabaseClient || !currentUser) return

  const id = parseInt(btn.dataset.id, 10)

  if (btn.classList.contains('edit-btn')) {
    const { data: cafe, error } = await supabaseClient
      .from('cafes').select('*').eq('id', id).single()
    if (error || !cafe) return
    setFormMode('edit', cafe)
  } else if (btn.classList.contains('delete-btn')) {
    if (!confirm('このカフェを削除してもよろしいですか？')) return
    const { error } = await supabaseClient.from('cafes').delete().eq('id', id)
    if (error) {
      console.error('Failed to delete cafe:', error)
      return
    }
    renderAllCafes()
  } else if (btn.classList.contains('like-btn')) {
    const { data: cafe, error: fetchErr } = await supabaseClient
      .from('cafes').select('like_count').eq('id', id).single()
    if (fetchErr || !cafe) return
    const newCount = (cafe.like_count || 0) + 1
    const { error: updateErr } = await supabaseClient
      .from('cafes').update({ like_count: newCount }).eq('id', id)
    if (updateErr) return
    const marker = markerMap[id]
    if (!marker) return
    const popup = marker.getPopup()
    if (!popup) return
    const el = popup.getElement()
    if (!el) return
    const countEl = el.querySelector('.like-count')
    if (countEl) countEl.textContent = newCount
  }
})

document.getElementById('map').addEventListener('submit', async function (e) {
  const form = e.target.closest('.comment-form')
  if (!form || !supabaseClient || !currentUser) return
  e.preventDefault()

  const id = parseInt(form.dataset.id, 10)
  const nickname = form.querySelector('.comment-nickname').value.trim()
  const text = form.querySelector('.comment-text').value.trim()
  if (!nickname || !text) return

  const { error } = await supabaseClient.from('comments').insert({
    cafe_id: id, nickname, text
  })
  if (error) {
    console.error('Failed to add comment:', error)
    return
  }
  form.querySelector('.comment-nickname').value = ''
  form.querySelector('.comment-text').value = ''
  loadCommentsIntoPopup(id)
})

document.getElementById('auth-signup-btn').addEventListener('click', async function () {
  const email = document.getElementById('auth-email').value.trim()
  const password = document.getElementById('auth-password').value
  if (!email || !password) return
  const { error } = await supabaseClient.auth.signUp({ email, password })
  if (error) {
    alert(error.message)
  } else {
    alert('確認メールを送信しました。メールをご確認の上、ログインしてください。')
  }
})

document.getElementById('auth-signin-btn').addEventListener('click', async function () {
  const email = document.getElementById('auth-email').value.trim()
  const password = document.getElementById('auth-password').value
  if (!email || !password) return
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password })
  if (error) {
    alert(error.message)
  }
})

document.getElementById('auth-signout-btn').addEventListener('click', async function () {
  await supabaseClient.auth.signOut()
})

document.getElementById('cancel-btn').addEventListener('click', function () {
  setFormMode('create')
})

async function uploadPhoto(file) {
  const ext = file.name.split('.').pop()
  const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabaseClient.storage.from('cafe-photos').upload(path, file)
  if (error) throw error
  const { data: { publicUrl } } = supabaseClient.storage.from('cafe-photos').getPublicUrl(path)
  return publicUrl
}

document.getElementById('cafe-form').addEventListener('submit', async function (e) {
  e.preventDefault()
  if (!supabaseClient || !currentUser) return

  const name = document.getElementById('name').value.trim()
  const address = document.getElementById('address').value.trim()
  const lat = parseFloat(document.getElementById('lat').value)
  const lng = parseFloat(document.getElementById('lng').value)
  const comment = document.getElementById('comment').value.trim()
  const hours = document.getElementById('hours').value.trim()
  const wifi = document.getElementById('wifi').value || null
  const power = document.getElementById('power').value || null
  const parking = document.getElementById('parking').value || null
  const photoFile = document.getElementById('photo').files[0]

  if (!name || !address || isNaN(lat) || isNaN(lng)) return

  let photo_url = null
  if (photoFile) {
    try {
      photo_url = await uploadPhoto(photoFile)
    } catch (err) {
      console.warn('Photo upload failed, continuing without photo:', err)
    }
  }
  const payload = { name, address, lat, lng, comment, hours, wifi, power, parking, user_id: currentUser.id }
  if (photo_url) payload.photo_url = photo_url

  if (editingId) {
    const { error } = await supabaseClient.from('cafes').update(payload).eq('id', editingId)
    if (error) {
      console.error('Failed to update cafe:', error)
      return
    }
    renderAllCafes()
    setFormMode('create')
  } else {
    const { data, error } = await supabaseClient.from('cafes').insert(payload).select()
    if (error) {
      console.error('Failed to add cafe:', error)
      return
    }
    addMarker(data[0])
    this.reset()
  }
})

supabaseClient.auth.onAuthStateChange((event, session) => {
  updateAuthUI(session?.user ?? null)
})

supabaseClient.auth.getSession().then(({ data: { session } }) => {
  updateAuthUI(session?.user ?? null)
})
