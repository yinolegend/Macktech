module.exports = function defineUsageLog(sequelize, DataTypes) {
  return sequelize.define('UsageLog', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    material_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    quantity_delta: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Inventory adjustment',
    },
  }, {
    tableName: 'usage_logs',
    timestamps: false,
  });
};