// Server entrypoint for the Mack chat + ticket app.
// - Serves static frontend from `public/`
// - Provides a small REST API for tickets under `/api/tickets`
// - Exposes a Socket.IO websocket for realtime chat events
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ad = require('./ad');
const multer = require('multer');

// Secret for signing JWTs. In production use a secure env var.
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const JWT_EXPIRES_IN = '12h';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Ensure a top-level `data/` directory exists for the SQLite file.
// This directory is mounted by `docker-compose.yml` so the DB persists.
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// JSON body parsing for REST endpoints and serve static frontend files.
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS middleware: allow requests from other origins (including file:// during local testing)
// This is intentionally permissive for local/self-hosted use; tighten in production if needed.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization,Origin,X-Requested-With,Content-Type,Accept');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Request logging for debug: print simple method/path for all requests
app.use((req, res, next) => {
  try {
    console.log(new Date().toISOString(), req.method, req.path, '-', req.headers.host || 'no-host');
  } catch (e) {}
  next();
});

// Simple ping/debug endpoint to verify server reachability
app.get('/__ping', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), path: req.path, host: req.headers.host });
});

// Serve the "PDF handbook" folder at a friendly route `/pdf-handbook`.
// The folder name includes a space on disk (`public/PDF handbook`) but we
// expose it with a hyphen route to keep URLs clean.
const PDF_HANDBOOK_DIR = path.join(__dirname, 'public', 'PDF handbook');
if (!fs.existsSync(PDF_HANDBOOK_DIR)) fs.mkdirSync(PDF_HANDBOOK_DIR, { recursive: true });
app.use('/pdf-handbook', express.static(PDF_HANDBOOK_DIR));

// Announcements JSON path (publicly served as /announcements.json)
const ANNOUNCEMENTS_PATH = path.join(__dirname, 'public', 'announcements.json');
// Ensure announcements.json exists
if (!fs.existsSync(ANNOUNCEMENTS_PATH)) {
  try { fs.writeFileSync(ANNOUNCEMENTS_PATH, '[]', 'utf8'); } catch (e) { console.error('failed to create announcements.json', e); }
}

// Directory to store uploaded announcement files/images
const ANNOUNCEMENTS_FILES_DIR = path.join(__dirname, 'public', 'announcements_files');
if (!fs.existsSync(ANNOUNCEMENTS_FILES_DIR)) fs.mkdirSync(ANNOUNCEMENTS_FILES_DIR, { recursive: true });
app.use('/announcements-files', express.static(ANNOUNCEMENTS_FILES_DIR));

// Multer storage for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ANNOUNCEMENTS_FILES_DIR),
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'upload').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
    cb(null, `${Date.now()}_${safe}`);
  }
});
const upload = multer({ storage });

// --- Realtime chat (Socket.IO) ---
// When a client connects we listen for `chat message` events and
// broadcast them to all connected clients. Messages are not persisted
// in this minimal implementation (you could add DB persistence later).
// Authenticate sockets using a token in `socket.handshake.auth.token`.
io.use((socket, next) => {
  (async () => {
    try {
      // Prefer token if provided in the socket auth payload
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (token) {
        try {
          const payload = jwt.verify(token, JWT_SECRET);
          const user = await db.getUserById(payload.id);
          if (user) socket.user = { id: user.id, username: user.username };
          return next();
        } catch (e) {
          // token invalid -> fall through to header-based SSO
        }
      }

      // Check headers that a reverse-proxy might forward
      const headers = socket.handshake.headers || {};
      const headerNames = ['x-remote-user', 'remote-user', 'x-forwarded-user', 'remote_user'];
      for (const h of headerNames) {
        const v = headers[h];
        if (!v) continue;
        let sam = String(v);
        if (sam.includes('\\')) sam = sam.split('\\').pop();
        if (sam.includes('@')) sam = sam.split('@')[0];
        try {
          let user = await db.getUserByUsername(sam);
          if (!user && ad && ad.configured()) {
            const adInfo = await ad.lookupUserBySamAccountName(sam);
            const display_name = (adInfo && adInfo.displayName) || sam;
            const id = await db.createUser({ username: sam, password_hash: null, display_name, external: 1 });
            user = await db.getUserById(id);
          }
          if (user) socket.user = { id: user.id, username: user.username };
          return next();
        } catch (e) {
          console.error('socket SSO failure', e && e.message ? e.message : e);
          return next();
        }
      }

      return next();
    } catch (err) {
      return next();
    }
  })();
});

io.on('connection', (socket) => {
  console.log('socket connected', socket.id, socket.user ? socket.user.username : 'anon');

  // Receive a chat message from one client and broadcast it to all.
  // If the socket is authenticated, use server-side username instead of trusting client-provided user.
  socket.on('chat message', (msg) => {
    const message = {
      id: Date.now(),
      text: msg.text || '',
      user: (socket.user && socket.user.username) || (msg.user || 'Anonymous'),
      ts: new Date().toISOString(),
    };
    io.emit('chat message', message);
  });
});

// Ticket API
// --- Tickets REST API ---
// GET /api/tickets     -> list tickets
// GET /api/tickets/:id -> fetch a ticket
// POST /api/tickets    -> create ticket (JSON: title, description, requester)
// PUT /api/tickets/:id -> update ticket fields (title, description, requester, status)

app.get('/api/tickets', async (req, res) => {
  try {
    const tickets = await db.allTickets();
    res.json(tickets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to fetch tickets' });
  }
});

// --- Authentication API ---
// Simple JWT-based auth. For intranet/AD integration you can add an LDAP/AD verifier
// that either creates local users or issues tokens based on AD credentials.

// Helper middleware to verify JWT in `Authorization: Bearer <token>` header.
async function resolveUserFromRequest(req) {
  // 1) Try JWT token
  try {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      const token = auth.slice(7);
      const payload = jwt.verify(token, JWT_SECRET);
      const user = await db.getUserById(payload.id);
      if (user) return user;
    }
  } catch (err) {
    // ignore token errors and fall through to header-based SSO
  }

  // 2) Try header-based SSO (set by reverse-proxy or environment). Accepts headers like
  // `x-remote-user` or `remote-user` with values like `DOMAIN\\user` or `user@domain`.
  const hdrs = ['x-remote-user', 'remote-user', 'x-forwarded-user', 'remote_user'];
  for (const h of hdrs) {
    const v = req.headers[h];
    if (!v) continue;
    let sam = String(v);
    // strip DOMAIN\ prefix or @domain suffix
    if (sam.includes('\\')) sam = sam.split('\\').pop();
    if (sam.includes('@')) sam = sam.split('@')[0];

    // If AD is configured, try to look up displayName/email
    let adInfo = null;
    if (ad && typeof ad.lookupUserBySamAccountName === 'function' && ad.configured()) {
      try {
        adInfo = await ad.lookupUserBySamAccountName(sam);
      } catch (e) {
        console.error('AD lookup failed', e && e.message ? e.message : e);
      }
    }

    // Ensure a local user record exists (create if missing). Mark as external (AD).
    try {
      let user = await db.getUserByUsername(sam);
      if (!user) {
        const display_name = (adInfo && adInfo.displayName) || sam;
        const id = await db.createUser({ username: sam, password_hash: null, display_name, external: 1 });
        user = await db.getUserById(id);
      }
      return user;
    } catch (e) {
      console.error('Failed to resolve/create local user for SSO', e && e.message ? e.message : e);
      return null;
    }
  }

  return null;
}

// Middleware that requires either a valid JWT or a header-based SSO user.
async function authMiddleware(req, res, next) {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'missing token or SSO header' });
    req.user = { id: user.id, username: user.username, display_name: user.display_name };
    next();
  } catch (err) {
    console.error('authMiddleware', err);
    return res.status(401).json({ error: 'authentication failed' });
  }
}

// Register a new user (username, password, display_name)
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, display_name } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const existing = await db.getUserByUsername(username);
    if (existing) return res.status(409).json({ error: 'username taken' });
    const hash = await bcrypt.hash(password, 10);
    const id = await db.createUser({ username, password_hash: hash, display_name });
    const user = await db.getUserById(id);
    res.status(201).json(user);
  } catch (err) {
    console.error('register', err);
    res.status(500).json({ error: 'registration failed' });
  }
});

// Login and receive a JWT
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const user = await db.getUserByUsername(username);
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name } });
  } catch (err) {
    console.error('login', err);
    res.status(500).json({ error: 'login failed' });
  }
});

// Return the current user based on token
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'failed' });
  }
});

// Protect ticket creation and updates: require auth
// Public ticket creation: allow unauthenticated users to create tickets.
app.post('/api/tickets', async (req, res) => {
  try {
    const { title, description, requester } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    // Try to resolve an authenticated user (optional). If present, override requester.
    let resolved = null;
    try { resolved = await resolveUserFromRequest(req); } catch (e) { /* ignore */ }

    const who = (resolved && resolved.username) || requester || 'Anonymous';
    // Attempt to capture computer name and location from headers forwarded by proxy/agent
    const hdr = req.headers || {};
    const computer = hdr['x-computer-name'] || hdr['x-client-host'] || hdr['x-forwarded-for-host'] || hdr['x-device'] || null;
    const location = hdr['x-location'] || hdr['x-site'] || hdr['x-building'] || null;
    const id = await db.createTicket({ title, description: description || '', requester: who, computer, location });
    const ticket = await db.getTicket(id);
    // Record creation event
    try { await db.createTicketEvent({ ticket_id: id, type: 'created', actor: who, message: 'Ticket created' }); } catch (e) {}
      // Notify connected clients about the new ticket
      try { io.emit('ticket.created', ticket); } catch (e) { console.error('emit ticket.created', e); }
    res.status(201).json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to create ticket' });
  }
});

app.put('/api/tickets/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const fields = req.body;
    await db.updateTicket(id, fields);
    const ticket = await db.getTicket(id);
    // record an event for status change or updates
    try {
      const actor = req.user && req.user.username;
      await db.createTicketEvent({ ticket_id: id, type: 'updated', actor, message: JSON.stringify(fields) });
    } catch (e) {}
      // notify clients that a ticket changed
      try { io.emit('ticket.updated', ticket); } catch (e) { console.error('emit ticket.updated', e); }
    res.json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to update ticket' });
  }
});

app.get('/api/tickets/:id', async (req, res) => {
  try {
    const ticket = await db.getTicket(Number(req.params.id));
    if (!ticket) return res.status(404).json({ error: 'not found' });
    res.json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to fetch ticket' });
  }
});

// Ticket events (admin only)
app.get('/api/tickets/:id/events', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const events = await db.getTicketEvents(id);
    res.json(events);
  } catch (err) {
    console.error('events', err);
    res.status(500).json({ error: 'failed to fetch events' });
  }
});

// Admin can post internal notes/events
app.post('/api/tickets/:id/events', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { message, type } = req.body;
    const actor = req.user && req.user.username;
    const evId = await db.createTicketEvent({ ticket_id: id, type: type || 'note', actor, message });
    res.status(201).json({ id: evId });
  } catch (err) {
    console.error('post event', err);
    res.status(500).json({ error: 'failed to post event' });
  }
});

// --- Handbook files listing ---
// Returns a list of PDFs that live under `public/PDF handbook/`.
// The frontend uses this to render links; files are served from `/pdf-handbook/<name>`.
app.get('/api/handbook', (req, res) => {
  try {
    const hbDir = PDF_HANDBOOK_DIR;
    if (!fs.existsSync(hbDir)) return res.json([]);
    const files = fs.readdirSync(hbDir).filter(f => f.match(/\.pdf$/i));
    const list = files.map(name => ({ name, url: `/pdf-handbook/${encodeURIComponent(name)}` }));
    res.json(list);
  } catch (err) {
    console.error('handbook list', err);
    res.status(500).json({ error: 'failed to list handbook' });
  }
});

// Return list of users (admin only)
app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const users = await db.allUsers();
    res.json(users);
  } catch (err) {
    console.error('users', err);
    res.status(500).json({ error: 'failed to list users' });
  }
});

// Publicly expose AD user search if AD is configured. Returns array of { username, displayName, email }
app.get('/api/ad/users', async (req, res) => {
  try {
    if (!ad || !ad.configured || !ad.configured()) return res.status(404).json([]);
    const q = String(req.query.q || '').trim();
    // limit to 50 results by default
    const users = await ad.searchUsers(q, 50);
    res.json(users);
  } catch (err) {
    console.error('ad users', err && err.message ? err.message : err);
    res.status(500).json({ error: 'failed to search ad users' });
  }
});

// POST /api/announcements - authenticated users (admins) can create an announcement
// Body: { title, body (HTML allowed), date (optional), image (optional url) }
app.post('/api/announcements', authMiddleware, (req, res) => {
  try {
    const { title, body, date, image } = req.body || {};
    // Only the 'admin' user may post announcements from this portal by default.
    if (!req.user || req.user.username !== 'admin') return res.status(403).json({ error: 'forbidden' });
    if (!title || !body) return res.status(400).json({ error: 'title and body are required' });
    // Read existing announcements
    let arr = [];
    try {
      const raw = fs.readFileSync(ANNOUNCEMENTS_PATH, 'utf8');
      arr = JSON.parse(raw || '[]');
    } catch (e) { arr = []; }

    const ann = {
      id: Date.now(),
      title: String(title).trim(),
      body: String(body),
      date: (date && String(date)) || new Date().toISOString().slice(0,10),
      image: image ? String(image).trim() : undefined,
      author: req.user && req.user.username,
      hidden: false
    };

    // Prepend new announcement so newest appears first
    arr.unshift(ann);
    fs.writeFileSync(ANNOUNCEMENTS_PATH, JSON.stringify(arr, null, 2), 'utf8');

    // Optionally emit a socket event so clients can refresh automatically
    try { io.emit('announcement.created', ann); } catch (e) { }

    res.status(201).json({ ok: true, announcement: ann });
  } catch (err) {
    console.error('post announcement failed', err);
    res.status(500).json({ error: 'failed to publish announcement' });
  }
});

// Return announcements (admin only for management UI)
app.get('/api/announcements', authMiddleware, (req, res) => {
  try {
    const raw = fs.readFileSync(ANNOUNCEMENTS_PATH, 'utf8');
    let arr = JSON.parse(raw || '[]');
    let mutated = false;
    arr = arr.map((ann, idx) => {
      if (!ann || typeof ann !== 'object') return ann;
      if (typeof ann.id === 'undefined' || ann.id === null || ann.id === '') {
        const newId = Date.now() + idx + Math.floor(Math.random() * 1000);
        ann.id = newId;
        mutated = true;
      }
      return ann;
    });
    if (mutated) {
      try { fs.writeFileSync(ANNOUNCEMENTS_PATH, JSON.stringify(arr, null, 2), 'utf8'); }
      catch (e) { console.error('Failed to persist announcement ids', e); }
    }
    res.json(arr);
  } catch (e) {
    console.error('failed to read announcements', e);
    res.status(500).json({ error: 'failed to read announcements' });
  }
});

// Delete an announcement by id
app.delete('/api/announcements/:id', authMiddleware, (req, res) => {
  try {
    const idParam = String(req.params.id);
    let arr = [];
    try { arr = JSON.parse(fs.readFileSync(ANNOUNCEMENTS_PATH, 'utf8') || '[]'); } catch(e){ arr = []; }
    const normalizeId = (val) => {
      if (val === null || typeof val === 'undefined') return null;
      const str = String(val);
      if (str && str.trim() !== '' && !Number.isNaN(Number(str))) return String(Number(str));
      return str;
    };
    const targetId = normalizeId(idParam);
    const idx = arr.findIndex(a => normalizeId(a.id) === targetId);
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    const [removed] = arr.splice(idx, 1);
    fs.writeFileSync(ANNOUNCEMENTS_PATH, JSON.stringify(arr, null, 2), 'utf8');
    try { io.emit('announcement.deleted', { id: removed && removed.id }); } catch(e){}
    res.json({ ok: true, removed });
  } catch (err) {
    console.error('delete announcement', err);
    res.status(500).json({ error: 'failed to delete' });
  }
});

// Patch announcement (e.g., set hidden)
app.patch('/api/announcements/:id', authMiddleware, (req, res) => {
  try {
    const idParam = String(req.params.id);
    const patch = req.body || {};
    let arr = [];
    try { arr = JSON.parse(fs.readFileSync(ANNOUNCEMENTS_PATH, 'utf8') || '[]'); } catch(e){ arr = []; }
    const normalizeId = (val) => {
      if (val === null || typeof val === 'undefined') return null;
      const str = String(val);
      if (str && str.trim() !== '' && !Number.isNaN(Number(str))) return String(Number(str));
      return str;
    };
    const targetId = normalizeId(idParam);
    const idx = arr.findIndex(a => normalizeId(a.id) === targetId);
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    const ann = arr[idx];
    // allow only specific fields to be patched
    if (typeof patch.hidden !== 'undefined') ann.hidden = !!patch.hidden;
    if (typeof patch.title !== 'undefined') ann.title = String(patch.title);
    if (typeof patch.body !== 'undefined') ann.body = String(patch.body);
    if (typeof patch.image !== 'undefined') ann.image = patch.image ? String(patch.image) : undefined;
    arr[idx] = ann;
    fs.writeFileSync(ANNOUNCEMENTS_PATH, JSON.stringify(arr, null, 2), 'utf8');
    try { io.emit('announcement.updated', ann); } catch(e){}
    res.json({ ok: true, announcement: ann });
  } catch (err) {
    console.error('patch announcement', err);
    res.status(500).json({ error: 'failed to patch' });
  }
});

// Reorder announcements: body { order: [id1, id2, ...] }
app.patch('/api/announcements/reorder', authMiddleware, (req, res) => {
  try {
    const order = req.body && Array.isArray(req.body.order) ? req.body.order.map(x => String(x)) : null;
    if (!order) return res.status(400).json({ error: 'order array required' });
    let arr = [];
    try { arr = JSON.parse(fs.readFileSync(ANNOUNCEMENTS_PATH, 'utf8') || '[]'); } catch(e){ arr = []; }
    const map = new Map(arr.map(a => [String(a.id), a]));
    const reordered = [];
    for (const id of order) {
      if (map.has(id)) reordered.push(map.get(id));
    }
    // Append any missing items that weren't in the order list
    for (const a of arr) {
      if (!order.includes(String(a.id))) reordered.push(a);
    }
    fs.writeFileSync(ANNOUNCEMENTS_PATH, JSON.stringify(reordered, null, 2), 'utf8');
    try { io.emit('announcement.reordered', { order: reordered.map(a => a.id) }); } catch(e){}
    res.json({ ok: true, order: reordered.map(a => a.id) });
  } catch (err) {
    console.error('reorder announcements', err);
    res.status(500).json({ error: 'failed to reorder' });
  }
});

// Upload an image for announcements. Returns { url: '/announcements-files/<filename>' }
app.post('/api/announcements/upload-image', authMiddleware, upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'image required' });
    const url = `/announcements-files/${encodeURIComponent(req.file.filename)}`;
    return res.json({ ok: true, url });
  } catch (err) {
    console.error('upload image failed', err);
    return res.status(500).json({ error: 'upload failed' });
  }
});

// Bootstrap a default admin user if it doesn't exist (username: admin, password: admin)
(async () => {
  try {
    const existing = await db.getUserByUsername('admin');
    if (!existing) {
      const hash = await bcrypt.hash('admin', 10);
      const id = await db.createUser({ username: 'admin', password_hash: hash, display_name: 'Administrator' });
      console.log('Created default admin user with id', id);
    }
  } catch (e) {
    console.error('failed to bootstrap default admin user', e && e.message ? e.message : e);
  }
})();

// Serve root-level announcements portal file if someone requests it from the server root.
// This lets the file live at the workspace root while still being accessible via the app.
app.get('/announcements_portal.html', (req, res) => {
  const rootPortal = path.join(__dirname, '..', 'announcements_portal.html');
  if (fs.existsSync(rootPortal)) return res.sendFile(rootPortal);
  // Fallback: serve the public one
  return res.sendFile(path.join(__dirname, 'public', 'announcements_portal.html'));
});

// Fallback: serve `app.html` for routes under `/app` (so deep linking works),
// otherwise serve the landing `index.html`.
app.get('*', (req, res) => {
  const p = req.path || '';
  if (p.startsWith('/app')) {
    return res.sendFile(path.join(__dirname, 'public', 'app.html'));
  }
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
