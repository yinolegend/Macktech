const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const paths = require('../config/paths');

const backendRequire = createRequire(path.join(__dirname, '..', 'backend', 'package.json'));
const { Sequelize, DataTypes, QueryTypes } = backendRequire('sequelize');

const defineMaterial = require('./Material');
const defineUsageLog = require('./UsageLog');
const defineHazmatTemplate = require('./HazmatTemplate');
const defineCalibrationTemplate = require('./CalibrationTemplate');
const defineCalibrationAsset = require('./CalibrationAsset');
const defineFailureTicket = require('./FailureTicket');
const defineFaultyComponent = require('./FaultyComponent');
const defineDebugTicketHistory = require('./DebugTicketHistory');
const defineCommandLog = require('./CommandLog');
const defineDepartment = require('./Department');
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

if (!fs.existsSync(paths.DATA_DIR)) {
  fs.mkdirSync(paths.DATA_DIR, { recursive: true });
}

function createSQLiteSequelize(storage) {
  return new Sequelize({
    dialect: 'sqlite',
    storage,
    logging: false,
  });
}

const hazmatSequelize = createSQLiteSequelize(paths.HAZMAT_DB_PATH);
const gagesSequelize = createSQLiteSequelize(paths.GAGES_DB_PATH);
const debugSequelize = createSQLiteSequelize(paths.DEBUG_LAB_DB_PATH);

const Material = defineMaterial(hazmatSequelize, DataTypes);
const UsageLog = defineUsageLog(hazmatSequelize, DataTypes);
const HazmatTemplate = defineHazmatTemplate(hazmatSequelize, DataTypes);
const HazmatLog = defineCommandLog(hazmatSequelize, DataTypes);

const CalibrationTemplate = defineCalibrationTemplate(gagesSequelize, DataTypes);
const CalibrationAsset = defineCalibrationAsset(gagesSequelize, DataTypes);
const GageLog = defineCommandLog(gagesSequelize, DataTypes);
const Department = defineDepartment(gagesSequelize, DataTypes);

const FailureTicket = defineFailureTicket(debugSequelize, DataTypes);
const FaultyComponent = defineFaultyComponent(debugSequelize, DataTypes);
const DebugTicketHistory = defineDebugTicketHistory(debugSequelize, DataTypes);
const DebugLog = defineCommandLog(debugSequelize, DataTypes);

Material.hasMany(UsageLog, {
  foreignKey: 'material_id',
  as: 'usage_logs',
});

UsageLog.belongsTo(Material, {
  foreignKey: 'material_id',
  as: 'material',
});

CalibrationTemplate.hasMany(CalibrationAsset, {
  foreignKey: 'template_id',
  as: 'assets',
});

CalibrationAsset.belongsTo(CalibrationTemplate, {
  foreignKey: 'template_id',
  as: 'template',
});

FailureTicket.hasMany(FaultyComponent, {
  foreignKey: 'ticket_id',
  as: 'faulty_components',
});

FaultyComponent.belongsTo(FailureTicket, {
  foreignKey: 'ticket_id',
  as: 'ticket',
});

FailureTicket.hasMany(DebugTicketHistory, {
  foreignKey: 'ticket_id',
  as: 'timeline_events',
});

DebugTicketHistory.belongsTo(FailureTicket, {
  foreignKey: 'ticket_id',
  as: 'ticket',
});

function normalizeLogModule(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeLogEntityType(value) {
  return String(value || '').trim().toLowerCase();
}

function shouldMigrateHazmatLog(row) {
  const moduleName = normalizeLogModule(row && row.module);
  const entityType = normalizeLogEntityType(row && row.entity_type);
  return moduleName === 'inventory' || moduleName === 'hazmat' || entityType === 'material';
}

function shouldMigrateGageLog(row) {
  const moduleName = normalizeLogModule(row && row.module);
  const entityType = normalizeLogEntityType(row && row.entity_type);
  return moduleName === 'calibration' || moduleName === 'gage' || moduleName === 'gages' || entityType === 'asset';
}

const HAZMAT_CLASS_RULES = [
  { symbol: 'explosive', primaryClass: '1', division: '1.1' },
  { symbol: 'flammable', primaryClass: '2', division: '3' },
  { symbol: 'oxidizing', primaryClass: '3', division: '5.1' },
  { symbol: 'gas_cylinder', primaryClass: '4', division: '2.2' },
  { symbol: 'corrosive', primaryClass: '5', division: '8' },
  { symbol: 'toxic', primaryClass: '6', division: '6.1' },
  { symbol: 'health_hazard', primaryClass: '7', division: '6.2' },
  { symbol: 'exclamation_mark', primaryClass: '8', division: '9' },
  { symbol: 'environmental_hazard', primaryClass: '9', division: '9.1' },
];

function normalizeHazmatSymbol(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function normalizeHazmatSymbols(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(normalizeHazmatSymbol).filter(Boolean)));
  }

  const raw = String(value || '').trim();
  if (!raw) return [];

  if (raw.startsWith('[')) {
    try {
      return normalizeHazmatSymbols(JSON.parse(raw));
    } catch (error) {
    }
  }

  return Array.from(new Set(raw.split(/[;,|]/).map(normalizeHazmatSymbol).filter(Boolean)));
}

function normalizePrimaryClassCode(value) {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return '';
  const compact = text.startsWith('C') ? text.slice(1) : text;
  const digit = compact.match(/[0-9]/);
  return digit ? digit[0] : '';
}

function normalizeDivisionText(value) {
  return String(value || '').trim();
}

function resolveClassDivisionFromSymbols(symbols) {
  const normalized = normalizeHazmatSymbols(symbols);
  if (!normalized.length) {
    return { primaryClass: '0', division: '0' };
  }

  const symbolSet = new Set(normalized);
  const hasNonHazardous = symbolSet.has('non_hazardous');
  const hasOtherHazards = normalized.some((symbol) => symbol !== 'non_hazardous');

  if (hasNonHazardous && !hasOtherHazards) {
    return { primaryClass: '0', division: '0' };
  }

  for (const rule of HAZMAT_CLASS_RULES) {
    if (symbolSet.has(rule.symbol)) {
      return {
        primaryClass: rule.primaryClass,
        division: rule.division,
      };
    }
  }

  return { primaryClass: '0', division: '0' };
}

function normalizeLabelId(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeLabelDivisionSegment(value) {
  const compact = normalizeDivisionText(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact || '0';
}

function buildBase36Segment(length = 6) {
  let token = '';
  while (token.length < length) {
    token += Math.floor(Math.random() * 36).toString(36);
  }
  return token.slice(0, length).toUpperCase();
}

function formatLabelDateSegment(value) {
  const parsed = value ? new Date(value) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const yy = String(date.getUTCFullYear()).slice(-2);
  return `${mm}${dd}${yy}`;
}

function buildSmartLabelIdSeed(primaryClass, division, expirationDate) {
  const classCode = normalizePrimaryClassCode(primaryClass) || '0';
  const divisionCode = normalizeLabelDivisionSegment(division);
  const randomCode = buildBase36Segment(6);
  const dateCode = formatLabelDateSegment(expirationDate);
  return `C${classCode}${divisionCode}-${randomCode}-${dateCode}`;
}

function getUniqueBackfilledLabelId(usedSet, preferredLabel, primaryClass, division, expirationDate) {
  const preferred = normalizeLabelId(preferredLabel);
  if (preferred && !usedSet.has(preferred)) {
    usedSet.add(preferred);
    return preferred;
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidate = buildSmartLabelIdSeed(primaryClass, division, expirationDate);
    if (!usedSet.has(candidate)) {
      usedSet.add(candidate);
      return candidate;
    }
  }

  const fallback = normalizeLabelId(
    `C${normalizePrimaryClassCode(primaryClass) || '0'}${normalizeLabelDivisionSegment(division)}-${Date.now().toString(36).slice(-6).toUpperCase().padStart(6, '0')}-${formatLabelDateSegment(expirationDate)}`
  );
  usedSet.add(fallback);
  return fallback;
}

async function syncHazmatModels() {
  await hazmatSequelize.authenticate();
  await ensureHazmatMaterialColumns({ allowMissingTable: true });
  await hazmatSequelize.sync();
  await ensureHazmatMaterialColumns();
  await ensureHazmatMaterialIndexes();
}

async function ensureHazmatMaterialColumns(options = {}) {
  const allowMissingTable = Boolean(options && options.allowMissingTable);
  const hasMaterialsTable = await tableExists(hazmatSequelize, 'materials');
  if (!hasMaterialsTable) {
    if (allowMissingTable) return;
    throw new Error('materials table does not exist');
  }

  const columns = await listTableColumns(hazmatSequelize, 'materials');
  const missingColumns = [];

  if (!columns.has('label_id')) {
    missingColumns.push('ALTER TABLE materials ADD COLUMN label_id TEXT');
  }
  if (!columns.has('primary_class')) {
    missingColumns.push("ALTER TABLE materials ADD COLUMN primary_class TEXT NOT NULL DEFAULT '0'");
  }
  if (!columns.has('division')) {
    missingColumns.push("ALTER TABLE materials ADD COLUMN division TEXT NOT NULL DEFAULT ''");
  }

  if (!columns.has('cas_number')) {
    missingColumns.push('ALTER TABLE materials ADD COLUMN cas_number TEXT');
  }
  if (!columns.has('ghs_auto_symbols')) {
    missingColumns.push("ALTER TABLE materials ADD COLUMN ghs_auto_symbols TEXT NOT NULL DEFAULT '[]'");
  }
  if (!columns.has('ghs_manual_overrides')) {
    missingColumns.push("ALTER TABLE materials ADD COLUMN ghs_manual_overrides TEXT NOT NULL DEFAULT '{\"on\":[],\"off\":[]}'");
  }
  if (!columns.has('container_size')) {
    missingColumns.push('ALTER TABLE materials ADD COLUMN container_size TEXT');
  }
  if (!columns.has('sds_file_path')) {
    missingColumns.push('ALTER TABLE materials ADD COLUMN sds_file_path TEXT');
  }
  if (!columns.has('image_paths')) {
    missingColumns.push("ALTER TABLE materials ADD COLUMN image_paths TEXT NOT NULL DEFAULT '[]'");
  }

  for (const statement of missingColumns) {
    await hazmatSequelize.query(statement);
  }

  await hazmatSequelize.query("UPDATE materials SET label_id = COALESCE(NULLIF(TRIM(label_id), ''), NULLIF(TRIM(batch_id), ''))");
  await hazmatSequelize.query("UPDATE materials SET primary_class = COALESCE(NULLIF(TRIM(primary_class), ''), '0')");
  await hazmatSequelize.query("UPDATE materials SET division = COALESCE(division, '')");
  await hazmatSequelize.query("UPDATE materials SET ghs_auto_symbols = COALESCE(ghs_auto_symbols, '[]')");
  await hazmatSequelize.query("UPDATE materials SET ghs_manual_overrides = COALESCE(ghs_manual_overrides, '{\"on\":[],\"off\":[]}')");
  await hazmatSequelize.query("UPDATE materials SET image_paths = COALESCE(image_paths, '[]')");

  const rows = await Material.findAll({
    attributes: ['id', 'label_id', 'batch_id', 'primary_class', 'division', 'ghs_symbols', 'ghs_auto_symbols', 'expiration_date'],
    order: [['id', 'ASC']],
    raw: true,
  });
  const usedLabelIds = new Set();

  for (const row of rows) {
    const autoSymbols = normalizeHazmatSymbols(row.ghs_auto_symbols);
    const selectedSymbols = normalizeHazmatSymbols(row.ghs_symbols);
    const derived = resolveClassDivisionFromSymbols(autoSymbols.length ? autoSymbols : selectedSymbols);

    const primaryClass = normalizePrimaryClassCode(row.primary_class) || derived.primaryClass;
    const division = normalizeDivisionText(row.division) || derived.division;
    const existingLabelId = normalizeLabelId(row.label_id);
    let labelId = existingLabelId;

    if (labelId && !usedLabelIds.has(labelId)) {
      usedLabelIds.add(labelId);
    } else {
      const preferredLabelId = normalizeLabelId(row.batch_id);
      labelId = getUniqueBackfilledLabelId(
        usedLabelIds,
        preferredLabelId,
        primaryClass,
        division,
        row.expiration_date
      );
    }

    const updates = {};
    if (existingLabelId !== labelId) updates.label_id = labelId;
    if (normalizeLabelId(row.batch_id) !== labelId) updates.batch_id = labelId;
    if (normalizePrimaryClassCode(row.primary_class) !== primaryClass) updates.primary_class = primaryClass;
    if (normalizeDivisionText(row.division) !== division) updates.division = division;

    if (Object.keys(updates).length) {
      await Material.update(updates, { where: { id: row.id } });
    }
  }
}

async function ensureHazmatMaterialIndexes() {
  await hazmatSequelize.query('CREATE INDEX IF NOT EXISTS materials_name_idx ON materials(name)');
  await hazmatSequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS materials_label_id_uidx ON materials(label_id)');
  await hazmatSequelize.query('CREATE INDEX IF NOT EXISTS materials_batch_id_idx ON materials(batch_id)');
  await hazmatSequelize.query('CREATE INDEX IF NOT EXISTS materials_primary_class_idx ON materials(primary_class)');
  await hazmatSequelize.query('CREATE INDEX IF NOT EXISTS materials_cas_number_idx ON materials(cas_number)');
}
async function listTableColumns(sequelize, tableName) {
  const rows = await sequelize.query(`PRAGMA table_info(${tableName})`, {
    type: QueryTypes.SELECT,
  });
  return new Set(rows.map((row) => String(row && row.name ? row.name : '').trim()).filter(Boolean));
}

async function ensureCalibrationTemplateColumns() {
  const columns = await listTableColumns(gagesSequelize, 'templates');
  const missingColumns = [];

  if (!columns.has('interval_mode')) {
    missingColumns.push("ALTER TABLE templates ADD COLUMN interval_mode TEXT NOT NULL DEFAULT 'days'");
  }
  if (!columns.has('interval_months')) {
    missingColumns.push('ALTER TABLE templates ADD COLUMN interval_months INTEGER NOT NULL DEFAULT 12');
  }
  if (!columns.has('interval_days')) {
    missingColumns.push('ALTER TABLE templates ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 365');
  }
  if (!columns.has('max_daily_calibrations')) {
    missingColumns.push('ALTER TABLE templates ADD COLUMN max_daily_calibrations INTEGER NOT NULL DEFAULT 10');
  }
  if (!columns.has('allowed_days')) {
    missingColumns.push("ALTER TABLE templates ADD COLUMN allowed_days TEXT NOT NULL DEFAULT '[1,2,3,4,5]'");
  }

  for (const statement of missingColumns) {
    await gagesSequelize.query(statement);
  }
}

async function ensureCalibrationAssetColumns() {
  const columns = await listTableColumns(gagesSequelize, 'calibration');
  const missingColumns = [];

  if (!columns.has('asset_type')) {
    missingColumns.push('ALTER TABLE calibration ADD COLUMN asset_type TEXT');
  }
  if (!columns.has('model')) {
    missingColumns.push('ALTER TABLE calibration ADD COLUMN model TEXT');
  }
  if (!columns.has('manufacturer')) {
    missingColumns.push('ALTER TABLE calibration ADD COLUMN manufacturer TEXT');
  }
  if (!columns.has('template_id')) {
    missingColumns.push('ALTER TABLE calibration ADD COLUMN template_id INTEGER');
  }
  if (!columns.has('category')) {
    missingColumns.push(`ALTER TABLE calibration ADD COLUMN category TEXT NOT NULL DEFAULT '${DEFAULT_CATEGORY}'`);
  }
  if (!columns.has('alert_lead_days')) {
    missingColumns.push(`ALTER TABLE calibration ADD COLUMN alert_lead_days INTEGER NOT NULL DEFAULT ${defaultAlertLeadDays(DEFAULT_INTERVAL_DAYS)}`);
  }
  if (!columns.has('grace_period_days')) {
    missingColumns.push(`ALTER TABLE calibration ADD COLUMN grace_period_days INTEGER NOT NULL DEFAULT ${defaultGracePeriodDays(DEFAULT_INTERVAL_DAYS)}`);
  }
  if (!columns.has('unit_of_measure')) {
    missingColumns.push(`ALTER TABLE calibration ADD COLUMN unit_of_measure TEXT NOT NULL DEFAULT '${DEFAULT_UNIT_OF_MEASURE}'`);
  }
  if (!columns.has('measurement_types')) {
    missingColumns.push('ALTER TABLE calibration ADD COLUMN measurement_types TEXT');
  }
  if (!columns.has('range_size')) {
    missingColumns.push('ALTER TABLE calibration ADD COLUMN range_size TEXT');
  }
  if (!columns.has('accuracy')) {
    missingColumns.push('ALTER TABLE calibration ADD COLUMN accuracy TEXT');
  }
  if (!columns.has('date_acquired')) {
    missingColumns.push('ALTER TABLE calibration ADD COLUMN date_acquired TEXT');
  }
  if (!columns.has('source_vendor')) {
    missingColumns.push('ALTER TABLE calibration ADD COLUMN source_vendor TEXT');
  }
  if (!columns.has('cost')) {
    missingColumns.push('ALTER TABLE calibration ADD COLUMN cost REAL');
  }
  if (!columns.has('environment')) {
    missingColumns.push('ALTER TABLE calibration ADD COLUMN environment TEXT');
  }
  if (!columns.has('instructions')) {
    missingColumns.push('ALTER TABLE calibration ADD COLUMN instructions TEXT');
  }
  if (!columns.has('notes')) {
    missingColumns.push('ALTER TABLE calibration ADD COLUMN notes TEXT');
  }
  if (!columns.has('attachment_path')) {
    missingColumns.push('ALTER TABLE calibration ADD COLUMN attachment_path TEXT');
  }
  if (!columns.has('date_created')) {
    missingColumns.push('ALTER TABLE calibration ADD COLUMN date_created TEXT');
  }
  if (!columns.has('assigned_department')) {
    missingColumns.push(`ALTER TABLE calibration ADD COLUMN assigned_department TEXT NOT NULL DEFAULT '${DEFAULT_DEPARTMENT}'`);
  }

  for (const statement of missingColumns) {
    await gagesSequelize.query(statement);
  }

  await gagesSequelize.query("UPDATE calibration SET date_created = COALESCE(date_created, date('now'))");
}

async function syncGagesModels() {
  await gagesSequelize.authenticate();
  await Department.sync();
  await CalibrationTemplate.sync();
  await ensureCalibrationTemplateColumns();
  await CalibrationAsset.sync();
  await ensureCalibrationAssetColumns();
  await GageLog.sync();
}

async function syncDebugModels() {
  await debugSequelize.authenticate();
  await FailureTicket.sync();
  await FaultyComponent.sync();
  await DebugTicketHistory.sync();
  await DebugLog.sync();
}

function buildTemplateValues(source) {
  const intervalMode = normalizeIntervalMode(source && (source.interval_mode || source.intervalMode), DEFAULT_INTERVAL_MODE);
  const intervalMonths = normalizeIntervalMonths(source && (source.interval_months || source.intervalMonths), DEFAULT_INTERVAL_MONTHS);
  const intervalDays = normalizeIntervalDays(
    source && (source.interval_days || source.intervalDays || source.cal_interval_days || source.cal_frequency),
    DEFAULT_INTERVAL_DAYS
  );
  const interval = deriveIntervalDays({
    intervalMode,
    intervalMonths,
    intervalDays,
  });

  return {
    template_name: normalizeText(source && (source.template_name || source.tool_name), 'Legacy Template'),
    category: normalizeCategory(source && source.category, DEFAULT_CATEGORY),
    cal_interval_days: interval,
    interval_mode: intervalMode,
    interval_months: intervalMonths,
    interval_days: intervalDays,
    alert_lead_days: Math.min(interval, normalizeNonNegativeInteger(source && source.alert_lead_days, defaultAlertLeadDays(interval))),
    grace_period_days: normalizeNonNegativeInteger(source && source.grace_period_days, defaultGracePeriodDays(interval)),
    unit_of_measure: normalizeUnitOfMeasure(source && source.unit_of_measure, DEFAULT_UNIT_OF_MEASURE),
    assigned_department: normalizeText(source && source.assigned_department, DEFAULT_DEPARTMENT),
    max_daily_calibrations: normalizeMaxDailyCalibrations(
      source && (source.max_daily_calibrations || source.maxDailyCalibrations),
      DEFAULT_MAX_DAILY_CALIBRATIONS
    ),
    allowed_days: JSON.stringify(normalizeAllowedDays(
      source && (source.allowed_days || source.allowedDays),
      DEFAULT_ALLOWED_DAYS
    )),
  };
}

function buildTemplateKey(source) {
  const values = buildTemplateValues(source || {});
  const allowedDays = normalizeAllowedDays(values.allowed_days, DEFAULT_ALLOWED_DAYS).join(',');
  return [
    values.template_name.toLowerCase(),
    values.category.toLowerCase(),
    values.cal_interval_days,
    values.interval_mode,
    values.interval_months,
    values.interval_days,
    values.alert_lead_days,
    values.grace_period_days,
    values.unit_of_measure.toLowerCase(),
    values.assigned_department.toLowerCase(),
    values.max_daily_calibrations,
    allowedDays,
  ].join('|');
}

async function tableExists(sequelize, tableName) {
  const rows = await sequelize.query(
    'SELECT name FROM sqlite_master WHERE type = \'table\' AND name = ?',
    {
      replacements: [tableName],
      type: QueryTypes.SELECT,
    }
  );

  return rows.length > 0;
}

async function hasHazmatData() {
  const counts = await Promise.all([
    Material.count(),
    UsageLog.count(),
    HazmatLog.count(),
  ]);

  return counts.some((count) => Number(count) > 0);
}

async function hasGagesData() {
  const counts = await Promise.all([
    CalibrationAsset.count(),
    GageLog.count(),
  ]);

  return counts.some((count) => Number(count) > 0);
}

async function readLegacyRows(sequelize, sql) {
  return sequelize.query(sql, { type: QueryTypes.SELECT });
}

async function migrateHazmatData(legacySequelize) {
  if (!legacySequelize || await hasHazmatData()) {
    return false;
  }

  const [hasMaterials, hasUsageLogs, hasLogs] = await Promise.all([
    tableExists(legacySequelize, 'materials'),
    tableExists(legacySequelize, 'usage_logs'),
    tableExists(legacySequelize, 'logs'),
  ]);

  if (!hasMaterials && !hasUsageLogs && !hasLogs) {
    return false;
  }

  const [materials, usageLogs, logs] = await Promise.all([
    hasMaterials
      ? readLegacyRows(legacySequelize, 'SELECT id, name, batch_id, ghs_symbols, received_date, expiration_date, current_stock, min_threshold FROM materials ORDER BY id ASC')
      : [],
    hasUsageLogs
      ? readLegacyRows(legacySequelize, 'SELECT id, material_id, user_id, quantity_delta, timestamp, reason FROM usage_logs ORDER BY id ASC')
      : [],
    hasLogs
      ? readLegacyRows(legacySequelize, 'SELECT id, module, entity_type, entity_id, action, actor_id, actor_name, detail, metadata, timestamp FROM logs ORDER BY id ASC')
      : [],
  ]);

  const hazmatLogs = logs.filter(shouldMigrateHazmatLog);
  if (!materials.length && !usageLogs.length && !hazmatLogs.length) {
    return false;
  }

  await hazmatSequelize.transaction(async (transaction) => {
    for (const row of materials) {
      const symbols = normalizeHazmatSymbols(row.ghs_symbols);
      const derived = resolveClassDivisionFromSymbols(symbols);
      await Material.upsert({
        id: row.id,
        name: row.name,
        label_id: row.batch_id,
        batch_id: row.batch_id,
        primary_class: derived.primaryClass,
        division: derived.division,
        ghs_symbols: row.ghs_symbols,
        received_date: row.received_date,
        expiration_date: row.expiration_date,
        stock_level: row.current_stock,
        min_threshold: row.min_threshold,
      }, { transaction });
    }

    for (const row of usageLogs) {
      await UsageLog.upsert({
        id: row.id,
        material_id: row.material_id,
        user_id: row.user_id,
        quantity_delta: row.quantity_delta,
        timestamp: row.timestamp,
        reason: row.reason,
      }, { transaction });
    }

    for (const row of hazmatLogs) {
      await HazmatLog.upsert({
        id: row.id,
        module: row.module,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        action: row.action,
        actor_id: row.actor_id,
        actor_name: row.actor_name,
        detail: row.detail,
        metadata: row.metadata,
        timestamp: row.timestamp,
      }, { transaction });
    }
  });

  return true;
}

async function migrateGagesData(legacySequelize) {
  if (!legacySequelize || await hasGagesData()) {
    return false;
  }

  const [hasCalibration, hasLogs] = await Promise.all([
    tableExists(legacySequelize, 'calibration'),
    tableExists(legacySequelize, 'logs'),
  ]);

  if (!hasCalibration && !hasLogs) {
    return false;
  }

  const [calibrationAssets, logs] = await Promise.all([
    hasCalibration
      ? readLegacyRows(legacySequelize, 'SELECT id, tool_name, serial_number, last_cal, cal_frequency, next_cal, status FROM calibration ORDER BY id ASC')
      : [],
    hasLogs
      ? readLegacyRows(legacySequelize, 'SELECT id, module, entity_type, entity_id, action, actor_id, actor_name, detail, metadata, timestamp FROM logs ORDER BY id ASC')
      : [],
  ]);

  const gageLogs = logs.filter(shouldMigrateGageLog);
  if (!calibrationAssets.length && !gageLogs.length) {
    return false;
  }

  await gagesSequelize.transaction(async (transaction) => {
    for (const row of calibrationAssets) {
      await CalibrationAsset.upsert({
        id: row.id,
        tool_name: row.tool_name,
        serial_number: row.serial_number,
        last_cal: row.last_cal,
        cal_frequency: row.cal_frequency,
        next_cal: row.next_cal,
        status: row.status,
      }, { transaction });
    }

    for (const row of gageLogs) {
      await GageLog.upsert({
        id: row.id,
        module: row.module,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        action: row.action,
        actor_id: row.actor_id,
        actor_name: row.actor_name,
        detail: row.detail,
        metadata: row.metadata,
        timestamp: row.timestamp,
      }, { transaction });
    }
  });

  return true;
}

async function migrateLegacyPortalData() {
  const appDbPath = path.resolve(paths.APP_DB_PATH);
  if (!fs.existsSync(appDbPath)) {
    return { hazmatMigrated: false, gagesMigrated: false };
  }

  const blockedTargets = new Set([
    path.resolve(paths.HAZMAT_DB_PATH),
    path.resolve(paths.GAGES_DB_PATH),
    path.resolve(paths.DEBUG_LAB_DB_PATH),
  ]);

  if (blockedTargets.has(appDbPath)) {
    return { hazmatMigrated: false, gagesMigrated: false };
  }

  const legacySequelize = createSQLiteSequelize(appDbPath);

  try {
    const hazmatMigrated = await migrateHazmatData(legacySequelize);
    const gagesMigrated = await migrateGagesData(legacySequelize);
    return { hazmatMigrated, gagesMigrated };
  } finally {
    await legacySequelize.close().catch(() => null);
  }
}

async function hydrateCalibrationTemplates() {
  const assets = await CalibrationAsset.findAll({
    order: [['id', 'ASC']],
  });

  if (!assets.length) {
    return false;
  }

  const templates = await CalibrationTemplate.findAll({
    order: [['id', 'ASC']],
  });
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const templatesByKey = new Map(templates.map((template) => [buildTemplateKey(template.toJSON()), template]));
  let changed = false;

  await gagesSequelize.transaction(async (transaction) => {
    for (const asset of assets) {
      let template = asset.template_id ? templatesById.get(asset.template_id) : null;
      if (!template) {
        const templateValues = buildTemplateValues(asset.toJSON());
        const templateKey = buildTemplateKey(templateValues);
        template = templatesByKey.get(templateKey);

        if (!template) {
          template = await CalibrationTemplate.create(templateValues, { transaction });
          templatesById.set(template.id, template);
          templatesByKey.set(templateKey, template);
          changed = true;
        }
      }

      const inheritedValues = {
        template_id: template.id,
        category: template.category,
        cal_frequency: template.cal_interval_days,
        alert_lead_days: template.alert_lead_days,
        grace_period_days: template.grace_period_days,
        unit_of_measure: template.unit_of_measure,
        assigned_department: template.assigned_department,
      };

      if (
        asset.template_id !== inheritedValues.template_id
        || asset.category !== inheritedValues.category
        || Number(asset.cal_frequency) !== Number(inheritedValues.cal_frequency)
        || Number(asset.alert_lead_days) !== Number(inheritedValues.alert_lead_days)
        || Number(asset.grace_period_days) !== Number(inheritedValues.grace_period_days)
        || String(asset.unit_of_measure || '') !== inheritedValues.unit_of_measure
        || String(asset.assigned_department || '') !== inheritedValues.assigned_department
      ) {
        await asset.update(inheritedValues, { transaction });
        changed = true;
      }
    }
  });

  return changed;
}

async function syncPortalModels() {
  await syncHazmatModels();
  await syncGagesModels();
  await syncDebugModels();
  await migrateLegacyPortalData();
  await hydrateCalibrationTemplates();
}

const hazmatDb = {
  sequelize: hazmatSequelize,
  Material,
  UsageLog,
  HazmatTemplate,
  CommandLog: HazmatLog,
};

const gagesDb = {
  sequelize: gagesSequelize,
  Department,
  CalibrationTemplate,
  CalibrationAsset,
  CommandLog: GageLog,
};

const debugDb = {
  sequelize: debugSequelize,
  FailureTicket,
  FaultyComponent,
  DebugTicketHistory,
  CommandLog: DebugLog,
};

module.exports = {
  hazmatDb,
  gagesDb,
  debugDb,
  sequelize: hazmatSequelize,
  hazmatSequelize,
  gagesSequelize,
  debugSequelize,
  Material,
  UsageLog,
  HazmatTemplate,
  Department,
  CalibrationTemplate,
  CalibrationAsset,
  FailureTicket,
  FaultyComponent,
  DebugTicketHistory,
  HazmatLog,
  GageLog,
  DebugLog,
  syncPortalModels,
  syncHazmatModels,
  syncGagesModels,
  syncDebugModels,
  hydrateCalibrationTemplates,
  migrateHazmatData,
  migrateGagesData,
  migrateLegacyPortalData,
};