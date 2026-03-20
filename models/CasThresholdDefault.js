function normalizeCasNumber(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = text.match(/^(\d{2,7})-(\d{2})-(\d)$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function normalizeThreshold(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Number(numeric.toFixed(2));
}

module.exports = function defineCasThresholdDefault(sequelize, DataTypes) {
  return sequelize.define('CasThresholdDefault', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    cas_number: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      get() {
        return normalizeCasNumber(this.getDataValue('cas_number'));
      },
      set(value) {
        this.setDataValue('cas_number', normalizeCasNumber(value));
      },
      validate: {
        is: /^\d{2,7}-\d{2}-\d$/,
      },
    },
    min_threshold: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      get() {
        return normalizeThreshold(this.getDataValue('min_threshold'));
      },
      set(value) {
        this.setDataValue('min_threshold', normalizeThreshold(value));
      },
    },
  }, {
    tableName: 'cas_threshold_defaults',
    timestamps: false,
    indexes: [
      {
        name: 'cas_threshold_defaults_cas_number_uidx',
        unique: true,
        fields: ['cas_number'],
      },
    ],
  });
};
