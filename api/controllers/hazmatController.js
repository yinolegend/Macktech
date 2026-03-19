const path = require('path');
const { createRequire } = require('module');

const backendRequire = createRequire(path.join(__dirname, '..', '..', 'backend', 'package.json'));
const { Op } = backendRequire('sequelize');

const HIGH_HAZARD_CODES = new Set(['explosive', 'flammable', 'oxidizing', 'toxic', 'corrosive', 'health_hazard']);

function normalizeSymbol(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function normalizeSymbols(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(normalizeSymbol).filter(Boolean)));
  }

  const raw = String(value || '').trim();
  if (!raw) return [];

  if (raw.startsWith('[')) {
    try {
      return normalizeSymbols(JSON.parse(raw));
    } catch (error) {
    }
  }

  return Array.from(new Set(raw.split(/[;,|]/).map(normalizeSymbol).filter(Boolean)));
}

function normalizeDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeCasNumber(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = text.match(/^(\d{2,7})-(\d{2})-(\d)$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function normalizeManualOverrides(value) {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      source = {};
    }
  }

  const on = normalizeSymbols(source && source.on);
  const off = normalizeSymbols(source && source.off);
  const offSet = new Set(off);

  return {
    on: on.filter((symbol) => !offSet.has(symbol)),
    off,
  };
}

function normalizeContainerSize(payload) {
  const source = payload && payload.container_size && typeof payload.container_size === 'object'
    ? payload.container_size
    : payload;

  const unit = String((source && (source.unit || source.container_unit)) || '').trim();
  const numericValue = Number(source && (source.value != null ? source.value : source.container_value));
  if (!unit || !Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  const type = String((source && source.type) || 'unknown').trim() || 'unknown';
  const normalized = source && source.normalized && typeof source.normalized === 'object'
    ? {
      value: Number(source.normalized.value),
      unit: String(source.normalized.unit || '').trim(),
      type: String(source.normalized.type || type).trim() || type,
    }
    : null;

  return {
    value: numericValue,
    unit,
    type,
    normalized,
  };
}

function formatMaterial(material) {
  const payload = material && typeof material.toJSON === 'function' ? material.toJSON() : material;
  const symbols = normalizeSymbols(payload.ghs_symbols);
  const autoSymbols = normalizeSymbols(payload.ghs_auto_symbols);
  const manualOverrides = normalizeManualOverrides(payload.ghs_manual_overrides);
  const imagePaths = Array.isArray(payload.image_paths)
    ? payload.image_paths.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  return {
    id: payload.id,
    name: payload.name,
    batch_id: payload.batch_id,
    cas_number: normalizeCasNumber(payload.cas_number),
    ghs_symbols: symbols,
    ghs_auto_symbols: autoSymbols,
    ghs_manual_overrides: manualOverrides,
    container_size: normalizeContainerSize(payload),
    received_date: payload.received_date,
    expiration_date: payload.expiration_date,
    current_stock: normalizeNumber(payload.current_stock),
    min_threshold: normalizeNumber(payload.min_threshold),
    sds_file_path: payload.sds_file_path || null,
    image_paths: imagePaths,
    high_hazard: symbols.some((symbol) => HIGH_HAZARD_CODES.has(symbol)) || symbols.length >= 3,
  };
}

function formatUsageLog(entry) {
  const payload = entry && typeof entry.toJSON === 'function' ? entry.toJSON() : entry;
  return {
    id: payload.id,
    material_id: payload.material_id,
    user_id: payload.user_id,
    quantity_delta: normalizeNumber(payload.quantity_delta),
    timestamp: payload.timestamp,
    reason: payload.reason,
    material: payload.material ? {
      id: payload.material.id,
      name: payload.material.name,
      batch_id: payload.material.batch_id,
    } : null,
  };
}

function normalizeMaterialPayload(payload) {
  const name = String((payload && payload.name) || '').trim();
  const batchId = String((payload && payload.batch_id) || '').trim();
  const casNumber = normalizeCasNumber(payload && payload.cas_number);
  if (payload && payload.cas_number && !casNumber) {
    throw new Error('cas_number must match XXX-XX-X format');
  }

  const autoSymbols = normalizeSymbols(payload && payload.ghs_auto_symbols);
  const manualOverrides = normalizeManualOverrides(payload && payload.ghs_manual_overrides);
  let selectedSymbols = normalizeSymbols(payload && payload.ghs_symbols);
  const hasManualOverrides = payload && Object.prototype.hasOwnProperty.call(payload, 'ghs_manual_overrides');
  if (!hasManualOverrides && !autoSymbols.length && selectedSymbols.length) {
    manualOverrides.on = selectedSymbols.slice();
    manualOverrides.off = [];
  }
  if (autoSymbols.length || hasManualOverrides) {
    const selectedSet = new Set(autoSymbols);
    manualOverrides.off.forEach((symbol) => selectedSet.delete(symbol));
    manualOverrides.on.forEach((symbol) => selectedSet.add(symbol));
    selectedSymbols = Array.from(selectedSet);
  }

  if (!name || !batchId) {
    throw new Error('name and batch_id are required');
  }

  return {
    name,
    batch_id: batchId,
    cas_number: casNumber,
    ghs_symbols: selectedSymbols,
    ghs_auto_symbols: autoSymbols,
    ghs_manual_overrides: manualOverrides,
    container_size: normalizeContainerSize(payload || {}),
    received_date: normalizeDate(payload.received_date),
    expiration_date: normalizeDate(payload.expiration_date),
    current_stock: normalizeNumber(payload.current_stock),
    min_threshold: normalizeNumber(payload.min_threshold),
  };
}

function normalizeUsagePayload(payload) {
  const materialId = Number(payload && payload.material_id);
  const quantityDelta = normalizeNumber(payload && payload.quantity_delta, NaN);
  const reason = String((payload && payload.reason) || '').trim() || 'Inventory adjustment';

  if (!Number.isInteger(materialId) || materialId <= 0) {
    throw new Error('material_id is required');
  }

  if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
    throw new Error('quantity_delta must be a non-zero number');
  }

  return {
    material_id: materialId,
    quantity_delta: quantityDelta,
    reason,
  };
}

function createHazmatController({ Material, UsageLog, sequelize, paths, hazmatSdsUpload, hazmatImageUpload }) {
  function runSingleUpload(uploadHandler, req, res) {
    return new Promise((resolve, reject) => {
      if (!uploadHandler || typeof uploadHandler.single !== 'function') {
        return reject(new Error('upload handler is not configured'));
      }
      uploadHandler.single('file')(req, res, (error) => {
        if (error) return reject(error);
        return resolve(req.file || null);
      });
    });
  }

  function runArrayUpload(uploadHandler, req, res) {
    return new Promise((resolve, reject) => {
      if (!uploadHandler || typeof uploadHandler.array !== 'function') {
        return reject(new Error('upload handler is not configured'));
      }
      uploadHandler.array('files', 12)(req, res, (error) => {
        if (error) return reject(error);
        return resolve(Array.isArray(req.files) ? req.files : []);
      });
    });
  }

  function buildRelativeUploadPath(folderName, fileName) {
    const safeFolder = String(folderName || '').replace(/^\/+|\/+$/g, '');
    const safeFile = encodeURIComponent(String(fileName || '').trim());
    return `/uploads/${safeFolder}/${safeFile}`;
  }

  return {
    servePortal: (req, res) => {
      return res.sendFile(path.join(paths.LEGACY_PUBLIC_DIR, 'hazmat-portal.html'));
    },

    session: async (req, res) => {
      return res.json({
        user: req.user,
        offline_sync_enabled: false,
      });
    },

    logout: async (req, res) => {
      res.clearCookie('hazmat_access', { path: '/' });
      if (req.session) {
        return req.session.destroy(() => {
          res.clearCookie('mack_session', { path: '/' });
          return res.json({ ok: true });
        });
      }
      return res.json({ ok: true });
    },

    listMaterials: async (req, res) => {
      try {
        const materials = await Material.findAll({
          order: [
            ['expiration_date', 'ASC'],
            ['name', 'ASC'],
          ],
        });
        return res.json(materials.map(formatMaterial));
      } catch (error) {
        console.error('hazmat list materials', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load materials' });
      }
    },

    searchMaterials: async (req, res) => {
      try {
        const query = String(req.query.q || '').trim();
        if (!query) {
          return res.json([]);
        }

        const materials = await Material.findAll({
          where: {
            [Op.or]: [
              { name: { [Op.like]: `%${query}%` } },
              { batch_id: { [Op.like]: `%${query}%` } },
            ],
          },
          order: [
            ['name', 'ASC'],
            ['batch_id', 'ASC'],
          ],
          limit: 100,
        });

        return res.json(materials.map(formatMaterial));
      } catch (error) {
        console.error('hazmat search materials', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to search materials' });
      }
    },

    createMaterial: async (req, res) => {
      try {
        const payload = normalizeMaterialPayload(req.body || {});
        const material = await Material.create(payload);
        return res.status(201).json(formatMaterial(material));
      } catch (error) {
        const message = error && error.name === 'SequelizeUniqueConstraintError'
          ? 'batch_id already exists'
          : (error && error.message) || 'failed to create material';
        const status = /required|exists/i.test(message) ? 400 : 500;
        return res.status(status).json({ error: message });
      }
    },

    updateMaterial: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const material = await Material.findByPk(id);
        if (!material) return res.status(404).json({ error: 'material not found' });

        const payload = normalizeMaterialPayload({ ...material.toJSON(), ...(req.body || {}) });
        await material.update(payload);
        return res.json(formatMaterial(material));
      } catch (error) {
        const message = error && error.name === 'SequelizeUniqueConstraintError'
          ? 'batch_id already exists'
          : (error && error.message) || 'failed to update material';
        const status = /required|exists/i.test(message) ? 400 : 500;
        return res.status(status).json({ error: message });
      }
    },

    deleteMaterial: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const material = await Material.findByPk(id);
        if (!material) return res.status(404).json({ error: 'material not found' });

        await UsageLog.destroy({ where: { material_id: id } });
        await material.destroy();
        return res.json({ ok: true, id });
      } catch (error) {
        console.error('hazmat delete material', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to delete material' });
      }
    },

    importMaterials: async (req, res) => {
      const rows = Array.isArray(req.body && req.body.materials) ? req.body.materials : [];
      if (!rows.length) return res.status(400).json({ error: 'materials array is required' });

      try {
        const result = { created: 0, updated: 0 };
        await sequelize.transaction(async (transaction) => {
          for (const rawRow of rows) {
            const payload = normalizeMaterialPayload(rawRow || {});
            const existing = await Material.findOne({ where: { batch_id: payload.batch_id }, transaction });
            if (existing) {
              await existing.update(payload, { transaction });
              result.updated += 1;
            } else {
              await Material.create(payload, { transaction });
              result.created += 1;
            }
          }
        });

        return res.json(result);
      } catch (error) {
        const message = (error && error.message) || 'failed to import materials';
        return res.status(400).json({ error: message });
      }
    },

    uploadSds: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const material = await Material.findByPk(id);
        if (!material) return res.status(404).json({ error: 'material not found' });

        if (!paths || !paths.SDS_UPLOADS_DIR) {
          return res.status(500).json({ error: 'sds uploads path is not configured' });
        }

        const file = await runSingleUpload(hazmatSdsUpload, req, res);
        if (!file) {
          return res.status(400).json({ error: 'file is required' });
        }

        const publicPath = buildRelativeUploadPath('sds', file.filename);
        await material.update({ sds_file_path: publicPath });

        return res.json({
          ok: true,
          material: formatMaterial(material),
          sds_file_path: publicPath,
        });
      } catch (error) {
        const message = (error && error.message) || 'failed to upload sds';
        const status = /only|file|required/i.test(message) ? 400 : 500;
        return res.status(status).json({ error: message });
      }
    },

    uploadImages: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const material = await Material.findByPk(id);
        if (!material) return res.status(404).json({ error: 'material not found' });

        if (!paths || !paths.HAZMAT_IMAGE_UPLOADS_DIR) {
          return res.status(500).json({ error: 'hazmat image uploads path is not configured' });
        }

        const files = await runArrayUpload(hazmatImageUpload, req, res);
        if (!files.length) {
          return res.status(400).json({ error: 'at least one image file is required' });
        }

        const existingImages = Array.isArray(material.image_paths) ? material.image_paths : [];
        const uploaded = files.map((file) => buildRelativeUploadPath('hazmat-images', file.filename));
        const merged = Array.from(new Set(existingImages.concat(uploaded)));

        await material.update({ image_paths: merged });

        return res.json({
          ok: true,
          material: formatMaterial(material),
          image_paths: merged,
          added: uploaded,
        });
      } catch (error) {
        const message = (error && error.message) || 'failed to upload images';
        const status = /only|file|required|image/i.test(message) ? 400 : 500;
        return res.status(status).json({ error: message });
      }
    },

    listUsageLogs: async (req, res) => {
      try {
        const requested = Number(req.query.limit);
        const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 100) : 20;
        const logs = await UsageLog.findAll({
          include: [{ model: Material, as: 'material', attributes: ['id', 'name', 'batch_id'] }],
          order: [['timestamp', 'DESC']],
          limit,
        });
        return res.json(logs.map(formatUsageLog));
      } catch (error) {
        console.error('hazmat list usage logs', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load usage logs' });
      }
    },

    createUsageLog: async (req, res) => {
      try {
        const payload = normalizeUsagePayload(req.body || {});

        const response = await sequelize.transaction(async (transaction) => {
          const material = await Material.findByPk(payload.material_id, { transaction });
          if (!material) {
            throw new Error('material not found');
          }

          const nextStock = normalizeNumber(material.current_stock) + payload.quantity_delta;
          if (nextStock < 0) {
            throw new Error('quantity would reduce stock below zero');
          }

          const usageLog = await UsageLog.create({
            material_id: material.id,
            user_id: req.user && req.user.id ? req.user.id : null,
            quantity_delta: payload.quantity_delta,
            timestamp: new Date().toISOString(),
            reason: payload.reason,
          }, { transaction });

          await material.update({ current_stock: nextStock }, { transaction });

          return {
            material,
            usageLog,
          };
        });

        return res.status(201).json({
          material: formatMaterial(response.material),
          usage_log: formatUsageLog(response.usageLog),
        });
      } catch (error) {
        const message = (error && error.message) || 'failed to record usage';
        const status = /not found|below zero|required|non-zero/i.test(message) ? 400 : 500;
        return res.status(status).json({ error: message });
      }
    },
  };
}

module.exports = {
  createHazmatController,
};