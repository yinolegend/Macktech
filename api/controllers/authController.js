const { buildAccessProfile } = require('../../config/access');
const { SESSION_MAX_AGE_MS } = require('../../config/app');

const REQUESTED_PORTAL_TARGETS = {
  admin: {
    redirectTo: '/admin-console',
    cookieName: '',
  },
  hazmat: {
    redirectTo: '/portals/hazmat',
    cookieName: 'hazmat_access',
  },
  'command-center': {
    redirectTo: '/portals/command-center',
    cookieName: 'command_center_access',
  },
  announcements: {
    redirectTo: '/announcements_portal.html',
    cookieName: '',
  },
  mapping: {
    redirectTo: '/mapping_portal.html',
    cookieName: '',
  },
};

function normalizeRequestedPortal(value) {
  const raw = String(value || '').trim().toLowerCase();
  return REQUESTED_PORTAL_TARGETS[raw] ? raw : '';
}

function hasOperationalModuleAccess(access) {
  if (!access || !Array.isArray(access.modules)) return false;
  return access.modules.some((moduleKey) => {
    return moduleKey === 'dashboard'
      || moduleKey === 'hazmat'
      || moduleKey === 'calibration'
      || moduleKey === 'failure_analysis'
      || moduleKey === 'reports';
  });
}

function resolvePortalTarget(role, requestedPortal) {
  return null;
}

function clearPortalCookies(res) {
  const cookieNames = new Set([
    ...Object.values(REQUESTED_PORTAL_TARGETS).map((target) => target.cookieName),
  ]);

  for (const cookieName of cookieNames) {
    if (!cookieName) continue;
    res.clearCookie(cookieName, { path: '/' });
  }
}

function saveSession(req) {
  if (!req || !req.session) return Promise.resolve();

  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

function destroyLocalSession(req, res) {
  if (!req || !req.session) return Promise.resolve();

  return new Promise((resolve) => {
    req.session.destroy(() => {
      res.clearCookie('command_center_session', { path: '/' });
      resolve();
    });
  });
}

function buildLocalSessionState(user) {
  const access = buildAccessProfile(user);
  return {
    user_id: user.id,
    role: access.role,
    permissions: access.permissions,
    modules: access.modules,
    department: user.department || '',
    expires_at: Date.now() + SESSION_MAX_AGE_MS,
  };
}

function userCanAccessRequestedPortal(user, requestedPortal) {
  const access = buildAccessProfile(user);
  const normalizedPortal = normalizeRequestedPortal(requestedPortal);

  if (!normalizedPortal) {
    return true;
  }

  if (access.permissions.includes('admin_console')) {
    return true;
  }

  if (normalizedPortal === 'command-center') {
    return access.modules.some((moduleKey) => moduleKey === 'dashboard' || moduleKey === 'hazmat' || moduleKey === 'calibration' || moduleKey === 'failure_analysis' || moduleKey === 'reports');
  }

  if (normalizedPortal === 'hazmat') {
    return access.modules.includes('hazmat');
  }

  if (normalizedPortal === 'announcements') {
    return true;
  }

  if (normalizedPortal === 'mapping') {
    return String((user && user.username) || '').trim().toLowerCase() === 'admin';
  }

  if (normalizedPortal === 'admin') {
    return access.permissions.includes('admin_console');
  }

  return false;
}

function resolvePortalTargetForUser(user, requestedPortal) {
  const access = buildAccessProfile(user);
  const normalizedPortal = normalizeRequestedPortal(requestedPortal);
  const username = String((user && user.username) || '').trim().toLowerCase();

  // Honor an explicit portal choice first, then fall back to role landing logic.
  if (normalizedPortal === 'admin') {
    return access.permissions.includes('admin_console')
      ? REQUESTED_PORTAL_TARGETS.admin
      : null;
  }

  if (normalizedPortal === 'mapping') {
    return username === 'admin' ? REQUESTED_PORTAL_TARGETS.mapping : null;
  }

  if (normalizedPortal === 'announcements') {
    return REQUESTED_PORTAL_TARGETS.announcements;
  }

  if (normalizedPortal === 'hazmat') {
    return access.modules.includes('hazmat')
      ? REQUESTED_PORTAL_TARGETS.hazmat
      : null;
  }

  if (normalizedPortal === 'command-center') {
    return (hasOperationalModuleAccess(access) || access.permissions.includes('admin_console'))
      ? REQUESTED_PORTAL_TARGETS['command-center']
      : null;
  }

  if (access.permissions.includes('admin_console')) {
    return REQUESTED_PORTAL_TARGETS.admin;
  }

  if (access.landingRoute === '/portals/command-center') {
    return REQUESTED_PORTAL_TARGETS['command-center'];
  }

  return {
    redirectTo: access.landingRoute,
    cookieName: '',
  };
}

function createAuthController({ db, bcrypt, jwt, jwtSecret, jwtExpiresIn }) {
  return {
    register: async (req, res) => {
      try {
        const { username, password, display_name } = req.body || {};
        if (!username || !password) {
          return res.status(400).json({ error: 'username and password required' });
        }
        const existing = await db.getUserByUsername(username);
        if (existing) return res.status(409).json({ error: 'username taken' });

        const hash = await bcrypt.hash(password, 10);
        const id = await db.createUser({ username, password_hash: hash, display_name, role: 'Viewer' });
        const user = await db.getUserById(id);
        return res.status(201).json(user);
      } catch (error) {
        console.error('register', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'registration failed' });
      }
    },

    login: async (req, res) => {
      try {
        const { username, password, portal } = req.body || {};
        if (!username || !password) {
          return res.status(400).json({ error: 'username and password required' });
        }

        const user = await db.getUserByUsername(username);
        if (!user) return res.status(401).json({ error: 'invalid credentials' });
        if (String(user.account_status || '').toLowerCase() === 'disabled') {
          return res.status(403).json({ error: 'account disabled' });
        }
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return res.status(401).json({ error: 'invalid credentials' });

        const role = user.role || 'Viewer';
        if (!userCanAccessRequestedPortal(user, portal)) {
          return res.status(403).json({ error: 'account does not have access to the requested portal' });
        }

        const token = jwt.sign({ id: user.id, username: user.username, role }, jwtSecret, { expiresIn: jwtExpiresIn });
        const portalTarget = resolvePortalTargetForUser(user, portal);

        clearPortalCookies(res);
        if (portalTarget && portalTarget.cookieName) {
          res.cookie(portalTarget.cookieName, token, {
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
            path: '/',
          });
        }

        if (req.session) {
          req.session.auth = buildLocalSessionState(user);
          await saveSession(req);
        } else {
          await destroyLocalSession(req, res);
        }

        return res.json({
          token,
          redirectTo: portalTarget ? portalTarget.redirectTo : null,
          user: {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            department: user.department || '',
            role,
            modules: user.modules,
            permissions: user.permissions,
            landing_route: user.landing_route,
            account_status: user.account_status,
          },
        });
      } catch (error) {
        console.error('login', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'login failed' });
      }
    },

    me: async (req, res) => {
      try {
        const user = await db.getUserById(req.user.id);
        return res.json(user);
      } catch (error) {
        return res.status(500).json({ error: 'failed' });
      }
    },

    logout: async (req, res) => {
      clearPortalCookies(res);
      await destroyLocalSession(req, res);
      return res.json({ ok: true });
    },
  };
}

module.exports = {
  createAuthController,
};
