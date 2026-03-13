const ROLE_DEFAULT_PORTAL_TARGETS = {
  Warehouse_Admin: {
    redirectTo: '/portals/hazmat',
    cookieName: 'hazmat_access',
  },
  Command_Center: {
    redirectTo: '/portals/command-center',
    cookieName: 'command_center_access',
  },
};

const REQUESTED_PORTAL_TARGETS = {
  hazmat: {
    redirectTo: '/portals/hazmat',
    cookieName: 'hazmat_access',
  },
  'command-center': {
    redirectTo: '/portals/command-center',
    cookieName: 'command_center_access',
  },
};

function normalizeRequestedPortal(value) {
  const raw = String(value || '').trim().toLowerCase();
  return REQUESTED_PORTAL_TARGETS[raw] ? raw : '';
}

function resolvePortalTarget(role, requestedPortal) {
  const normalizedPortal = normalizeRequestedPortal(requestedPortal);

  if (normalizedPortal === 'command-center') {
    if (role === 'Admin' || role === 'Command_Center' || role === 'Warehouse_Admin') {
      return REQUESTED_PORTAL_TARGETS[normalizedPortal];
    }
  }

  if (normalizedPortal === 'hazmat') {
    if (role === 'Admin' || role === 'Warehouse_Admin') {
      return REQUESTED_PORTAL_TARGETS[normalizedPortal];
    }
  }

  return ROLE_DEFAULT_PORTAL_TARGETS[role] || null;
}

function clearPortalCookies(res) {
  const cookieNames = new Set([
    ...Object.values(ROLE_DEFAULT_PORTAL_TARGETS).map((target) => target.cookieName),
    ...Object.values(REQUESTED_PORTAL_TARGETS).map((target) => target.cookieName),
  ]);

  for (const cookieName of cookieNames) {
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

function destroyCommandCenterSession(req, res) {
  if (!req || !req.session || !req.session.commandCenterUserId) return Promise.resolve();

  return new Promise((resolve) => {
    req.session.destroy(() => {
      res.clearCookie('mack_session', { path: '/' });
      resolve();
    });
  });
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
        const id = await db.createUser({ username, password_hash: hash, display_name, role: 'User' });
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
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return res.status(401).json({ error: 'invalid credentials' });

        const role = user.role || 'User';
        const token = jwt.sign({ id: user.id, username: user.username, role }, jwtSecret, { expiresIn: jwtExpiresIn });
  const portalTarget = resolvePortalTarget(role, portal);

        clearPortalCookies(res);
        if (portalTarget) {
          res.cookie(portalTarget.cookieName, token, {
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
            path: '/',
          });
        }

        if (portalTarget && portalTarget.cookieName === 'command_center_access' && req.session) {
          req.session.commandCenterUserId = user.id;
          req.session.commandCenterRole = role;
          await saveSession(req);
        } else {
          await destroyCommandCenterSession(req, res);
        }

        return res.json({
          token,
          redirectTo: portalTarget ? portalTarget.redirectTo : null,
          user: {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            role,
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
  };
}

module.exports = {
  createAuthController,
};
