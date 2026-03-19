const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { PORT, HOST, JWT_SECRET, JWT_EXPIRES_IN, SESSION_MAX_AGE_MS } = require('../config/app');
const paths = require('../config/paths');
const db = require('./database');
const ad = require('./auth/directory');
const { createSocketAuthMiddleware } = require('./auth/socketAuth');
const { bootstrapDefaultAdmin } = require('./utils/bootstrapAdmin');
const { initializeWorkspaceStructure } = require('./utils/startup');

const registerRoutes = require('../api/routes');
const { createAuthHelpers } = require('../api/middleware/auth');
const { createAuthController } = require('../api/controllers/authController');
const { createTicketController } = require('../api/controllers/ticketController');
const { createHandbookController } = require('../api/controllers/handbookController');
const { createMapController } = require('../api/controllers/mapController');
const { createUserController } = require('../api/controllers/userController');
const { createAnnouncementController } = require('../api/controllers/announcementController');
const { createPageController } = require('../api/controllers/pageController');
const { createHazmatController } = require('../api/controllers/hazmatController');
const { createCommandCenterController } = require('../api/controllers/commandCenterController');
const { createAdminConsoleController } = require('../api/controllers/adminConsoleController');
const { createCasService } = require('./services/casService');
const { hazmatDb, gagesDb, debugDb, syncPortalModels } = require('../models');

let PDFDocument = null;
let SVGtoPDF = null;

try {
  PDFDocument = require('pdfkit');
  SVGtoPDF = require('svg-to-pdfkit');
} catch (error) {
  console.warn('map export dependencies unavailable', error && error.message ? error.message : error);
}

function createServerApp() {
  initializeWorkspaceStructure();

  const handbookService = require('./services/handbookService');
  const mapService = require('./services/mapService');
  const announcementsService = require('./services/announcementsService');
  const {
    announcementUpload,
    mapAssetUpload,
    handbookUpload,
    calibrationAttachmentUpload,
    hazmatSdsUpload,
    hazmatImageUpload,
  } = require('./services/uploadService');

  announcementsService.cleanupUnusedAnnouncementFiles();

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  const casMasterLookupEnabled = String(process.env.CAS_MASTER_LOOKUP || 'true').trim().toLowerCase() !== 'false';
  const casRemoteLookupEnabled = String(process.env.CAS_REMOTE_LOOKUP || 'true').trim().toLowerCase() !== 'false';
  const casRemoteTimeoutMs = Number.parseInt(process.env.CAS_REMOTE_TIMEOUT_MS || '8000', 10);
  const casSnapshotPaths = [paths.CAS_INDEX_PATH];
  if (casMasterLookupEnabled) {
    casSnapshotPaths.push(paths.CAS_INDEX_MASTER_PATH);
  }
  casSnapshotPaths.push(paths.CAS_INDEX_EXTENDED_PATH);
  const casService = createCasService({
    snapshotPaths: casSnapshotPaths,
    writeThroughPath: paths.CAS_INDEX_EXTENDED_PATH,
    allowRemoteLookup: casRemoteLookupEnabled,
    remoteLookupTimeoutMs: Number.isFinite(casRemoteTimeoutMs) ? casRemoteTimeoutMs : 8000,
    logger: console,
  });
  casService.loadSnapshot();

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(session({
    name: 'command_center_session',
    secret: JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: SESSION_MAX_AGE_MS,
    },
  }));

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Authorization,Origin,X-Requested-With,Content-Type,Accept');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    return next();
  });

  app.use((req, res, next) => {
    try {
      console.log(new Date().toISOString(), req.method, req.path, '-', req.headers.host || 'no-host');
    } catch (error) {
    }
    return next();
  });

  app.use((req, res, next) => {
    if (/\.html?$/i.test(String(req.path || ''))) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    return next();
  });

  // Serve the service worker with no-cache so browsers always fetch the latest version.
  // Service-Worker-Allowed: / grants it scope over the entire origin.
  app.get('/sw.js', (req, res) => {
    res.set({
      'Content-Type': 'application/javascript',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.sendFile(require('path').join(paths.FRONTEND_PAGES_DIR, 'sw.js'));
  });

  // Serve the PWA manifest with the correct MIME type.
  app.get('/manifest.webmanifest', (req, res) => {
    res.set('Content-Type', 'application/manifest+json');
    res.sendFile(require('path').join(paths.FRONTEND_PAGES_DIR, 'manifest.webmanifest'));
  });

  app.use(express.static(paths.FRONTEND_PAGES_DIR));
  app.use(express.static(paths.FRONTEND_SCRIPTS_DIR));
  app.use(express.static(paths.FRONTEND_ASSETS_DIR));
  app.use('/components', express.static(paths.FRONTEND_COMPONENTS_DIR));
  app.use('/css', express.static(paths.FRONTEND_STYLES_DIR));
  app.use('/styles', express.static(paths.FRONTEND_STYLES_DIR));
  app.use('/scripts', express.static(paths.FRONTEND_SCRIPTS_DIR));
  app.use('/assets', express.static(paths.FRONTEND_ASSETS_DIR));
  app.use('/public/css', express.static(paths.FRONTEND_STYLES_DIR));
  // Keep legacy /public/js route for existing app pages that still load local scripts from this path.
  app.use('/public/js', express.static(paths.LEGACY_PUBLIC_JS_DIR));
  app.use('/public/sds', express.static(paths.SDS_UPLOADS_DIR));
  app.use('/public/certs', express.static(paths.CERT_UPLOADS_DIR));
  app.use('/assets/icons', express.static(paths.FRONTEND_ICONS_DIR));
  app.use('/icons', express.static(paths.FRONTEND_ICONS_DIR));
  app.use('/uploads', express.static(paths.UPLOADS_DIR));
  app.use('/pdf-handbook', express.static(handbookService.HANDBOOK_DIR));
  app.use('/announcements-files', express.static(paths.ANNOUNCEMENT_FILES_DIR));
  app.use('/map-assets', express.static(paths.MAP_ASSETS_DIR));
  app.use('/calibration-attachments', express.static(paths.CALIBRATION_ATTACHMENTS_DIR));

  const { resolveUserFromRequest, authMiddleware, requireRole, requirePermission, requireAnyModule } = createAuthHelpers({
    db,
    ad,
    jwt,
    jwtSecret: JWT_SECRET,
  });

  io.use(createSocketAuthMiddleware({
    db,
    ad,
    jwt,
    jwtSecret: JWT_SECRET,
  }));

  io.on('connection', (socket) => {
    console.log('socket connected', socket.id, socket.user ? socket.user.username : 'anon');
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

  const controllers = {
    authController: createAuthController({
      db,
      bcrypt,
      jwt,
      jwtSecret: JWT_SECRET,
      jwtExpiresIn: JWT_EXPIRES_IN,
    }),
    ticketController: createTicketController({
      db,
      io,
      resolveUserFromRequest,
    }),
    handbookController: createHandbookController({
      handbookService,
      resolveUserFromRequest,
      handbookUpload,
    }),
    mapController: createMapController({
      mapService,
      io,
      mapAssetUpload,
      PDFDocument,
      SVGtoPDF,
    }),
    userController: createUserController({
      db,
      ad,
    }),
    announcementController: createAnnouncementController({
      announcementsService,
      io,
      announcementUpload,
    }),
    pageController: createPageController({ paths }),
    hazmatController: createHazmatController({
      Material: hazmatDb.Material,
      UsageLog: hazmatDb.UsageLog,
      sequelize: hazmatDb.sequelize,
      paths,
      hazmatSdsUpload,
      hazmatImageUpload,
    }),
    commandCenterController: createCommandCenterController({
      hazmatDb,
      gagesDb,
      debugDb,
      paths,
      calibrationAttachmentUpload,
      casService,
    }),
    adminConsoleController: createAdminConsoleController({
      db,
      bcrypt,
      paths,
      hazmatDb,
      gagesDb,
    }),
  };

  registerRoutes(app, controllers, authMiddleware, requireRole, requirePermission, requireAnyModule);

  return {
    app,
    server,
    io,
  };
}

async function startServer(port = PORT) {
  await db.ready;
  const runtime = createServerApp();
  await syncPortalModels();
  await bootstrapDefaultAdmin({ db, bcrypt }).catch(() => null);
  await new Promise((resolve) => {
    runtime.server.listen(port, HOST, () => {
      console.log(`Server listening on http://${HOST}:${port}`);
      resolve();
    });
  });
  return runtime;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('failed to start server', error && error.message ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  createServerApp,
  startServer,
};
