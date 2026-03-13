function registerHandbookRoutes(app, controller, authMiddleware) {
  app.get('/api/handbook/departments', controller.getDepartments);
  app.get('/api/handbook', controller.list);
  app.post('/api/handbook', authMiddleware, controller.upload);
  app.patch('/api/handbook/:filename', authMiddleware, controller.patch);
  app.delete('/api/handbook/:filename', authMiddleware, controller.remove);
}

module.exports = registerHandbookRoutes;
