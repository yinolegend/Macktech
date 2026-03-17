function registerAdminConsoleRoutes(app, controller, authMiddleware, requireRole, requirePermission) {
  const adminConsoleOnly = requirePermission('admin_console');
  const adminOnly = requireRole('Admin');
  const departmentManagementOnly = requirePermission('department_management', 'settings_access');

  app.get('/admin-console', authMiddleware, adminConsoleOnly, controller.serveConsole);

  app.get('/api/admin-console/session', authMiddleware, adminConsoleOnly, controller.session);
  app.get('/api/admin-console/overview', authMiddleware, adminConsoleOnly, controller.overview);
  app.get('/api/admin-console/roles', authMiddleware, adminConsoleOnly, controller.roles);
  app.put('/api/admin-console/roles/:roleKey', authMiddleware, adminOnly, controller.updateRoleTemplate);

  app.get('/api/admin-console/users', authMiddleware, adminConsoleOnly, controller.listUsers);
  app.post('/api/admin-console/users', authMiddleware, adminOnly, controller.createUser);
  app.put('/api/admin-console/users/:id', authMiddleware, adminOnly, controller.updateUser);
  app.delete('/api/admin-console/users/:id', authMiddleware, adminOnly, controller.deleteUser);
  app.post('/api/admin-console/users/:id/reset-password', authMiddleware, adminOnly, controller.resetPassword);

  app.get('/api/admin-console/departments', authMiddleware, adminConsoleOnly, controller.listDepartments);
  app.post('/api/admin-console/departments', authMiddleware, departmentManagementOnly, controller.createDepartment);
  app.put('/api/admin-console/departments/:id', authMiddleware, departmentManagementOnly, controller.updateDepartment);
  app.delete('/api/admin-console/departments/:id', authMiddleware, departmentManagementOnly, controller.deleteDepartment);
}

module.exports = registerAdminConsoleRoutes;