var currentTileLayer

function setTileLayer(dark) {
  if (currentTileLayer) map.removeLayer(currentTileLayer)
  var url = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
  var attr = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
  currentTileLayer = L.tileLayer(url, { maxZoom: 19, attribution: attr }).addTo(map)
}

const map = L.map('map', { zoomControl: false }).setView([35.6895, 139.7000], 14)

document.getElementById('home-btn').addEventListener('click', function () {
  map.setView([35.6895, 139.7000], 14)
})

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
let allCafes = []
let tempMarker = null

const TAG_LIST = ['作業向き', 'おしゃべりOK', '隠れ家', '静か', 'コスパ◎', '長居OK', '写真映え', '電源あり', 'Wi-Fi快適', '一人でも入りやすい']

const MOOD_TAGS = {
  '作業したい': ['作業向き', '電源あり', 'Wi-Fi快適', '静か', '長居OK'],
  'おしゃべりしたい': ['おしゃべりOK', '長居OK'],
  '一人で静かに': ['静か', '一人でも入りやすい', '隠れ家'],
  '写真映え重視': ['写真映え', '隠れ家']
}

function selectedTags(container) {
  const tags = []
  ;(container || document).querySelectorAll('.tag-check:checked').forEach(cb => tags.push(cb.value))
  return tags
}

async function loadTagsForCafe(cafeId) {
  if (!supabaseClient) return []
  const { data, error } = await supabaseClient.from('cafe_tags').select('tag, user_id').eq('cafe_id', cafeId)
  if (error) { console.error('loadTagsForCafe:', error); return [] }
  return data || []
}

async function loadAllTags() {
  if (!supabaseClient) return {}
  const { data, error } = await supabaseClient.from('cafe_tags').select('cafe_id, tag, user_id')
  if (error) { console.error('loadAllTags:', error); return {} }
  if (!data) return {}
  const map = {}
  data.forEach(r => {
    if (!map[r.cafe_id]) map[r.cafe_id] = {}
    if (!map[r.cafe_id][r.tag]) map[r.cafe_id][r.tag] = { count: 0, users: [] }
    map[r.cafe_id][r.tag].count++
    map[r.cafe_id][r.tag].users.push(r.user_id)
  })
  return map
}

async function saveTags(cafeId, tags) {
  if (!supabaseClient || !currentUser) return
  const { error: delErr } = await supabaseClient.from('cafe_tags').delete().eq('cafe_id', cafeId).eq('user_id', currentUser.id)
  if (delErr) { console.error('saveTags delete:', delErr); return }
  if (tags.length === 0) return
  const rows = tags.map(tag => ({ cafe_id: cafeId, user_id: currentUser.id, tag }))
  const { error: insErr } = await supabaseClient.from('cafe_tags').insert(rows)
  if (insErr) console.error('saveTags insert:', insErr)
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function tag(val, text) {
  const cls = val === 'yes' ? 'yes' : val === 'no' ? 'no' : 'unknown'
  return `<span class="info-tag ${cls}">${text}</span>`
}

var hamburgerOpen = false

function showView(view) {
  document.getElementById('view-list').style.display = view === 'list' ? 'block' : 'none'
  document.getElementById('view-form').style.display = view === 'form' ? 'block' : 'none'
  document.getElementById('view-detail').style.display = view === 'detail' ? 'block' : 'none'
  document.getElementById('view-auth').style.display = view === 'auth' ? 'block' : 'none'

  if (window.innerWidth <= 768) {
    if (view === 'list' && !hamburgerOpen) {
      document.getElementById('view-list').style.display = 'none'
    } else if (view !== 'list') {
      hamburgerOpen = false
    }
  }
}

/* ===== カフェカード生成 ===== */
function buildCafeCard(cafe) {
  const photoHtml = cafe.photo_url
    ? `<img class="card-photo" src="${escapeHtml(cafe.photo_url)}" alt="${escapeHtml(cafe.name)}" />`
    : `<div class="card-photo" style="display:flex;align-items:center;justify-content:center;color:var(--color-sub);font-size:28px;">☕</div>`

  const tags = cafe._tags || {}
  const tagEntries = Object.entries(tags)
  const tagHtml = tagEntries.slice(0, 3).map(([t, v]) =>
    `<span class="cafe-tag">${escapeHtml(t)}</span>`
  ).join('')
  const moreTag = tagEntries.length > 3 ? `<span class="cafe-tag cafe-tag-more">+${tagEntries.length - 3}</span>` : ''

  return `
    <div class="cafe-card" data-id="${cafe.id}">
      ${photoHtml}
      <div class="card-name">${escapeHtml(cafe.name)}</div>
      <div class="card-address">${escapeHtml(cafe.address)}</div>
      <div class="card-info">
        ${cafe.hours ? `<span class="card-info-item">🕐 ${escapeHtml(cafe.hours)}</span>` : ''}
      </div>
      <div class="card-tags">
        ${tag(cafe.wifi, 'Wifi')}
        ${tag(cafe.power, '電源')}
        ${tag(cafe.parking, '駐車場')}
      </div>
      ${tagEntries.length > 0 ? `<div class="card-ctags">${tagHtml}${moreTag}</div>` : ''}
      <button class="card-detail-btn" data-id="${cafe.id}">詳細を見る</button>
    </div>
  `
}

function renderCafeList(cafes) {
  const container = document.getElementById('cafe-list')
  if (!cafes || cafes.length === 0) {
    container.innerHTML = '<div class="empty-state">カフェが見つかりませんでした</div>'
    return
  }
  container.innerHTML = cafes.map(buildCafeCard).join('')
}

/* ===== 詳細ビュー生成 ===== */
function buildDetailContent(cafe) {
  const likeCount = cafe.like_count ?? 0
  const photoHtml = cafe.photo_url
    ? `<img class="detail-photo" src="${escapeHtml(cafe.photo_url)}" alt="${escapeHtml(cafe.name)}" />`
    : `<div class="detail-photo" style="display:flex;align-items:center;justify-content:center;color:var(--color-sub);font-size:36px;">☕</div>`

  const tags = cafe._tags || {}
  const tagEntries = Object.entries(tags)
  const tagHtml = tagEntries.map(([t, v]) =>
    `<span class="cafe-tag cafe-tag-detail">${escapeHtml(t)} <span class="tag-count">${v.count}</span></span>`
  ).join('')

  let tagsSection = tagEntries.length > 0
    ? `<div class="detail-tags">${tagHtml}</div>`
    : '<div class="detail-tags" style="color:var(--color-sub);font-size:12px;">タグはまだありません</div>'

  let tagAddSection = ''
  if (currentUser) {
    tagAddSection = `
      <div class="detail-tag-add">
        <div class="tag-picker" id="detail-tag-picker"></div>
        <button class="tag-add-btn" id="detail-tag-submit" data-id="${cafe.id}">選択したタグを追加</button>
      </div>
    `
  }

  let ownerActions = ''
  if (currentUser && cafe.user_id === currentUser.id) {
    ownerActions = `
      <div class="detail-actions">
        <button class="popup-btn edit-btn detail-edit-btn" data-id="${cafe.id}">編集</button>
        <button class="popup-btn delete-btn detail-delete-btn" data-id="${cafe.id}">削除</button>
      </div>
    `
  }

  let authSection = ''
  if (currentUser) {
    authSection = `
      <div class="detail-like">
        <span class="like-count" data-id="${cafe.id}">${likeCount}</span>
        <button class="like-btn detail-like-btn" data-id="${cafe.id}">👍 いいね</button>
      </div>
      <div class="detail-comments">
        <h3>コメント</h3>
        <div class="comment-list" data-id="${cafe.id}"><div class="comment-empty">読込中...</div></div>
        <form class="comment-form" data-id="${cafe.id}">
          <input type="text" class="comment-nickname" placeholder="ニックネーム" required />
          <input type="text" class="comment-text" placeholder="コメントを入力" required />
          <button type="submit" class="comment-submit">送信</button>
        </form>
      </div>
    `
  }

  return `
    ${photoHtml}
    <div class="detail-name">${escapeHtml(cafe.name)}</div>
    <div class="detail-address">📍 ${escapeHtml(cafe.address)}</div>
    ${cafe.hours ? `<div class="detail-info-row">🕐 ${escapeHtml(cafe.hours)}</div>` : ''}
    <div class="detail-info-row">
      ${tag(cafe.wifi, 'Wifi')} ${tag(cafe.power, '電源')} ${tag(cafe.parking, '駐車場')}
    </div>
    <div class="detail-info-row" style="font-size:12px;color:var(--color-sub);">登録者: ${escapeHtml(cafe.nickname || '不明')}</div>
    ${cafe.comment ? `<div class="detail-comment">${escapeHtml(cafe.comment)}</div>` : ''}
    ${tagsSection}
    ${tagAddSection}
    ${ownerActions}
    ${authSection}
  `
}

function showDetail(cafe) {
  const container = document.getElementById('detail-content')
  container.innerHTML = buildDetailContent(cafe)
  showView('detail')

  const picker = document.getElementById('detail-tag-picker')
  if (picker) {
    picker.innerHTML = TAG_LIST.map(t => `<label class="tag-option"><input type="checkbox" class="tag-check" value="${t}" /> ${t}</label>`).join('')
  }
  loadDetailComments(cafe.id)
}

/* ===== マーカー・ポップアップ ===== */
function buildPopupContent(cafe) {
  const likeCount = cafe.like_count ?? 0
  const tags = cafe._tags || {}
  const tagEntries = Object.entries(tags)
  const tagHtml = tagEntries.length > 0
    ? `<div style="margin:4px 0;display:flex;flex-wrap:wrap;gap:3px;">${tagEntries.slice(0, 4).map(([t]) => `<span class="cafe-tag" style="font-size:10px;">${escapeHtml(t)}</span>`).join('')}${tagEntries.length > 4 ? `<span class="cafe-tag cafe-tag-more" style="font-size:10px;">+${tagEntries.length - 4}</span>` : ''}</div>`
    : ''
  const lines = [
    `<h3>${escapeHtml(cafe.name)}</h3>`,
    `📍 ${escapeHtml(cafe.address)}`
  ]
  if (cafe.photo_url) {
    lines.push(`<img class="popup-photo" src="${escapeHtml(cafe.photo_url)}" alt="${escapeHtml(cafe.name)}" />`)
  }
  if (cafe.comment) lines.push(`<div class="popup-info-row">${escapeHtml(cafe.comment)}</div>`)
  if (cafe.hours) lines.push(`<div class="popup-info-row">🕐 ${escapeHtml(cafe.hours)}</div>`)
  lines.push(`<div class="popup-info-row">${tag(cafe.wifi, 'Wifi')} ${tag(cafe.power, '電源')} ${tag(cafe.parking, '駐車場')}</div>`)
  if (tagHtml) lines.push(tagHtml)
  if (currentUser && cafe.user_id === currentUser.id) {
    lines.push(
      `<div class="popup-actions">`,
      `  <button class="popup-btn edit-btn" data-id="${cafe.id}">編集</button>`,
      `  <button class="popup-btn delete-btn" data-id="${cafe.id}">削除</button>`,
      `</div>`
    )
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

function createCafeIcon() {
  return L.divIcon({
    className: 'custom-marker',
    html: `<svg width="28" height="42" viewBox="0 0 28 42" fill="none">
      <path d="M14 0C6.3 0 0 6.3 0 14C0 24.5 14 42 14 42S28 24.5 28 14C28 6.3 21.7 0 14 0Z" fill="#8A9A85"/>
      <circle cx="14" cy="13" r="7" fill="white"/>
    </svg>`,
    iconSize: [28, 42],
    iconAnchor: [14, 42],
    popupAnchor: [0, -42]
  })
}

function addMarker(cafe) {
  const marker = L.marker([cafe.lat, cafe.lng], { icon: createCafeIcon() })
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

/* ===== データ読み込み ===== */
async function renderAllCafes() {
  clearMarkers()
  if (!supabaseClient) return
  const { data: cafes, error } = await supabaseClient.from('cafes').select('*')
  if (error) {
    console.error('Failed to load cafes:', error)
    return
  }
  allCafes = cafes || []
  const tagsMap = await loadAllTags()
  allCafes.forEach(cafe => {
    cafe._tags = tagsMap[cafe.id] || {}
    addMarker(cafe)
  })
  applySearchFilter()
}

function applySearchFilter() {
  const searchInput = document.getElementById('search-input')
  if (!searchInput) return
  const query = searchInput.value.trim().toLowerCase()
  const activeTags = Array.from(document.querySelectorAll('.tag-filter-btn.active')).map(b => b.dataset.tag)

  let filtered = allCafes.filter(c => {
    if (query && !c.name.toLowerCase().includes(query) && !c.address.toLowerCase().includes(query) && !(c.comment && c.comment.toLowerCase().includes(query))) return false
    if (activeTags.length > 0) {
      const tags = c._tags || {}
      if (tagFilterMode === 'and') {
        if (!activeTags.every(t => tags[t])) return false
      } else {
        if (!activeTags.some(t => tags[t])) return false
      }
    }
    return true
  })

  if (activeTags.length > 0) {
    filtered.sort((a, b) => {
      const aCount = activeTags.filter(t => (a._tags || {})[t]).length
      const bCount = activeTags.filter(t => (b._tags || {})[t]).length
      return bCount - aCount
    })
  }

  renderCafeList(filtered)
}

var tagFilterMode = 'or'

function initTagFilter() {
  const container = document.getElementById('tag-filter')
  if (!container) return
  const moods = Object.entries(MOOD_TAGS)
  const moodHtml = moods.map(([label, tags]) =>
    `<button class="mood-shortcut" data-tags="${tags.join(',')}">${label} ▾</button>`
  ).join('') +
    `<button class="mood-shortcut" id="mood-recommend" data-tags="__recommend__">あなたへのおすすめ ▾</button>`

  container.innerHTML =
    '<div class="mood-section">' +
    '<div class="mood-section-label">気分</div>' +
    '<div class="mood-shortcuts">' + moodHtml + '</div>' +
    '</div>' +
    '<div class="tag-buttons">' +
    '<div class="tag-filter-mode-row">' +
    '<button id="tag-filter-mode-toggle" class="tag-filter-mode-btn">絞り込み: いずれかに一致 (OR)</button>' +
    '</div>' +
    TAG_LIST.map(t => `<button class="tag-filter-btn" data-tag="${t}">${t}</button>`).join('') +
    '<button class="tag-filter-btn tag-filter-reset" id="tag-filter-reset">✕ リセット</button>' +
    '</div>'

  document.getElementById('tag-filter-mode-toggle').addEventListener('click', function () {
    tagFilterMode = tagFilterMode === 'or' ? 'and' : 'or'
    const label = tagFilterMode === 'or' ? 'いずれかに一致 (OR)' : 'すべてに一致 (AND)'
    this.textContent = '絞り込み: ' + label
    this.classList.toggle('and', tagFilterMode === 'and')
    applySearchFilter()
  })

  container.addEventListener('click', async function (e) {
    const shortcut = e.target.closest('.mood-shortcut')
    if (shortcut) {
      container.querySelectorAll('.mood-shortcut').forEach(s => s.classList.remove('active'))
      shortcut.classList.add('active')
      const btns = container.querySelectorAll('.tag-filter-btn')

      if (shortcut.id === 'mood-recommend') {
        const tagWeights = await getRecommendedTags()
        const topTags = Object.entries(tagWeights).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0])
        btns.forEach(b => b.classList.toggle('active', topTags.includes(b.dataset.tag)))
      } else {
        const tags = shortcut.dataset.tags.split(',')
        btns.forEach(b => b.classList.toggle('active', tags.includes(b.dataset.tag)))
      }
      applySearchFilter()
      return
    }

    const btn = e.target.closest('.tag-filter-btn')
    if (!btn) return
    if (btn.id === 'tag-filter-reset') {
      container.querySelectorAll('.tag-filter-btn.active').forEach(b => b.classList.remove('active'))
      container.querySelectorAll('.mood-shortcut.active').forEach(s => s.classList.remove('active'))
    } else {
      btn.classList.toggle('active')
      container.querySelectorAll('.mood-shortcut.active').forEach(s => s.classList.remove('active'))
    }
    applySearchFilter()
  })
}

async function getRecommendedTags() {
  if (!supabaseClient || !currentUser) return {}
  const { data: likes, error: lErr } = await supabaseClient.from('likes').select('cafe_id').eq('user_id', currentUser.id)
  if (lErr) { console.error('getRecommendedTags likes:', lErr); return {} }
  if (!likes || likes.length === 0) return {}
  const cafeIds = likes.map(l => l.cafe_id)
  const { data: tags, error: tErr } = await supabaseClient.from('cafe_tags').select('tag').in('cafe_id', cafeIds)
  if (tErr) { console.error('getRecommendedTags tags:', tErr); return {} }
  if (!tags) return {}
  const weights = {}
  tags.forEach(r => { weights[r.tag] = (weights[r.tag] || 0) + 1 })
  return weights
}

/* ===== コメント ===== */
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
    `<div class="comment-item"><strong>${escapeHtml(c.nickname)}</strong>: ${escapeHtml(c.text)}</div>`
  ).join('')
}

async function loadDetailComments(cafeId) {
  if (!supabaseClient) return
  const container = document.getElementById('detail-content')
  const listEl = container.querySelector('.comment-list')
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
    `<div class="comment-item"><strong>${escapeHtml(c.nickname)}</strong>: ${escapeHtml(c.text)}</div>`
  ).join('')
}

/* ===== 認証 ===== */
function updateAuthUI(user) {
  const loggedOut = document.getElementById('auth-logged-out')
  const loggedIn = document.getElementById('auth-logged-in')
  const emailDisplay = document.getElementById('auth-email-display')

  if (user) {
    currentUser = user
    loggedOut.style.display = 'none'
    loggedIn.style.display = 'flex'
    const nick = user.user_metadata?.nickname || user.email
    emailDisplay.textContent = nick
    showView('list')
  } else {
    currentUser = null
    loggedOut.style.display = 'flex'
    loggedIn.style.display = 'none'
    showView('list')
  }
  renderAllCafes()
}

/* ===== フォームモード ===== */
function setFormMode(mode, cafe) {
  const btn = document.getElementById('register-btn')
  const title = document.getElementById('form-title')
  const cancelBtn = document.getElementById('cancel-btn')

  const container = document.getElementById('form-tags')
  container.innerHTML = TAG_LIST.map(t => `<label class="tag-option"><input type="checkbox" class="tag-check" value="${t}" /> ${t}</label>`).join('')

  if (mode === 'edit' && cafe) {
    editingId = cafe.id
    document.getElementById('name').value = cafe.name
    document.getElementById('address').value = cafe.address
    document.getElementById('lat').value = cafe.lat
    document.getElementById('lng').value = cafe.lng
    document.getElementById('comment').value = cafe.comment || ''
    if (cafe.hours) {
      const parts = cafe.hours.split('〜')
      document.getElementById('hours-start').value = parts[0] || ''
      document.getElementById('hours-end').value = parts[1] || ''
    } else {
      document.getElementById('hours-start').value = ''
      document.getElementById('hours-end').value = ''
    }
    document.getElementById('wifi').value = cafe.wifi || ''
    document.getElementById('power').value = cafe.power || ''
    document.getElementById('parking').value = cafe.parking || ''
    document.getElementById('photo').value = ''
    setTempMarker(cafe.lat, cafe.lng)
    map.setView([cafe.lat, cafe.lng], 15)
    btn.textContent = '更新'
    title.textContent = 'カフェを編集'
    cancelBtn.style.display = 'block'

    const editId = cafe.id
    loadTagsForCafe(cafe.id).then(tags => {
      if (editingId !== editId) return
      const userTags = tags.filter(t => t.user_id === currentUser?.id).map(t => t.tag)
      const checkboxes = container.querySelectorAll('.tag-check')
      checkboxes.forEach(cb => {
        if (userTags.includes(cb.value)) cb.checked = true
      })
    }).catch(() => {})
  } else {
    clearTempMarker()
    editingId = null
    document.getElementById('cafe-form').reset()
    document.getElementById('lat').value = ''
    document.getElementById('lng').value = ''
    btn.textContent = '登録'
    title.textContent = 'カフェを登録'
    cancelBtn.style.display = 'none'
  }
  showView('form')
}

/* ===== フォーム送信 ===== */
async function uploadPhoto(file) {
  const ext = file.name.split('.').pop()
  const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabaseClient.storage.from('cafe-photos').upload(path, file)
  if (error) throw error
  const { data: { publicUrl } } = supabaseClient.storage.from('cafe-photos').getPublicUrl(path)
  return publicUrl
}

/* ========================================
   イベントリスナー
   ======================================== */

/* --- 仮ピン管理 --- */
function clearTempMarker() {
  if (tempMarker) {
    map.removeLayer(tempMarker)
    tempMarker = null
  }
}

function setTempMarker(lat, lng) {
  clearTempMarker()
  tempMarker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: 'custom-marker',
      html: `<svg width="24" height="36" viewBox="0 0 24 36" fill="none">
        <path d="M12 0C5.4 0 0 5.4 0 12C0 21 12 36 12 36S24 21 24 12C24 5.4 18.6 0 12 0Z" fill="#D3D7CF" stroke="#8A9A85" stroke-width="1.5"/>
        <circle cx="12" cy="11" r="5" fill="white"/>
      </svg>`,
      iconSize: [24, 36],
      iconAnchor: [12, 36],
      popupAnchor: [0, -36]
    })
  }).addTo(map)
}

/* --- 地図クリック→登録フォームが開いてるときだけ逆ジオコーディング --- */
map.on('click', function (e) {
  if (document.getElementById('view-form').style.display !== 'block') return

  const lat = e.latlng.lat.toFixed(6)
  const lng = e.latlng.lng.toFixed(6)
  document.getElementById('lat').value = lat
  document.getElementById('lng').value = lng
  setTempMarker(e.latlng.lat, e.latlng.lng)

  fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
    headers: { 'User-Agent': 'CafeMap/1.0' }
  })
    .then(r => r.json())
    .then(data => {
      if (data && data.display_name) {
        var addr = data.display_name
          .split(', ')
          .filter(function (p) { return p !== '日本' && !/^\d{3}-?\d{4}$/.test(p) && !/^〒/.test(p) })
          .reverse()
          .join('')
        if (addr) document.getElementById('address').value = addr
      }
    })
    .catch(function (err) { console.warn('Reverse geocoding:', err) })
})

/* --- ポップアップ内のボタン・フォーム操作 --- */
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
    await handleLike(id)
  }
})

/* --- ポップアップ内のコメント送信 --- */
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

/* --- 住所から位置を検索（ジオコーディング） --- */
document.getElementById('geocode-btn').addEventListener('click', async function () {
  const address = document.getElementById('address').value.trim()
  if (!address) return
  const geocodeBtn = this
  geocodeBtn.textContent = '⏳'
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=3`
    const res = await fetch(url, { headers: { 'User-Agent': 'CafeMap/1.0' } })
    const data = await res.json()
    if (data && data.length > 0) {
      const place = data[0]
      const lat = parseFloat(place.lat)
      const lng = parseFloat(place.lon)
      document.getElementById('lat').value = lat.toFixed(6)
      document.getElementById('lng').value = lng.toFixed(6)
      setTempMarker(lat, lng)
      map.setView([lat, lng], 16)
    } else {
      alert('住所が見つかりませんでした。\n「東京都渋谷区神宮前」のように市区町村から入力してください')
    }
  } catch (err) {
    console.error('Geocoding failed:', err)
    alert('位置情報の取得に失敗しました。しばらく経ってからもう一度試してください')
  }
  geocodeBtn.textContent = '🔍'
})

/* --- 現在地ボタン（Leafletコントロール） --- */
var locateControl = L.control({ position: 'bottomright' })

locateControl.onAdd = function () {
  var btn = L.DomUtil.create('button', 'leaflet-control-locate-btn')
  btn.innerHTML = '📍'
  btn.title = '現在地を表示'
  btn.onclick = function () {
    if (!navigator.geolocation) {
      alert('お使いのブラウザは位置情報に対応していません')
      return
    }
    var cached = sessionStorage.getItem('cachedLat')
    if (cached) {
      var lat = parseFloat(cached)
      var lng = parseFloat(sessionStorage.getItem('cachedLng'))
      map.setView([lat, lng], 15)
      setTempMarker(lat, lng)
      document.getElementById('lat').value = lat.toFixed(6)
      document.getElementById('lng').value = lng.toFixed(6)
      return
    }
    btn.innerHTML = '⏳'
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var lat = pos.coords.latitude
        var lng = pos.coords.longitude
        sessionStorage.setItem('cachedLat', lat)
        sessionStorage.setItem('cachedLng', lng)
        map.setView([lat, lng], 15)
        setTempMarker(lat, lng)
        document.getElementById('lat').value = lat.toFixed(6)
        document.getElementById('lng').value = lng.toFixed(6)
        btn.innerHTML = '📍'
      },
      function (err) {
        var msg = '位置情報の取得に失敗しました'
        if (err.code === 1) msg = '位置情報の取得が許可されていません'
        else if (err.code === 2) msg = '位置情報を取得できませんでした'
        else if (err.code === 3) msg = '位置情報の取得がタイムアウトしました'
        alert(msg)
        btn.innerHTML = '📍'
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }
  return btn
}

locateControl.addTo(map)
L.control.zoom({ position: 'bottomright' }).addTo(map)

/* --- 認証 --- */
function showAuthInfo(msg) {
  document.getElementById('auth-info').textContent = msg
}

function clearAuthInfo() {
  document.getElementById('auth-info').textContent = ''
}

function getAuthFields() {
  const email = document.getElementById('auth-email').value.trim()
  const password = document.getElementById('auth-password').value
  return { email, password }
}

function validateAuthFields(email, password) {
  if (email && !password) {
    showAuthInfo('パスワードを入力してください')
    return false
  }
  if (!email && password) {
    showAuthInfo('メールアドレスを入力してください')
    return false
  }
  if (!email && !password) {
    showAuthInfo('メールアドレスとパスワードを入力してください')
    return false
  }
  if (password && password.length < 6) {
    showAuthInfo('パスワードは6文字以上で入力してください')
    return false
  }
  return true
}

function translateAuthError(msg) {
  if (msg === 'Password should be at least 6 characters') return 'パスワードは6文字以上で入力してください'
  if (msg.includes('Invalid login credentials')) return 'メールアドレスまたはパスワードが違います'
  if (msg.includes('Email not confirmed')) return 'メールアドレスが確認されていません'
  if (msg.includes('User already registered')) return 'このメールアドレスは既に登録されています'
  return msg
}

let authMode = 'login'

function focusAuthFirstField() {
  setTimeout(() => document.getElementById('auth-email').focus(), 100)
}

function setAuthMode(mode) {
  authMode = mode
  const title = document.getElementById('auth-title')
  const btn = document.getElementById('auth-submit-btn')
  const switchEl = document.getElementById('auth-switch')
  const nicknameField = document.getElementById('auth-nickname-field')
  if (mode === 'signup') {
    nicknameField.style.display = 'block'
  } else {
    nicknameField.style.display = 'none'
    document.getElementById('auth-nickname').value = ''
  }
  if (mode === 'login') {
    title.textContent = 'ログイン'
    btn.textContent = 'ログイン'
    switchEl.innerHTML = '初めての方は <a href="#" id="auth-to-signup">新規登録</a>'
  } else {
    title.textContent = '新規登録'
    btn.textContent = '新規登録'
    switchEl.innerHTML = 'すでにアカウントをお持ちの方は <a href="#" id="auth-to-login">ログイン</a>'
  }
}

/* ヘッダーのログインボタン */
document.getElementById('header-login-btn').addEventListener('click', function () {
  if (document.getElementById('view-auth').style.display === 'block') {
    showView('list')
    return
  }
  clearAuthInfo()
  document.getElementById('auth-email').value = ''
  document.getElementById('auth-password').value = ''
  setAuthMode('login')
  showView('auth')
  focusAuthFirstField()
})

/* ヘッダーの新規登録ボタン */
document.getElementById('header-signup-btn').addEventListener('click', function () {
  if (document.getElementById('view-auth').style.display === 'block') {
    showView('list')
    return
  }
  clearAuthInfo()
  document.getElementById('auth-email').value = ''
  document.getElementById('auth-password').value = ''
  setAuthMode('signup')
  showView('auth')
  focusAuthFirstField()
})

/* 認証ビューのキャンセルボタン */
document.getElementById('auth-cancel-btn').addEventListener('click', function () {
  showView('list')
})

/* 切り替えリンク（イベント委任） */
document.getElementById('view-auth').addEventListener('click', function (e) {
  if (e.target.id === 'auth-to-signup') {
    e.preventDefault()
    clearAuthInfo()
    setAuthMode('signup')
  } else if (e.target.id === 'auth-to-login') {
    e.preventDefault()
    clearAuthInfo()
    setAuthMode('login')
  }
})

/* フォーム送信（Enterキー） */
document.getElementById('auth-form').addEventListener('submit', async function (e) {
  e.preventDefault()
  await handleAuthSubmit()
})

/* 認証ボタンクリック */
document.getElementById('auth-submit-btn').addEventListener('click', async function () {
  await handleAuthSubmit()
})

async function handleAuthSubmit() {
  const { email, password } = getAuthFields()
  if (!validateAuthFields(email, password)) return
  clearAuthInfo()
  if (authMode === 'login') {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password })
    if (error) showAuthInfo(translateAuthError(error.message))
  } else {
    const nickname = document.getElementById('auth-nickname').value.trim()
    if (!nickname) {
      showAuthInfo('ニックネームを入力してください')
      return
    }
    const { error } = await supabaseClient.auth.signUp({ email, password, options: { data: { nickname } } })
    if (error) {
      showAuthInfo(error.message)
    } else {
      showAuthInfo('確認メールを送信しました。メールをご確認の上、ログインしてください。')
      setAuthMode('login')
    }
  }
}

document.getElementById('auth-signout-btn').addEventListener('click', async function () {
  await supabaseClient.auth.signOut()
})

/* --- フォーム関連 --- */
document.getElementById('cancel-btn').addEventListener('click', function () {
  clearTempMarker()
  setFormMode('create')
  showView('list')
})

document.getElementById('back-from-form').addEventListener('click', function () {
  clearTempMarker()
  setFormMode('create')
  showView('list')
})

document.getElementById('back-from-detail').addEventListener('click', function () {
  showView('list')
})

document.getElementById('show-form-btn').addEventListener('click', function () {
  setFormMode('create')
})

document.getElementById('cafe-form').addEventListener('submit', async function (e) {
  e.preventDefault()
  if (!supabaseClient || !currentUser) return

  const name = document.getElementById('name').value.trim()
  const address = document.getElementById('address').value.trim()
  const lat = parseFloat(document.getElementById('lat').value)
  const lng = parseFloat(document.getElementById('lng').value)
  const comment = document.getElementById('comment').value.trim()
  const hoursStart = document.getElementById('hours-start').value
  const hoursEnd = document.getElementById('hours-end').value
  const hours = hoursStart && hoursEnd ? `${hoursStart}〜${hoursEnd}` : (hoursStart || hoursEnd || '')
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
  const userNickname = currentUser.user_metadata?.nickname || currentUser.email
  const payload = { name, address, lat, lng, comment, hours, wifi, power, parking, user_id: currentUser.id, nickname: userNickname }
  if (photo_url) payload.photo_url = photo_url

  if (editingId) {
    const { error } = await supabaseClient.from('cafes').update(payload).eq('id', editingId)
    if (error) {
      console.error('Failed to update cafe:', error)
      return
    }
    await saveTags(editingId, selectedTags(document.getElementById('form-tags')))
    renderAllCafes()
    setFormMode('create')
    showView('list')
  } else {
    const { data, error } = await supabaseClient.from('cafes').insert(payload).select()
    if (error) {
      console.error('Failed to add cafe:', error)
      return
    }
    await saveTags(data[0].id, selectedTags(document.getElementById('form-tags')))
    addMarker(data[0])
    allCafes.push(data[0])
    applySearchFilter()
    this.reset()
    showView('list')
  }
  clearTempMarker()
})

/* --- カードのクリック（詳細表示） --- */
document.getElementById('map-area').addEventListener('click', async function (e) {
  const card = e.target.closest('.cafe-card')
  const detailBtn = e.target.closest('.card-detail-btn')
  if (card) {
    const id = parseInt(card.dataset.id, 10)
    const cafe = allCafes.find(c => c.id === id)
    if (!cafe) return

    if (detailBtn) {
      map.closePopup()
      map.flyTo([cafe.lat, cafe.lng], 20, { duration: 0.5 })
      setTimeout(() => showDetail(cafe), 400)
    } else {
      var targetLat = cafe.lat + 0.003
      map.flyTo([targetLat, cafe.lng], 16, { duration: 0.5 })
      setTimeout(() => {
        var marker = markerMap[id]
        if (marker) marker.openPopup()
      }, 300)
    }
    if (window.innerWidth <= 768) {
      document.getElementById('view-list').style.display = 'none'
      hamburgerOpen = false
    }
    return
  }

  /* 詳細ビュー内のいいね・コメント・編集・削除・タグ追加 */
  const tagSubmit = e.target.closest('#detail-tag-submit')
  if (tagSubmit) {
    const id = parseInt(tagSubmit.dataset.id, 10)
    const tags = selectedTags(document.getElementById('detail-tag-picker'))
    if (tags.length === 0) return
    const rows = tags.map(tag => ({ cafe_id: id, user_id: currentUser.id, tag }))
    const { error } = await supabaseClient.from('cafe_tags').upsert(rows, { onConflict: 'cafe_id,user_id,tag', ignoreDuplicates: true })
    if (error) console.error('Failed to add tags:', error)
    const cafe = allCafes.find(c => c.id === id)
    if (cafe) {
      cafe._tags = await loadTagsForCafe(id).then(rows => {
        const m = {}
        rows.forEach(r => {
          if (!m[r.tag]) m[r.tag] = { count: 0, users: [] }
          m[r.tag].count++
          m[r.tag].users.push(r.user_id)
        })
        return m
      })
      showDetail(cafe)
    }
    return
  }

  const likeBtn = e.target.closest('.detail-like-btn')
  if (likeBtn) {
    const id = parseInt(likeBtn.dataset.id, 10)
    await handleLike(id)
    return
  }

  const editBtn = e.target.closest('.detail-edit-btn')
  if (editBtn) {
    const id = parseInt(editBtn.dataset.id, 10)
    await handleEdit(id)
    return
  }

  const deleteBtn = e.target.closest('.detail-delete-btn')
  if (deleteBtn) {
    const id = parseInt(deleteBtn.dataset.id, 10)
    await handleDelete(id)
    return
  }

  const commentForm = e.target.closest('.detail-comments .comment-form')
  if (commentForm) {
    e.preventDefault()
    await handleDetailComment(commentForm)
    return
  }
})

async function handleLike(id) {
  if (!supabaseClient || !currentUser) return

  const { data: existing } = await supabaseClient
    .from('likes').select('id').eq('cafe_id', id).eq('user_id', currentUser.id).maybeSingle()
  if (existing) {
    alert('すでにいいねしています')
    return
  }

  const { error: insertErr } = await supabaseClient
    .from('likes').insert({ cafe_id: id, user_id: currentUser.id })
  if (insertErr) return

  const { data: cafe } = await supabaseClient
    .from('cafes').select('like_count').eq('id', id).single()
  const newCount = (cafe?.like_count || 0) + 1
  await supabaseClient.from('cafes').update({ like_count: newCount }).eq('id', id)

  const els = document.querySelectorAll('.like-count')
  els.forEach(function (el) {
    if (el.dataset.id == id) el.textContent = newCount
  })
}

async function handleEdit(id) {
  if (!supabaseClient) return
  const { data: cafe, error } = await supabaseClient
    .from('cafes').select('*').eq('id', id).single()
  if (error || !cafe) return
  setFormMode('edit', cafe)
}

async function handleDelete(id) {
  if (!supabaseClient || !currentUser) return
  if (!confirm('このカフェを削除してもよろしいですか？')) return
  const { error } = await supabaseClient.from('cafes').delete().eq('id', id)
  if (error) {
    console.error('Failed to delete cafe:', error)
    return
  }
  renderAllCafes()
  showView('list')
}

async function handleDetailComment(form) {
  if (!supabaseClient || !currentUser) return
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
  loadDetailComments(id)
}

/* --- 検索 --- */
document.getElementById('search-input').addEventListener('input', function () {
  applySearchFilter()
})

/* --- フィルター表示切替 --- */
document.getElementById('filter-toggle').addEventListener('click', function () {
  const section = document.getElementById('filter-section')
  const isHidden = section.style.display === 'none'
  section.style.display = isHidden ? 'block' : 'none'
  this.textContent = isHidden ? '✕ 閉じる' : '絞り込み ▾'
  this.title = isHidden ? 'フィルターを閉じる' : 'フィルターを表示'
})

/* ========================================
   初期化
   ======================================== */

supabaseClient.auth.onAuthStateChange((event, session) => {
  updateAuthUI(session?.user ?? null)
})

supabaseClient.auth.getSession().then(({ data: { session } }) => {
  updateAuthUI(session?.user ?? null)
  if (window.innerWidth <= 768) {
    document.getElementById('view-list').style.display = 'none'
  }
})

/* ========================================
   ダークモード
   ======================================== */

var darkEnabled = localStorage.getItem('cafeMapDark') === 'true'

function applyDarkMode(dark) {
  darkEnabled = dark
  localStorage.setItem('cafeMapDark', dark ? 'true' : 'false')
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  document.getElementById('dark-toggle').checked = dark
  setTileLayer(dark)
}

document.getElementById('dark-toggle').addEventListener('change', function () {
  applyDarkMode(this.checked)
})

applyDarkMode(darkEnabled)

/* --- モバイルメニューボタン --- */
document.getElementById('mobile-menu-btn').addEventListener('click', function () {
  if (hamburgerOpen) {
    document.getElementById('view-list').style.display = 'none'
    hamburgerOpen = false
  } else {
    hamburgerOpen = true
    showView('list')
  }
})

initTagFilter()