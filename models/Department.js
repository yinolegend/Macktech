module.exports = function defineDepartment(sequelize, DataTypes) {
  return sequelize.define('Department', {
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
    supervisor: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
  }, {
    tableName: 'departments',
    timestamps: false,
    hooks: {
      beforeValidate(department) {
        department.name = String(department.name || '').trim().replace(/\s+/g, ' ');
        department.supervisor = String(department.supervisor || '').trim().replace(/\s+/g, ' ');
      },
    },
  });
};
