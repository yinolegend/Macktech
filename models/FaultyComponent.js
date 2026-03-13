module.exports = function defineFaultyComponent(sequelize, DataTypes) {
  return sequelize.define('FaultyComponent', {
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
    ref_designator: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    component_type: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
    },
    failure_mode: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
    },
    lot_code: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'faulty_components',
    timestamps: false,
    hooks: {
      beforeValidate(component) {
        component.ref_designator = String(component.ref_designator || '').trim().toUpperCase();
        component.component_type = String(component.component_type || '').trim();
        component.failure_mode = String(component.failure_mode || '').trim();
        component.lot_code = String(component.lot_code || '').trim();
      },
    },
  });
};
