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
let PDFDocument = null;
let SVGtoPDF = null;

try {
  PDFDocument = require('pdfkit');
  SVGtoPDF = require('svg-to-pdfkit');
} catch (err) {
  console.warn('map export dependencies unavailable', err && err.message ? err.message : err);
}

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
const ICON_LIBRARY_DIR = path.join(__dirname, 'public', 'icons');
if (!fs.existsSync(ICON_LIBRARY_DIR)) fs.mkdirSync(ICON_LIBRARY_DIR, { recursive: true });
const HANDBOOK_VISIBILITY_PATH = path.join(DATA_DIR, 'handbook_visibility.json');
const HANDBOOK_METADATA_PATH = path.join(DATA_DIR, 'handbook_metadata.json');
const FACILITY_MAP_PATH = path.join(DATA_DIR, 'facility_map.json');
const FACILITY_MAP_STORE_PATH = path.join(DATA_DIR, 'facility_maps.json');
const DEFAULT_FACILITY_MAP_RECORD_ID = 'main_facility';
const MAX_FACILITY_MAPS = 40;
const HANDBOOK_DEPARTMENTS = [
  { id: 'hr', label: 'HR' },
  { id: 'it', label: 'IT' },
  { id: 'operations', label: 'Operations' },
  { id: 'finance', label: 'Finance' },
  { id: 'quality', label: 'Quality' },
  { id: 'safety', label: 'Safety' },
];
const DEFAULT_HANDBOOK_DEPARTMENT = 'hr';
const FACILITY_AREA_KINDS = ['department', 'hallway', 'room', 'table', 'wall', 'sign', 'text', 'service', 'common', 'other'];
const FACILITY_AREA_SHAPES = ['rect', 'rounded', 'circle', 'diamond', 'hex', 'pill', 'note', 'line', 'arrow'];
const FACILITY_DEPARTMENT_TYPES = ['administration', 'operations', 'it', 'hr', 'finance', 'quality', 'safety', 'support', 'other'];
const FACILITY_DEPARTMENT_COLORS = {
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
const DEFAULT_FACILITY_MAP = {
  canvas: {
    width: 1400,
    height: 850,
  },
  backgroundUrl: '',
  areas: [
    {
      id: 'administration_office',
      name: 'Administration',
      description: 'Main office for administrative support and records.',
      icon: 'A',
      kind: 'department',
      shape: 'rect',
      departmentType: 'administration',
      color: '#3f51b5',
      x: 110,
      y: 120,
      width: 250,
      height: 150,
      z: 1,
    },
    {
      id: 'main_hallway',
      name: 'Main Hallway',
      description: 'Main corridor connecting all departments.',
      icon: '',
      kind: 'hallway',
      shape: 'rect',
      departmentType: 'other',
      color: '#b0bec5',
      x: 60,
      y: 330,
      width: 1180,
      height: 85,
      z: 0,
    },
    {
      id: 'it_support',
      name: 'IT Support',
      description: 'Service desk, workstation support, and troubleshooting.',
      icon: 'IT',
      kind: 'department',
      shape: 'rect',
      departmentType: 'it',
      color: '#009688',
      x: 430,
      y: 145,
      width: 260,
      height: 150,
      z: 1,
    },
    {
      id: 'operations_floor',
      name: 'Operations',
      description: 'Operations planning and execution team workspace.',
      icon: 'OPS',
      kind: 'department',
      shape: 'rect',
      departmentType: 'operations',
      color: '#f57c00',
      x: 760,
      y: 145,
      width: 290,
      height: 150,
      z: 1,
    },
  ],
  updatedAt: null,
  updatedBy: null,
};

function cloneDefaultFacilityMap() {
  return JSON.parse(JSON.stringify(DEFAULT_FACILITY_MAP));
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeShortText(value, maxLen, fallback = '') {
  const raw = typeof value === 'string' ? value : '';
  const clean = raw.trim();
  if (!clean) return fallback;
  return clean.slice(0, maxLen);
}

function sanitizeMapColor(value, fallback = '#0b74ff') {
  const raw = sanitizeShortText(value, 7, fallback);
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  return fallback;
}

function normalizeAreaId(value, fallback) {
  const raw = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return raw || fallback;
}

function sanitizeAreaKind(value) {
  const raw = sanitizeShortText(value, 24, 'department').toLowerCase();
  return FACILITY_AREA_KINDS.includes(raw) ? raw : 'department';
}

function sanitizeDepartmentType(value) {
  const raw = sanitizeShortText(value, 24, 'other').toLowerCase();
  return FACILITY_DEPARTMENT_TYPES.includes(raw) ? raw : 'other';
}

function defaultDepartmentColor(departmentType) {
  return FACILITY_DEPARTMENT_COLORS[departmentType] || FACILITY_DEPARTMENT_COLORS.other;
}

function defaultAreaColor(kind, departmentType) {
  const k = String(kind || '').trim().toLowerCase();
  if (k === 'table') return '#8d6e63';
  if (k === 'wall') return '#607d8b';
  if (k === 'sign') return '#ffca28';
  if (k === 'text') return '#183153';
  return defaultDepartmentColor(departmentType);
}

function defaultAreaShape(kind) {
  const k = String(kind || '').trim().toLowerCase();
  if (k === 'wall') return 'line';
  if (k === 'table') return 'rounded';
  if (k === 'sign') return 'pill';
  if (k === 'room') return 'rounded';
  if (k === 'service') return 'rounded';
  if (k === 'common') return 'rounded';
  return 'rect';
}

function sanitizeAreaShape(value, kind) {
  const raw = sanitizeShortText(value, 16, '').toLowerCase();
  if (FACILITY_AREA_SHAPES.includes(raw)) return raw;
  return defaultAreaShape(kind);
}

function minAreaSizeForKind(kind) {
  const k = String(kind || '').trim().toLowerCase();
  if (k === 'wall') return { width: 60, height: 8 };
  if (k === 'text') return { width: 40, height: 20 };
  if (k === 'sign') return { width: 40, height: 24 };
  return { width: 20, height: 8 };
}

function isLinearArea(kind, shape) {
  return String(shape || '').trim().toLowerCase() === 'line';
}

function defaultLineWidth(kind) {
  const normalized = String(kind || '').trim().toLowerCase();
  if (normalized === 'hallway') return 44;
  if (normalized === 'wall') return 12;
  return 10;
}

function sanitizeAreaColor(value, kind, departmentType) {
  return sanitizeMapColor(value, defaultAreaColor(kind, departmentType));
}

function sanitizeAreaFillStyle(value, fallback = '') {
  const raw = sanitizeShortText(value, 24, fallback).toLowerCase();
  if (raw === 'transparent' || raw === 'outline') return 'transparent';
  return '';
}

function sanitizeAreaStrokeWidth(value, fallback = 3) {
  const numeric = Number(value);
  const source = Number.isFinite(numeric) ? numeric : Number(fallback || 3);
  const rounded = Math.round((Number.isFinite(source) ? source : 3) * 10) / 10;
  return clampNumber(rounded, 1, 140);
}

function sanitizeSvgAssetPath(value, fallback = '') {
  const raw = sanitizeShortText(value, 300, fallback).replace(/\\/g, '/');
  if (!raw) return '';
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  if (!normalized.startsWith('/icons/') || !normalized.toLowerCase().endsWith('.svg')) return fallback || '';
  return normalized;
}

function sanitizeRotation(value, fallback = 0) {
  const numeric = Number(value);
  const source = Number.isFinite(numeric) ? numeric : Number(fallback || 0);
  if (!Number.isFinite(source)) return 0;
  let rotation = Math.round(source * 10) / 10;
  rotation = ((rotation % 360) + 360) % 360;
  if (rotation > 180) rotation -= 360;
  return rotation;
}

function toDisplayLabelFromSlug(value, fallback = 'Icon') {
  const raw = String(value || '').replace(/\.svg$/i, '').replace(/[_-]+/g, ' ').trim();
  if (!raw) return fallback;
  return raw.replace(/\b\w/g, (match) => match.toUpperCase());
}

function walkSvgIconFiles(rootDir, currentDir = rootDir) {
  if (!fs.existsSync(currentDir)) return [];

  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      items.push(...walkSvgIconFiles(rootDir, fullPath));
      continue;
    }
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.svg') continue;

    const relativePath = path.relative(rootDir, fullPath).split(path.sep).join('/');
    const parts = relativePath.split('/').filter(Boolean);
    const category = toDisplayLabelFromSlug(parts.length > 1 ? parts[0] : 'general', 'General');
    const fileName = parts[parts.length - 1] || entry.name;
    const label = toDisplayLabelFromSlug(fileName, 'Icon');
    items.push({
      id: relativePath.replace(/[^a-zA-Z0-9_-]/g, '_'),
      label,
      category,
      relativePath,
      url: `/icons/${relativePath}`,
    });
  }
  return items;
}

function listLocalSvgIcons() {
  return walkSvgIconFiles(ICON_LIBRARY_DIR)
    .sort((a, b) => {
      const categoryCompare = a.category.localeCompare(b.category);
      if (categoryCompare !== 0) return categoryCompare;
      return a.label.localeCompare(b.label);
    });
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

function mapLegacyMarkerTypeToAreaKind(markerType) {
  const t = String(markerType || '').trim().toLowerCase();
  if (t === 'entry' || t === 'safety') return 'service';
  if (t === 'meeting') return 'room';
  return 'department';
}

function convertLegacyMarkerToArea(item, index, width, height, usedIds) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;

  const departmentType = mapLegacyMarkerTypeToDepartmentType(item.type);
  const kind = mapLegacyMarkerTypeToAreaKind(item.type);
  const shape = defaultAreaShape(kind);
  const defaultWidth = kind === 'room' ? 140 : 180;
  const defaultHeight = kind === 'room' ? 100 : 120;
  const mins = minAreaSizeForKind(kind);
  const areaWidth = clampNumber(defaultWidth, mins.width, width);
  const areaHeight = clampNumber(defaultHeight, mins.height, height);
  const centerX = clampNumber(Number(item.x), 0, width);
  const centerY = clampNumber(Number(item.y), 0, height);

  const baseId = normalizeAreaId(item.id, `area_${index + 1}`);
  let id = baseId;
  let suffix = 1;
  while (usedIds.has(id)) {
    id = `${baseId}_${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);

  return {
    id,
    name: sanitizeShortText(item.name, 80, `Area ${index + 1}`),
    description: sanitizeShortText(item.description, 700, ''),
    icon: '',
    kind,
    shape,
    departmentType,
    color: sanitizeAreaColor(item.color, kind, departmentType),
    x: Math.round(clampNumber(centerX - (areaWidth / 2), 0, Math.max(0, width - areaWidth)) * 10) / 10,
    y: Math.round(clampNumber(centerY - (areaHeight / 2), 0, Math.max(0, height - areaHeight)) * 10) / 10,
    width: Math.round(areaWidth * 10) / 10,
    height: Math.round(areaHeight * 10) / 10,
    z: index,
  };
}

function sanitizeFacilityMapPayload(payload, fallbackMap) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const fallback = fallbackMap && typeof fallbackMap === 'object' ? fallbackMap : cloneDefaultFacilityMap();

  const fallbackWidth = Number(fallback.canvas && fallback.canvas.width) || 1400;
  const fallbackHeight = Number(fallback.canvas && fallback.canvas.height) || 850;
  const widthRaw = Number(source.canvas && source.canvas.width);
  const heightRaw = Number(source.canvas && source.canvas.height);
  const width = clampNumber(Math.round(Number.isFinite(widthRaw) ? widthRaw : fallbackWidth), 600, 3600);
  const height = clampNumber(Math.round(Number.isFinite(heightRaw) ? heightRaw : fallbackHeight), 400, 2400);

  let backgroundUrl = sanitizeShortText(source.backgroundUrl, 300, '');
  if (backgroundUrl && !backgroundUrl.startsWith('/map-assets/')) {
    backgroundUrl = sanitizeShortText(fallback.backgroundUrl, 300, '');
  }
  if (backgroundUrl && !backgroundUrl.startsWith('/map-assets/')) {
    backgroundUrl = '';
  }

  const areaSource = Array.isArray(source.areas) ? source.areas : [];
  const usedIds = new Set();
  let areas = areaSource.slice(0, 800).map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;

    const baseId = normalizeAreaId(item.id, `area_${index + 1}`);
    let id = baseId;
    let suffix = 1;
    while (usedIds.has(id)) {
      id = `${baseId}_${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);

    const name = sanitizeShortText(item.name, 80, `Area ${index + 1}`);
    const description = sanitizeShortText(item.description, 700, '');
    const icon = sanitizeShortText(item.icon, 12, '');
    const kind = sanitizeAreaKind(item.kind);
    const shape = sanitizeAreaShape(item.shape, kind);
    const departmentType = sanitizeDepartmentType(item.departmentType || item.department_type || item.type);
    const color = sanitizeAreaColor(item.color, kind, departmentType);
    const fillStyle = sanitizeAreaFillStyle(item.fillStyle || item.fill_style, '');
    const strokeWidth = sanitizeAreaStrokeWidth(item.strokeWidth, fillStyle === 'transparent' ? 3 : 2);
    const rotation = sanitizeRotation(item.rotation, item.angle);
    const svgPath = sanitizeSvgAssetPath(item.svgPath || item.svg_path, '');

    const widthRaw = Number(item.width);
    const heightRaw = Number(item.height);
    const mins = minAreaSizeForKind(kind);
    let areaWidth = clampNumber(Math.round((Number.isFinite(widthRaw) ? widthRaw : 160) * 10) / 10, mins.width, width);
    let areaHeight = clampNumber(Math.round((Number.isFinite(heightRaw) ? heightRaw : 110) * 10) / 10, mins.height, height);

    const xRaw = Number(item.x);
    const yRaw = Number(item.y);
    let x = clampNumber(Number.isFinite(xRaw) ? xRaw : (width / 2) - (areaWidth / 2), 0, Math.max(0, width - areaWidth));
    let y = clampNumber(Number.isFinite(yRaw) ? yRaw : (height / 2) - (areaHeight / 2), 0, Math.max(0, height - areaHeight));
    const zRaw = Number(item.z);
    const z = clampNumber(Math.round(Number.isFinite(zRaw) ? zRaw : index), 0, 5000);

    const lineArea = isLinearArea(kind, shape);
    let x1;
    let y1;
    let x2;
    let y2;
    let lineWidth;

    if (lineArea) {
      lineWidth = clampNumber(
        Math.round((Number(item.lineWidth || item.line_width || item.strokeWidth || defaultLineWidth(kind)) || defaultLineWidth(kind)) * 10) / 10,
        4,
        140
      );

      const fallbackY = y + (areaHeight / 2);
      x1 = clampNumber(Number.isFinite(Number(item.x1)) ? Number(item.x1) : x, 0, width);
      y1 = clampNumber(Number.isFinite(Number(item.y1)) ? Number(item.y1) : fallbackY, 0, height);
      x2 = clampNumber(Number.isFinite(Number(item.x2)) ? Number(item.x2) : (x + areaWidth), 0, width);
      y2 = clampNumber(Number.isFinite(Number(item.y2)) ? Number(item.y2) : fallbackY, 0, height);

      if (Math.abs(x2 - x1) < 0.01 && Math.abs(y2 - y1) < 0.01) {
        x2 = clampNumber(x1 + Math.max(60, mins.width), 0, width);
      }

      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      x = left;
      y = top;
      areaWidth = Math.max(lineWidth, Math.abs(x2 - x1));
      areaHeight = Math.max(lineWidth, Math.abs(y2 - y1));
    }

    return {
      id,
      name,
      description,
      icon,
      kind,
      shape,
      departmentType,
      color,
      fillStyle,
      ...(lineArea ? {} : { strokeWidth: Math.round(strokeWidth * 10) / 10 }),
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      width: Math.round(areaWidth * 10) / 10,
      height: Math.round(areaHeight * 10) / 10,
      z,
      rotation,
      svgPath,
      ...(lineArea ? {
        x1: Math.round(x1 * 10) / 10,
        y1: Math.round(y1 * 10) / 10,
        x2: Math.round(x2 * 10) / 10,
        y2: Math.round(y2 * 10) / 10,
        lineWidth: Math.round(lineWidth * 10) / 10,
      } : {}),
    };
  }).filter(Boolean);

  // Migration path: convert old marker-based maps to area-based maps on first save/read.
  if (!areas.length && Array.isArray(source.markers) && source.markers.length) {
    areas = source.markers.slice(0, 500)
      .map((item, index) => convertLegacyMarkerToArea(item, index, width, height, usedIds))
      .filter(Boolean);
  }

  areas.sort((a, b) => (Number(a.z) || 0) - (Number(b.z) || 0));

  return {
    canvas: { width, height },
    backgroundUrl,
    areas,
    updatedAt: sanitizeShortText(source.updatedAt, 64, null),
    updatedBy: sanitizeShortText(source.updatedBy, 64, null),
  };
}

function cloneFacilityMapRecord(record) {
  return JSON.parse(JSON.stringify(record || {}));
}

function defaultFacilityMapRecord() {
  return Object.assign({
    id: DEFAULT_FACILITY_MAP_RECORD_ID,
    name: 'Main Facility Map',
    description: 'Primary facility layout',
    createdAt: null,
    createdBy: null,
  }, cloneDefaultFacilityMap());
}

function createDefaultFacilityMapStore() {
  const record = defaultFacilityMapRecord();
  return {
    version: 2,
    activeMapId: record.id,
    maps: [record],
  };
}

function normalizeFacilityMapRecordId(value, fallback) {
  return normalizeAreaId(value, fallback);
}

function sanitizeFacilityMapRecordName(value, fallback) {
  return sanitizeShortText(value, 80, fallback);
}

function sanitizeFacilityMapRecordDescription(value, fallback = '') {
  return sanitizeShortText(value, 240, fallback);
}

function normalizeFacilityMapStoreSource(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  if (Array.isArray(payload.maps)) return payload;

  if (payload.canvas || Array.isArray(payload.areas) || Array.isArray(payload.markers)) {
    return {
      activeMapId: payload.id || DEFAULT_FACILITY_MAP_RECORD_ID,
      maps: [Object.assign({
        id: payload.id || DEFAULT_FACILITY_MAP_RECORD_ID,
        name: payload.name || 'Main Facility Map',
        description: payload.description || '',
      }, payload)],
    };
  }

  return payload;
}

function sanitizeFacilityMapStore(payload, fallbackStore) {
  const fallback = fallbackStore && typeof fallbackStore === 'object' && !Array.isArray(fallbackStore)
    ? fallbackStore
    : createDefaultFacilityMapStore();
  const source = normalizeFacilityMapStoreSource(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {});
  const fallbackMaps = Array.isArray(fallback.maps) ? fallback.maps : [];
  const mapsSource = Array.isArray(source.maps) && source.maps.length
    ? source.maps
    : (fallbackMaps.length ? fallbackMaps : [defaultFacilityMapRecord()]);
  const usedIds = new Set();

  const maps = mapsSource.slice(0, MAX_FACILITY_MAPS).map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;

    const matchedFallback = fallbackMaps.find((entry) => normalizeFacilityMapRecordId(entry && entry.id, '') === normalizeFacilityMapRecordId(item.id, ''));
    const fallbackRecord = matchedFallback || fallbackMaps[index] || defaultFacilityMapRecord();
    const requestedBaseId = normalizeFacilityMapRecordId(item.id, normalizeFacilityMapRecordId(item.name, `map_${index + 1}`));
    const baseId = requestedBaseId || `map_${index + 1}`;
    let id = baseId;
    let suffix = 1;
    while (usedIds.has(id)) {
      id = `${baseId}_${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);

    const sanitizedMap = sanitizeFacilityMapPayload(item, fallbackRecord);
    return Object.assign({}, sanitizedMap, {
      id,
      name: sanitizeFacilityMapRecordName(item.name, sanitizeFacilityMapRecordName(fallbackRecord.name, `Map ${index + 1}`)),
      description: sanitizeFacilityMapRecordDescription(item.description, sanitizeFacilityMapRecordDescription(fallbackRecord.description, '')),
      createdAt: sanitizeShortText(item.createdAt || fallbackRecord.createdAt, 64, null),
      createdBy: sanitizeShortText(item.createdBy || fallbackRecord.createdBy, 64, null),
    });
  }).filter(Boolean);

  if (!maps.length) maps.push(defaultFacilityMapRecord());

  let activeMapId = normalizeFacilityMapRecordId(source.activeMapId, '');
  if (!maps.some((item) => item.id === activeMapId)) {
    const fallbackActiveId = normalizeFacilityMapRecordId(fallback.activeMapId, '');
    activeMapId = maps.some((item) => item.id === fallbackActiveId) ? fallbackActiveId : maps[0].id;
  }

  return {
    version: 2,
    activeMapId,
    maps,
  };
}

function getFacilityMapRecord(store, mapId) {
  const source = store && typeof store === 'object' && !Array.isArray(store) ? store : createDefaultFacilityMapStore();
  const maps = Array.isArray(source.maps) ? source.maps : [];
  if (!maps.length) return null;

  const requestedId = normalizeFacilityMapRecordId(mapId, '');
  if (requestedId) {
    const requested = maps.find((item) => item.id === requestedId);
    if (requested) return requested;
  }

  const active = maps.find((item) => item.id === normalizeFacilityMapRecordId(source.activeMapId, ''));
  return active || maps[0];
}

function listFacilityMapSummaries(store) {
  const source = store && typeof store === 'object' && !Array.isArray(store) ? store : createDefaultFacilityMapStore();
  const activeMapId = normalizeFacilityMapRecordId(source.activeMapId, '');
  const maps = Array.isArray(source.maps) ? source.maps : [];

  return maps.map((item) => ({
    id: item.id,
    name: sanitizeFacilityMapRecordName(item.name, 'Map'),
    description: sanitizeFacilityMapRecordDescription(item.description, ''),
    areaCount: Array.isArray(item.areas) ? item.areas.length : 0,
    canvas: {
      width: Number(item.canvas && item.canvas.width) || 1400,
      height: Number(item.canvas && item.canvas.height) || 850,
    },
    backgroundUrl: sanitizeShortText(item.backgroundUrl, 300, ''),
    updatedAt: sanitizeShortText(item.updatedAt, 64, null),
    updatedBy: sanitizeShortText(item.updatedBy, 64, null),
    isActive: item.id === activeMapId,
  }));
}

function createUniqueFacilityMapId(name, existingMaps) {
  const list = Array.isArray(existingMaps) ? existingMaps : [];
  const baseId = normalizeFacilityMapRecordId(name, `map_${Date.now()}`) || `map_${Date.now()}`;
  let id = baseId;
  let suffix = 1;
  while (list.some((item) => item && item.id === id)) {
    id = `${baseId}_${suffix}`;
    suffix += 1;
  }
  return id;
}

function writeLegacyFacilityMapSnapshot(store) {
  try {
    const record = getFacilityMapRecord(store, store && store.activeMapId);
    const snapshot = record ? sanitizeFacilityMapPayload(record, DEFAULT_FACILITY_MAP) : cloneDefaultFacilityMap();
    fs.writeFileSync(FACILITY_MAP_PATH, JSON.stringify(snapshot, null, 2), 'utf8');
  } catch (err) {
    console.error('write legacy facility map failed', err && err.message ? err.message : err);
  }
}

function readFacilityMapStore() {
  try {
    if (fs.existsSync(FACILITY_MAP_STORE_PATH)) {
      const raw = fs.readFileSync(FACILITY_MAP_STORE_PATH, 'utf8');
      return sanitizeFacilityMapStore(JSON.parse(raw || '{}'), createDefaultFacilityMapStore());
    }

    if (fs.existsSync(FACILITY_MAP_PATH)) {
      const raw = fs.readFileSync(FACILITY_MAP_PATH, 'utf8');
      const migrated = sanitizeFacilityMapStore(JSON.parse(raw || '{}'), createDefaultFacilityMapStore());
      fs.writeFileSync(FACILITY_MAP_STORE_PATH, JSON.stringify(migrated, null, 2), 'utf8');
      writeLegacyFacilityMapSnapshot(migrated);
      return migrated;
    }

    const initial = createDefaultFacilityMapStore();
    fs.writeFileSync(FACILITY_MAP_STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    writeLegacyFacilityMapSnapshot(initial);
    return initial;
  } catch (err) {
    console.error('read facility map store failed', err && err.message ? err.message : err);
    return sanitizeFacilityMapStore({}, createDefaultFacilityMapStore());
  }
}

function writeFacilityMapStore(storeData) {
  try {
    const fallback = readFacilityMapStore();
    const sanitized = sanitizeFacilityMapStore(storeData, fallback);
    fs.writeFileSync(FACILITY_MAP_STORE_PATH, JSON.stringify(sanitized, null, 2), 'utf8');
    writeLegacyFacilityMapSnapshot(sanitized);
    return sanitized;
  } catch (err) {
    console.error('write facility map store failed', err && err.message ? err.message : err);
    throw err;
  }
}

function getMapAssetMimeType(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

function resolvePublicMapAssetPath(assetUrl) {
  const raw = String(assetUrl || '').trim();
  if (!raw) return null;

  if (raw.startsWith('/map-assets/')) {
    const name = raw.slice('/map-assets/'.length);
    const filePath = path.join(MAP_ASSETS_DIR, name);
    return fs.existsSync(filePath) ? filePath : null;
  }

  if (raw.startsWith('/icons/')) {
    const relative = raw.slice('/icons/'.length).split('/').join(path.sep);
    const filePath = path.join(ICON_LIBRARY_DIR, relative);
    return fs.existsSync(filePath) ? filePath : null;
  }

  return null;
}

function readAssetAsDataUri(assetUrl) {
  try {
    const filePath = resolvePublicMapAssetPath(assetUrl);
    if (!filePath) return '';
    const mime = getMapAssetMimeType(filePath);
    const data = fs.readFileSync(filePath);
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch (err) {
    console.error('read asset as data uri failed', err && err.message ? err.message : err);
    return '';
  }
}

function readInlineSvgAsset(assetUrl) {
  try {
    const filePath = resolvePublicMapAssetPath(assetUrl);
    if (!filePath || path.extname(filePath).toLowerCase() !== '.svg') return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const svgMatch = raw.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
    if (!svgMatch) return null;

    const openTagMatch = raw.match(/<svg\b([^>]*)>/i);
    const openTag = openTagMatch ? openTagMatch[1] : '';
    const viewBoxMatch = openTag.match(/viewBox\s*=\s*['"]([^'"]+)['"]/i);
    const widthMatch = openTag.match(/width\s*=\s*['"]([^'"]+)['"]/i);
    const heightMatch = openTag.match(/height\s*=\s*['"]([^'"]+)['"]/i);
    const viewBox = viewBoxMatch ? viewBoxMatch[1] : `0 0 ${parseFloat(widthMatch && widthMatch[1]) || 24} ${parseFloat(heightMatch && heightMatch[1]) || 24}`;
    return {
      viewBox,
      inner: svgMatch[1].trim(),
    };
  } catch (err) {
    console.error('read inline svg asset failed', err && err.message ? err.message : err);
    return null;
  }
}

function parseSvgViewBox(value) {
  const parts = String(value || '0 0 24 24').trim().split(/[\s,]+/).map(Number);
  const minX = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minY = Number.isFinite(parts[1]) ? parts[1] : 0;
  const width = Math.max(1, Number.isFinite(parts[2]) ? parts[2] : 24);
  const height = Math.max(1, Number.isFinite(parts[3]) ? parts[3] : 24);
  return { minX, minY, width, height };
}

function escapeXml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function exportShapePolygonPoints(shape, width, height) {
  if (shape === 'diamond') {
    return [
      { x: width * 0.5, y: 0 },
      { x: width, y: height * 0.5 },
      { x: width * 0.5, y: height },
      { x: 0, y: height * 0.5 },
    ];
  }

  if (shape === 'hex') {
    return [
      { x: width * 0.25, y: 0 },
      { x: width * 0.75, y: 0 },
      { x: width, y: height * 0.5 },
      { x: width * 0.75, y: height },
      { x: width * 0.25, y: height },
      { x: 0, y: height * 0.5 },
    ];
  }

  if (shape === 'note') {
    return [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height * 0.78 },
      { x: width * 0.78, y: height },
      { x: 0, y: height },
    ];
  }

  if (shape === 'arrow') {
    return [
      { x: 0, y: height * 0.35 },
      { x: width * 0.74, y: height * 0.35 },
      { x: width * 0.74, y: height * 0.14 },
      { x: width, y: height * 0.5 },
      { x: width * 0.74, y: height * 0.86 },
      { x: width * 0.74, y: height * 0.65 },
      { x: 0, y: height * 0.65 },
    ];
  }

  return null;
}

function buildFacilityMapExportSvg(record) {
  const mapRecord = record && typeof record === 'object' && !Array.isArray(record)
    ? record
    : defaultFacilityMapRecord();
  const width = Number(mapRecord.canvas && mapRecord.canvas.width) || 1400;
  const height = Number(mapRecord.canvas && mapRecord.canvas.height) || 850;
  const backgroundDataUri = readAssetAsDataUri(mapRecord.backgroundUrl);
  const sortedAreas = (Array.isArray(mapRecord.areas) ? mapRecord.areas.slice() : [])
    .sort((a, b) => (Number(a.z) || 0) - (Number(b.z) || 0));

  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<title>${escapeXml(mapRecord.name || 'Facility Map')}</title>`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />`,
  ];

  if (backgroundDataUri) {
    parts.push(`<image x="0" y="0" width="${width}" height="${height}" href="${backgroundDataUri}" preserveAspectRatio="none" />`);
  }

  for (const area of sortedAreas) {
    if (!area || typeof area !== 'object') continue;

    const kind = sanitizeAreaKind(area.kind);
    const shape = sanitizeAreaShape(area.shape, kind);
    const rotation = sanitizeRotation(area.rotation, 0);
    const x = Number(area.x) || 0;
    const y = Number(area.y) || 0;
    const areaWidth = Math.max(1, Number(area.width) || 1);
    const areaHeight = Math.max(1, Number(area.height) || 1);
    const color = sanitizeAreaColor(area.color, kind, area.departmentType);
    const transparentFill = sanitizeAreaFillStyle(area.fillStyle || area.fill_style, '') === 'transparent';
    const nonLineStrokeWidth = sanitizeAreaStrokeWidth(area.strokeWidth, transparentFill ? 3 : 2);
    const centerX = x + (areaWidth / 2);
    const centerY = y + (areaHeight / 2);
    const lineArea = isLinearArea(kind, shape);
    const transform = rotation ? ` transform="rotate(${rotation} ${centerX} ${centerY})"` : '';

    if (lineArea) {
      const lineWidth = clampNumber(
        Math.round((Number(area.lineWidth || area.line_width || area.strokeWidth || defaultLineWidth(kind)) || defaultLineWidth(kind)) * 10) / 10,
        4,
        140
      );
      const x1 = Number.isFinite(Number(area.x1)) ? Number(area.x1) : x;
      const y1 = Number.isFinite(Number(area.y1)) ? Number(area.y1) : (y + (areaHeight / 2));
      const x2 = Number.isFinite(Number(area.x2)) ? Number(area.x2) : (x + areaWidth);
      const y2 = Number.isFinite(Number(area.y2)) ? Number(area.y2) : (y + (areaHeight / 2));
      parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round" />`);
      continue;
    }

    const fill = transparentFill || kind === 'text' ? 'none' : color;
    const stroke = kind === 'wall' ? 'none' : (transparentFill ? color : 'rgba(12,45,84,0.42)');
    const strokeWidth = kind === 'wall' ? 0 : nonLineStrokeWidth;

    if (kind === 'text') {
      parts.push(`<text x="${x + 2}" y="${y + 20}" font-family="Manrope, Segoe UI, sans-serif" font-size="18" font-weight="700" fill="#183153">${escapeXml(area.name || '')}</text>`);
      continue;
    }

    if (area.svgPath) {
      const inlineSvg = readInlineSvgAsset(area.svgPath);
      if (inlineSvg && inlineSvg.inner) {
        const viewBox = parseSvgViewBox(inlineSvg.viewBox);
        const scaleX = areaWidth / viewBox.width;
        const scaleY = areaHeight / viewBox.height;
        const iconTransform = [
          `translate(${x} ${y})`,
          rotation ? `rotate(${rotation} ${areaWidth / 2} ${areaHeight / 2})` : '',
          `scale(${scaleX} ${scaleY})`,
          `translate(${-viewBox.minX} ${-viewBox.minY})`,
        ].filter(Boolean).join(' ');
        parts.push(`<g transform="${iconTransform}">${inlineSvg.inner}</g>`);
      } else {
        const dataUri = readAssetAsDataUri(area.svgPath);
        if (dataUri) {
          parts.push(`<image x="${x}" y="${y}" width="${areaWidth}" height="${areaHeight}" href="${dataUri}"${transform} preserveAspectRatio="none" />`);
        }
      }
      continue;
    }

    const polygonPoints = exportShapePolygonPoints(shape, areaWidth, areaHeight);
    if (shape === 'circle' || shape === 'pill') {
      parts.push(`<ellipse cx="${centerX}" cy="${centerY}" rx="${areaWidth / 2}" ry="${areaHeight / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${transform} />`);
    } else if (polygonPoints) {
      const points = polygonPoints.map((point) => `${point.x + x},${point.y + y}`).join(' ');
      parts.push(`<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${transform} />`);
    } else {
      const radius = shape === 'rounded' ? 16 : 10;
      parts.push(`<rect x="${x}" y="${y}" width="${areaWidth}" height="${areaHeight}" rx="${radius}" ry="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${transform} />`);
    }

    const shouldRenderLabel = !(transparentFill || shape === 'line' || shape === 'arrow' || kind === 'wall');
    if (shouldRenderLabel && area.name) {
      const iconPrefix = area.icon ? `${area.icon} ` : '';
      parts.push(`<text x="${x + 8}" y="${y + 18}" font-family="Manrope, Segoe UI, sans-serif" font-size="12" font-weight="700" fill="#0f355f">${escapeXml((iconPrefix + area.name).trim())}</text>`);
    }
  }

  parts.push('</svg>');
  return parts.join('');
}

function normalizeDepartmentId(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return DEFAULT_HANDBOOK_DEPARTMENT;
  const cleaned = raw.replace(/[^a-z0-9_-]/g, '');
  const known = HANDBOOK_DEPARTMENTS.find(item => item.id === cleaned);
  return known ? known.id : DEFAULT_HANDBOOK_DEPARTMENT;
}

function getDepartmentLabel(id) {
  const normalized = normalizeDepartmentId(id);
  const found = HANDBOOK_DEPARTMENTS.find(item => item.id === normalized);
  return found ? found.label : 'HR';
}

function readHandbookVisibilityMap() {
  try {
    if (!fs.existsSync(HANDBOOK_VISIBILITY_PATH)) return {};
    const raw = fs.readFileSync(HANDBOOK_VISIBILITY_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (err) {
    console.error('read handbook visibility failed', err && err.message ? err.message : err);
    return {};
  }
}

function writeHandbookVisibilityMap(map) {
  try {
    fs.writeFileSync(HANDBOOK_VISIBILITY_PATH, JSON.stringify(map || {}, null, 2), 'utf8');
  } catch (err) {
    console.error('write handbook visibility failed', err && err.message ? err.message : err);
  }
}

function readHandbookMetadataMap() {
  try {
    if (!fs.existsSync(HANDBOOK_METADATA_PATH)) return {};
    const raw = fs.readFileSync(HANDBOOK_METADATA_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (err) {
    console.error('read handbook metadata failed', err && err.message ? err.message : err);
    return {};
  }
}

function writeHandbookMetadataMap(map) {
  try {
    fs.writeFileSync(HANDBOOK_METADATA_PATH, JSON.stringify(map || {}, null, 2), 'utf8');
  } catch (err) {
    console.error('write handbook metadata failed', err && err.message ? err.message : err);
  }
}

function sanitizeHandbookFilename(filename) {
  if (!filename) return null;
  const raw = String(filename).trim();
  if (!raw) return null;
  // Express already decodes route params, so avoid decoding again here.
  if (raw.includes('..') || raw.includes('/') || raw.includes('\\')) return null;
  return raw;
}

function getRequestedHandbookDepartment(req) {
  const raw = req && req.query ? (req.query.department || req.query.dept) : null;
  const cleaned = String(raw || '').trim().toLowerCase();
  if (!cleaned || cleaned === 'all') return null;
  return normalizeDepartmentId(cleaned);
}

function getHandbookFilesWithVisibility(options = {}) {
  const requestedDepartment = options.department || null;
  if (!fs.existsSync(PDF_HANDBOOK_DIR)) return [];
  const visibility = readHandbookVisibilityMap();
  const metadata = readHandbookMetadataMap();
  const files = fs.readdirSync(PDF_HANDBOOK_DIR).filter(f => f.match(/\.pdf$/i)).sort((a, b) => a.localeCompare(b));

  // Prune stale entries from the visibility map when files have been removed.
  const known = new Set(files);
  const stale = Object.keys(visibility).filter(name => !known.has(name));
  if (stale.length) {
    for (const name of stale) delete visibility[name];
    writeHandbookVisibilityMap(visibility);
  }

  // Prune stale metadata entries too.
  const staleMetadata = Object.keys(metadata).filter(name => !known.has(name));
  if (staleMetadata.length) {
    for (const name of staleMetadata) delete metadata[name];
    writeHandbookMetadataMap(metadata);
  }

  const list = files.map(name => {
    let size = 0;
    try { size = fs.statSync(path.join(PDF_HANDBOOK_DIR, name)).size; } catch (e) {}
    const meta = metadata[name] || {};
    const department = normalizeDepartmentId(meta.department);
    return {
      name,
      url: `/pdf-handbook/${encodeURIComponent(name)}`,
      size,
      hidden: !!visibility[name],
      department,
      departmentLabel: getDepartmentLabel(department),
    };
  });

  if (!requestedDepartment) return list;
  return list.filter(item => item.department === requestedDepartment);
}

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
const MAP_ASSETS_DIR = path.join(__dirname, 'public', 'map_assets');
if (!fs.existsSync(MAP_ASSETS_DIR)) fs.mkdirSync(MAP_ASSETS_DIR, { recursive: true });
app.use('/map-assets', express.static(MAP_ASSETS_DIR));

function extractAnnouncementFileNames(announcement) {
  const refs = new Set();
  if (!announcement) return refs;
  const pushRef = (value) => {
    if (!value || typeof value !== 'string') return;
    const match = value.match(/\/announcements-files\/([^"'\s)<>?#]+)/i);
    if (match && match[1]) {
      try {
        refs.add(decodeURIComponent(match[1]));
      } catch (err) {
        refs.add(match[1]);
      }
    }
  };
  if (typeof announcement.image === 'string') pushRef(announcement.image);
  if (typeof announcement.body === 'string') {
    const regex = /\/announcements-files\/([^"'\s)<>?#]+)/ig;
    let match;
    while ((match = regex.exec(announcement.body)) !== null) {
      try {
        refs.add(decodeURIComponent(match[1]));
      } catch (err) {
        refs.add(match[1]);
      }
    }
  }
  return refs;
}

function cleanupUnusedAnnouncementFiles(currentAnnouncements) {
  try {
    let announcements = currentAnnouncements;
    if (!Array.isArray(announcements)) {
      try {
        const raw = fs.readFileSync(ANNOUNCEMENTS_PATH, 'utf8');
        announcements = JSON.parse(raw || '[]');
      } catch (err) {
        announcements = [];
      }
    }
    const referenced = new Set();
    for (const announcement of announcements) {
      for (const name of extractAnnouncementFileNames(announcement)) {
        referenced.add(name);
      }
    }
    const entries = fs.readdirSync(ANNOUNCEMENTS_FILES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const name = entry.name;
      if (name.startsWith('.')) continue;
      if (!referenced.has(name)) {
        const target = path.join(ANNOUNCEMENTS_FILES_DIR, name);
        try {
          fs.unlinkSync(target);
        } catch (err) {
          console.error('failed to remove announcement file', target, err && err.message ? err.message : err);
        }
      }
    }
  } catch (err) {
    console.error('cleanup announcement files failed', err && err.message ? err.message : err);
  }
}

cleanupUnusedAnnouncementFiles();

// Multer storage for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ANNOUNCEMENTS_FILES_DIR),
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'upload').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
    cb(null, `${Date.now()}_${safe}`);
  }
});
const upload = multer({ storage });

const mapAssetStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MAP_ASSETS_DIR),
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'map_image').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
    cb(null, `${Date.now()}_${safe}`);
  }
});
const uploadMapAsset = multer({
  storage: mapAssetStorage,
  fileFilter: (req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) return cb(null, true);
    return cb(new Error('Only image files are allowed'));
  },
});

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
app.get('/api/handbook/departments', (req, res) => {
  res.json({
    defaultDepartment: DEFAULT_HANDBOOK_DEPARTMENT,
    departments: HANDBOOK_DEPARTMENTS,
  });
});

app.get('/api/handbook', async (req, res) => {
  try {
    const includeAll = String(req.query.all || req.query.includeHidden || '') === '1';
    const department = getRequestedHandbookDepartment(req);
    if (includeAll) {
      const user = await resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'missing token or SSO header' });
    }

    const list = getHandbookFilesWithVisibility({ department });
    if (includeAll) return res.json(list);
    return res.json(list.filter(item => !item.hidden));
  } catch (err) {
    console.error('handbook list', err);
    res.status(500).json({ error: 'failed to list handbook' });
  }
});

// Upload a handbook PDF (admin only)
const handbookStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PDF_HANDBOOK_DIR),
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'handbook.pdf').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
    cb(null, safe);
  }
});
const uploadHandbook = multer({ storage: handbookStorage, fileFilter: (req, file, cb) => {
  if (!file.originalname.toLowerCase().endsWith('.pdf')) {
    return cb(new Error('Only PDF files are allowed'));
  }
  cb(null, true);
}});

app.post('/api/handbook', authMiddleware, (req, res) => {
  uploadHandbook.single('pdf')(req, res, (err) => {
    if (err) {
      console.error('upload handbook error', err);
      return res.status(400).json({ error: err.message || 'upload failed' });
    }
    try {
      if (!req.file) return res.status(400).json({ error: 'PDF file required' });
      const department = normalizeDepartmentId(req.body && req.body.department);
      // New uploads are visible by default.
      const visibility = readHandbookVisibilityMap();
      if (visibility[req.file.filename]) {
        delete visibility[req.file.filename];
        writeHandbookVisibilityMap(visibility);
      }
      const metadata = readHandbookMetadataMap();
      metadata[req.file.filename] = { department };
      writeHandbookMetadataMap(metadata);
      res.json({
        ok: true,
        filename: req.file.filename,
        url: `/pdf-handbook/${encodeURIComponent(req.file.filename)}`,
        department,
        departmentLabel: getDepartmentLabel(department),
      });
    } catch (err) {
      console.error('upload handbook', err);
      res.status(500).json({ error: 'upload failed' });
    }
  });
});

// Toggle handbook visibility for app viewers (admin only)
app.patch('/api/handbook/:filename', authMiddleware, (req, res) => {
  try {
    const filename = sanitizeHandbookFilename(req.params.filename);
    if (!filename) return res.status(400).json({ error: 'invalid filename' });

    const target = path.join(PDF_HANDBOOK_DIR, filename);
    if (!fs.existsSync(target)) return res.status(404).json({ error: 'file not found' });

    const patch = req.body || {};
    const updateHidden = Object.prototype.hasOwnProperty.call(patch, 'hidden');
    const updateDepartment = Object.prototype.hasOwnProperty.call(patch, 'department');
    if (!updateHidden && !updateDepartment) {
      return res.status(400).json({ error: 'hidden or department is required' });
    }

    const visibility = readHandbookVisibilityMap();
    const metadata = readHandbookMetadataMap();

    if (updateHidden) {
      const hidden = !!patch.hidden;
      if (hidden) visibility[filename] = true;
      else delete visibility[filename];
      writeHandbookVisibilityMap(visibility);
    }

    if (updateDepartment) {
      const nextDepartment = normalizeDepartmentId(patch.department);
      metadata[filename] = Object.assign({}, metadata[filename], { department: nextDepartment });
      writeHandbookMetadataMap(metadata);
    }

    const hidden = !!visibility[filename];
    const department = normalizeDepartmentId(metadata[filename] && metadata[filename].department);

    res.json({ ok: true, filename, hidden, department, departmentLabel: getDepartmentLabel(department) });
  } catch (err) {
    console.error('patch handbook', err);
    res.status(500).json({ error: 'failed to update handbook visibility' });
  }
});

// Delete a handbook PDF (admin only)
app.delete('/api/handbook/:filename', authMiddleware, (req, res) => {
  try {
    const filename = sanitizeHandbookFilename(req.params.filename);
    if (!filename) return res.status(400).json({ error: 'invalid filename' });

    const filePath = path.join(PDF_HANDBOOK_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'file not found' });
    }
    fs.unlinkSync(filePath);

    const visibility = readHandbookVisibilityMap();
    if (visibility[filename]) {
      delete visibility[filename];
      writeHandbookVisibilityMap(visibility);
    }

    const metadata = readHandbookMetadataMap();
    if (metadata[filename]) {
      delete metadata[filename];
      writeHandbookMetadataMap(metadata);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('delete handbook', err);
    res.status(500).json({ error: 'delete failed' });
  }
});

// --- Facilities map ---
// Public endpoints for map list/read consumption in the main portal.
app.get('/api/maps', (req, res) => {
  try {
    const store = readFacilityMapStore();
    res.json({
      activeMapId: store.activeMapId,
      maps: listFacilityMapSummaries(store),
    });
  } catch (err) {
    console.error('get maps', err);
    res.status(500).json({ error: 'failed to load maps' });
  }
});

app.get('/api/map', (req, res) => {
  try {
    const store = readFacilityMapStore();
    const requestedId = normalizeFacilityMapRecordId(req.query && req.query.mapId, '');
    const map = requestedId
      ? (Array.isArray(store.maps) ? store.maps.find((item) => item.id === requestedId) : null)
      : getFacilityMapRecord(store, store.activeMapId);
    if (!map) return res.status(404).json({ error: 'map not found' });
    res.json(cloneFacilityMapRecord(map));
  } catch (err) {
    console.error('get map', err);
    res.status(500).json({ error: 'failed to load map' });
  }
});

app.get('/api/map/icons', (req, res) => {
  try {
    res.json({ icons: listLocalSvgIcons() });
  } catch (err) {
    console.error('get map icons', err);
    res.status(500).json({ error: 'failed to load icons' });
  }
});

app.get('/api/maps/:mapId/export.svg', (req, res) => {
  try {
    const store = readFacilityMapStore();
    const requestedId = normalizeFacilityMapRecordId(req.params.mapId, '');
    const map = Array.isArray(store.maps) ? store.maps.find((item) => item.id === requestedId) : null;
    if (!map) return res.status(404).json({ error: 'map not found' });

    const svg = buildFacilityMapExportSvg(map);
    const fileStem = String(map.name || 'facility_map').trim().replace(/[^a-zA-Z0-9._-]+/g, '_') || 'facility_map';
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileStem}.svg"`);
    res.send(svg);
  } catch (err) {
    console.error('export svg map', err);
    res.status(500).json({ error: 'failed to export svg' });
  }
});

app.get('/api/maps/:mapId/export.pdf', (req, res) => {
  try {
    if (!PDFDocument || !SVGtoPDF) {
      return res.status(503).json({ error: 'pdf export is unavailable' });
    }

    const store = readFacilityMapStore();
    const requestedId = normalizeFacilityMapRecordId(req.params.mapId, '');
    const map = Array.isArray(store.maps) ? store.maps.find((item) => item.id === requestedId) : null;
    if (!map) return res.status(404).json({ error: 'map not found' });

    const width = Number(map.canvas && map.canvas.width) || 1400;
    const height = Number(map.canvas && map.canvas.height) || 850;
    const svg = buildFacilityMapExportSvg(map);
    const fileStem = String(map.name || 'facility_map').trim().replace(/[^a-zA-Z0-9._-]+/g, '_') || 'facility_map';
    const doc = new PDFDocument({ size: [width, height], margin: 0 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileStem}.pdf"`);
    doc.pipe(res);
    SVGtoPDF(doc, svg, 0, 0, { width, height, assumePt: true, preserveAspectRatio: 'xMinYMin meet' });
    doc.end();
  } catch (err) {
    console.error('export pdf map', err);
    res.status(500).json({ error: 'failed to export pdf' });
  }
});

app.post('/api/maps', authMiddleware, (req, res) => {
  try {
    if (!req.user || req.user.username !== 'admin') {
      return res.status(403).json({ error: 'forbidden' });
    }

    const store = readFacilityMapStore();
    const maps = Array.isArray(store.maps) ? store.maps : [];
    if (maps.length >= MAX_FACILITY_MAPS) {
      return res.status(400).json({ error: `maximum of ${MAX_FACILITY_MAPS} maps reached` });
    }

    const cloneFromId = normalizeFacilityMapRecordId(req.body && req.body.cloneFromId, '');
    const cloneSource = cloneFromId
      ? maps.find((item) => item.id === cloneFromId)
      : null;
    const name = sanitizeFacilityMapRecordName(req.body && req.body.name, `Map ${maps.length + 1}`);
    const now = new Date().toISOString();
    const nextId = createUniqueFacilityMapId(name, maps);
    const baseMap = cloneSource ? cloneFacilityMapRecord(cloneSource) : defaultFacilityMapRecord();
    const record = Object.assign({}, sanitizeFacilityMapPayload(baseMap, cloneSource || DEFAULT_FACILITY_MAP), {
      id: nextId,
      name,
      description: sanitizeFacilityMapRecordDescription(req.body && req.body.description, cloneSource ? cloneSource.description : ''),
      createdAt: now,
      createdBy: req.user.username,
      updatedAt: now,
      updatedBy: req.user.username,
    });
    const shouldSetActive = !!(req.body && req.body.makeActive);
    const nextStore = writeFacilityMapStore({
      activeMapId: shouldSetActive ? nextId : (store.activeMapId || nextId),
      maps: maps.concat([record]),
    });
    const saved = Array.isArray(nextStore.maps) ? nextStore.maps.find((item) => item.id === nextId) : null;
    try {
      io.emit('map.updated', {
        mapId: nextId,
        activeMapId: nextStore.activeMapId,
        catalogChanged: true,
        updatedAt: saved && saved.updatedAt,
        updatedBy: saved && saved.updatedBy,
      });
    } catch (e) {}
    res.status(201).json({
      ok: true,
      map: cloneFacilityMapRecord(saved),
      activeMapId: nextStore.activeMapId,
      maps: listFacilityMapSummaries(nextStore),
    });
  } catch (err) {
    console.error('create map', err);
    res.status(500).json({ error: 'failed to create map' });
  }
});

app.patch('/api/maps/:mapId', authMiddleware, (req, res) => {
  try {
    if (!req.user || req.user.username !== 'admin') {
      return res.status(403).json({ error: 'forbidden' });
    }

    const requestedId = normalizeFacilityMapRecordId(req.params.mapId, '');
    const store = readFacilityMapStore();
    const maps = Array.isArray(store.maps) ? store.maps : [];
    const current = maps.find((item) => item.id === requestedId);
    if (!current) return res.status(404).json({ error: 'map not found' });

    const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, 'name');
    const hasDescription = Object.prototype.hasOwnProperty.call(req.body || {}, 'description');
    const nextMaps = maps.map((item) => {
      if (item.id !== current.id) return item;
      return Object.assign({}, item, {
        name: hasName ? sanitizeFacilityMapRecordName(req.body.name, item.name) : item.name,
        description: hasDescription ? sanitizeFacilityMapRecordDescription(req.body.description, item.description) : item.description,
      });
    });
    const nextStore = writeFacilityMapStore({
      activeMapId: req.body && req.body.setActive ? current.id : store.activeMapId,
      maps: nextMaps,
    });
    const saved = Array.isArray(nextStore.maps) ? nextStore.maps.find((item) => item.id === current.id) : null;
    try {
      io.emit('map.updated', {
        mapId: current.id,
        activeMapId: nextStore.activeMapId,
        catalogChanged: true,
        updatedAt: saved && saved.updatedAt,
        updatedBy: saved && saved.updatedBy,
      });
    } catch (e) {}
    res.json({
      ok: true,
      map: cloneFacilityMapRecord(saved),
      activeMapId: nextStore.activeMapId,
      maps: listFacilityMapSummaries(nextStore),
    });
  } catch (err) {
    console.error('patch map', err);
    res.status(500).json({ error: 'failed to update map' });
  }
});

app.delete('/api/maps/:mapId', authMiddleware, (req, res) => {
  try {
    if (!req.user || req.user.username !== 'admin') {
      return res.status(403).json({ error: 'forbidden' });
    }

    const requestedId = normalizeFacilityMapRecordId(req.params.mapId, '');
    const store = readFacilityMapStore();
    const maps = Array.isArray(store.maps) ? store.maps : [];
    if (maps.length <= 1) {
      return res.status(400).json({ error: 'at least one map must remain' });
    }

    const current = maps.find((item) => item.id === requestedId);
    if (!current) return res.status(404).json({ error: 'map not found' });

    const nextMaps = maps.filter((item) => item.id !== current.id);
    const nextActiveMapId = store.activeMapId === current.id
      ? nextMaps[0].id
      : store.activeMapId;
    const nextStore = writeFacilityMapStore({
      activeMapId: nextActiveMapId,
      maps: nextMaps,
    });
    try {
      io.emit('map.updated', {
        mapId: nextStore.activeMapId,
        activeMapId: nextStore.activeMapId,
        catalogChanged: true,
      });
    } catch (e) {}
    res.json({
      ok: true,
      activeMapId: nextStore.activeMapId,
      maps: listFacilityMapSummaries(nextStore),
    });
  } catch (err) {
    console.error('delete map', err);
    res.status(500).json({ error: 'failed to delete map' });
  }
});

// Admin-only map save endpoint used by the mapping editor portal.
app.put('/api/map', authMiddleware, (req, res) => {
  try {
    if (!req.user || req.user.username !== 'admin') {
      return res.status(403).json({ error: 'forbidden' });
    }

    const store = readFacilityMapStore();
    const requestedId = normalizeFacilityMapRecordId(req.query && req.query.mapId, '');
    const current = requestedId
      ? (Array.isArray(store.maps) ? store.maps.find((item) => item.id === requestedId) : null)
      : getFacilityMapRecord(store, store.activeMapId);
    if (!current) return res.status(404).json({ error: 'map not found' });

    const nextMap = sanitizeFacilityMapPayload(req.body || {}, current);
    nextMap.updatedAt = new Date().toISOString();
    nextMap.updatedBy = req.user.username;
    const nextStore = writeFacilityMapStore({
      activeMapId: store.activeMapId,
      maps: (Array.isArray(store.maps) ? store.maps : []).map((item) => item.id === current.id
        ? Object.assign({}, item, nextMap, {
          updatedAt: nextMap.updatedAt,
          updatedBy: nextMap.updatedBy,
        })
        : item),
    });
    const saved = Array.isArray(nextStore.maps) ? nextStore.maps.find((item) => item.id === current.id) : null;
    try {
      io.emit('map.updated', {
        mapId: current.id,
        activeMapId: nextStore.activeMapId,
        catalogChanged: false,
        updatedAt: saved && saved.updatedAt,
        updatedBy: saved && saved.updatedBy,
      });
    } catch (e) {}
    res.json({ ok: true, map: cloneFacilityMapRecord(saved), activeMapId: nextStore.activeMapId });
  } catch (err) {
    console.error('save map', err);
    res.status(500).json({ error: 'failed to save map' });
  }
});

// Admin-only image upload for map backgrounds.
app.post('/api/map/upload-image', authMiddleware, (req, res) => {
  if (!req.user || req.user.username !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }

  uploadMapAsset.single('image')(req, res, (err) => {
    if (err) {
      console.error('upload map image error', err);
      return res.status(400).json({ error: err.message || 'upload failed' });
    }
    if (!req.file) return res.status(400).json({ error: 'image required' });
    const url = `/map-assets/${encodeURIComponent(req.file.filename)}`;
    return res.json({ ok: true, url });
  });
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
    cleanupUnusedAnnouncementFiles(arr);
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
    cleanupUnusedAnnouncementFiles(arr);
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
  const publicPortal = path.join(__dirname, 'public', 'announcements_portal.html');
  if (fs.existsSync(publicPortal)) return res.sendFile(publicPortal);
  const rootPortal = path.join(__dirname, '..', 'announcements_portal.html');
  if (fs.existsSync(rootPortal)) return res.sendFile(rootPortal);
  // Final fallback if files were moved.
  return res.sendFile(publicPortal);
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
