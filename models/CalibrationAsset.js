const {
  DEFAULT_CATEGORY,
  DEFAULT_DEPARTMENT,
  DEFAULT_INTERVAL_DAYS,
  DEFAULT_UNIT_OF_MEASURE,
  computeCalibrationStatus,
  computeNextCalibrationDate,
  defaultAlertLeadDays,
  defaultGracePeriodDays,
  normalizeCategory,
  normalizeDate,
  normalizeNonNegativeInteger,
  normalizePositiveInteger,
  normalizeText,
  normalizeUnitOfMeasure,
} = require('./calibrationRules');

module.exports = function defineCalibrationAsset(sequelize, DataTypes) {
  return sequelize.define('CalibrationAsset', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    tool_name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    serial_number: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
      },
    },
    asset_type: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    model: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    manufacturer: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    template_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'templates',
        key: 'id',
      },
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: DEFAULT_CATEGORY,
    },
    last_cal: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    cal_frequency: {
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
    next_cal: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'WARNING',
    },
    unit_of_measure: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: DEFAULT_UNIT_OF_MEASURE,
    },
    measurement_types: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    range_size: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    accuracy: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    date_acquired: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    source_vendor: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    cost: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    environment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    instructions: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    attachment_path: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    date_created: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    assigned_department: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: DEFAULT_DEPARTMENT,
    },
  }, {
    tableName: 'calibration',
    timestamps: false,
    hooks: {
      beforeValidate(asset) {
        const templateId = Number(asset.template_id);
        const calFrequency = normalizePositiveInteger(asset.cal_frequency, DEFAULT_INTERVAL_DAYS);
        asset.last_cal = normalizeDate(asset.last_cal);
        asset.template_id = Number.isInteger(templateId) && templateId > 0 ? templateId : null;
        asset.category = normalizeCategory(asset.category, DEFAULT_CATEGORY);
        asset.cal_frequency = calFrequency;
        asset.alert_lead_days = Math.min(calFrequency, normalizeNonNegativeInteger(asset.alert_lead_days, defaultAlertLeadDays(calFrequency)));
        asset.grace_period_days = normalizeNonNegativeInteger(asset.grace_period_days, defaultGracePeriodDays(calFrequency));
        asset.asset_type = normalizeText(asset.asset_type);
        asset.model = normalizeText(asset.model);
        asset.manufacturer = normalizeText(asset.manufacturer);
        asset.unit_of_measure = normalizeUnitOfMeasure(asset.unit_of_measure, DEFAULT_UNIT_OF_MEASURE);
        asset.measurement_types = normalizeText(asset.measurement_types);
        asset.range_size = normalizeText(asset.range_size);
        asset.accuracy = normalizeText(asset.accuracy);
        asset.date_acquired = normalizeDate(asset.date_acquired);
        asset.source_vendor = normalizeText(asset.source_vendor);
        const costValue = Number(asset.cost);
        asset.cost = Number.isFinite(costValue) ? costValue : null;
        asset.environment = normalizeText(asset.environment);
        asset.instructions = normalizeText(asset.instructions);
        asset.notes = normalizeText(asset.notes);
        asset.attachment_path = normalizeText(asset.attachment_path);
        asset.date_created = normalizeDate(asset.date_created) || new Date().toISOString().slice(0, 10);
        asset.assigned_department = normalizeText(asset.assigned_department, DEFAULT_DEPARTMENT);
        const providedNextCal = normalizeDate(asset.next_cal);
        asset.next_cal = providedNextCal || computeNextCalibrationDate(asset.last_cal, calFrequency);
        asset.status = computeCalibrationStatus({
          nextCalDate: asset.next_cal,
          alertLeadDays: asset.alert_lead_days,
          gracePeriodDays: asset.grace_period_days,
        });
      },
    },
  });
};