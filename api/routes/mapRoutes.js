function registerMapRoutes(app, controller, authMiddleware) {
  app.get('/api/maps', controller.listMaps);
  app.get('/api/map', controller.getMap);
  app.get('/api/map/icons', controller.getIcons);
  app.get('/api/maps/:mapId/export.svg', controller.exportSvg);
  app.get('/api/maps/:mapId/export.pdf', controller.exportPdf);
  app.post('/api/maps', authMiddleware, controller.createMap);
  app.patch('/api/maps/:mapId', authMiddleware, controller.patchMap);
  app.delete('/api/maps/:mapId', authMiddleware, controller.deleteMap);
  app.put('/api/map', authMiddleware, controller.saveMap);
  app.post('/api/map/upload-image', authMiddleware, controller.uploadImage);
}

module.exports = registerMapRoutes;
