const path = require('path');

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

function formatMaterial(material) {
  const payload = material && typeof material.toJSON === 'function' ? material.toJSON() : material;
  const symbols = normalizeSymbols(payload.ghs_symbols);
  return {
    id: payload.id,
    name: payload.name,
    batch_id: payload.batch_id,
    ghs_symbols: symbols,
    received_date: payload.received_date,
    expiration_date: payload.expiration_date,
    current_stock: normalizeNumber(payload.current_stock),
    min_threshold: normalizeNumber(payload.min_threshold),
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

  if (!name || !batchId) {
    throw new Error('name and batch_id are required');
  }

  return {
    name,
    batch_id: batchId,
    ghs_symbols: normalizeSymbols(payload.ghs_symbols),
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

function createHazmatController({ Material, UsageLog, sequelize, paths }) {
  return {
    servePortal: (req, res) => {
      return res.sendFile(path.join(paths.LEGACY_PUBLIC_DIR, 'hazmat-portal.html'));
    },

    session: async (req, res) => {
      return res.json({
        user: req.user,
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