const fs = require('fs');
const path = require('path');
const {
  FRONTEND_ICONS_DIR,
  MAP_ASSETS_DIR,
  FACILITY_MAP_PATH,
  FACILITY_MAP_STORE_PATH,
} = require('../../config/paths');

const ICON_LIBRARY_DIR = FRONTEND_ICONS_DIR;
const ICON_ROUTE_PREFIX = '/assets/icons/';
const LEGACY_ICON_ROUTE_PREFIX = '/icons/';
const DEFAULT_FACILITY_MAP_RECORD_ID = 'main_facility';
const MAX_FACILITY_MAPS = 40;
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
  const normalizedKind = String(kind || '').trim().toLowerCase();
  if (normalizedKind === 'table') return '#8d6e63';
  if (normalizedKind === 'wall') return '#607d8b';
  if (normalizedKind === 'sign') return '#ffca28';
  if (normalizedKind === 'text') return '#183153';
  return defaultDepartmentColor(departmentType);
}

function defaultAreaShape(kind) {
  const normalizedKind = String(kind || '').trim().toLowerCase();
  if (normalizedKind === 'wall') return 'line';
  if (normalizedKind === 'table') return 'rounded';
  if (normalizedKind === 'sign') return 'pill';
  if (normalizedKind === 'room') return 'rounded';
  if (normalizedKind === 'service') return 'rounded';
  if (normalizedKind === 'common') return 'rounded';
  return 'rect';
}

function sanitizeAreaShape(value, kind) {
  const raw = sanitizeShortText(value, 16, '').toLowerCase();
  if (FACILITY_AREA_SHAPES.includes(raw)) return raw;
  return defaultAreaShape(kind);
}

function minAreaSizeForKind(kind) {
  const normalizedKind = String(kind || '').trim().toLowerCase();
  if (normalizedKind === 'wall') return { width: 60, height: 8 };
  if (normalizedKind === 'text') return { width: 40, height: 20 };
  if (normalizedKind === 'sign') return { width: 40, height: 24 };
  return { width: 20, height: 8 };
}

function isLinearArea(kind, shape) {
  return String(shape || '').trim().toLowerCase() === 'line';
}

function defaultLineWidth(kind) {
  const normalizedKind = String(kind || '').trim().toLowerCase();
  if (normalizedKind === 'hallway') return 44;
  if (normalizedKind === 'wall') return 12;
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
  if (!normalized.toLowerCase().endsWith('.svg')) return fallback || '';
  if (normalized.startsWith(ICON_ROUTE_PREFIX)) return normalized;
  if (normalized.startsWith(LEGACY_ICON_ROUTE_PREFIX)) {
    return `${ICON_ROUTE_PREFIX}${normalized.slice(LEGACY_ICON_ROUTE_PREFIX.length)}`;
  }
  return fallback || '';
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
      url: `${ICON_ROUTE_PREFIX}${relativePath}`,
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
  const type = String(markerType || '').trim().toLowerCase();
  if (type === 'warehouse') return 'operations';
  if (type === 'office') return 'administration';
  if (type === 'lab') return 'quality';
  if (type === 'safety') return 'safety';
  if (type === 'entry') return 'support';
  if (type === 'it') return 'it';
  return 'other';
}

function mapLegacyMarkerTypeToAreaKind(markerType) {
  const type = String(markerType || '').trim().toLowerCase();
  if (type === 'entry' || type === 'safety') return 'service';
  if (type === 'meeting') return 'room';
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

    const widthValue = Number(item.width);
    const heightValue = Number(item.height);
    const mins = minAreaSizeForKind(kind);
    let areaWidth = clampNumber(Math.round((Number.isFinite(widthValue) ? widthValue : 160) * 10) / 10, mins.width, width);
    let areaHeight = clampNumber(Math.round((Number.isFinite(heightValue) ? heightValue : 110) * 10) / 10, mins.height, height);

    const xValue = Number(item.x);
    const yValue = Number(item.y);
    let x = clampNumber(Number.isFinite(xValue) ? xValue : (width / 2) - (areaWidth / 2), 0, Math.max(0, width - areaWidth));
    let y = clampNumber(Number.isFinite(yValue) ? yValue : (height / 2) - (areaHeight / 2), 0, Math.max(0, height - areaHeight));
    const zValue = Number(item.z);
    const z = clampNumber(Math.round(Number.isFinite(zValue) ? zValue : index), 0, 5000);

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
  } catch (error) {
    console.error('write legacy facility map failed', error && error.message ? error.message : error);
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
  } catch (error) {
    console.error('read facility map store failed', error && error.message ? error.message : error);
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
  } catch (error) {
    console.error('write facility map store failed', error && error.message ? error.message : error);
    throw error;
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

  if (raw.startsWith(ICON_ROUTE_PREFIX) || raw.startsWith(LEGACY_ICON_ROUTE_PREFIX)) {
    const relative = raw.startsWith(ICON_ROUTE_PREFIX)
      ? raw.slice(ICON_ROUTE_PREFIX.length).split('/').join(path.sep)
      : raw.slice(LEGACY_ICON_ROUTE_PREFIX.length).split('/').join(path.sep);
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
  } catch (error) {
    console.error('read asset as data uri failed', error && error.message ? error.message : error);
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
  } catch (error) {
    console.error('read inline svg asset failed', error && error.message ? error.message : error);
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
      parts.push(`<text x="${x + 2}" y="${y + 20}" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="700" fill="#183153">${escapeXml(area.name || '')}</text>`);
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
      parts.push(`<text x="${x + 8}" y="${y + 18}" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="700" fill="#0f355f">${escapeXml((iconPrefix + area.name).trim())}</text>`);
    }
  }

  parts.push('</svg>');
  return parts.join('');
}

module.exports = {
  DEFAULT_FACILITY_MAP_RECORD_ID,
  MAX_FACILITY_MAPS,
  cloneFacilityMapRecord,
  createUniqueFacilityMapId,
  defaultFacilityMapRecord,
  getFacilityMapRecord,
  listFacilityMapSummaries,
  listLocalSvgIcons,
  normalizeFacilityMapRecordId,
  readFacilityMapStore,
  sanitizeFacilityMapPayload,
  sanitizeFacilityMapRecordDescription,
  sanitizeFacilityMapRecordName,
  writeFacilityMapStore,
  buildFacilityMapExportSvg,
  DEFAULT_FACILITY_MAP,
};
