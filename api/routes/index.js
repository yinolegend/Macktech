const registerAuthRoutes = require('./authRoutes');
const registerTicketRoutes = require('./ticketRoutes');
const registerHandbookRoutes = require('./handbookRoutes');
const registerMapRoutes = require('./mapRoutes');
const registerUserRoutes = require('./userRoutes');
const registerAnnouncementRoutes = require('./announcementRoutes');
const registerPageRoutes = require('./pageRoutes');
const registerHazmatRoutes = require('./hazmatRoutes');
const registerCommandCenterRoutes = require('./commandCenterRoutes');
const registerAdminConsoleRoutes = require('./adminConsoleRoutes');

function registerRoutes(app, controllers, authMiddleware, requireRole, requirePermission, requireAnyModule) {
  registerTicketRoutes(app, controllers.ticketController, authMiddleware);
  registerAuthRoutes(app, controllers.authController, authMiddleware);
  registerHandbookRoutes(app, controllers.handbookController, authMiddleware);
  registerMapRoutes(app, controllers.mapController, authMiddleware);
  registerUserRoutes(app, controllers.userController, authMiddleware);
  registerAnnouncementRoutes(app, controllers.announcementController, authMiddleware);
  registerHazmatRoutes(app, controllers.hazmatController, authMiddleware, requireRole, requirePermission, requireAnyModule);
  registerCommandCenterRoutes(app, controllers.commandCenterController, authMiddleware, requireRole, requirePermission, requireAnyModule);
  registerAdminConsoleRoutes(app, controllers.adminConsoleController, authMiddleware, requireRole, requirePermission);
  registerPageRoutes(app, controllers.pageController);
}

module.exports = registerRoutes;
