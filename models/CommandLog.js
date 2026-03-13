function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;

  try {
    return JSON.parse(String(value));
  } catch (error) {
    return { raw: String(value) };
  }
}

module.exports = function defineCommandLog(sequelize, DataTypes) {
  return sequelize.define('CommandLog', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    module: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    entity_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    entity_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    actor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    actor_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    detail: {
      type: DataTypes.STRING,
      allowNull: false,
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
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'logs',
    timestamps: false,
  });
};