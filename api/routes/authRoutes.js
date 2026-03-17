function registerAuthRoutes(app, controller, authMiddleware) {
  app.post('/api/register', controller.register);
  app.post('/api/login', controller.login);
  app.get('/api/me', authMiddleware, controller.me);
  app.post('/api/logout', authMiddleware, controller.logout);
}

module.exports = registerAuthRoutes;
