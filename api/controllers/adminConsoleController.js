const path = require('path');

const {
  MODULE_DEFINITIONS,
  listRoles,
  canonicalizeRole,
  normalizeModuleAccess,
  normalizePermissionAccess,
} = require('../../config/access');

function normalizeText(value, fallback = '') {
  const normalized = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  return normalized || fallback;
}

function normalizeAccountStatus(value) {
  return String(value || '').trim().toLowerCase() === 'disabled' ? 'disabled' : 'active';
}

function normalizeDepartmentPayload(payload) {
  const name = normalizeText(payload && payload.name);
  if (!name) {
    throw new Error('department name is required');
  }

  return {
    name,
    supervisor: normalizeText(payload && payload.supervisor),
  };
}

function normalizeUserPayload(payload, options = {}) {
  const source = payload || {};
  const hasModuleAccess = Object.prototype.hasOwnProperty.call(source, 'module_access');
  const hasPermissionAccess = Object.prototype.hasOwnProperty.call(source, 'permission_access');
  const username = normalizeText(payload && payload.username);
  const displayName = normalizeText(payload && (payload.display_name || payload.full_name), username);
  const role = canonicalizeRole(payload && payload.role);
  const department = normalizeText(payload && payload.department);
  const accountStatus = normalizeAccountStatus(payload && payload.account_status);
  const moduleAccess = hasModuleAccess ? normalizeModuleAccess(source.module_access) : undefined;
  const permissionAccess = hasPermissionAccess
    ? (source.permission_access === null ? null : normalizePermissionAccess(source.permission_access))
    : undefined;

  if (!options.allowPartial && !username) {
    throw new Error('username is required');
  }

  return {
    username: username || undefined,
    display_name: displayName || undefined,
    role,
    department,
    account_status: accountStatus,
    module_access: moduleAccess,
    permission_access: permissionAccess,
  };
}

function isUpcomingCalibration(asset) {
  const raw = asset && asset.next_cal;
  if (!raw) return false;
  const nextDate = new Date(raw);
  if (Number.isNaN(nextDate.getTime())) return false;
  const now = new Date();
  const endWindow = new Date(now);
  endWindow.setDate(endWindow.getDate() + 30);
  return nextDate >= now && nextDate <= endWindow;
}

async function countRemainingActiveAdmins(db, excludedUserId) {
  const users = await db.listUsersDetailed();
  return users.filter((user) => {
    if (Number(user.id) === Number(excludedUserId)) return false;
    return user.role === 'Admin' && user.account_status === 'active';
  }).length;
}

function resolveConsoleCapabilities(user) {
  const role = canonicalizeRole(user && user.role);
  const permissions = new Set(Array.isArray(user && user.permissions) ? user.permissions : []);

  return {
    is_admin: role === 'Admin',
    can_edit_users: role === 'Admin',
    can_edit_roles: role === 'Admin',
    can_manage_departments: role === 'Admin' || permissions.has('department_management') || permissions.has('settings_access'),
  };
}

function createAdminConsoleController({ db, bcrypt, paths, hazmatDb, gagesDb }) {
  const Department = gagesDb.Department;
  const CalibrationAsset = gagesDb.CalibrationAsset;
  const Material = hazmatDb.Material;

  return {
    serveConsole: (req, res) => {
      return res.sendFile(path.join(paths.FRONTEND_PAGES_DIR, 'admin-console.html'));
    },

    session: async (req, res) => {
      return res.json({
        user: req.user,
        roles: listRoles(),
        modules: MODULE_DEFINITIONS,
        capabilities: resolveConsoleCapabilities(req.user),
      });
    },

    overview: async (req, res) => {
      try {
        const [users, calibrationAssets, hazmatInventory] = await Promise.all([
          db.listUsersDetailed(),
          CalibrationAsset.findAll({ attributes: ['id', 'next_cal'] }),
          Material.count(),
        ]);

        const totalUsers = users.length;
        const activeUsers = users.filter((user) => user.account_status === 'active').length;
        const calibrationAssetCount = calibrationAssets.length;
        const upcomingCalibrations = calibrationAssets.filter(isUpcomingCalibration).length;

        return res.json({
          total_users: totalUsers,
          active_users: activeUsers,
          calibration_assets: calibrationAssetCount,
          hazmat_inventory: Number(hazmatInventory || 0),
          upcoming_calibrations: upcomingCalibrations,
        });
      } catch (error) {
        console.error('admin overview', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load admin overview' });
      }
    },

    listUsers: async (req, res) => {
      try {
        const users = await db.listUsersDetailed();
        return res.json(users);
      } catch (error) {
        console.error('admin list users', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load users' });
      }
    },

    createUser: async (req, res) => {
      try {
        const password = String((req.body && req.body.password) || '');
        if (password.length < 8) {
          return res.status(400).json({ error: 'password must be at least 8 characters' });
        }

        const payload = normalizeUserPayload(req.body || {});
        const existing = await db.getUserByUsername(payload.username);
        if (existing) {
          return res.status(409).json({ error: 'username already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const id = await db.createUser({
          ...payload,
          password_hash: passwordHash,
        });
        const created = await db.getUserById(id);
        return res.status(201).json(created);
      } catch (error) {
        const message = error && error.message ? error.message : 'failed to create user';
        return res.status(/required/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    updateUser: async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: 'invalid user id' });
        }

        const existing = await db.getUserRecordById(id);
        if (!existing) {
          return res.status(404).json({ error: 'user not found' });
        }

        const input = req.body || {};
        const payload = normalizeUserPayload({
          ...existing,
          ...input,
        }, { allowPartial: true });

        if (!Object.prototype.hasOwnProperty.call(input, 'module_access')) {
          delete payload.module_access;
        }

        if (!Object.prototype.hasOwnProperty.call(input, 'permission_access')) {
          delete payload.permission_access;
        }

        if (payload.username && payload.username !== existing.username) {
          const duplicate = await db.getUserByUsername(payload.username);
          if (duplicate && Number(duplicate.id) !== id) {
            return res.status(409).json({ error: 'username already exists' });
          }
        }

        if (Number(req.user && req.user.id) === id) {
          if (payload.account_status === 'disabled') {
            return res.status(400).json({ error: 'cannot disable the current admin session' });
          }
          if (existing.role === 'Admin' && payload.role !== 'Admin') {
            return res.status(400).json({ error: 'cannot remove admin access from the current admin session' });
          }
        }

        const removingAdminAccess = existing.role === 'Admin' && (payload.role !== 'Admin' || payload.account_status === 'disabled');
        if (removingAdminAccess) {
          const remainingAdmins = await countRemainingActiveAdmins(db, id);
          if (remainingAdmins <= 0) {
            return res.status(400).json({ error: 'at least one active admin account must remain' });
          }
        }

        await db.updateUser(id, payload);
        const updated = await db.getUserById(id);
        return res.json(updated);
      } catch (error) {
        const message = error && error.message ? error.message : 'failed to update user';
        return res.status(/required|invalid/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    resetPassword: async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: 'invalid user id' });
        }

        const user = await db.getUserRecordById(id);
        if (!user) {
          return res.status(404).json({ error: 'user not found' });
        }

        const nextPassword = String((req.body && req.body.password) || '');
        if (nextPassword.length < 8) {
          return res.status(400).json({ error: 'password must be at least 8 characters' });
        }

        const passwordHash = await bcrypt.hash(nextPassword, 10);
        await db.setUserPassword(id, passwordHash);
        return res.json({ ok: true });
      } catch (error) {
        console.error('admin reset password', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to reset password' });
      }
    },

    deleteUser: async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: 'invalid user id' });
        }

        const existing = await db.getUserRecordById(id);
        if (!existing) {
          return res.status(404).json({ error: 'user not found' });
        }

        if (Number(req.user && req.user.id) === id) {
          return res.status(400).json({ error: 'cannot delete the current admin session' });
        }

        if (existing.role === 'Admin' && existing.account_status === 'active') {
          const remainingAdmins = await countRemainingActiveAdmins(db, id);
          if (remainingAdmins <= 0) {
            return res.status(400).json({ error: 'at least one active admin account must remain' });
          }
        }

        const reason = normalizeText(req.body && req.body.reason);
        await db.softDeleteUser(id, req.user && req.user.id, reason || 'Deleted by admin console');
        return res.json({
          ok: true,
          id,
          message: 'User deleted. Historical module data remains available to authorized users.',
        });
      } catch (error) {
        const message = error && error.message ? error.message : 'failed to delete user';
        return res.status(/invalid|not found/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    roles: async (req, res) => {
      return res.json({
        roles: listRoles(),
        modules: MODULE_DEFINITIONS,
        capabilities: resolveConsoleCapabilities(req.user),
      });
    },

    updateRoleTemplate: async (req, res) => {
      try {
        const roleKey = canonicalizeRole(req.params.roleKey);
        const knownRoles = new Set(listRoles().map((role) => role.key));
        if (!knownRoles.has(roleKey)) {
          return res.status(404).json({ error: 'role not found' });
        }

        const current = await db.getRoleTemplateByKey(roleKey);
        const payload = req.body || {};
        const next = {
          key: roleKey,
          label: normalizeText(payload.label, (current && current.label) || roleKey),
          description: normalizeText(payload.description, current && current.description ? current.description : ''),
          modules: payload.modules === undefined
            ? (current ? current.modules : [])
            : normalizeModuleAccess(payload.modules),
          permissions: payload.permissions === undefined
            ? (current ? current.permissions : [])
            : normalizePermissionAccess(payload.permissions),
        };

        const updated = await db.upsertRoleTemplate(next);
        return res.json({
          role: updated,
          roles: listRoles(),
          modules: MODULE_DEFINITIONS,
          capabilities: resolveConsoleCapabilities(req.user),
        });
      } catch (error) {
        const message = error && error.message ? error.message : 'failed to update role template';
        return res.status(/required|invalid/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    listDepartments: async (req, res) => {
      try {
        const departments = await Department.findAll({ order: [['name', 'ASC']] });
        return res.json(departments.map((department) => ({
          id: department.id,
          name: department.name,
          supervisor: department.supervisor || '',
        })));
      } catch (error) {
        console.error('admin departments', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load departments' });
      }
    },

    createDepartment: async (req, res) => {
      try {
        const payload = normalizeDepartmentPayload(req.body || {});
        const existing = await Department.findOne({ where: { name: payload.name } });
        if (existing) {
          return res.status(409).json({ error: 'department already exists' });
        }

        const department = await Department.create(payload);
        return res.status(201).json({
          id: department.id,
          name: department.name,
          supervisor: department.supervisor || '',
        });
      } catch (error) {
        const message = error && error.message ? error.message : 'failed to create department';
        return res.status(/required/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    updateDepartment: async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: 'invalid department id' });
        }

        const department = await Department.findByPk(id);
        if (!department) {
          return res.status(404).json({ error: 'department not found' });
        }

        const payload = normalizeDepartmentPayload({ ...department.toJSON(), ...(req.body || {}) });
        const existing = await Department.findOne({ where: { name: payload.name } });
        if (existing && Number(existing.id) !== id) {
          return res.status(409).json({ error: 'department already exists' });
        }

        await department.update(payload);
        return res.json({
          id: department.id,
          name: department.name,
          supervisor: department.supervisor || '',
        });
      } catch (error) {
        const message = error && error.message ? error.message : 'failed to update department';
        return res.status(/required|invalid/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    deleteDepartment: async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: 'invalid department id' });
        }

        const department = await Department.findByPk(id);
        if (!department) {
          return res.status(404).json({ error: 'department not found' });
        }

        await department.destroy();
        return res.json({ ok: true });
      } catch (error) {
        console.error('admin delete department', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to delete department' });
      }
    },
  };
}

module.exports = {
  createAdminConsoleController,
};