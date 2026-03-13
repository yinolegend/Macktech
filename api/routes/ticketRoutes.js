function registerTicketRoutes(app, controller, authMiddleware) {
  app.get('/api/tickets', controller.listTickets);
  app.post('/api/tickets', controller.createTicket);
  app.put('/api/tickets/:id', authMiddleware, controller.updateTicket);
  app.get('/api/tickets/:id', controller.getTicket);
  app.get('/api/tickets/:id/events', authMiddleware, controller.getTicketEvents);
  app.post('/api/tickets/:id/events', authMiddleware, controller.createTicketEvent);
}

module.exports = registerTicketRoutes;
