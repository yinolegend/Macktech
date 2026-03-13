function createAuthHelpers({ db, ad, jwt, jwtSecret }) {
  function requestPrefersHtml(req) {
    const accept = String((req && req.headers && req.headers.accept) || '');
    return String((req && req.method) || 'GET').toUpperCase() === 'GET' && accept.includes('text/html');
  }

  function getPortalCookieName(req) {
    const requestPath = String((req && req.path) || '');
    if (requestPath === '/portals/hazmat' || requestPath.startsWith('/api/hazmat')) {
      return 'hazmat_access';
    }
    if (requestPath === '/portals/command-center' || requestPath.startsWith('/api/command-center')) {
      return 'command_center_access';
    }
    return '';
  }

  function requestSupportsCommandCenterSession(req) {
    const requestPath = String((req && req.path) || '');
    return requestPath === '/portals/command-center' || requestPath.startsWith('/api/command-center');
  }

  function readCookie(req, cookieName) {
    const source = String((req && req.headers && req.headers.cookie) || '');
    if (!source) return '';
    const parts = source.split(';');
    for (const part of parts) {
      const [name, ...rest] = part.split('=');
      if (String(name || '').trim() !== cookieName) continue;
      return decodeURIComponent(rest.join('=').trim());
    }
    return '';
  }

  async function resolveUserFromRequest(req) {
    try {
      let token = '';
      const authorization = req.headers.authorization;
      if (authorization && authorization.startsWith('Bearer ')) {
        token = authorization.slice(7);
      } else {
        const cookieName = getPortalCookieName(req);
        if (cookieName) {
          token = readCookie(req, cookieName);
        }
      }

      if (token) {
        const payload = jwt.verify(token, jwtSecret);
        const user = await db.getUserById(payload.id);
        if (user) return user;
      }
    } catch (error) {
    }

    if (requestSupportsCommandCenterSession(req) && req.session && req.session.commandCenterUserId) {
      try {
        const user = await db.getUserById(req.session.commandCenterUserId);
        if (user) return user;
      } catch (error) {
      }
    }

    const headerNames = ['x-remote-user', 'remote-user', 'x-forwarded-user', 'remote_user'];
    for (const headerName of headerNames) {
      const value = req.headers[headerName];
      if (!value) continue;

      let sam = String(value);
      if (sam.includes('\\')) sam = sam.split('\\').pop();
      if (sam.includes('@')) sam = sam.split('@')[0];

      let adInfo = null;
      if (ad && typeof ad.lookupUserBySamAccountName === 'function' && ad.configured && ad.configured()) {
        try {
          adInfo = await ad.lookupUserBySamAccountName(sam);
        } catch (error) {
          console.error('AD lookup failed', error && error.message ? error.message : error);
        }
      }

      try {
        let user = await db.getUserByUsername(sam);
        if (!user) {
          const display_name = (adInfo && adInfo.displayName) || sam;
          const id = await db.createUser({
            username: sam,
            password_hash: null,
            display_name,
            role: 'User',
            external: 1,
          });
          user = await db.getUserById(id);
        }
        return user;
      } catch (error) {
        console.error('Failed to resolve/create local user for SSO', error && error.message ? error.message : error);
        return null;
      }
    }

    return null;
  }

  async function authMiddleware(req, res, next) {
    try {
      const user = await resolveUserFromRequest(req);
      if (!user) {
        if (requestPrefersHtml(req)) {
          return res.redirect('/admin.html#signin');
        }
        return res.status(401).json({ error: 'missing token or SSO header' });
      }
      req.user = {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role || 'User',
      };
      return next();
    } catch (error) {
      console.error('authMiddleware', error && error.message ? error.message : error);
      if (requestPrefersHtml(req)) {
        return res.redirect('/admin.html#signin');
      }
      return res.status(401).json({ error: 'authentication failed' });
    }
  }

  function requireRole(...roles) {
    const allowedRoles = new Set(roles.filter(Boolean));
    return (req, res, next) => {
      const currentRole = req.user && req.user.role;
      if (currentRole === 'Admin') {
        return next();
      }
      if (!allowedRoles.size || allowedRoles.has(currentRole)) {
        return next();
      }

      if (requestPrefersHtml(req)) {
        return res.redirect('/admin.html#signin');
      }

      return res.status(403).json({ error: 'forbidden' });
    };
  }

  return {
    resolveUserFromRequest,
    authMiddleware,
    requireRole,
  };
}

module.exports = {
  createAuthHelpers,
};
