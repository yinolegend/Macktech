function registerAnnouncementRoutes(app, controller, authMiddleware) {
  app.get('/api/public/announcements', controller.listPublicAnnouncements);
  app.post('/api/announcements', authMiddleware, controller.createAnnouncement);
  app.get('/api/announcements', authMiddleware, controller.listAnnouncements);
  app.patch('/api/announcements/reorder', authMiddleware, controller.reorderAnnouncements);
  app.delete('/api/announcements/:id', authMiddleware, controller.deleteAnnouncement);
  app.patch('/api/announcements/:id', authMiddleware, controller.patchAnnouncement);
  app.post('/api/announcements/upload-image', authMiddleware, controller.uploadImage);
}

module.exports = registerAnnouncementRoutes;
