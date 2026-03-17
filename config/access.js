const MODULE_DEFINITIONS = [
  { key: 'dashboard', label: 'Dashboard', description: 'Shared operational overview and summary cards.' },
  { key: 'hazmat', label: 'Hazmat', description: 'Hazmat inventory and material operations.' },
  { key: 'calibration', label: 'Calibration', description: 'Calibration assets, templates, and due-date workflows.' },
  { key: 'failure_analysis', label: 'Failure Analysis', description: 'Debug Lab tickets, analytics, and repair diagnostics.' },
  { key: 'announcements', label: 'Announcements', description: 'Company announcements and bulletin access.' },
  { key: 'reports', label: 'Reports', description: 'Cross-module reporting and printable exports.' },
  { key: 'admin_console', label: 'Admin Console', description: 'Administrative control center and user management.' },
];

const CORE_ADMIN_PERMISSIONS = ['admin_console', 'user_management', 'settings_access', 'edit_access', 'department_management'];

const DEFAULT_ROLE_DEFINITIONS = {
  Admin: {
    key: 'Admin',
    label: 'Admin',
    description: 'Full system access, administration, and module management.',
    modules: ['dashboard', 'hazmat', 'calibration', 'failure_analysis', 'reports', 'admin_console'],
    permissions: CORE_ADMIN_PERMISSIONS.slice(),
  },
  Warehouse_Admin: {
    key: 'Warehouse_Admin',
    label: 'Operations Admin',
    description: 'Operations role with broad command center and announcements access.',
    modules: ['dashboard', 'hazmat', 'calibration', 'failure_analysis', 'announcements', 'reports'],
    permissions: ['settings_access', 'edit_access', 'department_management'],
  },
  Command_Center: {
    key: 'Command_Center',
    label: 'Command Center',
    description: 'Command center operator with full operational and announcements access.',
    modules: ['dashboard', 'hazmat', 'calibration', 'failure_analysis', 'announcements', 'reports'],
    permissions: ['settings_access', 'edit_access'],
  },
  'Calibration Tech': {
    key: 'Calibration Tech',
    label: 'Calibration Tech',
    description: 'Calibration module access with reports and editing privileges.',
    modules: ['dashboard', 'calibration', 'reports'],
    permissions: ['edit_access'],
  },
  'Hazmat Tech': {
    key: 'Hazmat Tech',
    label: 'Hazmat Tech',
    description: 'Hazmat inventory access with reports and editing privileges.',
    modules: ['dashboard', 'hazmat', 'reports'],
    permissions: ['edit_access'],
  },
  'Failure Analysis Tech': {
    key: 'Failure Analysis Tech',
    label: 'Failure Analysis Tech',
    description: 'Failure analysis and debug lab access with reports and editing privileges.',
    modules: ['dashboard', 'failure_analysis', 'reports'],
    permissions: ['edit_access'],
  },
  Viewer: {
    key: 'Viewer',
    label: 'Viewer',
    description: 'Read-only operational access with no admin tools or editing.',
    modules: ['dashboard', 'hazmat', 'calibration', 'failure_analysis', 'announcements', 'reports'],
    permissions: [],
  },
  User: {
    key: 'User',
    label: 'User',
    description: 'Fallback basic role for legacy accounts.',
    modules: ['dashboard'],
    permissions: [],
  },
};

const MODULE_SYNONYMS = {
  admin: 'admin_console',
  'admin-console': 'admin_console',
  admin_console: 'admin_console',
  calibration: 'calibration',
  debug: 'failure_analysis',
  'debug-lab': 'failure_analysis',
  'debug lab': 'failure_analysis',
  failure: 'failure_analysis',
  failure_analysis: 'failure_analysis',
  'failure-analysis': 'failure_analysis',
  'failure analysis': 'failure_analysis',
  hazmat: 'hazmat',
  announcement: 'announcements',
  announcements: 'announcements',
  report: 'reports',
  reports: 'reports',
  dashboard: 'dashboard',
};

const PERMISSION_SYNONYMS = {
  admin: 'admin_console',
  'admin-console': 'admin_console',
  admin_console: 'admin_console',
  user_management: 'user_management',
  'user-management': 'user_management',
  users: 'user_management',
  settings_access: 'settings_access',
  settings: 'settings_access',
  edit_access: 'edit_access',
  edit: 'edit_access',
  department_management: 'department_management',
  departments: 'department_management',
  dashboard_access: 'dashboard_access',
  hazmat_access: 'hazmat_access',
  calibration_access: 'calibration_access',
  failure_analysis_access: 'failure_analysis_access',
  announcements_access: 'announcements_access',
  reports_access: 'reports_access',
};

function normalizeRoleToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeModuleKey(value) {
  const token = String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
  if (MODULE_SYNONYMS[token]) return MODULE_SYNONYMS[token];
  return MODULE_SYNONYMS[token.replace(/-/g, ' ')] || '';
}

function normalizeModuleAccess(value) {
  let source = value;

  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (!trimmed) return [];
    try {
      source = JSON.parse(trimmed);
    } catch (error) {
      source = trimmed.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
  }

  if (!Array.isArray(source)) {
    return [];
  }

  return Array.from(new Set(source
    .map((entry) => normalizeModuleKey(entry))
    .filter(Boolean)));
}

function normalizePermissionKey(value) {
  const token = String(value || '').trim().toLowerCase().replace(/[\s\-]+/g, '_');
  if (!token) return '';
  return PERMISSION_SYNONYMS[token] || token;
}

function normalizePermissionAccess(value) {
  let source = value;

  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (!trimmed) return [];
    try {
      source = JSON.parse(trimmed);
    } catch (error) {
      source = trimmed.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
  }

  if (!Array.isArray(source)) {
    return [];
  }

  return Array.from(new Set(source
    .map((entry) => normalizePermissionKey(entry))
    .filter(Boolean)));
}

function cloneRoleDefinitions(definitions) {
  const copy = {};
  for (const definition of Object.values(definitions || {})) {
    if (!definition || !definition.key) continue;
    const key = String(definition.key);
    copy[key] = {
      key,
      label: String(definition.label || key).trim() || key,
      description: String(definition.description || '').trim(),
      modules: normalizeModuleAccess(definition.modules),
      permissions: normalizePermissionAccess(definition.permissions),
    };
  }
  return copy;
}

const ROLE_DEFINITIONS = {};

function replaceRoleDefinitions(nextDefinitions) {
  for (const key of Object.keys(ROLE_DEFINITIONS)) {
    delete ROLE_DEFINITIONS[key];
  }

  for (const [key, definition] of Object.entries(nextDefinitions || {})) {
    ROLE_DEFINITIONS[key] = {
      key: String(definition.key || key),
      label: String(definition.label || key).trim() || key,
      description: String(definition.description || '').trim(),
      modules: normalizeModuleAccess(definition.modules),
      permissions: normalizePermissionAccess(definition.permissions),
    };
  }

  if (!ROLE_DEFINITIONS.Viewer && DEFAULT_ROLE_DEFINITIONS.Viewer) {
    const fallback = DEFAULT_ROLE_DEFINITIONS.Viewer;
    ROLE_DEFINITIONS.Viewer = {
      key: fallback.key,
      label: fallback.label,
      description: fallback.description,
      modules: normalizeModuleAccess(fallback.modules),
      permissions: normalizePermissionAccess(fallback.permissions),
    };
  }
}

function canonicalizeRole(role) {
  const token = normalizeRoleToken(role);
  const currentMatch = Object.keys(ROLE_DEFINITIONS).find((key) => normalizeRoleToken(key) === token);
  if (currentMatch) return currentMatch;
  const defaultMatch = Object.keys(DEFAULT_ROLE_DEFINITIONS).find((key) => normalizeRoleToken(key) === token);
  return defaultMatch || 'Viewer';
}

function getRoleDefinition(role) {
  return ROLE_DEFINITIONS[canonicalizeRole(role)] || ROLE_DEFINITIONS.Viewer || DEFAULT_ROLE_DEFINITIONS.Viewer;
}

function hasExplicitModuleAccess(value) {
  if (Array.isArray(value)) return true;
  if (typeof value !== 'string') return false;
  return value.trim().length > 0;
}

function hasExplicitPermissionAccess(value) {
  if (Array.isArray(value)) return true;
  if (typeof value !== 'string') return false;
  return value.trim().length > 0;
}

function resolveLandingRoute(modules, permissions) {
  if (permissions.has('admin_console')) {
    return '/admin-console';
  }

  if (modules.some((moduleKey) => moduleKey === 'dashboard' || moduleKey === 'hazmat' || moduleKey === 'calibration' || moduleKey === 'failure_analysis' || moduleKey === 'reports')) {
    return '/portals/command-center';
  }

  if (modules.includes('announcements')) {
    return '/announcements_portal.html';
  }

  return '/app.html';
}

function normalizeRoleTemplate(template, fallbackDefinition) {
  const fallback = fallbackDefinition || DEFAULT_ROLE_DEFINITIONS.Viewer;
  const canonicalKey = canonicalizeRole(template && (template.key || template.role_key || template.role || fallback.key));
  const base = DEFAULT_ROLE_DEFINITIONS[canonicalKey] || fallback;

  const normalized = {
    key: base.key,
    label: String((template && template.label) || base.label || base.key).trim() || base.key,
    description: String((template && template.description) || base.description || '').trim(),
    modules: normalizeModuleAccess(template && template.modules !== undefined ? template.modules : base.modules),
    permissions: normalizePermissionAccess(template && template.permissions !== undefined ? template.permissions : base.permissions),
  };

  if (normalized.key === 'Admin') {
    if (!normalized.modules.includes('admin_console')) {
      normalized.modules.push('admin_console');
    }
    for (const permission of CORE_ADMIN_PERMISSIONS) {
      if (!normalized.permissions.includes(permission)) {
        normalized.permissions.push(permission);
      }
    }
  }

  return normalized;
}

function setRoleTemplates(roleTemplates) {
  const nextDefinitions = cloneRoleDefinitions(DEFAULT_ROLE_DEFINITIONS);

  if (Array.isArray(roleTemplates)) {
    for (const template of roleTemplates) {
      const key = canonicalizeRole(template && (template.key || template.role_key || template.role));
      if (!key || !nextDefinitions[key]) continue;
      nextDefinitions[key] = normalizeRoleTemplate(template, nextDefinitions[key]);
    }
  }

  replaceRoleDefinitions(nextDefinitions);
  return listRoles();
}

function buildAccessProfile(user) {
  const roleDefinition = getRoleDefinition(user && user.role);
  const explicitModules = normalizeModuleAccess(user && user.module_access);
  const explicitPermissions = normalizePermissionAccess(user && user.permission_access);
  const explicitModuleAccessProvided = Object.prototype.hasOwnProperty.call(user || {}, 'module_access_provided')
    ? Boolean(user && user.module_access_provided)
    : hasExplicitModuleAccess(user && user.module_access);
  const explicitPermissionAccessProvided = Object.prototype.hasOwnProperty.call(user || {}, 'permission_access_provided')
    ? Boolean(user && user.permission_access_provided)
    : hasExplicitPermissionAccess(user && user.permission_access);
  const modules = explicitModuleAccessProvided
    ? explicitModules
    : roleDefinition.modules.slice();

  const permissions = new Set(explicitPermissionAccessProvided
    ? explicitPermissions
    : normalizePermissionAccess(roleDefinition.permissions));
  if (roleDefinition.key === 'Admin') {
    CORE_ADMIN_PERMISSIONS.forEach((permission) => permissions.add(permission));
  }

  if (modules.includes('admin_console')) permissions.add('admin_console');
  if (modules.includes('dashboard')) permissions.add('dashboard_access');
  if (modules.includes('hazmat')) permissions.add('hazmat_access');
  if (modules.includes('calibration')) permissions.add('calibration_access');
  if (modules.includes('failure_analysis')) permissions.add('failure_analysis_access');
  if (modules.includes('announcements')) permissions.add('announcements_access');
  if (modules.includes('reports')) permissions.add('reports_access');

  return {
    role: roleDefinition.key,
    roleLabel: roleDefinition.label,
    roleDescription: roleDefinition.description,
    modules,
    permissions: Array.from(permissions),
    landingRoute: resolveLandingRoute(modules, permissions),
  };
}

function hasPermission(user, permission) {
  const requested = normalizePermissionKey(permission);
  if (!requested) return false;
  return buildAccessProfile(user).permissions.includes(requested);
}

function hasAnyModule(user, modules) {
  const requested = Array.isArray(modules) ? modules : [modules];
  const allowed = new Set(buildAccessProfile(user).modules);
  return requested.some((moduleKey) => allowed.has(normalizeModuleKey(moduleKey)));
}

function listRoles() {
  return Object.values(ROLE_DEFINITIONS).map((definition) => ({
    key: definition.key,
    label: definition.label,
    description: definition.description,
    modules: definition.modules.slice(),
    permissions: definition.permissions.slice(),
  }));
}

function listDefaultRoles() {
  return Object.values(DEFAULT_ROLE_DEFINITIONS).map((definition) => ({
    key: definition.key,
    label: definition.label,
    description: definition.description,
    modules: normalizeModuleAccess(definition.modules),
    permissions: normalizePermissionAccess(definition.permissions),
  }));
}

replaceRoleDefinitions(cloneRoleDefinitions(DEFAULT_ROLE_DEFINITIONS));

module.exports = {
  MODULE_DEFINITIONS,
  ROLE_DEFINITIONS,
  DEFAULT_ROLE_DEFINITIONS,
  canonicalizeRole,
  normalizeModuleKey,
  normalizeModuleAccess,
  normalizePermissionKey,
  normalizePermissionAccess,
  getRoleDefinition,
  setRoleTemplates,
  buildAccessProfile,
  hasPermission,
  hasAnyModule,
  listRoles,
  listDefaultRoles,
};