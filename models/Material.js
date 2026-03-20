function normalizeSymbols(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/[;,|]/)
        .map((item) => item.trim());

  return Array.from(new Set(source
    .map((item) => String(item || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'))
    .filter(Boolean)));
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

function normalizePrimaryClass(value, fallback = '0') {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return fallback;

  const compact = text.startsWith('C') ? text.slice(1) : text;
  const digit = compact.match(/[0-9]/);
  if (!digit) return fallback;
  return digit[0];
}

function normalizeDivision(value) {
  const text = String(value || '').trim();
  return text || null;
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

function normalizeContainerSize(value) {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      source = null;
    }
  }

  if (!source || typeof source !== 'object') return null;

  const unit = String(source.unit || '').trim();
  const numericValue = Number(source.value);
  if (!unit || !Number.isFinite(numericValue) || numericValue <= 0) return null;

  const type = String(source.type || (source.normalized && source.normalized.type) || 'unknown').trim() || 'unknown';
  const normalized = source.normalized && typeof source.normalized === 'object'
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

function normalizeDepartment(value, fallback = 'Operations') {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text || fallback;
}

function normalizeManufacturer(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text || null;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;

  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
}

function normalizeOptionalId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

module.exports = function defineMaterial(sequelize, DataTypes) {
  return sequelize.define('Material', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    label_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
      },
    },
    batch_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
      },
    },
    primary_class: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '0',
      get() {
        return normalizePrimaryClass(this.getDataValue('primary_class'));
      },
      set(value) {
        this.setDataValue('primary_class', normalizePrimaryClass(value));
      },
    },
    division: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
      get() {
        return normalizeDivision(this.getDataValue('division'));
      },
      set(value) {
        this.setDataValue('division', normalizeDivision(value));
      },
    },
    cas_number: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
      get() {
        return normalizeCasNumber(this.getDataValue('cas_number'));
      },
      set(value) {
        this.setDataValue('cas_number', normalizeCasNumber(value));
      },
    },
    ghs_symbols: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]',
      get() {
        const raw = this.getDataValue('ghs_symbols');
        if (!raw) return [];
        try {
          return normalizeSymbols(JSON.parse(raw));
        } catch (error) {
          return normalizeSymbols(raw);
        }
      },
      set(value) {
        this.setDataValue('ghs_symbols', JSON.stringify(normalizeSymbols(value)));
      },
    },
    ghs_auto_symbols: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]',
      get() {
        const raw = this.getDataValue('ghs_auto_symbols');
        if (!raw) return [];
        try {
          return normalizeSymbols(JSON.parse(raw));
        } catch (error) {
          return normalizeSymbols(raw);
        }
      },
      set(value) {
        this.setDataValue('ghs_auto_symbols', JSON.stringify(normalizeSymbols(value)));
      },
    },
    ghs_manual_overrides: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '{"on":[],"off":[]}',
      get() {
        const raw = this.getDataValue('ghs_manual_overrides');
        return normalizeManualOverrides(raw);
      },
      set(value) {
        this.setDataValue('ghs_manual_overrides', JSON.stringify(normalizeManualOverrides(value)));
      },
    },
    received_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    expiration_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    stock_level: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      field: 'current_stock',
    },
    min_threshold: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    assigned_department: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Operations',
      get() {
        return normalizeDepartment(this.getDataValue('assigned_department'));
      },
      set(value) {
        this.setDataValue('assigned_department', normalizeDepartment(value));
      },
    },
    manufacturer: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
      get() {
        return normalizeManufacturer(this.getDataValue('manufacturer'));
      },
      set(value) {
        this.setDataValue('manufacturer', normalizeManufacturer(value));
      },
    },
    sds_not_required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      get() {
        return normalizeBoolean(this.getDataValue('sds_not_required'), true);
      },
      set(value) {
        this.setDataValue('sds_not_required', normalizeBoolean(value, true));
      },
    },
    sds_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      get() {
        return normalizeOptionalId(this.getDataValue('sds_id'));
      },
      set(value) {
        this.setDataValue('sds_id', normalizeOptionalId(value));
      },
    },
    sds_file_path: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    image_paths: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]',
      get() {
        const raw = this.getDataValue('image_paths');
        if (!raw) return [];
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed)
            ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
            : [];
        } catch (error) {
          return [];
        }
      },
      set(value) {
        const source = Array.isArray(value) ? value : [value];
        const normalized = Array.from(new Set(source
          .map((item) => String(item || '').trim())
          .filter(Boolean)));
        this.setDataValue('image_paths', JSON.stringify(normalized));
      },
    },
    container_size: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      get() {
        const raw = this.getDataValue('container_size');
        return normalizeContainerSize(raw);
      },
      set(value) {
        const normalized = normalizeContainerSize(value);
        this.setDataValue('container_size', normalized ? JSON.stringify(normalized) : null);
      },
    },
    current_stock: {
      type: DataTypes.VIRTUAL,
      get() {
        return normalizeNumber(this.getDataValue('stock_level'));
      },
      set(value) {
        this.setDataValue('stock_level', normalizeNumber(value));
      },
    },
  }, {
    tableName: 'materials',
    timestamps: false,
    indexes: [
      {
        name: 'materials_name_idx',
        fields: ['name'],
      },
      {
        name: 'materials_label_id_idx',
        fields: ['label_id'],
      },
      {
        name: 'materials_batch_id_idx',
        fields: ['batch_id'],
      },
    ],
  });
};