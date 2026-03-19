function registerHazmatRoutes(app, controller, authMiddleware, requireRole) {
  const warehouseAdminOnly = requireRole('Warehouse_Admin');

  app.get('/portals/hazmat', authMiddleware, warehouseAdminOnly, controller.servePortal);

  app.get('/api/hazmat/session', authMiddleware, warehouseAdminOnly, controller.session);
  app.post('/api/hazmat/logout', authMiddleware, warehouseAdminOnly, controller.logout);

  app.get('/api/hazmat/materials', authMiddleware, warehouseAdminOnly, controller.listMaterials);
  app.get('/api/hazmat/materials/search', authMiddleware, warehouseAdminOnly, controller.searchMaterials);
  app.post('/api/hazmat/materials', authMiddleware, warehouseAdminOnly, controller.createMaterial);
  app.post('/api/hazmat/materials/import', authMiddleware, warehouseAdminOnly, controller.importMaterials);
  app.post('/api/hazmat/materials/:id/sds', authMiddleware, warehouseAdminOnly, controller.uploadSds);
  app.post('/api/hazmat/materials/:id/images', authMiddleware, warehouseAdminOnly, controller.uploadImages);
  app.put('/api/hazmat/materials/:id', authMiddleware, warehouseAdminOnly, controller.updateMaterial);
  app.delete('/api/hazmat/materials/:id', authMiddleware, warehouseAdminOnly, controller.deleteMaterial);

  app.get('/api/hazmat/usage-logs', authMiddleware, warehouseAdminOnly, controller.listUsageLogs);
  app.post('/api/hazmat/usage-logs', authMiddleware, warehouseAdminOnly, controller.createUsageLog);
}

module.exports = registerHazmatRoutes;