function registerUserRoutes(app, controller, authMiddleware) {
  app.get('/api/users', authMiddleware, controller.listUsers);
  app.get('/api/ad/users', controller.searchAdUsers);
}

module.exports = registerUserRoutes;
