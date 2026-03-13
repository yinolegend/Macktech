const fs = require('fs');
const path = require('path');

function createHandbookController({ handbookService, resolveUserFromRequest, handbookUpload }) {
  return {
    getDepartments: (req, res) => {
      return res.json({
        defaultDepartment: handbookService.DEFAULT_HANDBOOK_DEPARTMENT,
        departments: handbookService.HANDBOOK_DEPARTMENTS,
      });
    },

    list: async (req, res) => {
      try {
        const includeAll = String(req.query.all || req.query.includeHidden || '') === '1';
        const department = handbookService.getRequestedHandbookDepartment(req);
        if (includeAll) {
          const user = await resolveUserFromRequest(req);
          if (!user) return res.status(401).json({ error: 'missing token or SSO header' });
        }

        const list = handbookService.getHandbookFilesWithVisibility({ department });
        if (includeAll) return res.json(list);
        return res.json(list.filter((item) => !item.hidden));
      } catch (error) {
        console.error('handbook list', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to list handbook' });
      }
    },

    upload: (req, res) => {
      handbookUpload.single('pdf')(req, res, (error) => {
        if (error) {
          console.error('upload handbook error', error);
          return res.status(400).json({ error: error.message || 'upload failed' });
        }
        try {
          if (!req.file) return res.status(400).json({ error: 'PDF file required' });
          const department = handbookService.normalizeDepartmentId(req.body && req.body.department);
          const visibility = handbookService.readHandbookVisibilityMap();
          if (visibility[req.file.filename]) {
            delete visibility[req.file.filename];
            handbookService.writeHandbookVisibilityMap(visibility);
          }
          const metadata = handbookService.readHandbookMetadataMap();
          metadata[req.file.filename] = { department };
          handbookService.writeHandbookMetadataMap(metadata);
          return res.json({
            ok: true,
            filename: req.file.filename,
            url: `/pdf-handbook/${encodeURIComponent(req.file.filename)}`,
            department,
            departmentLabel: handbookService.getDepartmentLabel(department),
          });
        } catch (handlerError) {
          console.error('upload handbook', handlerError && handlerError.message ? handlerError.message : handlerError);
          return res.status(500).json({ error: 'upload failed' });
        }
      });
    },

    patch: (req, res) => {
      try {
        const filename = handbookService.sanitizeHandbookFilename(req.params.filename);
        if (!filename) return res.status(400).json({ error: 'invalid filename' });

        const target = path.join(handbookService.HANDBOOK_DIR, filename);
        if (!fs.existsSync(target)) return res.status(404).json({ error: 'file not found' });

        const patch = req.body || {};
        const updateHidden = Object.prototype.hasOwnProperty.call(patch, 'hidden');
        const updateDepartment = Object.prototype.hasOwnProperty.call(patch, 'department');
        if (!updateHidden && !updateDepartment) {
          return res.status(400).json({ error: 'hidden or department is required' });
        }

        const visibility = handbookService.readHandbookVisibilityMap();
        const metadata = handbookService.readHandbookMetadataMap();

        if (updateHidden) {
          const hidden = !!patch.hidden;
          if (hidden) visibility[filename] = true;
          else delete visibility[filename];
          handbookService.writeHandbookVisibilityMap(visibility);
        }

        if (updateDepartment) {
          const nextDepartment = handbookService.normalizeDepartmentId(patch.department);
          metadata[filename] = Object.assign({}, metadata[filename], { department: nextDepartment });
          handbookService.writeHandbookMetadataMap(metadata);
        }

        const hidden = !!visibility[filename];
        const department = handbookService.normalizeDepartmentId(metadata[filename] && metadata[filename].department);
        return res.json({
          ok: true,
          filename,
          hidden,
          department,
          departmentLabel: handbookService.getDepartmentLabel(department),
        });
      } catch (error) {
        console.error('patch handbook', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to update handbook visibility' });
      }
    },

    remove: (req, res) => {
      try {
        const filename = handbookService.sanitizeHandbookFilename(req.params.filename);
        if (!filename) return res.status(400).json({ error: 'invalid filename' });

        const filePath = path.join(handbookService.HANDBOOK_DIR, filename);
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ error: 'file not found' });
        }
        fs.unlinkSync(filePath);

        const visibility = handbookService.readHandbookVisibilityMap();
        if (visibility[filename]) {
          delete visibility[filename];
          handbookService.writeHandbookVisibilityMap(visibility);
        }

        const metadata = handbookService.readHandbookMetadataMap();
        if (metadata[filename]) {
          delete metadata[filename];
          handbookService.writeHandbookMetadataMap(metadata);
        }

        return res.json({ ok: true });
      } catch (error) {
        console.error('delete handbook', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'delete failed' });
      }
    },
  };
}

module.exports = {
  createHandbookController,
};
