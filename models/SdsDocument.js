function normalizeCasNumber(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = text.match(/^(\d{2,7})-(\d{2})-(\d)$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function normalizeManufacturer(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text || null;
}

function normalizeSdsPath(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeOptionalId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

module.exports = function defineSdsDocument(sequelize, DataTypes) {
  return sequelize.define('SdsDocument', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    cas_number: {
      type: DataTypes.STRING,
      allowNull: false,
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
    manufacturer: {
      type: DataTypes.STRING,
      allowNull: false,
      get() {
        return normalizeManufacturer(this.getDataValue('manufacturer'));
      },
      set(value) {
        this.setDataValue('manufacturer', normalizeManufacturer(value));
      },
    },
    manufacturer_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      get() {
        return normalizeOptionalId(this.getDataValue('manufacturer_id'));
      },
      set(value) {
        this.setDataValue('manufacturer_id', normalizeOptionalId(value));
      },
    },
    sds_file_path: {
      type: DataTypes.STRING,
      allowNull: false,
      get() {
        return normalizeSdsPath(this.getDataValue('sds_file_path'));
      },
      set(value) {
        this.setDataValue('sds_file_path', normalizeSdsPath(value));
      },
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'sds_documents',
    timestamps: false,
    indexes: [
      {
        name: 'sds_documents_cas_manufacturer_id_uidx',
        unique: true,
        fields: ['cas_number', 'manufacturer_id'],
      },
      {
        name: 'sds_documents_cas_number_idx',
        fields: ['cas_number'],
      },
      {
        name: 'sds_documents_manufacturer_id_idx',
        fields: ['manufacturer_id'],
      },
      {
        name: 'sds_documents_manufacturer_idx',
        fields: ['manufacturer'],
      },
    ],
  });
};