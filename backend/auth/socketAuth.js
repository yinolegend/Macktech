function createSocketAuthMiddleware({ db, ad, jwt, jwtSecret }) {
  return (socket, next) => {
    (async () => {
      try {
        const token = socket.handshake.auth && socket.handshake.auth.token;
        if (token) {
          try {
            const payload = jwt.verify(token, jwtSecret);
            const user = await db.getUserById(payload.id);
            if (user) socket.user = { id: user.id, username: user.username };
            return next();
          } catch (error) {
          }
        }

        const headers = socket.handshake.headers || {};
        const headerNames = ['x-remote-user', 'remote-user', 'x-forwarded-user', 'remote_user'];
        for (const headerName of headerNames) {
          const value = headers[headerName];
          if (!value) continue;

          let sam = String(value);
          if (sam.includes('\\')) sam = sam.split('\\').pop();
          if (sam.includes('@')) sam = sam.split('@')[0];

          try {
            let user = await db.getUserByUsername(sam);
            if (!user && ad && ad.configured && ad.configured()) {
              const adInfo = await ad.lookupUserBySamAccountName(sam);
              const display_name = (adInfo && adInfo.displayName) || sam;
              const id = await db.createUser({
                username: sam,
                password_hash: null,
                display_name,
                external: 1,
              });
              user = await db.getUserById(id);
            }
            if (user) socket.user = { id: user.id, username: user.username };
            return next();
          } catch (error) {
            console.error('socket SSO failure', error && error.message ? error.message : error);
            return next();
          }
        }

        return next();
      } catch (error) {
        return next();
      }
    })();
  };
}

module.exports = {
  createSocketAuthMiddleware,
};
