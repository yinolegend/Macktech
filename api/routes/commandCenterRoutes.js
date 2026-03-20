function registerCommandCenterRoutes(app, controller, authMiddleware, requireRole, requirePermission, requireAnyModule) {
  const commandCenterOnly = requireAnyModule('dashboard', 'hazmat', 'calibration', 'failure_analysis', 'reports');
  const hazmatRead = requireAnyModule('hazmat');
  const calibrationRead = requireAnyModule('calibration');
  const debugRead = requireAnyModule('failure_analysis');
  const editOnly = requirePermission('edit_access');
  const settingsOnly = requirePermission('settings_access', 'department_management');

  app.get('/portals/command-center', controller.servePortal);

  app.get('/api/command-center/session', authMiddleware, commandCenterOnly, controller.session);
  app.post('/api/command-center/logout', authMiddleware, commandCenterOnly, controller.logout);
  app.get('/api/command-center/departments', authMiddleware, commandCenterOnly, controller.listDepartments);
  app.post('/api/command-center/departments', authMiddleware, settingsOnly, controller.createDepartment);
  app.put('/api/command-center/departments/:id', authMiddleware, settingsOnly, controller.updateDepartment);
  app.delete('/api/command-center/departments/:id', authMiddleware, settingsOnly, controller.deleteDepartment);
  app.get('/api/command-center/manufacturers', authMiddleware, hazmatRead, controller.listManufacturers);
  app.post('/api/command-center/manufacturers', authMiddleware, hazmatRead, settingsOnly, controller.createManufacturer);
  app.delete('/api/command-center/manufacturers/:id', authMiddleware, hazmatRead, settingsOnly, controller.deleteManufacturer);

  app.get('/api/command-center/materials', authMiddleware, hazmatRead, controller.listMaterials);
  app.get('/api/command-center/cas-index', authMiddleware, hazmatRead, controller.listCasIndex);
  app.get('/api/command-center/cas-index/summary', authMiddleware, hazmatRead, controller.casIndexSummary);
  app.get('/api/command-center/cas/:casNumber', authMiddleware, hazmatRead, controller.lookupCas);
  app.get('/api/command-center/sds/resolve', authMiddleware, hazmatRead, controller.resolveSdsDocument);
  app.post('/api/command-center/sds/upload', authMiddleware, hazmatRead, editOnly, controller.uploadSdsDocument);
  app.get('/api/command-center/sds-documents', authMiddleware, hazmatRead, settingsOnly, controller.listSdsDocuments);
  app.delete('/api/command-center/sds-documents/:id', authMiddleware, hazmatRead, settingsOnly, controller.deleteSdsDocument);
  app.get('/api/command-center/hazmat/sds-compliance', authMiddleware, hazmatRead, controller.getHazmatSdsCompliance);
  app.get('/api/command-center/cas-thresholds', authMiddleware, hazmatRead, controller.listCasThresholdDefaults);
  app.post('/api/command-center/cas-thresholds', authMiddleware, hazmatRead, settingsOnly, controller.createCasThresholdDefault);
  app.put('/api/command-center/cas-thresholds/:casNumber', authMiddleware, hazmatRead, settingsOnly, controller.updateCasThresholdDefault);
  app.delete('/api/command-center/cas-thresholds/:casNumber', authMiddleware, hazmatRead, settingsOnly, controller.deleteCasThresholdDefault);
  app.post('/api/command-center/materials', authMiddleware, hazmatRead, editOnly, controller.createMaterial);
  app.put('/api/command-center/materials/:id', authMiddleware, hazmatRead, editOnly, controller.updateMaterial);
  app.delete('/api/command-center/materials/:id', authMiddleware, hazmatRead, editOnly, controller.deleteMaterial);
  app.post('/api/command-center/materials/import', authMiddleware, hazmatRead, editOnly, controller.importMaterials);
  app.post('/api/command-center/materials/:id/use', authMiddleware, hazmatRead, editOnly, controller.useMaterial);
  app.post('/api/command-center/materials/:id/verify', authMiddleware, hazmatRead, editOnly, controller.verifyMaterial);

  app.get('/api/command-center/hazmat/templates', authMiddleware, hazmatRead, controller.listHazmatTemplates);
  app.post('/api/command-center/hazmat/templates', authMiddleware, hazmatRead, editOnly, controller.createHazmatTemplate);
  app.put('/api/command-center/hazmat/templates/:id', authMiddleware, hazmatRead, editOnly, controller.updateHazmatTemplate);
  app.delete('/api/command-center/hazmat/templates/:id', authMiddleware, hazmatRead, editOnly, controller.deleteHazmatTemplate);

  app.get('/api/command-center/calibration/templates', authMiddleware, calibrationRead, controller.listCalibrationTemplates);
  app.post('/api/command-center/calibration/templates', authMiddleware, calibrationRead, editOnly, controller.createCalibrationTemplate);
  app.put('/api/command-center/calibration/templates/:id', authMiddleware, calibrationRead, editOnly, controller.updateCalibrationTemplate);
  app.delete('/api/command-center/calibration/templates/:id', authMiddleware, calibrationRead, editOnly, controller.deleteCalibrationTemplate);

  app.get('/api/command-center/calibration', authMiddleware, calibrationRead, controller.listCalibration);
  app.post('/api/command-center/calibration/attachments', authMiddleware, calibrationRead, editOnly, controller.uploadCalibrationAttachment);
  app.post('/api/command-center/calibration', authMiddleware, calibrationRead, editOnly, controller.createCalibration);
  app.put('/api/command-center/calibration/:id', authMiddleware, calibrationRead, editOnly, controller.updateCalibration);
  app.delete('/api/command-center/calibration/:id', authMiddleware, calibrationRead, editOnly, controller.deleteCalibration);
  app.post('/api/command-center/calibration/import', authMiddleware, calibrationRead, editOnly, controller.importCalibration);
  app.post('/api/command-center/calibration/:id/check-out', authMiddleware, calibrationRead, editOnly, controller.checkoutCalibration);
  app.post('/api/command-center/calibration/:id/certificate', authMiddleware, calibrationRead, editOnly, controller.generateCertificate);

  app.get('/api/command-center/debug-lab/tickets', authMiddleware, debugRead, controller.listDebugTickets);
  app.post('/api/command-center/debug-lab/import', authMiddleware, debugRead, editOnly, controller.importDebugTickets);
  app.post('/api/command-center/debug-lab/tickets', authMiddleware, debugRead, editOnly, controller.createDebugTicket);
  app.get('/api/command-center/debug-lab/tickets/:id/report', authMiddleware, debugRead, controller.getDebugTicketReport);
  app.put('/api/command-center/debug-lab/tickets/:id', authMiddleware, debugRead, editOnly, controller.updateDebugTicket);
  app.delete('/api/command-center/debug-lab/tickets/:id', authMiddleware, debugRead, editOnly, controller.deleteDebugTicket);

  app.get('/api/command-center/debug-lab/tickets/:ticketId/components', authMiddleware, debugRead, controller.listDebugComponents);
  app.post('/api/command-center/debug-lab/tickets/:ticketId/components', authMiddleware, debugRead, editOnly, controller.createDebugComponent);
  app.put('/api/command-center/debug-lab/components/:id', authMiddleware, debugRead, editOnly, controller.updateDebugComponent);
  app.delete('/api/command-center/debug-lab/components/:id', authMiddleware, debugRead, editOnly, controller.deleteDebugComponent);

  app.get('/api/command-center/debug-lab/analytics', authMiddleware, debugRead, controller.getDebugAnalytics);
  app.get('/api/command-center/debug-lab/pattern-alert', authMiddleware, debugRead, controller.getDebugPatternAlert);
  app.get('/api/command-center/debug-lab/systemic-issues', authMiddleware, debugRead, controller.listDebugSystemicIssues);

  app.get('/api/command-center/asset-logs', authMiddleware, commandCenterOnly, controller.listAssetLogs);

  app.get('/api/command-center/logs', authMiddleware, commandCenterOnly, controller.listLogs);
}

module.exports = registerCommandCenterRoutes;