function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;

  try {
    return JSON.parse(String(value));
  } catch (error) {
    return { raw: String(value) };
  }
}

module.exports = function defineDebugTicketHistory(sequelize, DataTypes) {
  return sequelize.define('DebugTicketHistory', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    ticket_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'failure_tickets',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    event_type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'import_merge',
    },
    source_file: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
    },
    source_row_number: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    source_reference: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
    },
    technician_list: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
    },
    note_text: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
    },
    failure_signature_before: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
    },
    failure_signature_after: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
    },
    fingerprint_hash: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
    },
    metadata: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '{}',
      get() {
        return parseMetadata(this.getDataValue('metadata'));
      },
      set(value) {
        this.setDataValue('metadata', JSON.stringify(parseMetadata(value)));
      },
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'failure_ticket_history',
    timestamps: false,
    indexes: [
      { fields: ['ticket_id'] },
      { fields: ['fingerprint_hash'] },
      { fields: ['created_at'] },
    ],
    hooks: {
      beforeValidate(entry) {
        entry.event_type = String(entry.event_type || 'import_merge').trim().toLowerCase();
        entry.source_file = String(entry.source_file || '').trim();
        entry.source_reference = String(entry.source_reference || '').trim();
        entry.technician_list = String(entry.technician_list || '').trim();
        entry.note_text = String(entry.note_text || '').trim();
        entry.failure_signature_before = String(entry.failure_signature_before || '').trim();
        entry.failure_signature_after = String(entry.failure_signature_after || '').trim();
        entry.fingerprint_hash = String(entry.fingerprint_hash || '').trim();

        const rowNumber = Number(entry.source_row_number);
        entry.source_row_number = Number.isInteger(rowNumber) && rowNumber > 0 ? rowNumber : null;
      },
    },
  });
};