const {
  DEFAULT_CATEGORY,
  DEFAULT_DEPARTMENT,
  DEFAULT_INTERVAL_DAYS,
  DEFAULT_UNIT_OF_MEASURE,
  defaultAlertLeadDays,
  defaultGracePeriodDays,
  normalizeCategory,
  normalizeNonNegativeInteger,
  normalizePositiveInteger,
  normalizeText,
  normalizeUnitOfMeasure,
} = require('./calibrationRules');

module.exports = function defineHazmatTemplate(sequelize, DataTypes) {
  return sequelize.define('HazmatTemplate', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    template_name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
      },
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: DEFAULT_CATEGORY,
    },
    cal_interval_days: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: DEFAULT_INTERVAL_DAYS,
    },
    alert_lead_days: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: defaultAlertLeadDays(DEFAULT_INTERVAL_DAYS),
    },
    grace_period_days: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: defaultGracePeriodDays(DEFAULT_INTERVAL_DAYS),
    },
    unit_of_measure: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: DEFAULT_UNIT_OF_MEASURE,
    },
    assigned_department: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: DEFAULT_DEPARTMENT,
    },
  }, {
    tableName: 'hazmat_templates',
    timestamps: false,
    hooks: {
      beforeValidate(template) {
        const interval = normalizePositiveInteger(template.cal_interval_days, DEFAULT_INTERVAL_DAYS);
        template.template_name = normalizeText(template.template_name);
        template.category = normalizeCategory(template.category, DEFAULT_CATEGORY);
        template.cal_interval_days = interval;
        template.alert_lead_days = Math.min(interval, normalizeNonNegativeInteger(template.alert_lead_days, defaultAlertLeadDays(interval)));
        template.grace_period_days = normalizeNonNegativeInteger(template.grace_period_days, defaultGracePeriodDays(interval));
        template.unit_of_measure = normalizeUnitOfMeasure(template.unit_of_measure, DEFAULT_UNIT_OF_MEASURE);
        template.assigned_department = normalizeText(template.assigned_department, DEFAULT_DEPARTMENT);
      },
    },
  });
};
