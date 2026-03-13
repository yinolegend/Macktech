function registerCommandCenterRoutes(app, controller, authMiddleware, requireRole) {
  const commandCenterOnly = requireRole('Command_Center', 'Warehouse_Admin');

  app.get('/portals/command-center', authMiddleware, commandCenterOnly, controller.servePortal);

  app.get('/api/command-center/session', authMiddleware, commandCenterOnly, controller.session);
  app.post('/api/command-center/logout', authMiddleware, commandCenterOnly, controller.logout);
  app.get('/api/command-center/departments', authMiddleware, commandCenterOnly, controller.listDepartments);
  app.post('/api/command-center/departments', authMiddleware, commandCenterOnly, controller.createDepartment);
  app.put('/api/command-center/departments/:id', authMiddleware, commandCenterOnly, controller.updateDepartment);
  app.delete('/api/command-center/departments/:id', authMiddleware, commandCenterOnly, controller.deleteDepartment);

  app.get('/api/command-center/materials', authMiddleware, commandCenterOnly, controller.listMaterials);
  app.post('/api/command-center/materials', authMiddleware, commandCenterOnly, controller.createMaterial);
  app.put('/api/command-center/materials/:id', authMiddleware, commandCenterOnly, controller.updateMaterial);
  app.delete('/api/command-center/materials/:id', authMiddleware, commandCenterOnly, controller.deleteMaterial);
  app.post('/api/command-center/materials/import', authMiddleware, commandCenterOnly, controller.importMaterials);
  app.post('/api/command-center/materials/:id/use', authMiddleware, commandCenterOnly, controller.useMaterial);
  app.post('/api/command-center/materials/:id/verify', authMiddleware, commandCenterOnly, controller.verifyMaterial);

  app.get('/api/command-center/hazmat/templates', authMiddleware, commandCenterOnly, controller.listHazmatTemplates);
  app.post('/api/command-center/hazmat/templates', authMiddleware, commandCenterOnly, controller.createHazmatTemplate);
  app.put('/api/command-center/hazmat/templates/:id', authMiddleware, commandCenterOnly, controller.updateHazmatTemplate);
  app.delete('/api/command-center/hazmat/templates/:id', authMiddleware, commandCenterOnly, controller.deleteHazmatTemplate);

  app.get('/api/command-center/calibration/templates', authMiddleware, commandCenterOnly, controller.listCalibrationTemplates);
  app.post('/api/command-center/calibration/templates', authMiddleware, commandCenterOnly, controller.createCalibrationTemplate);
  app.put('/api/command-center/calibration/templates/:id', authMiddleware, commandCenterOnly, controller.updateCalibrationTemplate);
  app.delete('/api/command-center/calibration/templates/:id', authMiddleware, commandCenterOnly, controller.deleteCalibrationTemplate);

  app.get('/api/command-center/calibration', authMiddleware, commandCenterOnly, controller.listCalibration);
  app.post('/api/command-center/calibration/attachments', authMiddleware, commandCenterOnly, controller.uploadCalibrationAttachment);
  app.post('/api/command-center/calibration', authMiddleware, commandCenterOnly, controller.createCalibration);
  app.put('/api/command-center/calibration/:id', authMiddleware, commandCenterOnly, controller.updateCalibration);
  app.delete('/api/command-center/calibration/:id', authMiddleware, commandCenterOnly, controller.deleteCalibration);
  app.post('/api/command-center/calibration/import', authMiddleware, commandCenterOnly, controller.importCalibration);
  app.post('/api/command-center/calibration/:id/check-out', authMiddleware, commandCenterOnly, controller.checkoutCalibration);
  app.post('/api/command-center/calibration/:id/certificate', authMiddleware, commandCenterOnly, controller.generateCertificate);

  app.get('/api/command-center/debug-lab/tickets', authMiddleware, commandCenterOnly, controller.listDebugTickets);
  app.post('/api/command-center/debug-lab/tickets', authMiddleware, commandCenterOnly, controller.createDebugTicket);
  app.get('/api/command-center/debug-lab/tickets/:id/report', authMiddleware, commandCenterOnly, controller.getDebugTicketReport);
  app.put('/api/command-center/debug-lab/tickets/:id', authMiddleware, commandCenterOnly, controller.updateDebugTicket);
  app.delete('/api/command-center/debug-lab/tickets/:id', authMiddleware, commandCenterOnly, controller.deleteDebugTicket);

  app.get('/api/command-center/debug-lab/tickets/:ticketId/components', authMiddleware, commandCenterOnly, controller.listDebugComponents);
  app.post('/api/command-center/debug-lab/tickets/:ticketId/components', authMiddleware, commandCenterOnly, controller.createDebugComponent);
  app.put('/api/command-center/debug-lab/components/:id', authMiddleware, commandCenterOnly, controller.updateDebugComponent);
  app.delete('/api/command-center/debug-lab/components/:id', authMiddleware, commandCenterOnly, controller.deleteDebugComponent);

  app.get('/api/command-center/debug-lab/analytics', authMiddleware, commandCenterOnly, controller.getDebugAnalytics);
  app.get('/api/command-center/debug-lab/pattern-alert', authMiddleware, commandCenterOnly, controller.getDebugPatternAlert);
  app.get('/api/command-center/debug-lab/systemic-issues', authMiddleware, commandCenterOnly, controller.listDebugSystemicIssues);

  app.get('/api/command-center/asset-logs', authMiddleware, commandCenterOnly, controller.listAssetLogs);

  app.get('/api/command-center/logs', authMiddleware, commandCenterOnly, controller.listLogs);
}

module.exports = registerCommandCenterRoutes;