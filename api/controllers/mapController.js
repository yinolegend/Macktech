function createMapController({
  mapService,
  io,
  mapAssetUpload,
  PDFDocument,
  SVGtoPDF,
}) {
  function isAdmin(req) {
    return !!(req.user && req.user.username === 'admin');
  }

  return {
    listMaps: (req, res) => {
      try {
        const store = mapService.readFacilityMapStore();
        return res.json({
          activeMapId: store.activeMapId,
          maps: mapService.listFacilityMapSummaries(store),
        });
      } catch (error) {
        console.error('get maps', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load maps' });
      }
    },

    getMap: (req, res) => {
      try {
        const store = mapService.readFacilityMapStore();
        const requestedId = mapService.normalizeFacilityMapRecordId(req.query && req.query.mapId, '');
        const map = requestedId
          ? (Array.isArray(store.maps) ? store.maps.find((item) => item.id === requestedId) : null)
          : mapService.getFacilityMapRecord(store, store.activeMapId);
        if (!map) return res.status(404).json({ error: 'map not found' });
        return res.json(mapService.cloneFacilityMapRecord(map));
      } catch (error) {
        console.error('get map', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load map' });
      }
    },

    getIcons: (req, res) => {
      try {
        return res.json({ icons: mapService.listLocalSvgIcons() });
      } catch (error) {
        console.error('get map icons', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load icons' });
      }
    },

    exportSvg: (req, res) => {
      try {
        const store = mapService.readFacilityMapStore();
        const requestedId = mapService.normalizeFacilityMapRecordId(req.params.mapId, '');
        const map = Array.isArray(store.maps) ? store.maps.find((item) => item.id === requestedId) : null;
        if (!map) return res.status(404).json({ error: 'map not found' });

        const svg = mapService.buildFacilityMapExportSvg(map);
        const fileStem = String(map.name || 'facility_map').trim().replace(/[^a-zA-Z0-9._-]+/g, '_') || 'facility_map';
        res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileStem}.svg"`);
        return res.send(svg);
      } catch (error) {
        console.error('export svg map', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to export svg' });
      }
    },

    exportPdf: (req, res) => {
      try {
        if (!PDFDocument || !SVGtoPDF) {
          return res.status(503).json({ error: 'pdf export is unavailable' });
        }

        const store = mapService.readFacilityMapStore();
        const requestedId = mapService.normalizeFacilityMapRecordId(req.params.mapId, '');
        const map = Array.isArray(store.maps) ? store.maps.find((item) => item.id === requestedId) : null;
        if (!map) return res.status(404).json({ error: 'map not found' });

        const width = Number(map.canvas && map.canvas.width) || 1400;
        const height = Number(map.canvas && map.canvas.height) || 850;
        const svg = mapService.buildFacilityMapExportSvg(map);
        const fileStem = String(map.name || 'facility_map').trim().replace(/[^a-zA-Z0-9._-]+/g, '_') || 'facility_map';
        const doc = new PDFDocument({ size: [width, height], margin: 0 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileStem}.pdf"`);
        doc.pipe(res);
        SVGtoPDF(doc, svg, 0, 0, { width, height, assumePt: true, preserveAspectRatio: 'xMinYMin meet' });
        doc.end();
        return undefined;
      } catch (error) {
        console.error('export pdf map', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to export pdf' });
      }
    },

    createMap: (req, res) => {
      try {
        if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });

        const store = mapService.readFacilityMapStore();
        const maps = Array.isArray(store.maps) ? store.maps : [];
        if (maps.length >= mapService.MAX_FACILITY_MAPS) {
          return res.status(400).json({ error: `maximum of ${mapService.MAX_FACILITY_MAPS} maps reached` });
        }

        const cloneFromId = mapService.normalizeFacilityMapRecordId(req.body && req.body.cloneFromId, '');
        const cloneSource = cloneFromId ? maps.find((item) => item.id === cloneFromId) : null;
        const name = mapService.sanitizeFacilityMapRecordName(req.body && req.body.name, `Map ${maps.length + 1}`);
        const now = new Date().toISOString();
        const nextId = mapService.createUniqueFacilityMapId(name, maps);
        const baseMap = cloneSource ? mapService.cloneFacilityMapRecord(cloneSource) : mapService.defaultFacilityMapRecord();
        const record = Object.assign({}, mapService.sanitizeFacilityMapPayload(baseMap, cloneSource || mapService.DEFAULT_FACILITY_MAP), {
          id: nextId,
          name,
          description: mapService.sanitizeFacilityMapRecordDescription(req.body && req.body.description, cloneSource ? cloneSource.description : ''),
          createdAt: now,
          createdBy: req.user.username,
          updatedAt: now,
          updatedBy: req.user.username,
        });
        const shouldSetActive = !!(req.body && req.body.makeActive);
        const nextStore = mapService.writeFacilityMapStore({
          activeMapId: shouldSetActive ? nextId : (store.activeMapId || nextId),
          maps: maps.concat([record]),
        });
        const saved = Array.isArray(nextStore.maps) ? nextStore.maps.find((item) => item.id === nextId) : null;

        try {
          io.emit('map.updated', {
            mapId: nextId,
            activeMapId: nextStore.activeMapId,
            catalogChanged: true,
            updatedAt: saved && saved.updatedAt,
            updatedBy: saved && saved.updatedBy,
          });
        } catch (error) {
        }

        return res.status(201).json({
          ok: true,
          map: mapService.cloneFacilityMapRecord(saved),
          activeMapId: nextStore.activeMapId,
          maps: mapService.listFacilityMapSummaries(nextStore),
        });
      } catch (error) {
        console.error('create map', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to create map' });
      }
    },

    patchMap: (req, res) => {
      try {
        if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });

        const requestedId = mapService.normalizeFacilityMapRecordId(req.params.mapId, '');
        const store = mapService.readFacilityMapStore();
        const maps = Array.isArray(store.maps) ? store.maps : [];
        const current = maps.find((item) => item.id === requestedId);
        if (!current) return res.status(404).json({ error: 'map not found' });

        const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, 'name');
        const hasDescription = Object.prototype.hasOwnProperty.call(req.body || {}, 'description');
        const nextMaps = maps.map((item) => {
          if (item.id !== current.id) return item;
          return Object.assign({}, item, {
            name: hasName ? mapService.sanitizeFacilityMapRecordName(req.body.name, item.name) : item.name,
            description: hasDescription ? mapService.sanitizeFacilityMapRecordDescription(req.body.description, item.description) : item.description,
          });
        });
        const nextStore = mapService.writeFacilityMapStore({
          activeMapId: req.body && req.body.setActive ? current.id : store.activeMapId,
          maps: nextMaps,
        });
        const saved = Array.isArray(nextStore.maps) ? nextStore.maps.find((item) => item.id === current.id) : null;

        try {
          io.emit('map.updated', {
            mapId: current.id,
            activeMapId: nextStore.activeMapId,
            catalogChanged: true,
            updatedAt: saved && saved.updatedAt,
            updatedBy: saved && saved.updatedBy,
          });
        } catch (error) {
        }

        return res.json({
          ok: true,
          map: mapService.cloneFacilityMapRecord(saved),
          activeMapId: nextStore.activeMapId,
          maps: mapService.listFacilityMapSummaries(nextStore),
        });
      } catch (error) {
        console.error('patch map', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to update map' });
      }
    },

    deleteMap: (req, res) => {
      try {
        if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });

        const requestedId = mapService.normalizeFacilityMapRecordId(req.params.mapId, '');
        const store = mapService.readFacilityMapStore();
        const maps = Array.isArray(store.maps) ? store.maps : [];
        if (maps.length <= 1) {
          return res.status(400).json({ error: 'at least one map must remain' });
        }

        const current = maps.find((item) => item.id === requestedId);
        if (!current) return res.status(404).json({ error: 'map not found' });

        const nextMaps = maps.filter((item) => item.id !== current.id);
        const nextActiveMapId = store.activeMapId === current.id ? nextMaps[0].id : store.activeMapId;
        const nextStore = mapService.writeFacilityMapStore({
          activeMapId: nextActiveMapId,
          maps: nextMaps,
        });

        try {
          io.emit('map.updated', {
            mapId: nextStore.activeMapId,
            activeMapId: nextStore.activeMapId,
            catalogChanged: true,
          });
        } catch (error) {
        }

        return res.json({
          ok: true,
          activeMapId: nextStore.activeMapId,
          maps: mapService.listFacilityMapSummaries(nextStore),
        });
      } catch (error) {
        console.error('delete map', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to delete map' });
      }
    },

    saveMap: (req, res) => {
      try {
        if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });

        const store = mapService.readFacilityMapStore();
        const requestedId = mapService.normalizeFacilityMapRecordId(req.query && req.query.mapId, '');
        const current = requestedId
          ? (Array.isArray(store.maps) ? store.maps.find((item) => item.id === requestedId) : null)
          : mapService.getFacilityMapRecord(store, store.activeMapId);
        if (!current) return res.status(404).json({ error: 'map not found' });

        const nextMap = mapService.sanitizeFacilityMapPayload(req.body || {}, current);
        nextMap.updatedAt = new Date().toISOString();
        nextMap.updatedBy = req.user.username;
        const nextStore = mapService.writeFacilityMapStore({
          activeMapId: store.activeMapId,
          maps: (Array.isArray(store.maps) ? store.maps : []).map((item) => item.id === current.id
            ? Object.assign({}, item, nextMap, {
              updatedAt: nextMap.updatedAt,
              updatedBy: nextMap.updatedBy,
            })
            : item),
        });
        const saved = Array.isArray(nextStore.maps) ? nextStore.maps.find((item) => item.id === current.id) : null;

        try {
          io.emit('map.updated', {
            mapId: current.id,
            activeMapId: nextStore.activeMapId,
            catalogChanged: false,
            updatedAt: saved && saved.updatedAt,
            updatedBy: saved && saved.updatedBy,
          });
        } catch (error) {
        }

        return res.json({
          ok: true,
          map: mapService.cloneFacilityMapRecord(saved),
          activeMapId: nextStore.activeMapId,
        });
      } catch (error) {
        console.error('save map', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to save map' });
      }
    },

    uploadImage: (req, res) => {
      if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });

      return mapAssetUpload.single('image')(req, res, (error) => {
        if (error) {
          console.error('upload map image error', error);
          return res.status(400).json({ error: error.message || 'upload failed' });
        }
        if (!req.file) return res.status(400).json({ error: 'image required' });
        const url = `/map-assets/${encodeURIComponent(req.file.filename)}`;
        return res.json({ ok: true, url });
      });
    },
  };
}

module.exports = {
  createMapController,
};
