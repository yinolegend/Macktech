const fs = require('fs');
const path = require('path');
const {
  HANDBOOK_DIR,
  HANDBOOK_VISIBILITY_PATH,
  HANDBOOK_METADATA_PATH,
} = require('../../config/paths');

const HANDBOOK_DEPARTMENTS = [
  { id: 'hr', label: 'HR' },
  { id: 'it', label: 'IT' },
  { id: 'operations', label: 'Operations' },
  { id: 'finance', label: 'Finance' },
  { id: 'quality', label: 'Quality' },
  { id: 'safety', label: 'Safety' },
];
const DEFAULT_HANDBOOK_DEPARTMENT = 'hr';

function normalizeDepartmentId(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return DEFAULT_HANDBOOK_DEPARTMENT;
  const cleaned = raw.replace(/[^a-z0-9_-]/g, '');
  const known = HANDBOOK_DEPARTMENTS.find((item) => item.id === cleaned);
  return known ? known.id : DEFAULT_HANDBOOK_DEPARTMENT;
}

function getDepartmentLabel(id) {
  const normalized = normalizeDepartmentId(id);
  const found = HANDBOOK_DEPARTMENTS.find((item) => item.id === normalized);
  return found ? found.label : 'HR';
}

function readJsonMap(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (error) {
    console.error('read handbook map failed', error && error.message ? error.message : error);
    return {};
  }
}

function writeJsonMap(filePath, value) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(value || {}, null, 2), 'utf8');
  } catch (error) {
    console.error('write handbook map failed', error && error.message ? error.message : error);
  }
}

function readHandbookVisibilityMap() {
  return readJsonMap(HANDBOOK_VISIBILITY_PATH);
}

function writeHandbookVisibilityMap(map) {
  writeJsonMap(HANDBOOK_VISIBILITY_PATH, map);
}

function readHandbookMetadataMap() {
  return readJsonMap(HANDBOOK_METADATA_PATH);
}

function writeHandbookMetadataMap(map) {
  writeJsonMap(HANDBOOK_METADATA_PATH, map);
}

function sanitizeHandbookFilename(filename) {
  if (!filename) return null;
  const raw = String(filename).trim();
  if (!raw) return null;
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
  if (!fs.existsSync(HANDBOOK_DIR)) return [];

  const visibility = readHandbookVisibilityMap();
  const metadata = readHandbookMetadataMap();
  const files = fs.readdirSync(HANDBOOK_DIR)
    .filter((fileName) => fileName.match(/\.pdf$/i))
    .sort((a, b) => a.localeCompare(b));

  const known = new Set(files);
  const staleVisibility = Object.keys(visibility).filter((fileName) => !known.has(fileName));
  if (staleVisibility.length) {
    for (const fileName of staleVisibility) delete visibility[fileName];
    writeHandbookVisibilityMap(visibility);
  }

  const staleMetadata = Object.keys(metadata).filter((fileName) => !known.has(fileName));
  if (staleMetadata.length) {
    for (const fileName of staleMetadata) delete metadata[fileName];
    writeHandbookMetadataMap(metadata);
  }

  const list = files.map((fileName) => {
    let size = 0;
    try {
      size = fs.statSync(path.join(HANDBOOK_DIR, fileName)).size;
    } catch (error) {
    }

    const meta = metadata[fileName] || {};
    const department = normalizeDepartmentId(meta.department);
    return {
      name: fileName,
      url: `/pdf-handbook/${encodeURIComponent(fileName)}`,
      size,
      hidden: !!visibility[fileName],
      department,
      departmentLabel: getDepartmentLabel(department),
    };
  });

  if (!requestedDepartment) return list;
  return list.filter((item) => item.department === requestedDepartment);
}

module.exports = {
  HANDBOOK_DEPARTMENTS,
  DEFAULT_HANDBOOK_DEPARTMENT,
  HANDBOOK_DIR,
  normalizeDepartmentId,
  getDepartmentLabel,
  readHandbookVisibilityMap,
  writeHandbookVisibilityMap,
  readHandbookMetadataMap,
  writeHandbookMetadataMap,
  sanitizeHandbookFilename,
  getRequestedHandbookDepartment,
  getHandbookFilesWithVisibility,
};
