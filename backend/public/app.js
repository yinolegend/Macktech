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
const TOKEN_KEY = 'mack_token';

// Socket instance (created after token is known so we can attach it in auth handshake)
let socket = null;

// Helper: attach Authorization header to fetch requests when a token exists.
function authHeaders(){
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: 'Bearer ' + token } : {};
}

// Escape any user-supplied content before injecting into innerHTML.
function escapeHtml(s) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(s).replace(/[&<>"']/g, (c) => map[c]);
}

// Connect Socket.IO, passing the token in `auth` for server verification.
function connectSocket(){
  const token = localStorage.getItem(TOKEN_KEY);
  if (typeof io !== 'function') return null;
  socket = io({ auth: { token } });
  socket.on('chat message', (m)=> addMessage(m));
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
  // update hash without scrolling
  history.replaceState(null, '', '#'+name);
  // Keep handbook clean: hide the ticket creation block and mini tickets when viewing handbook
  try{
    const createBlock = document.getElementById('create-ticket-block');
    const mini = document.getElementById('tickets-list-mini');
    if (name === 'handbook' || name === 'chat'){
      if (createBlock) createBlock.style.display = 'none';
      if (mini) mini.style.display = 'none';
      // refresh AD users when opening chat
      try{ if (name === 'chat') loadADUsers(); }catch(e){}
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
async function loadHandbook(){
  const el = document.getElementById('handbook-list');
  if (!el) return;
  try{
    const res = await fetch('/api/handbook');
    const list = await res.json();
    el.innerHTML = '';
    if (!list || list.length === 0) {
      el.innerHTML = '<div style="color:var(--muted)">No handbook PDFs found. Drop PDF files into <code>backend/public/handbook/</code>.</div>';
      return;
    }
    // Render each PDF as a clean card with Open and Download actions
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(220px, 1fr))';
    grid.style.gap = '10px';
    for (const f of list){
      const card = document.createElement('div');
      card.style.border = '1px solid #eef6ff';
      card.style.padding = '10px';
      card.style.borderRadius = '8px';
      card.style.background = 'white';
      const title = document.createElement('div');
      title.style.fontWeight = '600';
      title.style.marginBottom = '6px';
      title.textContent = /handbook/i.test(f.name) ? 'Handbook' : f.name;
      const btnOpen = document.createElement('button');
      btnOpen.textContent = 'Open';
      btnOpen.className = 'btn primary';
      btnOpen.style.marginRight = '8px';
      btnOpen.addEventListener('click', ()=> openPDF(f.url, f.name));
      card.appendChild(title);
      const meta = document.createElement('div'); meta.className = 'small'; meta.style.marginBottom = '8px'; meta.textContent = f.name;
      card.appendChild(meta);
      const actions = document.createElement('div');
      actions.appendChild(btnOpen);
      card.appendChild(actions);
      grid.appendChild(card);
    }
    el.appendChild(grid);
  }catch(err){ console.error('loadHandbook', err); }
}

// Open a PDF inside the embedded iframe viewer. `name` is the original filename used for labeling/download.
function openPDF(url, name){
  const viewer = document.getElementById('pdf-viewer');
  const frame = document.getElementById('pdf-frame');
  const title = document.getElementById('pdf-title');
  if (!viewer || !frame) return window.open(url, '_blank');
  title.textContent = name || 'Document';
  frame.src = url;
  viewer.style.display = 'block';
  showSection('handbook');
}

// Close viewer
document.addEventListener('click', (e)=>{
  if (e.target && e.target.id === 'pdf-close'){
    const viewer = document.getElementById('pdf-viewer');
    const frame = document.getElementById('pdf-frame');
    if (viewer) viewer.style.display = 'none';
    if (frame) frame.src = 'about:blank';
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
loadHandbook();
loadADUsers();
connectSocket();
