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
    batch_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
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
  });
};