function registerPageRoutes(app, controller) {
  app.get('/__ping', controller.ping);
  app.get('/announcements.json', controller.serveAnnouncementsJson);
  app.get('/index.html', controller.servePage('index.html'));
  app.get('/app.html', controller.servePage('app.html'));
  app.get('/login.html', controller.servePage('login.html'));
  app.get('/admin.html', controller.servePage('admin.html'));
  app.get('/announcements.html', controller.servePage('announcements.html'));
  app.get('/announcements_portal.html', controller.servePage('announcements_portal.html'));
  app.get('/mapping_portal.html', controller.servePage('mapping_portal.html'));
  app.get('/ticket.html', controller.servePage('ticket.html'));
  app.get('/Ticketform.html', controller.servePage('Ticketform.html'));
  app.get('*', controller.fallback);
}

module.exports = registerPageRoutes;
