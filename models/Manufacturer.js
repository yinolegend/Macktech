module.exports = function defineManufacturer(sequelize, DataTypes) {
  return sequelize.define('Manufacturer', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
      },
    },
  }, {
    tableName: 'manufacturers',
    timestamps: false,
    hooks: {
      beforeValidate(manufacturer) {
        manufacturer.name = String(manufacturer.name || '').trim().replace(/\s+/g, ' ');
      },
    },
  });
};
