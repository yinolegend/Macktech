const path = require('path');

function createPageController({ paths }) {
  return {
    ping: (req, res) => {
      return res.json({
        ok: true,
        time: new Date().toISOString(),
        path: req.path,
        host: req.headers.host,
      });
    },

    serveAnnouncementsJson: (req, res) => {
      return res.sendFile(paths.ANNOUNCEMENTS_PATH);
    },

    servePage: (pageName) => (req, res) => {
      return res.sendFile(path.join(paths.FRONTEND_PAGES_DIR, pageName));
    },

    fallback: (req, res) => {
      const requestPath = req.path || '';
      if (requestPath.startsWith('/app')) {
        return res.sendFile(path.join(paths.FRONTEND_PAGES_DIR, 'app.html'));
      }
      return res.sendFile(path.join(paths.FRONTEND_PAGES_DIR, 'index.html'));
    },
  };
}

module.exports = {
  createPageController,
};
