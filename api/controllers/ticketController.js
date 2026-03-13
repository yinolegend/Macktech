function createTicketController({ db, io, resolveUserFromRequest }) {
  return {
    listTickets: async (req, res) => {
      try {
        const tickets = await db.allTickets();
        return res.json(tickets);
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'failed to fetch tickets' });
      }
    },

    createTicket: async (req, res) => {
      try {
        const { title, description, requester } = req.body || {};
        if (!title) return res.status(400).json({ error: 'title required' });

        let resolved = null;
        try {
          resolved = await resolveUserFromRequest(req);
        } catch (error) {
        }

        const who = (resolved && resolved.username) || requester || 'Anonymous';
        const headers = req.headers || {};
        const computer = headers['x-computer-name'] || headers['x-client-host'] || headers['x-forwarded-for-host'] || headers['x-device'] || null;
        const location = headers['x-location'] || headers['x-site'] || headers['x-building'] || null;
        const id = await db.createTicket({
          title,
          description: description || '',
          requester: who,
          computer,
          location,
        });
        const ticket = await db.getTicket(id);

        try {
          await db.createTicketEvent({
            ticket_id: id,
            type: 'created',
            actor: who,
            message: 'Ticket created',
          });
        } catch (error) {
        }

        try {
          io.emit('ticket.created', ticket);
        } catch (error) {
          console.error('emit ticket.created', error && error.message ? error.message : error);
        }

        return res.status(201).json(ticket);
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'failed to create ticket' });
      }
    },

    updateTicket: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const fields = req.body || {};
        await db.updateTicket(id, fields);
        const ticket = await db.getTicket(id);

        try {
          const actor = req.user && req.user.username;
          await db.createTicketEvent({
            ticket_id: id,
            type: 'updated',
            actor,
            message: JSON.stringify(fields),
          });
        } catch (error) {
        }

        try {
          io.emit('ticket.updated', ticket);
        } catch (error) {
          console.error('emit ticket.updated', error && error.message ? error.message : error);
        }

        return res.json(ticket);
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'failed to update ticket' });
      }
    },

    getTicket: async (req, res) => {
      try {
        const ticket = await db.getTicket(Number(req.params.id));
        if (!ticket) return res.status(404).json({ error: 'not found' });
        return res.json(ticket);
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'failed to fetch ticket' });
      }
    },

    getTicketEvents: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const events = await db.getTicketEvents(id);
        return res.json(events);
      } catch (error) {
        console.error('events', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to fetch events' });
      }
    },

    createTicketEvent: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const { message, type } = req.body || {};
        const actor = req.user && req.user.username;
        const eventId = await db.createTicketEvent({
          ticket_id: id,
          type: type || 'note',
          actor,
          message,
        });
        return res.status(201).json({ id: eventId });
      } catch (error) {
        console.error('post event', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to post event' });
      }
    },
  };
}

module.exports = {
  createTicketController,
};
