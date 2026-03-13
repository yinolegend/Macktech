const {
  DEFAULT_CATEGORY,
  DEFAULT_DEPARTMENT,
  DEFAULT_ALLOWED_DAYS,
  DEFAULT_INTERVAL_DAYS,
  DEFAULT_INTERVAL_MODE,
  DEFAULT_INTERVAL_MONTHS,
  DEFAULT_MAX_DAILY_CALIBRATIONS,
  DEFAULT_UNIT_OF_MEASURE,
  defaultAlertLeadDays,
  defaultGracePeriodDays,
  deriveIntervalDays,
  normalizeCategory,
  normalizeAllowedDays,
  normalizeIntervalDays,
  normalizeIntervalMode,
  normalizeIntervalMonths,
  normalizeMaxDailyCalibrations,
  normalizeNonNegativeInteger,
  normalizePositiveInteger,
  normalizeText,
  normalizeUnitOfMeasure,
} = require('./calibrationRules');

module.exports = function defineCalibrationTemplate(sequelize, DataTypes) {
  return sequelize.define('CalibrationTemplate', {
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
    interval_mode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: DEFAULT_INTERVAL_MODE,
    },
    interval_months: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: DEFAULT_INTERVAL_MONTHS,
    },
    interval_days: {
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
    max_daily_calibrations: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: DEFAULT_MAX_DAILY_CALIBRATIONS,
    },
    allowed_days: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: JSON.stringify(DEFAULT_ALLOWED_DAYS),
    },
  }, {
    tableName: 'templates',
    timestamps: false,
    hooks: {
      beforeValidate(template) {
        const intervalMode = normalizeIntervalMode(template.interval_mode, DEFAULT_INTERVAL_MODE);
        const intervalMonths = normalizeIntervalMonths(template.interval_months, DEFAULT_INTERVAL_MONTHS);
        const intervalDays = normalizeIntervalDays(
          template.interval_days,
          normalizePositiveInteger(template.cal_interval_days, DEFAULT_INTERVAL_DAYS)
        );
        const interval = deriveIntervalDays({
          intervalMode,
          intervalMonths,
          intervalDays,
        });

        template.template_name = normalizeText(template.template_name);
        template.category = normalizeCategory(template.category, DEFAULT_CATEGORY);
        template.interval_mode = intervalMode;
        template.interval_months = intervalMonths;
        template.interval_days = intervalDays;
        template.cal_interval_days = interval;
        template.alert_lead_days = Math.min(interval, normalizeNonNegativeInteger(template.alert_lead_days, defaultAlertLeadDays(interval)));
        template.grace_period_days = normalizeNonNegativeInteger(template.grace_period_days, defaultGracePeriodDays(interval));
        template.unit_of_measure = normalizeUnitOfMeasure(template.unit_of_measure, DEFAULT_UNIT_OF_MEASURE);
        template.assigned_department = normalizeText(template.assigned_department, DEFAULT_DEPARTMENT);
        template.max_daily_calibrations = normalizeMaxDailyCalibrations(
          template.max_daily_calibrations,
          DEFAULT_MAX_DAILY_CALIBRATIONS
        );
        template.allowed_days = JSON.stringify(normalizeAllowedDays(template.allowed_days, DEFAULT_ALLOWED_DAYS));
      },
    },
  });
};