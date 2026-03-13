function createAnnouncementController({ announcementsService, io, announcementUpload }) {
  return {
    createAnnouncement: (req, res) => {
      try {
        const { title, body, date, image } = req.body || {};
        if (!req.user || req.user.username !== 'admin') {
          return res.status(403).json({ error: 'forbidden' });
        }
        if (!title || !body) return res.status(400).json({ error: 'title and body are required' });

        const announcements = announcementsService.readAnnouncements();
        const announcement = {
          id: Date.now(),
          title: String(title).trim(),
          body: String(body),
          date: (date && String(date)) || new Date().toISOString().slice(0, 10),
          image: image ? String(image).trim() : undefined,
          author: req.user && req.user.username,
          hidden: false,
        };

        announcements.unshift(announcement);
        announcementsService.writeAnnouncements(announcements);

        try {
          io.emit('announcement.created', announcement);
        } catch (error) {
        }

        return res.status(201).json({ ok: true, announcement });
      } catch (error) {
        console.error('post announcement failed', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to publish announcement' });
      }
    },

    listAnnouncements: (req, res) => {
      try {
        const { list, mutated } = announcementsService.ensureAnnouncementIds(announcementsService.readAnnouncements());
        if (mutated) announcementsService.writeAnnouncements(list);
        return res.json(list);
      } catch (error) {
        console.error('failed to read announcements', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to read announcements' });
      }
    },

    deleteAnnouncement: (req, res) => {
      try {
        const targetId = announcementsService.normalizeAnnouncementId(req.params.id);
        const announcements = announcementsService.readAnnouncements();
        const index = announcements.findIndex((announcement) => announcementsService.normalizeAnnouncementId(announcement.id) === targetId);
        if (index === -1) return res.status(404).json({ error: 'not found' });

        const [removed] = announcements.splice(index, 1);
        announcementsService.writeAnnouncements(announcements);
        announcementsService.cleanupUnusedAnnouncementFiles(announcements);

        try {
          io.emit('announcement.deleted', { id: removed && removed.id });
        } catch (error) {
        }

        return res.json({ ok: true, removed });
      } catch (error) {
        console.error('delete announcement', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to delete' });
      }
    },

    patchAnnouncement: (req, res) => {
      try {
        const targetId = announcementsService.normalizeAnnouncementId(req.params.id);
        const patch = req.body || {};
        const announcements = announcementsService.readAnnouncements();
        const index = announcements.findIndex((announcement) => announcementsService.normalizeAnnouncementId(announcement.id) === targetId);
        if (index === -1) return res.status(404).json({ error: 'not found' });

        const announcement = Object.assign({}, announcements[index]);
        if (typeof patch.hidden !== 'undefined') announcement.hidden = !!patch.hidden;
        if (typeof patch.title !== 'undefined') announcement.title = String(patch.title);
        if (typeof patch.body !== 'undefined') announcement.body = String(patch.body);
        if (typeof patch.image !== 'undefined') announcement.image = patch.image ? String(patch.image) : undefined;
        announcements[index] = announcement;
        announcementsService.writeAnnouncements(announcements);
        announcementsService.cleanupUnusedAnnouncementFiles(announcements);

        try {
          io.emit('announcement.updated', announcement);
        } catch (error) {
        }

        return res.json({ ok: true, announcement });
      } catch (error) {
        console.error('patch announcement', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to patch' });
      }
    },

    reorderAnnouncements: (req, res) => {
      try {
        const order = req.body && Array.isArray(req.body.order) ? req.body.order.map((value) => String(value)) : null;
        if (!order) return res.status(400).json({ error: 'order array required' });

        const announcements = announcementsService.readAnnouncements();
        const byId = new Map(announcements.map((announcement) => [String(announcement.id), announcement]));
        const reordered = [];
        for (const id of order) {
          if (byId.has(id)) reordered.push(byId.get(id));
        }
        for (const announcement of announcements) {
          if (!order.includes(String(announcement.id))) reordered.push(announcement);
        }

        announcementsService.writeAnnouncements(reordered);
        try {
          io.emit('announcement.reordered', { order: reordered.map((announcement) => announcement.id) });
        } catch (error) {
        }

        return res.json({ ok: true, order: reordered.map((announcement) => announcement.id) });
      } catch (error) {
        console.error('reorder announcements', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to reorder' });
      }
    },

    uploadImage: (req, res) => {
      return announcementUpload.single('image')(req, res, (error) => {
        try {
          if (error) {
            console.error('upload image failed', error);
            return res.status(400).json({ error: error.message || 'upload failed' });
          }
          if (!req.file) return res.status(400).json({ error: 'image required' });
          const url = `/announcements-files/${encodeURIComponent(req.file.filename)}`;
          return res.json({ ok: true, url });
        } catch (handlerError) {
          console.error('upload image failed', handlerError && handlerError.message ? handlerError.message : handlerError);
          return res.status(500).json({ error: 'upload failed' });
        }
      });
    },
  };
}

module.exports = {
  createAnnouncementController,
};
