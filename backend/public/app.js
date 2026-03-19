// Client-side behavior for the app experience.
// This single script powers the handbook, ticket list, ticket creation form,
// and lightweight chat widget. Everything is written in plain JavaScript so
// non-developers can tweak the UI without learning a framework.
//
// Responsibilities:
// 1. Connect to Socket.IO and display incoming chat/ticket events.
// 2. Load tickets/handbook data from the REST API.
// 3. Handle ticket creation from the sidebar form.
// 4. Provide helper utilities (auth headers, HTML escaping, etc.).

// --- Auth & global state helpers ------------------------------------------------
// Authentication token storage key (admins will sign in via /admin.html)
const TOKEN_KEY = 'command_center_token';
const LEGACY_TOKEN_KEY = 'mack_token';
const APPEARANCE_STORAGE_KEY = 'command_center_appearance';
const LEGACY_APPEARANCE_STORAGE_KEY = 'mack_appearance';

// Socket instance (created after token is known so we can attach it in auth handshake)
let socket = null;
let currentHandbookPdf = null;
let handbookDepartments = [];
let handbookDefaultDepartment = 'hr';
let selectedHandbookDepartment = null;
let handbookDepartmentLocked = false;
let facilityMapData = null;
let facilityMapCatalog = [];
let activeFacilityMapId = '';
let selectedFacilityMapId = '';
let selectedFacilityAreaId = null;
let facilityMapScale = 1;
let facilityMapSearchQuery = '';
let facilityMapFitMode = true;

// Helper: attach Authorization header to fetch requests when a token exists.
function readStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || '';
  } catch (error) {
    return '';
  }
}

function readStoredAppearance() {
  try {
    return localStorage.getItem(APPEARANCE_STORAGE_KEY) || localStorage.getItem(LEGACY_APPEARANCE_STORAGE_KEY) || '';
  } catch (error) {
    return '';
  }
}

function authHeaders(){
  const token = readStoredToken();
  return token ? { Authorization: 'Bearer ' + token } : {};
}

// Escape any user-supplied content before injecting into innerHTML.
function escapeHtml(s) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(s).replace(/[&<>"']/g, (c) => map[c]);
}

function normalizeAppearance(value){
  return String(value || '').trim().toLowerCase() === 'dark' ? 'dark' : 'light';
}

function applyAppearance(mode){
  const next = normalizeAppearance(mode || readStoredAppearance() || 'light');
  document.body.classList.toggle('appearance-dark', next === 'dark');
  document.body.classList.toggle('appearance-light', next !== 'dark');
  localStorage.setItem(APPEARANCE_STORAGE_KEY, next);
  localStorage.removeItem(LEGACY_APPEARANCE_STORAGE_KEY);
  if (appThemeToggle) appThemeToggle.textContent = next === 'dark' ? 'Light Mode' : 'Dark Mode';
}

// Connect Socket.IO, passing the token in `auth` for server verification.
function connectSocket(){
  const token = readStoredToken();
  if (typeof io !== 'function') return null;
  socket = io({ auth: { token } });
  socket.on('chat message', (m)=> addMessage(m));
  socket.on('map.updated', ()=> {
    const mapSection = document.getElementById('map');
    if (mapSection && mapSection.classList.contains('active')) {
      loadFacilityMapCatalog({ preferredMapId: selectedFacilityMapId || activeFacilityMapId }).catch((err) => {
        console.error('map.updated reload failed', err);
      });
    }
  });
  return socket;
}

// --- Cache the DOM nodes we care about -----------------------------------------
// Elements (may be absent on some pages; guard accordingly)
const messagesEl = document.getElementById('messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatUser = document.getElementById('chat-user');
const ticketForm = document.getElementById('ticket-form');
const ticketsMini = document.getElementById('tickets-list-mini');
const ticketsFull = document.getElementById('tickets-full') || document.getElementById('tickets');
const handbookDepartmentFilter = document.getElementById('handbook-department-filter');
const handbookActiveDepartment = document.getElementById('handbook-active-department');
const handbookDepartmentControls = document.getElementById('handbook-department-controls');
const handbookDepartmentSelectWrap = document.getElementById('handbook-department-select-wrap');
const appMapViewport = document.getElementById('app-map-viewport');
const appMapStage = document.getElementById('app-map-stage');
const appMapMeta = document.getElementById('app-map-meta');
const appMapDetails = document.getElementById('app-map-details');
const appMapSearchInput = document.getElementById('app-map-search-input');
const appMapSearchBtn = document.getElementById('app-map-search-btn');
const appMapSearchClear = document.getElementById('app-map-search-clear');
const appMapZoomIn = document.getElementById('app-map-zoom-in');
const appMapZoomOut = document.getElementById('app-map-zoom-out');
const appMapZoomReset = document.getElementById('app-map-zoom-reset');
const appMapRefresh = document.getElementById('app-map-refresh');
const appMapSelect = document.getElementById('app-map-select');
const appThemeToggle = document.getElementById('btnAppTheme');

// --- Chat helpers --------------------------------------------------------------
// Render a chat message into the messages container.
function addMessage(m) {
  if (!messagesEl) return;
  const d = document.createElement('div');
  d.className = 'message';
  d.textContent = `${m.ts} — ${m.user}: ${m.text}`;
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Send a chat message to the server when the form is submitted.
if (chatForm) {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    if (!socket) connectSocket();
    socket && socket.emit('chat message', { text, user: chatUser.value || 'Anonymous' });
    chatInput.value = '';
  });
}

// --- Section navigation --------------------------------------------------------
function showSection(name){
  document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(name);
  if (el) el.classList.add('active');
  document.querySelectorAll('button[data-section]').forEach((button) => {
    button.classList.toggle('active', button.getAttribute('data-section') === name);
  });
  document.body.classList.toggle('map-layout-active', name === 'map');
  // update hash without dropping existing query params (e.g., department filter)
  const url = new URL(window.location.href);
  url.hash = '#' + name;
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  // Keep handbook clean: hide the ticket creation block and mini tickets when viewing handbook
  try{
    const createBlock = document.getElementById('create-ticket-block');
    const mini = document.getElementById('tickets-list-mini');
    if (name === 'handbook' || name === 'chat' || name === 'map'){
      if (createBlock) createBlock.style.display = 'none';
      if (mini) mini.style.display = 'none';
      // refresh AD users when opening chat
      try{ if (name === 'chat') loadADUsers(); }catch(e){}
      try{ if (name === 'map') loadFacilityMapCatalog({ preferredMapId: selectedFacilityMapId || activeFacilityMapId }); }catch(e){}
      try{ if (name === 'map') requestAnimationFrame(() => { if (fitFacilityMapToViewport()) renderFacilityMap(); }); }catch(e){}
    } else {
      if (createBlock) createBlock.style.display = '';
      if (mini) mini.style.display = '';
    }
  }catch(e){}
}

// Wire nav buttons if present
document.querySelectorAll('button[data-section]').forEach(b => {
  b.addEventListener('click', ()=> showSection(b.getAttribute('data-section')));
});

// respect initial hash
const initial = (location.hash && location.hash.slice(1)) || 'chat';
applyAppearance();
showSection(initial);

// --- Ticket list + mini dashboard ---------------------------------------------
async function loadTickets(){
  try{
    const res = await fetch('/api/tickets');
    const list = await res.json();
    if (ticketsFull) {
      ticketsFull.innerHTML = '';
      for (const t of list){
        const div = document.createElement('div');
        div.className = 'ticket';
        div.innerHTML = `<strong>#${t.id} ${escapeHtml(t.title)}</strong>
          <div>${escapeHtml(t.description || '')}</div>
          <div><em>${escapeHtml(t.requester || '')}</em> • ${t.status}</div>
          <div><button data-id="${t.id}" class="close-btn">Toggle Close</button></div>`;
        ticketsFull.appendChild(div);
      }
    }
    if (ticketsMini){
      ticketsMini.innerHTML = '';
      for (const t of list.slice(0,5)){
        const d = document.createElement('div');
        d.textContent = `#${t.id} ${t.title} — ${t.status}`;
        ticketsMini.appendChild(d);
      }
    }
  }catch(err){ console.error('loadTickets', err); }
}

// --- Handbook library ---------------------------------------------------------
// Loads PDF filenames from the server and renders quick cards. Dragging a PDF
// into `backend/public/PDF handbook/` is all that is required for it to show up.
function normalizeDepartmentId(value){
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.replace(/[^a-z0-9_-]/g, '');
}

function getDepartmentFromUrl(){
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('department') || params.get('dept') || '';
  const normalized = normalizeDepartmentId(raw);
  if (!normalized) return null;
  if (normalized === 'all') return 'all';
  return normalized;
}

function getDepartmentLabel(id){
  const found = handbookDepartments.find(item => item.id === id);
  return found ? found.label : 'HR';
}

function applyDepartmentFilterMode(){
  if (handbookDepartmentSelectWrap) {
    handbookDepartmentSelectWrap.style.display = handbookDepartmentLocked ? 'none' : '';
  }
  if (handbookDepartmentControls) {
    handbookDepartmentControls.style.alignItems = handbookDepartmentLocked ? 'center' : 'end';
  }
}

function updateHandbookCaption(){
  if (!handbookActiveDepartment) return;
  if (handbookDepartmentLocked && selectedHandbookDepartment && selectedHandbookDepartment !== 'all') {
    handbookActiveDepartment.textContent = `Files for ${getDepartmentLabel(selectedHandbookDepartment)}`;
    return;
  }
  if (!selectedHandbookDepartment || selectedHandbookDepartment === 'all') {
    handbookActiveDepartment.textContent = 'Showing all departments';
    return;
  }
  handbookActiveDepartment.textContent = `Department: ${getDepartmentLabel(selectedHandbookDepartment)}`;
}

function syncDepartmentToUrl(){
  const url = new URL(window.location.href);
  url.searchParams.delete('dept');
  if (!selectedHandbookDepartment || selectedHandbookDepartment === 'all') {
    url.searchParams.delete('department');
  } else {
    url.searchParams.set('department', selectedHandbookDepartment);
  }
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}

async function loadHandbookDepartments(){
  try {
    const res = await fetch('/api/handbook/departments', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load departments');
    const data = await res.json();
    const incoming = Array.isArray(data && data.departments) ? data.departments : [];
    handbookDepartments = incoming
      .map(item => ({
        id: normalizeDepartmentId(item && item.id),
        label: String((item && item.label) || '').trim(),
      }))
      .filter(item => item.id && item.label);
    handbookDefaultDepartment = normalizeDepartmentId(data && data.defaultDepartment) || 'hr';
  } catch (err) {
    handbookDepartments = [{ id: 'hr', label: 'HR' }];
    handbookDefaultDepartment = 'hr';
  }

  if (!handbookDepartments.some(item => item.id === handbookDefaultDepartment)) {
    handbookDefaultDepartment = handbookDepartments.length ? handbookDepartments[0].id : 'hr';
  }

  const requested = getDepartmentFromUrl();
  const requestedIsKnown = requested && requested !== 'all' && handbookDepartments.some(item => item.id === requested);
  handbookDepartmentLocked = !!requestedIsKnown;

  if (requested === 'all') selectedHandbookDepartment = 'all';
  else if (requestedIsKnown) selectedHandbookDepartment = requested;
  else selectedHandbookDepartment = handbookDefaultDepartment;

  applyDepartmentFilterMode();

  if (handbookDepartmentFilter) {
    handbookDepartmentFilter.innerHTML =
      '<option value="all">All Departments</option>' +
      handbookDepartments.map(item => `<option value="${item.id}">${item.label}</option>`).join('');
    handbookDepartmentFilter.value = selectedHandbookDepartment || 'all';
  }

  updateHandbookCaption();
}

async function loadHandbook(){
  const el = document.getElementById('handbook-list');
  if (!el) return;
  try{
    if (!selectedHandbookDepartment) selectedHandbookDepartment = handbookDefaultDepartment;
    if (handbookDepartmentFilter && handbookDepartmentFilter.value !== selectedHandbookDepartment) {
      handbookDepartmentFilter.value = selectedHandbookDepartment;
    }
    updateHandbookCaption();

    const deptQuery = selectedHandbookDepartment && selectedHandbookDepartment !== 'all'
      ? ('?department=' + encodeURIComponent(selectedHandbookDepartment))
      : '';
    const res = await fetch('/api/handbook' + deptQuery);
    const list = await res.json();
    el.innerHTML = '';
    if (!list || list.length === 0) {
      const scope = selectedHandbookDepartment && selectedHandbookDepartment !== 'all'
        ? (` for ${getDepartmentLabel(selectedHandbookDepartment)}`)
        : '';
      el.innerHTML = `<div style="color:var(--muted)">No handbook PDFs found${scope}.</div>`;
      return;
    }
    // Render each PDF as a clean card with Open action.
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(280px, 1fr))';
    grid.style.gap = '14px';
    for (const f of list){
      const card = document.createElement('div');
      card.style.border = '1px solid #eef6ff';
      card.style.padding = '16px';
      card.style.borderRadius = '12px';
      card.style.background = 'white';
      const title = document.createElement('div');
      title.style.fontWeight = '600';
      title.style.marginBottom = '8px';
      title.style.fontSize = '17px';
      title.textContent = /handbook/i.test(f.name) ? 'Handbook' : f.name;
      const btnOpen = document.createElement('button');
      btnOpen.textContent = 'Open';
      btnOpen.className = 'btn primary';
      btnOpen.style.marginRight = '8px';
      btnOpen.addEventListener('click', ()=> openPDF(f.url, f.name));
      card.appendChild(title);
      const meta = document.createElement('div');
      meta.className = 'small';
      meta.style.marginBottom = '10px';
      const deptLabel = f.departmentLabel || getDepartmentLabel(f.department || handbookDefaultDepartment);
      meta.textContent = f.size ? `${Math.round(f.size / 1024)} KB • ${deptLabel}` : `PDF document • ${deptLabel}`;
      card.appendChild(meta);
      const actions = document.createElement('div');
      actions.appendChild(btnOpen);
      card.appendChild(actions);
      grid.appendChild(card);
    }
    el.appendChild(grid);
  }catch(err){ console.error('loadHandbook', err); }
}

if (handbookDepartmentFilter) {
  handbookDepartmentFilter.addEventListener('change', async ()=> {
    selectedHandbookDepartment = handbookDepartmentFilter.value || 'all';
    syncDepartmentToUrl();
    await loadHandbook();
  });
}

function clampMapValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeMapColor(value) {
  const raw = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  return '#0b74ff';
}

function normalizeMapFillStyle(value, fallback) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'transparent' || raw === 'outline') return 'transparent';
  return fallback === 'transparent' ? 'transparent' : '';
}

function isLineMapArea(areaOrKind, maybeShape) {
  if (areaOrKind && typeof areaOrKind === 'object') {
    return normalizeMapShape(areaOrKind.shape, areaOrKind.kind) === 'line';
  }
  return normalizeMapShape(maybeShape, areaOrKind) === 'line';
}

function defaultMapLineWidth(kind) {
  const key = String(kind || '').trim().toLowerCase();
  if (key === 'hallway') return 44;
  if (key === 'wall') return 12;
  return 10;
}

function clampMapStrokeWidth(value, fallback) {
  const numeric = Number(value);
  const resolved = Number.isFinite(numeric) ? numeric : Number(fallback);
  return clampMapValue(Math.round((Number.isFinite(resolved) ? resolved : 3) * 10) / 10, 1, 140);
}

function hasTransparentMapFill(area) {
  return !!area && !isLineMapArea(area) && normalizeMapFillStyle(area.fillStyle || area.fill_style, '') === 'transparent';
}

function getMapAreaStrokeWidth(area) {
  return clampMapStrokeWidth(area && area.strokeWidth, hasTransparentMapFill(area) ? 3 : 2);
}

function getMapLineGeometry(area) {
  const lineWidth = clampMapValue(Number(area && area.lineWidth) || defaultMapLineWidth(area && area.kind), 4, 140);
  if (!area) {
    return { x1: 0, y1: 0, x2: 0, y2: 0, lineWidth };
  }

  const fallbackStart = {
    x: Number(area.x) || 0,
    y: (Number(area.y) || 0) + ((Number(area.height) || lineWidth) / 2),
  };
  const fallbackEnd = {
    x: (Number(area.x) || 0) + (Number(area.width) || 120),
    y: fallbackStart.y,
  };

  return {
    x1: Number.isFinite(Number(area.x1)) ? Number(area.x1) : fallbackStart.x,
    y1: Number.isFinite(Number(area.y1)) ? Number(area.y1) : fallbackStart.y,
    x2: Number.isFinite(Number(area.x2)) ? Number(area.x2) : fallbackEnd.x,
    y2: Number.isFinite(Number(area.y2)) ? Number(area.y2) : fallbackEnd.y,
    lineWidth,
  };
}

function applyMapLineGeometry(area, geometry) {
  if (!area || !geometry) return;
  const startX = Number.isFinite(Number(geometry.x1)) ? Number(geometry.x1) : 0;
  const startY = Number.isFinite(Number(geometry.y1)) ? Number(geometry.y1) : 0;
  const endX = Number.isFinite(Number(geometry.x2)) ? Number(geometry.x2) : startX;
  const endY = Number.isFinite(Number(geometry.y2)) ? Number(geometry.y2) : startY;
  const lineWidth = clampMapValue(Number(geometry.lineWidth) || defaultMapLineWidth(area.kind), 4, 140);

  area.x1 = startX;
  area.y1 = startY;
  area.x2 = endX;
  area.y2 = endY;
  area.lineWidth = lineWidth;
  area.rotation = 0;
  area.x = Math.min(startX, endX);
  area.y = Math.min(startY, endY);
  area.width = Math.max(lineWidth, Math.abs(endX - startX));
  area.height = Math.max(lineWidth, Math.abs(endY - startY));
}

function getFacilityMapGridBackground() {
  if (document.body.classList.contains('appearance-dark')) {
    return 'linear-gradient(180deg, #0f1b30, #122340), repeating-linear-gradient(0deg, rgba(80, 122, 173, 0.18) 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, rgba(80, 122, 173, 0.18) 0 1px, transparent 1px 24px), repeating-linear-gradient(0deg, rgba(112, 165, 219, 0.18) 0 1px, transparent 1px 120px), repeating-linear-gradient(90deg, rgba(112, 165, 219, 0.18) 0 1px, transparent 1px 120px)';
  }
  return 'linear-gradient(180deg, #eef6ff, #e7f2ff), repeating-linear-gradient(0deg, rgba(90, 140, 196, 0.22) 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, rgba(90, 140, 196, 0.22) 0 1px, transparent 1px 24px), repeating-linear-gradient(0deg, rgba(67, 110, 163, 0.3) 0 1px, transparent 1px 120px), repeating-linear-gradient(90deg, rgba(67, 110, 163, 0.3) 0 1px, transparent 1px 120px)';
}

function normalizeMapSvgPath(value) {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  if (!raw) return '';
  const normalized = raw.startsWith('/') ? raw : ('/' + raw.replace(/^\/+/, ''));
  if (!/\.svg$/i.test(normalized)) return '';
  if (normalized.startsWith('/assets/icons/')) return normalized;
  if (normalized.startsWith('/icons/')) {
    return '/assets/icons/' + normalized.slice('/icons/'.length);
  }
  return '';
}

function mapKindLabel(kind) {
  const labels = {
    department: 'Department',
    hallway: 'Hallway',
    room: 'Room',
    table: 'Table',
    wall: 'Wall',
    sign: 'Sign',
    text: 'Text Label',
    service: 'Service',
    common: 'Common Area',
    other: 'Other',
  };
  const key = String(kind || '').trim().toLowerCase();
  return labels[key] || labels.other;
}

function mapShapeLabel(shape) {
  const labels = {
    rect: 'Rectangle',
    rounded: 'Rounded',
    circle: 'Circle',
    diamond: 'Diamond',
    hex: 'Hexagon',
    pill: 'Pill',
    note: 'Note',
    line: 'Line',
    arrow: 'Arrow',
  };
  const key = String(shape || '').trim().toLowerCase();
  return labels[key] || labels.rect;
}

function mapDepartmentTypeLabel(type) {
  const labels = {
    administration: 'Administration',
    operations: 'Operations',
    it: 'IT',
    hr: 'HR',
    finance: 'Finance',
    quality: 'Quality',
    safety: 'Safety',
    support: 'Support',
    other: 'Other',
  };
  const key = String(type || '').trim().toLowerCase();
  return labels[key] || labels.other;
}

function defaultDepartmentColor(type) {
  const palette = {
    administration: '#3f51b5',
    operations: '#ef6c00',
    it: '#00838f',
    hr: '#8e24aa',
    finance: '#2e7d32',
    quality: '#546e7a',
    safety: '#c62828',
    support: '#0277bd',
    other: '#455a64',
  };
  return palette[String(type || '').toLowerCase()] || palette.other;
}

function defaultObjectColor(kind, departmentType) {
  const key = String(kind || '').trim().toLowerCase();
  if (key === 'table') return '#8d6e63';
  if (key === 'wall') return '#607d8b';
  if (key === 'sign') return '#ffca28';
  if (key === 'text') return '#183153';
  return defaultDepartmentColor(departmentType);
}

function defaultObjectShape(kind) {
  const key = String(kind || '').trim().toLowerCase();
  if (key === 'wall') return 'line';
  if (key === 'table') return 'rounded';
  if (key === 'sign') return 'pill';
  if (key === 'room') return 'rounded';
  if (key === 'service') return 'rounded';
  if (key === 'common') return 'rounded';
  return 'rect';
}

function normalizeMapShape(value, kind) {
  const raw = String(value || '').trim().toLowerCase();
  if (['rect', 'rounded', 'circle', 'diamond', 'hex', 'pill', 'note', 'line', 'arrow'].includes(raw)) return raw;
  return defaultObjectShape(kind);
}

function normalizeMapRecordId(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function minSizeForKind(kind) {
  const key = String(kind || '').trim().toLowerCase();
  if (key === 'wall') return { width: 60, height: 8 };
  if (key === 'text') return { width: 40, height: 20 };
  if (key === 'sign') return { width: 40, height: 24 };
  return { width: 20, height: 8 };
}

function mapLegacyMarkerTypeToDepartmentType(markerType) {
  const t = String(markerType || '').trim().toLowerCase();
  if (t === 'warehouse') return 'operations';
  if (t === 'office') return 'administration';
  if (t === 'lab') return 'quality';
  if (t === 'safety') return 'safety';
  if (t === 'entry') return 'support';
  if (t === 'it') return 'it';
  return 'other';
}

function mapLegacyMarkerTypeToKind(markerType) {
  const t = String(markerType || '').trim().toLowerCase();
  if (t === 'entry' || t === 'safety') return 'service';
  if (t === 'meeting') return 'room';
  return 'department';
}

function sanitizeFacilityMapResponse(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const width = clampMapValue(Math.round(Number(source.canvas && source.canvas.width) || 1400), 600, 3600);
  const height = clampMapValue(Math.round(Number(source.canvas && source.canvas.height) || 850), 400, 2400);
  const areaSource = Array.isArray(source.areas) ? source.areas : [];
  const usedIds = new Set();

  let areas = areaSource.slice(0, 800).map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;

    const baseName = String(item.name || '').trim() || `Area ${index + 1}`;
    let areaId = String(item.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!areaId) areaId = `area_${index + 1}`;
    let dedupe = areaId;
    let suffix = 1;
    while (usedIds.has(dedupe)) {
      dedupe = `${areaId}_${suffix}`;
      suffix += 1;
    }
    usedIds.add(dedupe);

    const kind = String(item.kind || 'department').trim().toLowerCase() || 'department';
    const shape = normalizeMapShape(item.shape, kind);
    const mins = minSizeForKind(kind);
    const areaWidth = clampMapValue(Number(item.width), mins.width, width);
    const areaHeight = clampMapValue(Number(item.height), mins.height, height);
    const x = clampMapValue(Number(item.x), 0, Math.max(0, width - areaWidth));
    const y = clampMapValue(Number(item.y), 0, Math.max(0, height - areaHeight));
    const departmentType = String(item.departmentType || item.department_type || 'other').trim().toLowerCase() || 'other';
    const color = normalizeMapColor(item.color || defaultObjectColor(kind, departmentType));
    const fillStyle = normalizeMapFillStyle(item.fillStyle || item.fill_style, '');
    const area = {
      id: dedupe,
      name: baseName,
      kind,
      shape,
      departmentType,
      description: String(item.description || '').trim(),
      icon: String(item.icon || '').trim(),
      color,
      fillStyle,
      x: Number.isFinite(x) ? x : width / 2,
      y: Number.isFinite(y) ? y : height / 2,
      width: Number.isFinite(areaWidth) ? areaWidth : 150,
      height: Number.isFinite(areaHeight) ? areaHeight : 100,
      z: Number.isFinite(Number(item.z)) ? Number(item.z) : index,
      rotation: Number.isFinite(Number(item.rotation)) ? Number(item.rotation) : 0,
      strokeWidth: clampMapStrokeWidth(item.strokeWidth, fillStyle === 'transparent' ? 3 : 2),
      svgPath: normalizeMapSvgPath(item.svgPath || item.svg_path || ''),
    };

    if (isLineMapArea(area)) {
      applyMapLineGeometry(area, {
        x1: Number.isFinite(Number(item.x1)) ? Number(item.x1) : area.x,
        y1: Number.isFinite(Number(item.y1)) ? Number(item.y1) : (area.y + (area.height / 2)),
        x2: Number.isFinite(Number(item.x2)) ? Number(item.x2) : (area.x + area.width),
        y2: Number.isFinite(Number(item.y2)) ? Number(item.y2) : (area.y + (area.height / 2)),
        lineWidth: Number(item.lineWidth || item.line_width || item.strokeWidth) || defaultMapLineWidth(kind),
      });
    }

    return area;
  }).filter(Boolean);

  // Backwards compatibility for older marker-based map payloads.
  if (!areas.length && Array.isArray(source.markers) && source.markers.length) {
    const legacyUsedIds = new Set();
    areas = source.markers.slice(0, 500).map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const departmentType = mapLegacyMarkerTypeToDepartmentType(item.type);
      const kind = mapLegacyMarkerTypeToKind(item.type);
      const shape = defaultObjectShape(kind);
      const areaWidth = kind === 'room' ? 140 : 180;
      const areaHeight = kind === 'room' ? 100 : 120;
      const centerX = clampMapValue(Number(item.x), 0, width);
      const centerY = clampMapValue(Number(item.y), 0, height);

      const baseName = String(item.name || '').trim() || `Area ${index + 1}`;
      let areaId = String(item.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
      if (!areaId) areaId = `area_${index + 1}`;
      let dedupe = areaId;
      let suffix = 1;
      while (legacyUsedIds.has(dedupe)) {
        dedupe = `${areaId}_${suffix}`;
        suffix += 1;
      }
      legacyUsedIds.add(dedupe);

      return {
        id: dedupe,
        name: baseName,
        kind,
        shape,
        departmentType,
        description: String(item.description || '').trim(),
        icon: '',
        color: normalizeMapColor(item.color || defaultObjectColor(kind, departmentType)),
        fillStyle: '',
        strokeWidth: 2,
        x: clampMapValue(centerX - (areaWidth / 2), 0, Math.max(0, width - areaWidth)),
        y: clampMapValue(centerY - (areaHeight / 2), 0, Math.max(0, height - areaHeight)),
        width: areaWidth,
        height: areaHeight,
        z: index,
        rotation: 0,
        svgPath: '',
      };
    }).filter(Boolean);
  }

  areas.sort((a, b) => (Number(a.z) || 0) - (Number(b.z) || 0));

  return {
    id: normalizeMapRecordId(source.id),
    name: String(source.name || '').trim() || 'Facility Map',
    description: String(source.description || '').trim(),
    canvas: { width, height },
    backgroundUrl: String(source.backgroundUrl || ''),
    areas,
    updatedAt: source.updatedAt ? String(source.updatedAt) : null,
    updatedBy: source.updatedBy ? String(source.updatedBy) : null,
  };
}

function sanitizeFacilityMapCatalogResponse(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const maps = Array.isArray(source.maps) ? source.maps : [];
  const cleaned = maps.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    return {
      id: normalizeMapRecordId(item.id) || `map_${index + 1}`,
      name: String(item.name || '').trim() || `Map ${index + 1}`,
      description: String(item.description || '').trim(),
      isActive: !!item.isActive,
      updatedAt: item.updatedAt ? String(item.updatedAt) : '',
    };
  }).filter(Boolean);
  const activeMapId = normalizeMapRecordId(source.activeMapId) || (cleaned.find((item) => item.isActive) || {}).id || (cleaned[0] && cleaned[0].id) || '';
  return { activeMapId, maps: cleaned };
}

function renderFacilityMapSelector() {
  if (!appMapSelect) return;

  if (!facilityMapCatalog.length) {
    appMapSelect.innerHTML = '<option value="">No maps</option>';
    appMapSelect.disabled = true;
    return;
  }

  appMapSelect.innerHTML = facilityMapCatalog.map((item) => (
    `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}${item.id === activeFacilityMapId ? ' (Default)' : ''}</option>`
  )).join('');
  appMapSelect.disabled = false;
  appMapSelect.value = selectedFacilityMapId || activeFacilityMapId || facilityMapCatalog[0].id;
}

function setFacilityMapCatalog(raw, preferredMapId) {
  const catalog = sanitizeFacilityMapCatalogResponse(raw);
  facilityMapCatalog = catalog.maps;
  activeFacilityMapId = catalog.activeMapId;

  let nextId = normalizeMapRecordId(preferredMapId || selectedFacilityMapId || activeFacilityMapId);
  if (!facilityMapCatalog.some((item) => item.id === nextId)) {
    nextId = activeFacilityMapId || (facilityMapCatalog[0] && facilityMapCatalog[0].id) || '';
  }

  selectedFacilityMapId = nextId;
  renderFacilityMapSelector();
  return nextId;
}

async function loadFacilityMapCatalog(options) {
  if (!appMapStage) return '';
  const opts = options || {};
  const res = await fetch('/api/maps', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load map catalog');
  const data = await res.json();
  const nextId = setFacilityMapCatalog(data, opts.preferredMapId);
  if (opts.loadCurrent === false) return nextId;
  if (nextId) await loadFacilityMap(nextId);
  return nextId;
}

function getSelectedFacilityArea() {
  if (!facilityMapData || !Array.isArray(facilityMapData.areas)) return null;
  return facilityMapData.areas.find(item => item.id === selectedFacilityAreaId) || null;
}

function areaMatchesSearch(area, query) {
  if (!query) return true;
  const text = [
    area.name,
    area.description,
    area.kind,
    area.shape,
    area.departmentType,
  ].join(' ').toLowerCase();
  return text.includes(query);
}

function renderFacilityMapDetails(area) {
  if (!appMapDetails) return;
  if (!area) {
    appMapDetails.innerHTML = '<h3>No area selected</h3><p>Select a labeled area to see department details.</p>';
    return;
  }

  const description = area.description ? escapeHtml(area.description) : 'No details available.';
  const icon = area.icon ? `${escapeHtml(area.icon)} ` : '';
  const shape = normalizeMapShape(area.shape, area.kind);
  const lineInfo = isLineMapArea(area)
    ? (() => {
      const geometry = getMapLineGeometry(area);
      return `Line: (${Math.round(geometry.x1)}, ${Math.round(geometry.y1)}) to (${Math.round(geometry.x2)}, ${Math.round(geometry.y2)})<br/>Thickness: ${Math.round(geometry.lineWidth)}<br/>`;
    })()
    : '';
  const strokeInfo = !isLineMapArea(area) && area.kind !== 'text' && !normalizeMapSvgPath(area.svgPath)
    ? `Stroke: ${Math.round(getMapAreaStrokeWidth(area) * 10) / 10}<br/>`
    : '';
  const fillInfo = hasTransparentMapFill(area) ? 'Fill: Transparent<br/>' : '';
  const svgInfo = normalizeMapSvgPath(area.svgPath) ? `SVG Asset: ${escapeHtml(normalizeMapSvgPath(area.svgPath))}<br/>` : '';
  appMapDetails.innerHTML = `<h3>${icon}${escapeHtml(area.name)}</h3><p>Kind: ${escapeHtml(mapKindLabel(area.kind))}<br/>Shape: ${escapeHtml(mapShapeLabel(shape || defaultObjectShape(area.kind)))}<br/>Department Type: ${escapeHtml(mapDepartmentTypeLabel(area.departmentType))}<br/>Coordinates: X ${Math.round(area.x)}, Y ${Math.round(area.y)}<br/>Size: ${Math.round(area.width)} x ${Math.round(area.height)}<br/>${lineInfo}${strokeInfo}${fillInfo}${svgInfo}${description}</p>`;
}

function renderFacilityMap() {
  if (!appMapStage || !facilityMapData) return;

  const width = Number(facilityMapData.canvas && facilityMapData.canvas.width) || 1400;
  const height = Number(facilityMapData.canvas && facilityMapData.canvas.height) || 850;
  const scaledWidth = Math.round(width * facilityMapScale);
  const scaledHeight = Math.round(height * facilityMapScale);

  appMapStage.style.width = scaledWidth + 'px';
  appMapStage.style.height = scaledHeight + 'px';
  const gridBackground = getFacilityMapGridBackground();
  const backgroundOverlay = document.body.classList.contains('appearance-dark')
    ? 'linear-gradient(0deg, rgba(9,17,29,0.48), rgba(9,17,29,0.48))'
    : 'linear-gradient(0deg, rgba(234,244,255,0.4), rgba(234,244,255,0.4))';
  appMapStage.style.backgroundImage = facilityMapData.backgroundUrl
    ? `${backgroundOverlay}, url(${facilityMapData.backgroundUrl}), ${gridBackground}`
    : gridBackground;
  appMapStage.innerHTML = '';

  const searchTerm = String(facilityMapSearchQuery || '').trim().toLowerCase();
  const fragment = document.createDocumentFragment();

  for (const area of facilityMapData.areas) {
    const shape = normalizeMapShape(area.shape, area.kind);
    const hasSvg = !!normalizeMapSvgPath(area.svgPath);
    const isLine = isLineMapArea(area);
    const transparentFill = hasTransparentMapFill(area);
    const fillColor = normalizeMapColor(area.color || defaultObjectColor(area.kind, area.departmentType));
    const showLabel = area.kind === 'text' || (!isLine && shape !== 'arrow' && !hasSvg && !transparentFill && area.kind !== 'wall');
    area.shape = shape;
    const areaEl = document.createElement('button');
    areaEl.type = 'button';
    areaEl.className = 'app-map-area' +
      (area.id === selectedFacilityAreaId ? ' active' : '') +
      (areaMatchesSearch(area, searchTerm) && searchTerm ? ' highlight' : '') +
      (hasSvg ? ' has-svg' : '') +
      (transparentFill ? ' outline-only' : '') +
      (isLine ? ' is-line' : '') +
      ` kind-${escapeHtml(area.kind || 'department')}` +
      ` shape-${escapeHtml(shape)}`;
    areaEl.style.zIndex = String((Number(area.z) || 0) + 1);
    areaEl.title = `${area.name} (${mapDepartmentTypeLabel(area.departmentType)})`;
    areaEl.setAttribute('aria-label', areaEl.title);

    if (isLine) {
      const geometry = getMapLineGeometry(area);
      const dx = geometry.x2 - geometry.x1;
      const dy = geometry.y2 - geometry.y1;
      const length = Math.max(1, Math.sqrt((dx * dx) + (dy * dy)));
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      const thickness = Math.max(2, geometry.lineWidth * facilityMapScale);

      areaEl.style.left = (geometry.x1 * facilityMapScale) + 'px';
      areaEl.style.top = (geometry.y1 * facilityMapScale) + 'px';
      areaEl.style.width = (length * facilityMapScale) + 'px';
      areaEl.style.height = thickness + 'px';
      areaEl.style.padding = '0';
      areaEl.style.background = fillColor;
      areaEl.style.border = '0';
      areaEl.style.transform = `translateY(-50%) rotate(${angle}deg)`;
      areaEl.style.transformOrigin = '0 50%';
    } else {
      const scaledStrokeWidth = Math.max(1, getMapAreaStrokeWidth(area) * facilityMapScale);

      areaEl.style.left = (area.x * facilityMapScale) + 'px';
      areaEl.style.top = (area.y * facilityMapScale) + 'px';
      areaEl.style.width = (area.width * facilityMapScale) + 'px';
      areaEl.style.height = (area.height * facilityMapScale) + 'px';
      areaEl.style.transform = `rotate(${Number(area.rotation) || 0}deg)`;
      areaEl.style.transformOrigin = 'center center';

      if (hasSvg) {
        areaEl.style.background = 'transparent';
        areaEl.style.border = '0';
        areaEl.style.padding = '0';
      } else if (area.kind === 'text') {
        areaEl.style.background = 'transparent';
        areaEl.style.border = '0';
        areaEl.style.padding = '0 2px';
        areaEl.style.boxShadow = 'none';
      } else {
        areaEl.style.background = transparentFill ? 'transparent' : fillColor;
        areaEl.style.borderColor = transparentFill ? fillColor : 'rgba(12, 45, 84, 0.42)';
        areaEl.style.borderWidth = scaledStrokeWidth + 'px';
        areaEl.style.padding = transparentFill ? '0' : '6px';
      }
    }

    if (hasSvg) {
      const svgImg = document.createElement('img');
      svgImg.className = 'svg-icon';
      svgImg.src = normalizeMapSvgPath(area.svgPath);
      svgImg.alt = area.name || 'Map icon';
      svgImg.loading = 'lazy';
      svgImg.decoding = 'async';
      svgImg.draggable = false;
      areaEl.appendChild(svgImg);
    }

    if (showLabel) {
      const label = document.createElement('span');
      label.className = 'label';
      const icon = area.icon ? `${area.icon} ` : '';
      label.textContent = `${icon}${area.name}`;
      if (area.kind === 'text') {
        label.style.color = fillColor;
      }
      areaEl.appendChild(label);
    }

    areaEl.addEventListener('click', () => {
      selectedFacilityAreaId = area.id;
      renderFacilityMap();
    });
    fragment.appendChild(areaEl);
  }

  appMapStage.appendChild(fragment);

  const selected = getSelectedFacilityArea();
  if (!selected && selectedFacilityAreaId) selectedFacilityAreaId = null;
  renderFacilityMapDetails(selected);

  if (appMapMeta) {
    const updated = facilityMapData.updatedAt ? new Date(facilityMapData.updatedAt).toLocaleString() : 'not saved yet';
    const matchCount = searchTerm
      ? facilityMapData.areas.filter(area => areaMatchesSearch(area, searchTerm)).length
      : facilityMapData.areas.length;
    appMapMeta.textContent = `${facilityMapData.name || 'Facility Map'} | Canvas ${width}x${height} | Areas ${facilityMapData.areas.length} | Search Matches ${matchCount} | Zoom ${Math.round(facilityMapScale * 100)}% | Updated ${updated}`;
  }
}

function fitFacilityMapToViewport() {
  if (!appMapViewport || !facilityMapData) return false;

  const width = Number(facilityMapData.canvas && facilityMapData.canvas.width) || 1400;
  const height = Number(facilityMapData.canvas && facilityMapData.canvas.height) || 850;
  const availableWidth = Math.max(120, appMapViewport.clientWidth - 20);
  const availableHeight = Math.max(120, appMapViewport.clientHeight - 20);

  if (!availableWidth || !availableHeight) return false;

  const nextScale = clampMapValue(Math.min(availableWidth / width, availableHeight / height), 0.2, 2.8);
  facilityMapScale = nextScale;
  facilityMapFitMode = true;
  return true;
}

function setFacilityMapScale(nextScale) {
  facilityMapScale = clampMapValue(Number(nextScale) || 1, 0.4, 2.8);
  facilityMapFitMode = false;
  renderFacilityMap();
}

async function loadFacilityMap(mapId) {
  if (!appMapStage) return;
  try {
    const previousMapId = selectedFacilityMapId;
    const requestedId = normalizeMapRecordId(mapId || selectedFacilityMapId || activeFacilityMapId);
    const query = requestedId ? ('?mapId=' + encodeURIComponent(requestedId)) : '';
    const res = await fetch('/api/map' + query, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load map');
    const data = await res.json();
    facilityMapData = sanitizeFacilityMapResponse(data);
    selectedFacilityMapId = facilityMapData.id || requestedId || selectedFacilityMapId;
    if (selectedFacilityMapId && selectedFacilityMapId !== previousMapId) {
      facilityMapFitMode = true;
      selectedFacilityAreaId = null;
    }
    renderFacilityMapSelector();
    if (!getSelectedFacilityArea()) selectedFacilityAreaId = null;
    if (facilityMapFitMode) fitFacilityMapToViewport();
    renderFacilityMap();
    if (facilityMapFitMode) {
      requestAnimationFrame(() => {
        if (fitFacilityMapToViewport()) renderFacilityMap();
      });
    }
  } catch (err) {
    console.error('loadFacilityMap', err);
    if (appMapMeta) appMapMeta.textContent = 'Map unavailable';
    if (appMapDetails) appMapDetails.innerHTML = '<h3>Map unavailable</h3><p>Could not load facilities map right now.</p>';
  }
}

function runFacilityMapSearch() {
  facilityMapSearchQuery = String((appMapSearchInput && appMapSearchInput.value) || '').trim().toLowerCase();
  if (!facilityMapData || !Array.isArray(facilityMapData.areas)) {
    renderFacilityMap();
    return;
  }

  if (!facilityMapSearchQuery) {
    renderFacilityMap();
    return;
  }

  const firstMatch = facilityMapData.areas.find(area => areaMatchesSearch(area, facilityMapSearchQuery));
  if (firstMatch) selectedFacilityAreaId = firstMatch.id;
  renderFacilityMap();
}

function clearFacilityMapSearch() {
  facilityMapSearchQuery = '';
  if (appMapSearchInput) appMapSearchInput.value = '';
  renderFacilityMap();
}

if (appMapZoomIn) appMapZoomIn.addEventListener('click', () => setFacilityMapScale(facilityMapScale + 0.15));
if (appMapZoomOut) appMapZoomOut.addEventListener('click', () => setFacilityMapScale(facilityMapScale - 0.15));
if (appMapZoomReset) appMapZoomReset.addEventListener('click', () => {
  if (fitFacilityMapToViewport()) renderFacilityMap();
});
if (appMapRefresh) appMapRefresh.addEventListener('click', () => { loadFacilityMapCatalog({ preferredMapId: selectedFacilityMapId || activeFacilityMapId }).catch((err) => console.error('refresh facility map failed', err)); });
if (appMapSelect) {
  appMapSelect.addEventListener('change', () => {
    const nextId = normalizeMapRecordId(appMapSelect.value);
    if (!nextId || nextId === selectedFacilityMapId) return;
    loadFacilityMap(nextId).catch((err) => console.error('switch facility map failed', err));
  });
}
if (appMapSearchBtn) appMapSearchBtn.addEventListener('click', runFacilityMapSearch);
if (appMapSearchClear) appMapSearchClear.addEventListener('click', clearFacilityMapSearch);
if (appMapSearchInput) {
  appMapSearchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runFacilityMapSearch();
    }
  });
}
if (appMapViewport) {
  appMapViewport.addEventListener('wheel', (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const step = event.deltaY < 0 ? 0.1 : -0.1;
    setFacilityMapScale(facilityMapScale + step);
  }, { passive: false });
}

window.addEventListener('resize', () => {
  if (!facilityMapData || !document.body.classList.contains('map-layout-active')) return;
  if (!facilityMapFitMode) return;
  if (fitFacilityMapToViewport()) renderFacilityMap();
});

if (appThemeToggle) {
  appThemeToggle.addEventListener('click', () => {
    applyAppearance(document.body.classList.contains('appearance-dark') ? 'light' : 'dark');
  });
}

// Open a PDF inside the embedded iframe viewer. `name` is the original filename used for labeling/download.
function openPDF(url, name){
  const viewer = document.getElementById('pdf-viewer');
  const frame = document.getElementById('pdf-frame');
  const title = document.getElementById('pdf-title');
  if (!viewer || !frame) return window.open(url, '_blank');
  currentHandbookPdf = { url, name: name || 'Document' };
  title.textContent = name || 'Document';
  frame.src = url;
  viewer.style.display = 'block';
  showSection('handbook');
}

async function exitFullscreenIfActive(){
  const doc = document;
  const activeFs = doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;
  if (!activeFs) return;
  const exitFn = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
  if (!exitFn) return;
  try {
    const result = exitFn.call(doc);
    if (result && typeof result.then === 'function') await result;
  } catch (err) {
    console.error('exit fullscreen failed', err);
  }
}

async function closePdfViewer(){
  await exitFullscreenIfActive();
  const viewer = document.getElementById('pdf-viewer');
  const frame = document.getElementById('pdf-frame');
  if (viewer) viewer.style.display = 'none';
  if (frame) frame.src = 'about:blank';
  currentHandbookPdf = null;
}

function openPdfInNewTab(){
  if (!currentHandbookPdf || !currentHandbookPdf.url) return;
  window.open(currentHandbookPdf.url, '_blank', 'noopener');
}

async function openPdfFullscreen(){
  const viewer = document.getElementById('pdf-viewer');
  if (!viewer) return;
  try {
    const fn = viewer.requestFullscreen || viewer.webkitRequestFullscreen || viewer.msRequestFullscreen;
    if (fn) {
      const result = fn.call(viewer);
      if (result && typeof result.then === 'function') await result;
      return;
    }
  } catch (err) {
    console.error('fullscreen failed', err);
  }
  // Fallback when Fullscreen API is unavailable.
  openPdfInNewTab();
}

// Close viewer
document.addEventListener('click', (e)=>{
  if (e.target && e.target.id === 'pdf-close'){
    closePdfViewer();
    return;
  }

  if (e.target && e.target.id === 'pdf-open-new'){
    openPdfInNewTab();
    return;
  }

  if (e.target && e.target.id === 'pdf-fullscreen'){
    openPdfFullscreen();
  }
});

// --- Ticket creation form -----------------------------------------------------
if (ticketForm){
  ticketForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fd = new FormData(ticketForm);
    const payload = { title: fd.get('title'), description: fd.get('description'), requester: fd.get('requester') };
    // ticket creation is public; include token header if present
    await fetch('/api/tickets', { method:'POST', headers: Object.assign({ 'Content-Type':'application/json' }, authHeaders()), body: JSON.stringify(payload) });
    ticketForm.reset();
    await loadTickets();
  });
}

// Delegated click handler for ticket buttons (toggle status)
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  try{
    const resp = await fetch(`/api/tickets/${id}`);
    const t = await resp.json();
    const newStatus = t.status === 'open' ? 'closed' : 'open';
    // updating tickets requires auth (admin). Include auth header.
    await fetch(`/api/tickets/${id}`, { method:'PUT', headers: Object.assign({ 'Content-Type':'application/json' }, authHeaders()), body: JSON.stringify({ status: newStatus }) });
    await loadTickets();
  }catch(err){ console.error('toggle ticket', err); }
});

// Load AD users (if AD configured on server) and render into the sidebar.
async function loadADUsers(q){
  const el = document.getElementById('ad-users-list');
  if (!el) return;
  try{
    const url = '/api/ad/users' + (q ? ('?q=' + encodeURIComponent(q)) : '');
    const res = await fetch(url);
    if (!res.ok) { el.innerHTML = ''; return; }
    const list = await res.json();
    el.innerHTML = '';
    if (!list || list.length === 0) { el.innerHTML = '<div style="color:var(--muted)">No users found</div>'; return; }
    for (const u of list.slice(0,50)){
      const d = document.createElement('div');
      d.style.padding = '6px 4px';
      d.style.cursor = 'pointer';
      d.title = u.email || u.username;
      d.textContent = u.displayName || u.username;
      d.addEventListener('click', ()=>{ if (chatUser) chatUser.value = u.displayName || u.username; });
      el.appendChild(d);
    }
  }catch(e){ console.error('loadADUsers', e); }
}

// Admin sign-in is handled on `/admin.html`. No public login/register UI in the app.

// --- Initial load -------------------------------------------------------------
loadTickets();
loadHandbookDepartments().then(loadHandbook);
loadFacilityMapCatalog().catch((err) => console.error('initial facility map load failed', err));
loadADUsers();
connectSocket();
