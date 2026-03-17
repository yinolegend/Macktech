const path = require('path');
const crypto = require('crypto');
const { createRequire } = require('module');

const backendRequire = createRequire(path.join(__dirname, '..', '..', 'backend', 'package.json'));
const QRCode = backendRequire('qrcode');
const { Op, fn, col, where } = backendRequire('sequelize');
const {
  DEFAULT_CATEGORY,
  DEFAULT_DEPARTMENT,
  DEFAULT_ALLOWED_DAYS,
  DEFAULT_INTERVAL_DAYS,
  DEFAULT_INTERVAL_MODE,
  DEFAULT_INTERVAL_MONTHS,
  DEFAULT_MAX_DAILY_CALIBRATIONS,
  DEFAULT_UNIT_OF_MEASURE,
  computeCalibrationStatus,
  computeNextCalibrationDate,
  defaultAlertLeadDays,
  defaultGracePeriodDays,
  deriveIntervalDays,
  normalizeAllowedDays,
  normalizeCategory,
  normalizeIntervalDays,
  normalizeIntervalMode,
  normalizeIntervalMonths,
  normalizeMaxDailyCalibrations,
  normalizeNonNegativeInteger,
  normalizePositiveInteger,
  normalizeText,
  normalizeUnitOfMeasure,
} = require('../../models/calibrationRules');

const HIGH_HAZARD_CODES = new Set(['explosive', 'flammable', 'oxidizing', 'toxic', 'corrosive', 'health_hazard']);
const DEBUG_TICKET_STATUSES = new Set(['OPEN', 'BENCH', 'FIXED', 'SCRAP']);
const CLOSED_DEBUG_STATUSES = new Set(['FIXED', 'SCRAP']);

function normalizeSymbol(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function normalizeSymbols(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(normalizeSymbol).filter(Boolean)));
  }

  const raw = String(value || '').trim();
  if (!raw) return [];

  if (raw.startsWith('[')) {
    try {
      return normalizeSymbols(JSON.parse(raw));
    } catch (error) {
    }
  }

  return Array.from(new Set(raw.split(/[;,|]/).map(normalizeSymbol).filter(Boolean)));
}

function normalizeDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function dateOnlyKey(value) {
  const normalized = normalizeDate(value);
  return normalized ? `${normalized}T00:00:00Z` : null;
}

function daysUntil(value) {
  const key = dateOnlyKey(value);
  if (!key) return null;

  const target = new Date(key);
  const today = new Date();
  const todayKey = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return Math.round((target.getTime() - todayKey.getTime()) / 86400000);
}

function buildCertificateId(assetId) {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0'),
  ].join('');

  return `CC-CAL-${assetId}-${stamp}`;
}

function normalizeNumericId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 0;
}

function formatIdSerial(value, width = 6) {
  return String(normalizeNumericId(value)).padStart(width, '0');
}

function buildAssetUid(moduleName, id) {
  const modulePrefix = String(moduleName || '').toLowerCase() === 'calibration' ? 'CAL' : 'HAZ';
  return `${modulePrefix}-ASSET-${formatIdSerial(id)}`;
}

function buildCfeUid(moduleName, id) {
  const modulePrefix = String(moduleName || '').toLowerCase() === 'calibration' ? 'CAL' : 'HAZ';
  return `CFE-${modulePrefix}-${formatIdSerial(id)}`;
}

function formatMaterial(material) {
  const payload = material && typeof material.toJSON === 'function' ? material.toJSON() : material;
  const ghsSymbols = normalizeSymbols(payload.ghs_symbols);
  const daysRemaining = daysUntil(payload.expiration_date);
  const stockLevel = normalizeNumber(payload.stock_level, normalizeNumber(payload.current_stock));
  const minThreshold = normalizeNumber(payload.min_threshold);

  return {
    id: payload.id,
    asset_uid: payload.asset_uid || buildAssetUid('hazmat', payload.id),
    cfe_uid: null,
    name: payload.name,
    batch_id: payload.batch_id,
    ghs_symbols: ghsSymbols,
    expiration_date: payload.expiration_date,
    stock_level: stockLevel,
    min_threshold: minThreshold,
    expired: typeof daysRemaining === 'number' ? daysRemaining < 0 : false,
    days_remaining: daysRemaining,
    low_stock: stockLevel <= minThreshold,
    high_hazard: ghsSymbols.some((symbol) => HIGH_HAZARD_CODES.has(symbol)),
  };
}

function formatCalibration(asset) {
  const payload = asset && typeof asset.toJSON === 'function' ? asset.toJSON() : asset;
  const daysRemaining = daysUntil(payload.next_cal);
  const template = payload.template && typeof payload.template.toJSON === 'function'
    ? payload.template.toJSON()
    : payload.template;
  const calFrequency = normalizePositiveInteger(payload.cal_frequency, DEFAULT_INTERVAL_DAYS);
  const alertLeadDays = Math.min(calFrequency, normalizeNonNegativeInteger(payload.alert_lead_days, defaultAlertLeadDays(calFrequency)));
  const gracePeriodDays = normalizeNonNegativeInteger(payload.grace_period_days, defaultGracePeriodDays(calFrequency));
  const status = String(payload.status || computeCalibrationStatus({
    nextCalDate: payload.next_cal,
    alertLeadDays,
    gracePeriodDays,
  })).toUpperCase() || 'WARNING';
  const graceRemaining = typeof daysRemaining === 'number' ? Math.max(0, gracePeriodDays + daysRemaining) : null;
  const templatePayload = template ? formatTemplate(template, { module: 'calibration' }) : null;

  return {
    id: payload.id,
    asset_uid: payload.asset_uid || buildAssetUid('calibration', payload.id),
    cfe_uid: payload.cfe_uid || buildCfeUid('calibration', payload.id),
    date_created: payload.date_created || null,
    dateCreated: payload.date_created || null,
    template_id: payload.template_id || (templatePayload && templatePayload.id) || null,
    template_name: (templatePayload && templatePayload.template_name) || payload.tool_name,
    tool_name: payload.tool_name,
    serial_number: payload.serial_number,
    asset_type: payload.asset_type || null,
    model: payload.model || null,
    manufacturer: payload.manufacturer || null,
    measurement_types: payload.measurement_types || null,
    range_size: payload.range_size || null,
    accuracy: payload.accuracy || null,
    date_acquired: payload.date_acquired || null,
    source_vendor: payload.source_vendor || null,
    cost: payload.cost == null ? null : Number(payload.cost),
    environment: payload.environment || null,
    instructions: payload.instructions || null,
    notes: payload.notes || null,
    attachment_path: payload.attachment_path || null,
    category: payload.category || (templatePayload && templatePayload.category) || DEFAULT_CATEGORY,
    last_cal: payload.last_cal,
    cal_frequency: calFrequency,
    interval_mode: payload.interval_mode || (templatePayload && templatePayload.interval_mode) || DEFAULT_INTERVAL_MODE,
    interval_months: normalizeIntervalMonths(payload.interval_months || (templatePayload && templatePayload.interval_months), DEFAULT_INTERVAL_MONTHS),
    interval_days: normalizeIntervalDays(payload.interval_days || (templatePayload && templatePayload.interval_days) || calFrequency, calFrequency),
    alert_lead_days: alertLeadDays,
    grace_period_days: gracePeriodDays,
    max_daily_calibrations: normalizeMaxDailyCalibrations(
      payload.max_daily_calibrations || (templatePayload && templatePayload.max_daily_calibrations),
      DEFAULT_MAX_DAILY_CALIBRATIONS
    ),
    allowed_days: normalizeAllowedDays(
      payload.allowed_days || (templatePayload && templatePayload.allowed_days),
      DEFAULT_ALLOWED_DAYS
    ),
    next_cal: payload.next_cal,
    unit_of_measure: normalizeUnitOfMeasure(
      payload.unit_of_measure || (templatePayload && templatePayload.unit_of_measure),
      DEFAULT_UNIT_OF_MEASURE
    ),
    assigned_department: payload.assigned_department || (templatePayload && templatePayload.assigned_department) || DEFAULT_DEPARTMENT,
    status,
    safe: status === 'SAFE',
    warning: status === 'WARNING',
    expired: status === 'EXPIRED',
    due_today: status === 'WARNING' && daysRemaining === 0,
    overdue: status === 'EXPIRED' || status === 'LOCKED',
    in_grace_period: status === 'EXPIRED',
    days_until_due: daysRemaining,
    grace_remaining_days: graceRemaining,
    locked_for_checkout: status === 'LOCKED',
    template: templatePayload,
  };
}

function formatTemplate(template, options = {}) {
  const payload = template && typeof template.toJSON === 'function' ? template.toJSON() : template;
  const schedule = normalizeTemplateSchedule(payload);
  const moduleName = options.module || payload.module || null;
  return {
    id: payload.id,
    template_name: payload.template_name,
    category: payload.category,
    module: moduleName,
    cal_interval_days: schedule.derivedIntervalDays,
    interval_mode: schedule.intervalMode,
    intervalMode: schedule.intervalMode,
    interval_months: schedule.intervalMonths,
    intervalMonths: schedule.intervalMonths,
    interval_days: schedule.intervalDays,
    intervalDays: schedule.intervalDays,
    alert_lead_days: normalizeNonNegativeInteger(payload.alert_lead_days, defaultAlertLeadDays(schedule.derivedIntervalDays)),
    grace_period_days: normalizeNonNegativeInteger(payload.grace_period_days, defaultGracePeriodDays(schedule.derivedIntervalDays)),
    max_daily_calibrations: schedule.maxDailyCalibrations,
    maxDailyCalibrations: schedule.maxDailyCalibrations,
    allowed_days: schedule.allowedDays,
    allowedDays: schedule.allowedDays,
    unit_of_measure: normalizeUnitOfMeasure(payload.unit_of_measure, DEFAULT_UNIT_OF_MEASURE),
    assigned_department: payload.assigned_department || DEFAULT_DEPARTMENT,
    asset_count: Array.isArray(payload.assets) ? payload.assets.length : normalizeNumber(payload.asset_count, 0),
  };
}

function formatLog(entry, source) {
  const payload = entry && typeof entry.toJSON === 'function' ? entry.toJSON() : entry;
  return {
    id: payload.id,
    source: source || null,
    module: payload.module,
    entity_type: payload.entity_type,
    entity_id: payload.entity_id,
    action: payload.action,
    actor_id: payload.actor_id,
    actor_name: payload.actor_name,
    detail: payload.detail,
    metadata: payload.metadata || {},
    timestamp: payload.timestamp,
  };
}

function normalizeLogTimestamp(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function normalizeAssetSource(value) {
  const source = String(value || '').trim().toLowerCase();
  if (source === 'hazmat' || source === 'material' || source === 'materials') return 'hazmat';
  if (source === 'calibration' || source === 'asset' || source === 'assets') return 'calibration';
  if (source === 'debug' || source === 'debug_lab' || source === 'failure' || source === 'failure_ticket' || source === 'failure_tickets') return 'debug';
  return '';
}

function normalizePositiveLimit(value, fallback, max) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return fallback;
  return Math.min(numeric, max);
}

function normalizeMaterialPayload(payload) {
  const name = String((payload && payload.name) || '').trim();
  const batchId = String((payload && payload.batch_id) || '').trim();
  if (!name || !batchId) {
    throw new Error('name and batch_id are required');
  }

  return {
    name,
    batch_id: batchId,
    ghs_symbols: normalizeSymbols(payload.ghs_symbols),
    expiration_date: normalizeDate(payload.expiration_date),
    stock_level: normalizeNumber(payload.stock_level, normalizeNumber(payload.current_stock)),
    min_threshold: normalizeNumber(payload.min_threshold),
  };
}

function normalizeTemplateId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeOptionalText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeDepartmentName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeDepartmentPayload(payload) {
  const name = normalizeDepartmentName(
    (payload && (payload.name || payload.department_name)) || ''
  );
  if (!name) {
    throw new Error('name is required');
  }

  const supervisor = normalizeDepartmentName(
    normalizeOptionalText(payload && (payload.supervisor || payload.department_supervisor)) || ''
  );

  return {
    name,
    supervisor,
  };
}

function formatDepartment(department) {
  const payload = department && typeof department.toJSON === 'function'
    ? department.toJSON()
    : (department || {});
  return {
    id: payload.id,
    name: normalizeDepartmentName(payload.name),
    supervisor: normalizeDepartmentName(payload.supervisor),
  };
}

function normalizeCost(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeAttachmentPath(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (!text.startsWith('/calibration-attachments/')) return null;
  return text;
}

function normalizeTemplateSchedule(payload) {
  const source = payload || {};
  const intervalMode = normalizeIntervalMode(
    source.interval_mode || source.intervalMode,
    DEFAULT_INTERVAL_MODE
  );
  const intervalMonths = normalizeIntervalMonths(
    source.interval_months || source.intervalMonths,
    DEFAULT_INTERVAL_MONTHS
  );
  const intervalDays = normalizeIntervalDays(
    source.interval_days || source.intervalDays || source.cal_interval_days || source.cal_frequency,
    DEFAULT_INTERVAL_DAYS
  );
  const derivedIntervalDays = deriveIntervalDays({
    intervalMode,
    intervalMonths,
    intervalDays,
  });
  const maxDailyCalibrations = normalizeMaxDailyCalibrations(
    source.max_daily_calibrations || source.maxDailyCalibrations,
    DEFAULT_MAX_DAILY_CALIBRATIONS
  );
  const allowedDays = normalizeAllowedDays(
    source.allowed_days || source.allowedDays,
    DEFAULT_ALLOWED_DAYS
  );

  return {
    intervalMode,
    intervalMonths,
    intervalDays,
    derivedIntervalDays,
    maxDailyCalibrations,
    allowedDays,
  };
}

function normalizeTemplatePayload(payload, options = {}) {
  const fallbackName = options.fallbackName || '';
  const moduleName = String(options.module || '').trim().toLowerCase();
  const templateName = normalizeText(payload && payload.template_name, fallbackName);
  if (!templateName) {
    throw new Error('template_name is required');
  }

  const schedule = normalizeTemplateSchedule(payload);
  const basePayload = {
    template_name: templateName,
    category: normalizeCategory(payload && payload.category, DEFAULT_CATEGORY),
    cal_interval_days: schedule.derivedIntervalDays,
    alert_lead_days: Math.min(
      schedule.derivedIntervalDays,
      normalizeNonNegativeInteger(payload && payload.alert_lead_days, defaultAlertLeadDays(schedule.derivedIntervalDays))
    ),
    grace_period_days: normalizeNonNegativeInteger(
      payload && payload.grace_period_days,
      defaultGracePeriodDays(schedule.derivedIntervalDays)
    ),
    unit_of_measure: normalizeUnitOfMeasure(payload && payload.unit_of_measure, DEFAULT_UNIT_OF_MEASURE),
    assigned_department: normalizeText(payload && payload.assigned_department, DEFAULT_DEPARTMENT),
  };

  if (moduleName !== 'calibration') {
    return basePayload;
  }

  return {
    ...basePayload,
    interval_mode: schedule.intervalMode,
    interval_months: schedule.intervalMonths,
    interval_days: schedule.intervalDays,
    max_daily_calibrations: schedule.maxDailyCalibrations,
    allowed_days: JSON.stringify(schedule.allowedDays),
  };
}

function normalizeCalibrationPayload(payload) {
  const toolName = String((payload && payload.tool_name) || '').trim();
  const serialNumber = String((payload && payload.serial_number) || '').trim();
  if (!toolName || !serialNumber) {
    throw new Error('tool_name and serial_number are required');
  }

  const templateId = normalizeTemplateId(payload && payload.template_id);

  return {
    tool_name: toolName,
    serial_number: serialNumber,
    last_cal: normalizeDate(payload.last_cal),
    asset_type: normalizeOptionalText(payload.asset_type),
    model: normalizeOptionalText(payload.model),
    manufacturer: normalizeOptionalText(payload.manufacturer),
    measurement_types: normalizeOptionalText(payload.measurement_types),
    unit_of_measure: normalizeOptionalText(payload.unit_of_measure),
    range_size: normalizeOptionalText(payload.range_size),
    accuracy: normalizeOptionalText(payload.accuracy),
    date_acquired: normalizeDate(payload.date_acquired),
    source_vendor: normalizeOptionalText(payload.source_vendor),
    cost: normalizeCost(payload.cost),
    environment: normalizeOptionalText(payload.environment),
    instructions: normalizeOptionalText(payload.instructions),
    notes: normalizeOptionalText(payload.notes),
    attachment_path: normalizeAttachmentPath(payload.attachment_path),
    assigned_department: normalizeOptionalText(payload.assigned_department),
    template_id: templateId,
    template_payload: templateId
      ? null
      : normalizeTemplatePayload(payload, { fallbackName: toolName, module: 'calibration' }),
  };
}

function normalizeUsagePayload(payload) {
  const quantity = normalizeNumber(payload && payload.quantity, NaN);
  const reason = String((payload && payload.reason) || '').trim() || 'Material usage';
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('quantity must be greater than zero');
  }

  return {
    quantity,
    reason,
  };
}

function normalizeVerificationPayload(payload) {
  return {
    notes: String((payload && payload.notes) || '').trim(),
  };
}

function normalizeCheckoutPayload(payload) {
  const reason = String((payload && payload.reason) || '').trim() || 'Asset check-out';
  return {
    reason,
  };
}

function normalizeCertificatePayload(payload) {
  const technician = String((payload && payload.technician) || '').trim();
  if (!technician) {
    throw new Error('technician is required');
  }
  return {
    technician,
  };
}

function normalizeDebugSerial(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeFailureStatus(value) {
  const normalized = String(value || 'OPEN').trim().toUpperCase();
  return DEBUG_TICKET_STATUSES.has(normalized) ? normalized : 'OPEN';
}

function normalizeCompactText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeFingerprintToken(value) {
  return normalizeCompactText(value).toLowerCase();
}

function splitDelimitedValues(value) {
  if (Array.isArray(value)) {
    return value;
  }

  const raw = String(value || '').trim();
  if (!raw) return [];
  return raw.split(/[;,|]+/);
}

function normalizeTechnicianValues(value) {
  const unique = new Map();
  splitDelimitedValues(value)
    .map((entry) => normalizeCompactText(entry))
    .filter(Boolean)
    .forEach((entry) => {
      const key = entry.toLowerCase();
      if (!unique.has(key)) {
        unique.set(key, entry);
      }
    });
  return Array.from(unique.values());
}

function mergeTechnicianValues(...sources) {
  const unique = new Map();
  sources.forEach((source) => {
    normalizeTechnicianValues(source).forEach((entry) => {
      const key = entry.toLowerCase();
      if (!unique.has(key)) {
        unique.set(key, entry);
      }
    });
  });
  return Array.from(unique.values());
}

function compactTechnicianText(values, maxLength = 240) {
  const normalized = normalizeTechnicianValues(values);
  if (!normalized.length) return '';

  const output = [];
  for (const value of normalized) {
    const next = output.length ? `${output.join(', ')}, ${value}` : value;
    if (next.length > maxLength) break;
    output.push(value);
  }
  return output.join(', ');
}

function normalizeImportStatus(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  return DEBUG_TICKET_STATUSES.has(raw) ? raw : '';
}

function buildDebugImportNotes(payload) {
  const noteRows = [
    ['Failure Notes', payload && (payload.failure_notes || payload.failure_note)],
    ['Repair Notes', payload && (payload.repair_notes || payload.repair_note || payload.rework_notes)],
    ['Verification Notes', payload && (payload.verification_notes || payload.verification_note)],
    ['Comments', payload && (payload.comments || payload.comment)],
    ['General Notes', payload && payload.notes],
  ];

  return noteRows
    .map(([label, value]) => {
      const normalized = normalizeCompactText(value);
      return normalized ? `${label}: ${normalized}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function buildDebugImportFingerprint(payload) {
  const source = [
    normalizeFingerprintToken(payload && payload.serial_number),
    normalizeFingerprintToken(payload && payload.failure_signature),
    normalizeFingerprintToken(payload && payload.note_text),
    normalizeTechnicianValues(payload && payload.technicians).map((entry) => entry.toLowerCase()).sort().join('|'),
    normalizeFingerprintToken(payload && payload.source_reference),
  ].join('::');

  return crypto.createHash('sha1').update(source).digest('hex');
}

function appendImportVerification(existingValue, importPayload) {
  const current = normalizeCompactText(existingValue);
  const noteText = normalizeCompactText(importPayload && importPayload.note_text);
  const technicians = normalizeTechnicianValues(importPayload && importPayload.technicians);
  const sourceFile = normalizeCompactText(importPayload && importPayload.source_file);

  const details = [];
  if (noteText) details.push(noteText);
  if (technicians.length) details.push(`Technicians: ${technicians.join(', ')}`);
  if (sourceFile) details.push(`Source: ${sourceFile}`);
  if (!details.length) return current;

  const block = `[Import ${new Date().toISOString()}] ${details.join(' | ')}`;
  return current ? `${current}\n\n${block}` : block;
}

function formatDebugTimelineEntry(entry) {
  const payload = entry && typeof entry.toJSON === 'function' ? entry.toJSON() : (entry || {});
  return {
    id: payload.id,
    ticket_id: payload.ticket_id,
    event_type: payload.event_type || '',
    source_file: payload.source_file || '',
    source_row_number: Number(payload.source_row_number) || null,
    source_reference: payload.source_reference || '',
    technician_list: normalizeTechnicianValues(payload.technician_list),
    note_text: payload.note_text || '',
    failure_signature_before: payload.failure_signature_before || '',
    failure_signature_after: payload.failure_signature_after || '',
    fingerprint_hash: payload.fingerprint_hash || '',
    metadata: payload.metadata || {},
    created_at: payload.created_at || null,
  };
}

function normalizeDebugImportPayload(payload, index = 0) {
  const serialNumber = normalizeDebugSerial(payload && (payload.serial_number || payload.serial || payload.sn || payload.board_serial));
  const failureSignature = normalizeText(payload && (payload.failure_signature || payload.failure || payload.symptom || payload.issue));
  if (!serialNumber || !failureSignature) {
    throw new Error('serial_number and failure_signature are required');
  }

  const benchTime = Number(payload && (payload.total_bench_time || payload.bench_hours || payload.bench_time));
  const rowNumber = Number(payload && (payload.source_row_number || payload.row_number || payload.row));
  const noteText = buildDebugImportNotes(payload || {});
  const verificationFromRow = normalizeCompactText(payload && payload.verification_pass);
  const technicians = mergeTechnicianValues(
    payload && payload.technicians,
    payload && payload.technician_id,
    payload && payload.technician,
    payload && payload.tech,
    payload && payload.techs,
    payload && payload.worked_by
  );

  const normalized = {
    serial_number: serialNumber,
    model_rev: normalizeText(payload && payload.model_rev),
    failure_signature: failureSignature,
    technician_id: compactTechnicianText(technicians),
    technicians,
    department_id: normalizeNumericId(payload && payload.department_id) || null,
    department_name: normalizeDepartmentName(payload && (payload.department_name || payload.department || payload.dept)),
    status: normalizeImportStatus(payload && payload.status),
    total_bench_time: Number.isFinite(benchTime) && benchTime >= 0 ? benchTime : 0,
    verification_pass: verificationFromRow,
    note_text: noteText,
    source_file: normalizeCompactText(payload && (payload.source_file || payload.file_name || payload.filename)),
    source_row_number: Number.isInteger(rowNumber) && rowNumber > 0 ? rowNumber : (index + 2),
    source_reference: normalizeText(payload && (payload.source_reference || payload.reference || payload.rma || payload.rma_number || payload.ticket_reference)),
  };

  normalized.fingerprint_hash = buildDebugImportFingerprint(normalized);
  return normalized;
}

function normalizeDebugTicketPayload(payload) {
  const serialNumber = normalizeDebugSerial(payload && payload.serial_number);
  const failureSignature = normalizeText(payload && payload.failure_signature);
  if (!serialNumber || !failureSignature) {
    throw new Error('serial_number and failure_signature are required');
  }

  const departmentId = Number(payload && payload.department_id);
  const benchTime = Number(payload && payload.total_bench_time);

  return {
    serial_number: serialNumber,
    model_rev: normalizeText(payload && payload.model_rev),
    failure_signature: failureSignature,
    technician_id: normalizeText(payload && payload.technician_id),
    department_id: Number.isInteger(departmentId) && departmentId > 0 ? departmentId : null,
    status: normalizeFailureStatus(payload && payload.status),
    total_bench_time: Number.isFinite(benchTime) && benchTime >= 0 ? benchTime : 0,
    verification_pass: normalizeText(payload && payload.verification_pass),
  };
}

function normalizeDebugComponentPayload(payload) {
  const refDesignator = String(payload && payload.ref_designator ? payload.ref_designator : '').trim().toUpperCase();
  if (!refDesignator) {
    throw new Error('ref_designator is required');
  }

  return {
    ref_designator: refDesignator,
    component_type: normalizeText(payload && payload.component_type),
    failure_mode: normalizeText(payload && payload.failure_mode),
    lot_code: normalizeText(payload && payload.lot_code),
  };
}

function formatDebugComponent(component) {
  const payload = component && typeof component.toJSON === 'function' ? component.toJSON() : (component || {});
  return {
    id: payload.id,
    ticket_id: payload.ticket_id,
    ref_designator: payload.ref_designator,
    component_type: payload.component_type || '',
    failure_mode: payload.failure_mode || '',
    lot_code: payload.lot_code || '',
    created_at: payload.created_at || null,
  };
}

function getWeekStartIso(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const day = (parsed.getUTCDay() + 6) % 7;
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCDate(parsed.getUTCDate() - day);
  return parsed.toISOString().slice(0, 10);
}

function buildLogActor(req) {
  return {
    actor_id: req.user && req.user.id ? req.user.id : null,
    actor_name: req.user && (req.user.display_name || req.user.username) ? (req.user.display_name || req.user.username) : 'System',
  };
}

function createCommandCenterController({ hazmatDb, gagesDb, debugDb, paths, calibrationAttachmentUpload }) {
  const {
    Material,
    UsageLog,
    HazmatTemplate,
    CommandLog: HazmatLog,
    sequelize: hazmatSequelize,
  } = hazmatDb;
  const {
    Department,
    CalibrationTemplate,
    CalibrationAsset,
    CommandLog: GageLog,
    sequelize: gagesSequelize,
  } = gagesDb;
  const {
    FailureTicket,
    FaultyComponent,
    DebugTicketHistory,
    CommandLog: DebugLog,
    sequelize: debugSequelize,
  } = debugDb || {};

  async function recordHazmatLog(req, payload, transaction) {
    const actor = buildLogActor(req);
    await HazmatLog.create({
      ...payload,
      ...actor,
      timestamp: new Date().toISOString(),
    }, { transaction });
  }

  async function recordGageLog(req, payload, transaction) {
    const actor = buildLogActor(req);
    await GageLog.create({
      ...payload,
      ...actor,
      timestamp: new Date().toISOString(),
    }, { transaction });
  }

  async function recordDebugLog(req, payload, transaction) {
    if (!DebugLog) return;
    const actor = buildLogActor(req);
    await DebugLog.create({
      ...payload,
      ...actor,
      timestamp: new Date().toISOString(),
    }, { transaction });
  }

  async function recordDebugTimeline(payload, transaction) {
    if (!DebugTicketHistory) return null;
    return DebugTicketHistory.create(payload, { transaction });
  }

  async function resolveDebugImportDepartmentId(payload) {
    const departmentId = normalizeNumericId(payload && payload.department_id);
    if (departmentId > 0) {
      await ensureDepartmentExists(departmentId);
      return departmentId;
    }

    const departmentName = normalizeDepartmentName(payload && payload.department_name);
    if (!departmentName) return null;

    const department = await findDepartmentByName(departmentName);
    return department ? department.id : null;
  }

  async function findMasterTicketBySerial(serialNumber, transaction) {
    return FailureTicket.findOne({
      where: { serial_number: serialNumber },
      order: [
        ['updated_at', 'DESC'],
        ['id', 'DESC'],
      ],
      transaction,
    });
  }

  async function isDebugImportDuplicate(ticketId, fingerprintHash, transaction) {
    if (!DebugTicketHistory || !ticketId || !fingerprintHash) return false;
    const existing = await DebugTicketHistory.findOne({
      where: {
        ticket_id: ticketId,
        fingerprint_hash: fingerprintHash,
      },
      transaction,
    });
    return Boolean(existing);
  }

  async function buildDepartmentNameMap(transaction) {
    const query = {};
    if (transaction && transaction.sequelize === gagesSequelize) {
      query.transaction = transaction;
    }

    const departments = await Department.findAll(query);
    const byId = new Map();
    departments.forEach((entry) => {
      const id = Number(entry.id);
      if (!Number.isInteger(id) || id <= 0) return;
      byId.set(id, normalizeDepartmentName(entry.name));
    });
    return byId;
  }

  async function buildChronicFailureCountMap(transaction) {
    if (!FailureTicket) return new Map();

    const cutoff = new Date(Date.now() - (90 * 24 * 60 * 60 * 1000));
    const rows = await FailureTicket.findAll({
      attributes: ['serial_number', [fn('COUNT', col('id')), 'failure_count']],
      where: {
        created_at: {
          [Op.gte]: cutoff,
        },
      },
      group: ['serial_number'],
      raw: true,
      transaction,
    });

    const map = new Map();
    rows.forEach((row) => {
      const serial = normalizeDebugSerial(row.serial_number);
      if (!serial) return;
      map.set(serial, Number(row.failure_count) || 0);
    });
    return map;
  }

  function formatDebugTicket(ticket, options = {}) {
    const payload = ticket && typeof ticket.toJSON === 'function' ? ticket.toJSON() : (ticket || {});
    const serialNumber = normalizeDebugSerial(payload.serial_number);
    const chronicMap = options.chronicCounts || new Map();
    const departmentById = options.departmentById || new Map();
    const chronicCount = Number(chronicMap.get(serialNumber) || 0);
    const departmentId = Number(payload.department_id);

    return {
      id: payload.id,
      serial_number: serialNumber,
      model_rev: payload.model_rev || '',
      failure_signature: payload.failure_signature || '',
      technician_id: payload.technician_id || '',
      department_id: Number.isInteger(departmentId) && departmentId > 0 ? departmentId : null,
      department_name: Number.isInteger(departmentId) && departmentId > 0
        ? (departmentById.get(departmentId) || '')
        : '',
      status: normalizeFailureStatus(payload.status),
      total_bench_time: Number(payload.total_bench_time) || 0,
      verification_pass: payload.verification_pass || '',
      chronic_failure: chronicCount > 2,
      chronic_failure_count_90d: chronicCount,
      created_at: payload.created_at || null,
      updated_at: payload.updated_at || null,
      closed_at: payload.closed_at || null,
      faulty_components: Array.isArray(payload.faulty_components)
        ? payload.faulty_components.map(formatDebugComponent)
        : [],
    };
  }

  function collectDebugTechnicianRoster(ticket, timelineEntries) {
    const list = mergeTechnicianValues(
      ticket && ticket.technician_id,
      ...(Array.isArray(timelineEntries)
        ? timelineEntries.map((entry) => entry && entry.technician_list)
        : [])
    );
    return list;
  }

  async function listSystemicIssueAlerts(transaction) {
    if (!FaultyComponent || !FailureTicket) return [];

    const components = await FaultyComponent.findAll({
      include: [{
        model: FailureTicket,
        as: 'ticket',
        attributes: ['serial_number'],
        required: true,
      }],
      transaction,
    });

    const refs = new Map();
    components.forEach((component) => {
      const payload = component && typeof component.toJSON === 'function' ? component.toJSON() : component;
      const ref = String(payload && payload.ref_designator ? payload.ref_designator : '').trim().toUpperCase();
      const serial = normalizeDebugSerial(payload && payload.ticket ? payload.ticket.serial_number : '');
      if (!ref || !serial) return;
      if (!refs.has(ref)) refs.set(ref, new Set());
      refs.get(ref).add(serial);
    });

    return Array.from(refs.entries())
      .map(([refDesignator, serials]) => ({
        ref_designator: refDesignator,
        affected_boards: serials.size,
      }))
      .filter((item) => item.affected_boards >= 5)
      .sort((left, right) => right.affected_boards - left.affected_boards || left.ref_designator.localeCompare(right.ref_designator))
      .map((item) => ({
        ...item,
        message: `Potential Design Flaw: ${item.ref_designator} failed across ${item.affected_boards} different boards.`,
      }));
  }

  async function buildDebugPatternAlert(failureSignature, transaction) {
    if (!FailureTicket || !FaultyComponent) return null;

    const normalized = String(failureSignature || '').trim().toLowerCase();
    if (!normalized) return null;

    const tickets = await FailureTicket.findAll({
      where: where(fn('lower', col('failure_signature')), normalized),
      include: [{
        model: FaultyComponent,
        as: 'faulty_components',
        required: false,
      }],
      transaction,
    });

    const eligible = tickets.filter((ticket) => Array.isArray(ticket.faulty_components) && ticket.faulty_components.length > 0);
    const total = eligible.length;
    if (!total) return null;

    const referenceCounts = new Map();
    eligible.forEach((ticket) => {
      const refs = new Set(ticket.faulty_components
        .map((component) => String(component.ref_designator || '').trim().toUpperCase())
        .filter(Boolean));
      refs.forEach((ref) => {
        referenceCounts.set(ref, (referenceCounts.get(ref) || 0) + 1);
      });
    });

    const top = Array.from(referenceCounts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
    if (!top) return null;

    const percentage = Math.round((top[1] / total) * 100);
    return {
      signature: failureSignature,
      ref_designator: top[0],
      total_cases: total,
      matched_cases: top[1],
      percentage,
      message: `Pattern Alert: ${percentage}% of boards with this symptom were resolved by replacing ${top[0]} based on previous logs.`,
    };
  }

  async function buildDebugAnalytics(transaction) {
    if (!FailureTicket || !FaultyComponent) {
      return {
        pareto: [],
        yield_trends: [],
        systemic_alerts: [],
      };
    }

    const [tickets, components, systemicAlerts] = await Promise.all([
      FailureTicket.findAll({ transaction }),
      FaultyComponent.findAll({ transaction }),
      listSystemicIssueAlerts(transaction),
    ]);

    const componentCounts = new Map();
    components.forEach((component) => {
      const ref = String(component.ref_designator || '').trim().toUpperCase();
      if (!ref) return;
      componentCounts.set(ref, (componentCounts.get(ref) || 0) + 1);
    });

    const pareto = Array.from(componentCounts.entries())
      .map(([refDesignator, failures]) => ({ ref_designator: refDesignator, failures }))
      .sort((left, right) => right.failures - left.failures || left.ref_designator.localeCompare(right.ref_designator))
      .slice(0, 5);

    const weekly = new Map();
    const ensureWeek = (weekStart) => {
      if (!weekly.has(weekStart)) {
        weekly.set(weekStart, {
          week_start: weekStart,
          boards_received: 0,
          boards_fixed: 0,
        });
      }
      return weekly.get(weekStart);
    };

    tickets.forEach((ticket) => {
      const receivedWeek = getWeekStartIso(ticket.created_at);
      if (receivedWeek) {
        ensureWeek(receivedWeek).boards_received += 1;
      }

      if (normalizeFailureStatus(ticket.status) === 'FIXED') {
        const fixedWeek = getWeekStartIso(ticket.closed_at || ticket.updated_at || ticket.created_at);
        if (fixedWeek) {
          ensureWeek(fixedWeek).boards_fixed += 1;
        }
      }
    });

    const yieldTrends = Array.from(weekly.values())
      .sort((left, right) => left.week_start.localeCompare(right.week_start));

    const chronicCounts = new Map();
    const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
    tickets.forEach((ticket) => {
      const serial = normalizeDebugSerial(ticket.serial_number);
      const createdAt = new Date(ticket.created_at || ticket.updated_at || ticket.closed_at);
      if (!serial || Number.isNaN(createdAt.getTime()) || createdAt.getTime() < cutoff) return;
      chronicCounts.set(serial, (chronicCounts.get(serial) || 0) + 1);
    });

    const chronicFailures = Array.from(chronicCounts.entries())
      .filter((entry) => entry[1] > 2)
      .map(([serialNumber, count]) => ({
        serial_number: serialNumber,
        failure_count_90d: count,
        message: `Chronic Failure: Board ${serialNumber} has failed ${count} times in the last 90 days.`,
      }))
      .sort((left, right) => right.failure_count_90d - left.failure_count_90d || left.serial_number.localeCompare(right.serial_number));

    return {
      pareto,
      yield_trends: yieldTrends,
      systemic_alerts: systemicAlerts,
      chronic_failures: chronicFailures,
    };
  }

  function isDebugLabAvailable() {
    return Boolean(FailureTicket && FaultyComponent && debugSequelize);
  }

  function ensureDebugLabAvailable(res) {
    if (isDebugLabAvailable()) return true;
    res.status(503).json({ error: 'debug lab module is unavailable' });
    return false;
  }

  async function ensureDepartmentExists(departmentId) {
    if (departmentId == null) return null;
    const normalizedId = Number(departmentId);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
      throw new Error('invalid department_id');
    }
    const department = await Department.findByPk(normalizedId);
    if (!department) {
      throw new Error('department not found');
    }
    return department;
  }

  async function fetchDebugTicketById(ticketId, transaction) {
    return FailureTicket.findByPk(ticketId, {
      include: [{
        model: FaultyComponent,
        as: 'faulty_components',
        required: false,
      }],
      transaction,
    });
  }

  async function findDepartmentByName(name, transaction) {
    const normalized = normalizeDepartmentName(name);
    if (!normalized) return null;
    return Department.findOne({
      where: where(fn('lower', col('name')), normalized.toLowerCase()),
      transaction,
    });
  }

  async function resolveCalibrationTemplate(payload, transaction) {
    if (payload.template_id) {
      const template = await CalibrationTemplate.findByPk(payload.template_id, { transaction });
      if (!template) {
        throw new Error('calibration template not found');
      }
      return template;
    }

    const templatePayload = payload.template_payload || normalizeTemplatePayload({}, {
      fallbackName: payload.tool_name,
      module: 'calibration',
    });
    const [template] = await CalibrationTemplate.findOrCreate({
      where: { template_name: templatePayload.template_name },
      defaults: templatePayload,
      transaction,
    });
    return template;
  }

  function buildTemplateSchedulingOptions(template) {
    const source = template && typeof template.toJSON === 'function' ? template.toJSON() : (template || {});
    const schedule = normalizeTemplateSchedule(source);
    return {
      intervalMode: schedule.intervalMode,
      intervalMonths: schedule.intervalMonths,
      intervalDays: schedule.intervalDays,
      calIntervalDays: schedule.derivedIntervalDays,
      maxDailyCalibrations: schedule.maxDailyCalibrations,
      allowedDays: schedule.allowedDays,
    };
  }

  async function listScheduledCalibrationDates(transaction, excludedAssetId) {
    const where = {
      next_cal: { [Op.not]: null },
    };

    const excludedId = Number(excludedAssetId);
    if (Number.isInteger(excludedId) && excludedId > 0) {
      where.id = { [Op.ne]: excludedId };
    }

    const assets = await CalibrationAsset.findAll({
      where,
      attributes: ['next_cal'],
      transaction,
    });
    return assets.map((asset) => asset.next_cal).filter(Boolean);
  }

  async function resolveAssetNextCalibrationDate(lastCalDate, template, transaction, excludedAssetId) {
    const normalizedLastCal = normalizeDate(lastCalDate);
    if (!normalizedLastCal) return null;

    const schedule = buildTemplateSchedulingOptions(template);
    const existingDates = await listScheduledCalibrationDates(transaction, excludedAssetId);
    return computeNextCalibrationDate(normalizedLastCal, schedule.calIntervalDays, {
      intervalMode: schedule.intervalMode,
      intervalMonths: schedule.intervalMonths,
      intervalDays: schedule.intervalDays,
      maxDailyCalibrations: schedule.maxDailyCalibrations,
      allowedDays: schedule.allowedDays,
      existingDates,
    });
  }

  function buildAssetPayload(payload, template, nextCalDate) {
    const schedule = buildTemplateSchedulingOptions(template);
    return {
      tool_name: payload.tool_name || template.template_name,
      serial_number: payload.serial_number,
      last_cal: payload.last_cal,
      next_cal: normalizeDate(nextCalDate),
      template_id: template.id,
      category: template.category,
      cal_frequency: schedule.calIntervalDays,
      alert_lead_days: template.alert_lead_days,
      grace_period_days: template.grace_period_days,
      unit_of_measure: normalizeUnitOfMeasure(
        payload.unit_of_measure,
        normalizeUnitOfMeasure(template.unit_of_measure, DEFAULT_UNIT_OF_MEASURE)
      ),
      assigned_department: normalizeText(payload.assigned_department, template.assigned_department || DEFAULT_DEPARTMENT),
      asset_type: payload.asset_type,
      model: payload.model,
      manufacturer: payload.manufacturer,
      measurement_types: payload.measurement_types,
      range_size: payload.range_size,
      accuracy: payload.accuracy,
      date_acquired: payload.date_acquired,
      source_vendor: payload.source_vendor,
      cost: payload.cost,
      environment: payload.environment,
      instructions: payload.instructions,
      notes: payload.notes,
      attachment_path: payload.attachment_path,
    };
  }

  async function syncAssetsForTemplate(template, transaction) {
    const schedule = buildTemplateSchedulingOptions(template);
    const assets = await CalibrationAsset.findAll({
      where: { template_id: template.id },
      order: [['id', 'ASC']],
      transaction,
    });

    for (const asset of assets) {
      const nextCalDate = await resolveAssetNextCalibrationDate(asset.last_cal, template, transaction, asset.id);
      await asset.update({
        category: template.category,
        cal_frequency: schedule.calIntervalDays,
        alert_lead_days: template.alert_lead_days,
        grace_period_days: template.grace_period_days,
        unit_of_measure: normalizeUnitOfMeasure(template.unit_of_measure, DEFAULT_UNIT_OF_MEASURE),
        assigned_department: template.assigned_department,
        next_cal: nextCalDate,
      }, { transaction });
    }
  }

  return {
    servePortal: (req, res) => {
      return res.sendFile(path.join(paths.LEGACY_PUBLIC_DIR, 'Layout.html'));
    },

    session: async (req, res) => {
      return res.json({ user: req.user });
    },

    logout: async (req, res) => {
      res.clearCookie('command_center_access', { path: '/' });
      if (req.session) {
        return req.session.destroy(() => {
          res.clearCookie('mack_session', { path: '/' });
          return res.json({ ok: true });
        });
      }
      return res.json({ ok: true });
    },

    listDepartments: async (req, res) => {
      try {
        const departments = await Department.findAll({
          order: [['name', 'ASC']],
        });
        return res.json(departments.map(formatDepartment));
      } catch (error) {
        console.error('command center list departments', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load departments' });
      }
    },

    createDepartment: async (req, res) => {
      try {
        const payload = normalizeDepartmentPayload(req.body || {});
        const existing = await findDepartmentByName(payload.name);
        if (existing) {
          return res.status(400).json({ error: 'department already exists' });
        }

        const department = await gagesSequelize.transaction(async (transaction) => {
          const created = await Department.create(payload, { transaction });
          await recordGageLog(req, {
            module: 'calibration',
            entity_type: 'department',
            entity_id: String(created.id),
            action: 'created',
            detail: `Created department ${created.name}`,
            metadata: {
              supervisor: created.supervisor || null,
            },
          }, transaction);
          return created;
        });

        return res.status(201).json(formatDepartment(department));
      } catch (error) {
        const message = error && error.name === 'SequelizeUniqueConstraintError'
          ? 'department already exists'
          : (error && error.message) || 'failed to create department';
        return res.status(/required|exists/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    updateDepartment: async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: 'invalid department id' });
        }

        const department = await Department.findByPk(id);
        if (!department) {
          return res.status(404).json({ error: 'department not found' });
        }

        const payload = normalizeDepartmentPayload({ ...department.toJSON(), ...(req.body || {}) });
        const existing = await findDepartmentByName(payload.name);
        if (existing && Number(existing.id) !== id) {
          return res.status(400).json({ error: 'department already exists' });
        }

        await gagesSequelize.transaction(async (transaction) => {
          await department.update(payload, { transaction });
          await recordGageLog(req, {
            module: 'calibration',
            entity_type: 'department',
            entity_id: String(department.id),
            action: 'updated',
            detail: `Updated department ${department.name}`,
            metadata: {
              supervisor: department.supervisor || null,
            },
          }, transaction);
        });

        const refreshed = await Department.findByPk(id);
        return res.json(formatDepartment(refreshed));
      } catch (error) {
        const message = error && error.name === 'SequelizeUniqueConstraintError'
          ? 'department already exists'
          : (error && error.message) || 'failed to update department';
        return res.status(/required|exists|invalid/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    deleteDepartment: async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: 'invalid department id' });
        }

        const department = await Department.findByPk(id);
        if (!department) {
          return res.status(404).json({ error: 'department not found' });
        }

        await gagesSequelize.transaction(async (transaction) => {
          await recordGageLog(req, {
            module: 'calibration',
            entity_type: 'department',
            entity_id: String(department.id),
            action: 'deleted',
            detail: `Deleted department ${department.name}`,
            metadata: {
              supervisor: department.supervisor || null,
            },
          }, transaction);
          await department.destroy({ transaction });
        });

        return res.json({ ok: true, id });
      } catch (error) {
        console.error('command center delete department', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to delete department' });
      }
    },

    listMaterials: async (req, res) => {
      try {
        const materials = await Material.findAll({
          order: [
            ['expiration_date', 'ASC'],
            ['name', 'ASC'],
          ],
        });
        return res.json(materials.map(formatMaterial));
      } catch (error) {
        console.error('command center list materials', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load materials' });
      }
    },

    createMaterial: async (req, res) => {
      try {
        const payload = normalizeMaterialPayload(req.body || {});
        const material = await hazmatSequelize.transaction(async (transaction) => {
          const created = await Material.create(payload, { transaction });
          await recordHazmatLog(req, {
            module: 'inventory',
            entity_type: 'material',
            entity_id: String(created.id),
            action: 'created',
            detail: `Created material ${created.name}`,
            metadata: {
              batch_id: created.batch_id,
              asset_uid: buildAssetUid('hazmat', created.id),
            },
          }, transaction);
          return created;
        });

        return res.status(201).json(formatMaterial(material));
      } catch (error) {
        const message = error && error.name === 'SequelizeUniqueConstraintError'
          ? 'batch_id already exists'
          : (error && error.message) || 'failed to create material';
        return res.status(/required|exists/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    updateMaterial: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const material = await Material.findByPk(id);
        if (!material) return res.status(404).json({ error: 'material not found' });

        const payload = normalizeMaterialPayload({ ...material.toJSON(), ...(req.body || {}) });
        await hazmatSequelize.transaction(async (transaction) => {
          await material.update(payload, { transaction });
          await recordHazmatLog(req, {
            module: 'inventory',
            entity_type: 'material',
            entity_id: String(material.id),
            action: 'updated',
            detail: `Updated material ${material.name}`,
            metadata: {
              batch_id: material.batch_id,
              asset_uid: buildAssetUid('hazmat', material.id),
            },
          }, transaction);
        });

        return res.json(formatMaterial(material));
      } catch (error) {
        const message = error && error.name === 'SequelizeUniqueConstraintError'
          ? 'batch_id already exists'
          : (error && error.message) || 'failed to update material';
        return res.status(/required|exists/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    deleteMaterial: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const material = await Material.findByPk(id);
        if (!material) return res.status(404).json({ error: 'material not found' });

        await hazmatSequelize.transaction(async (transaction) => {
          await UsageLog.destroy({ where: { material_id: id }, transaction });
          await recordHazmatLog(req, {
            module: 'inventory',
            entity_type: 'material',
            entity_id: String(material.id),
            action: 'deleted',
            detail: `Deleted material ${material.name}`,
            metadata: {
              batch_id: material.batch_id,
              asset_uid: buildAssetUid('hazmat', material.id),
            },
          }, transaction);
          await material.destroy({ transaction });
        });

        return res.json({ ok: true, id });
      } catch (error) {
        console.error('command center delete material', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to delete material' });
      }
    },

    importMaterials: async (req, res) => {
      const rows = Array.isArray(req.body && req.body.materials) ? req.body.materials : [];
      if (!rows.length) return res.status(400).json({ error: 'materials array is required' });

      try {
        const result = { created: 0, updated: 0 };
        await hazmatSequelize.transaction(async (transaction) => {
          for (const rawRow of rows) {
            const payload = normalizeMaterialPayload(rawRow || {});
            const existing = await Material.findOne({ where: { batch_id: payload.batch_id }, transaction });
            if (existing) {
              await existing.update(payload, { transaction });
              result.updated += 1;
            } else {
              await Material.create(payload, { transaction });
              result.created += 1;
            }
          }

          await recordHazmatLog(req, {
            module: 'inventory',
            entity_type: 'material',
            entity_id: null,
            action: 'imported',
            detail: `Imported ${rows.length} material rows`,
            metadata: result,
          }, transaction);
        });

        return res.json(result);
      } catch (error) {
        return res.status(400).json({ error: (error && error.message) || 'failed to import materials' });
      }
    },

    useMaterial: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const payload = normalizeUsagePayload(req.body || {});

        const response = await hazmatSequelize.transaction(async (transaction) => {
          const material = await Material.findByPk(id, { transaction });
          if (!material) throw new Error('material not found');

          const nextStock = normalizeNumber(material.stock_level) - payload.quantity;
          if (nextStock < 0) throw new Error('quantity would reduce stock below zero');

          const usageLog = await UsageLog.create({
            material_id: material.id,
            user_id: req.user && req.user.id ? req.user.id : null,
            quantity_delta: -payload.quantity,
            timestamp: new Date().toISOString(),
            reason: payload.reason,
          }, { transaction });

          await material.update({ stock_level: nextStock }, { transaction });
          await recordHazmatLog(req, {
            module: 'inventory',
            entity_type: 'material',
            entity_id: String(material.id),
            action: 'used',
            detail: `Used ${payload.quantity} from ${material.name}`,
            metadata: {
              quantity: payload.quantity,
              reason: payload.reason,
              asset_uid: buildAssetUid('hazmat', material.id),
            },
          }, transaction);

          return { material, usageLog };
        });

        return res.status(201).json({
          material: formatMaterial(response.material),
          usage_log: {
            id: response.usageLog.id,
            quantity_delta: response.usageLog.quantity_delta,
            timestamp: response.usageLog.timestamp,
            reason: response.usageLog.reason,
          },
        });
      } catch (error) {
        const message = (error && error.message) || 'failed to use material';
        return res.status(/not found|below zero|greater than zero/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    verifyMaterial: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const payload = normalizeVerificationPayload(req.body || {});

        const material = await hazmatSequelize.transaction(async (transaction) => {
          const existing = await Material.findByPk(id, { transaction });
          if (!existing) throw new Error('material not found');

          await recordHazmatLog(req, {
            module: 'inventory',
            entity_type: 'material',
            entity_id: String(existing.id),
            action: 'verified',
            detail: `Verified material ${existing.name}`,
            metadata: {
              notes: payload.notes,
              batch_id: existing.batch_id,
              asset_uid: buildAssetUid('hazmat', existing.id),
            },
          }, transaction);

          return existing;
        });

        return res.status(201).json({
          ok: true,
          material: formatMaterial(material),
        });
      } catch (error) {
        const message = (error && error.message) || 'failed to verify material';
        return res.status(/not found/i.test(message) ? 404 : 500).json({ error: message });
      }
    },

    uploadCalibrationAttachment: (req, res) => {
      if (!calibrationAttachmentUpload || typeof calibrationAttachmentUpload.single !== 'function') {
        return res.status(500).json({ error: 'calibration attachment upload is unavailable' });
      }

      return calibrationAttachmentUpload.single('attachment')(req, res, (error) => {
        if (error) {
          return res.status(400).json({ error: error.message || 'upload failed' });
        }

        if (!req.file || !req.file.filename) {
          return res.status(400).json({ error: 'attachment is required' });
        }

        return res.status(201).json({
          ok: true,
          path: `/calibration-attachments/${req.file.filename}`,
          file_name: req.file.filename,
          original_name: req.file.originalname,
        });
      });
    },

    listHazmatTemplates: async (req, res) => {
      try {
        const templates = await HazmatTemplate.findAll({
          order: [
            ['category', 'ASC'],
            ['template_name', 'ASC'],
          ],
        });
        return res.json(templates.map((template) => formatTemplate(template, { module: 'hazmat' })));
      } catch (error) {
        console.error('command center list hazmat templates', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load hazmat templates' });
      }
    },

    createHazmatTemplate: async (req, res) => {
      try {
        const payload = normalizeTemplatePayload(req.body || {}, { module: 'hazmat' });
        const template = await hazmatSequelize.transaction(async (transaction) => {
          const created = await HazmatTemplate.create(payload, { transaction });
          await recordHazmatLog(req, {
            module: 'hazmat',
            entity_type: 'template',
            entity_id: String(created.id),
            action: 'created',
            detail: `Created hazmat template ${created.template_name}`,
            metadata: { category: created.category },
          }, transaction);
          return created;
        });

        return res.status(201).json(formatTemplate(template, { module: 'hazmat' }));
      } catch (error) {
        const message = error && error.name === 'SequelizeUniqueConstraintError'
          ? 'template_name already exists'
          : (error && error.message) || 'failed to create hazmat template';
        return res.status(/required|exists/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    updateHazmatTemplate: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const template = await HazmatTemplate.findByPk(id);
        if (!template) return res.status(404).json({ error: 'hazmat template not found' });

        const payload = normalizeTemplatePayload({ ...template.toJSON(), ...(req.body || {}) }, { module: 'hazmat' });
        await hazmatSequelize.transaction(async (transaction) => {
          await template.update(payload, { transaction });
          await recordHazmatLog(req, {
            module: 'hazmat',
            entity_type: 'template',
            entity_id: String(template.id),
            action: 'updated',
            detail: `Updated hazmat template ${template.template_name}`,
            metadata: { category: template.category },
          }, transaction);
        });

        const refreshed = await HazmatTemplate.findByPk(id);
        return res.json(formatTemplate(refreshed, { module: 'hazmat' }));
      } catch (error) {
        const message = error && error.name === 'SequelizeUniqueConstraintError'
          ? 'template_name already exists'
          : (error && error.message) || 'failed to update hazmat template';
        return res.status(/required|exists/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    deleteHazmatTemplate: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const template = await HazmatTemplate.findByPk(id);
        if (!template) return res.status(404).json({ error: 'hazmat template not found' });

        await hazmatSequelize.transaction(async (transaction) => {
          await recordHazmatLog(req, {
            module: 'hazmat',
            entity_type: 'template',
            entity_id: String(template.id),
            action: 'deleted',
            detail: `Deleted hazmat template ${template.template_name}`,
            metadata: { category: template.category },
          }, transaction);
          await template.destroy({ transaction });
        });

        return res.json({ ok: true, id });
      } catch (error) {
        console.error('command center delete hazmat template', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to delete hazmat template' });
      }
    },

    listCalibrationTemplates: async (req, res) => {
      try {
        const templates = await CalibrationTemplate.findAll({
          include: [{
            model: CalibrationAsset,
            as: 'assets',
            attributes: ['id'],
            required: false,
          }],
          order: [
            ['category', 'ASC'],
            ['template_name', 'ASC'],
          ],
        });
        return res.json(templates.map((template) => formatTemplate(template, { module: 'calibration' })));
      } catch (error) {
        console.error('command center list calibration templates', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load calibration templates' });
      }
    },

    createCalibrationTemplate: async (req, res) => {
      try {
        const payload = normalizeTemplatePayload(req.body || {}, { module: 'calibration' });
        const template = await gagesSequelize.transaction(async (transaction) => {
          const created = await CalibrationTemplate.create(payload, { transaction });
          await recordGageLog(req, {
            module: 'calibration',
            entity_type: 'template',
            entity_id: String(created.id),
            action: 'created',
            detail: `Created calibration template ${created.template_name}`,
            metadata: { category: created.category },
          }, transaction);
          return created;
        });

        return res.status(201).json(formatTemplate(template, { module: 'calibration' }));
      } catch (error) {
        const message = error && error.name === 'SequelizeUniqueConstraintError'
          ? 'template_name already exists'
          : (error && error.message) || 'failed to create calibration template';
        return res.status(/required|exists/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    updateCalibrationTemplate: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const template = await CalibrationTemplate.findByPk(id);
        if (!template) return res.status(404).json({ error: 'calibration template not found' });

        const payload = normalizeTemplatePayload({ ...template.toJSON(), ...(req.body || {}) }, { module: 'calibration' });
        await gagesSequelize.transaction(async (transaction) => {
          await template.update(payload, { transaction });
          await syncAssetsForTemplate(template, transaction);
          await recordGageLog(req, {
            module: 'calibration',
            entity_type: 'template',
            entity_id: String(template.id),
            action: 'updated',
            detail: `Updated calibration template ${template.template_name}`,
            metadata: { category: template.category },
          }, transaction);
        });

        const refreshed = await CalibrationTemplate.findByPk(id, {
          include: [{
            model: CalibrationAsset,
            as: 'assets',
            attributes: ['id'],
            required: false,
          }],
        });
        return res.json(formatTemplate(refreshed, { module: 'calibration' }));
      } catch (error) {
        const message = error && error.name === 'SequelizeUniqueConstraintError'
          ? 'template_name already exists'
          : (error && error.message) || 'failed to update calibration template';
        return res.status(/required|exists/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    deleteCalibrationTemplate: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const template = await CalibrationTemplate.findByPk(id);
        if (!template) return res.status(404).json({ error: 'calibration template not found' });

        const assetCount = await CalibrationAsset.count({ where: { template_id: id } });
        if (assetCount > 0) {
          return res.status(400).json({ error: 'template is assigned to calibration assets' });
        }

        await gagesSequelize.transaction(async (transaction) => {
          await recordGageLog(req, {
            module: 'calibration',
            entity_type: 'template',
            entity_id: String(template.id),
            action: 'deleted',
            detail: `Deleted calibration template ${template.template_name}`,
            metadata: { category: template.category },
          }, transaction);
          await template.destroy({ transaction });
        });

        return res.json({ ok: true, id });
      } catch (error) {
        console.error('command center delete calibration template', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to delete calibration template' });
      }
    },

    listCalibration: async (req, res) => {
      try {
        const assets = await CalibrationAsset.findAll({
          include: [{
            model: CalibrationTemplate,
            as: 'template',
            required: false,
          }],
          order: [
            ['next_cal', 'ASC'],
            ['tool_name', 'ASC'],
          ],
        });
        return res.json(assets.map(formatCalibration));
      } catch (error) {
        console.error('command center list calibration', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load calibration assets' });
      }
    },

    createCalibration: async (req, res) => {
      try {
        const payload = normalizeCalibrationPayload(req.body || {});
        const asset = await gagesSequelize.transaction(async (transaction) => {
          const template = await resolveCalibrationTemplate(payload, transaction);
          const nextCalDate = await resolveAssetNextCalibrationDate(payload.last_cal, template, transaction, null);
          const created = await CalibrationAsset.create(buildAssetPayload(payload, template, nextCalDate), { transaction });
          await recordGageLog(req, {
            module: 'calibration',
            entity_type: 'asset',
            entity_id: String(created.id),
            action: 'created',
            detail: `Created calibration asset ${created.tool_name}`,
            metadata: {
              serial_number: created.serial_number,
              template_id: template.id,
              asset_uid: buildAssetUid('calibration', created.id),
              cfe_uid: buildCfeUid('calibration', created.id),
            },
          }, transaction);
          return created;
        });

        const refreshed = await CalibrationAsset.findByPk(asset.id, {
          include: [{
            model: CalibrationTemplate,
            as: 'template',
            required: false,
          }],
        });
        return res.status(201).json(formatCalibration(refreshed));
      } catch (error) {
        const message = error && error.name === 'SequelizeUniqueConstraintError'
          ? 'serial_number already exists'
          : (error && error.message) || 'failed to create calibration asset';
        return res.status(/required|exists/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    updateCalibration: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const asset = await CalibrationAsset.findByPk(id);
        if (!asset) return res.status(404).json({ error: 'calibration asset not found' });

        const payload = normalizeCalibrationPayload({ ...asset.toJSON(), ...(req.body || {}) });
        await gagesSequelize.transaction(async (transaction) => {
          const template = await resolveCalibrationTemplate(payload, transaction);
          const nextCalDate = await resolveAssetNextCalibrationDate(payload.last_cal, template, transaction, asset.id);
          await asset.update(buildAssetPayload(payload, template, nextCalDate), { transaction });
          await recordGageLog(req, {
            module: 'calibration',
            entity_type: 'asset',
            entity_id: String(asset.id),
            action: 'updated',
            detail: `Updated calibration asset ${asset.tool_name}`,
            metadata: {
              serial_number: asset.serial_number,
              template_id: template.id,
              asset_uid: buildAssetUid('calibration', asset.id),
              cfe_uid: buildCfeUid('calibration', asset.id),
            },
          }, transaction);
        });

        const refreshed = await CalibrationAsset.findByPk(id, {
          include: [{
            model: CalibrationTemplate,
            as: 'template',
            required: false,
          }],
        });
        return res.json(formatCalibration(refreshed));
      } catch (error) {
        const message = error && error.name === 'SequelizeUniqueConstraintError'
          ? 'serial_number already exists'
          : (error && error.message) || 'failed to update calibration asset';
        return res.status(/required|exists/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    deleteCalibration: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const asset = await CalibrationAsset.findByPk(id);
        if (!asset) return res.status(404).json({ error: 'calibration asset not found' });

        await gagesSequelize.transaction(async (transaction) => {
          await recordGageLog(req, {
            module: 'calibration',
            entity_type: 'asset',
            entity_id: String(asset.id),
            action: 'deleted',
            detail: `Deleted calibration asset ${asset.tool_name}`,
            metadata: {
              serial_number: asset.serial_number,
              asset_uid: buildAssetUid('calibration', asset.id),
              cfe_uid: buildCfeUid('calibration', asset.id),
            },
          }, transaction);
          await asset.destroy({ transaction });
        });

        return res.json({ ok: true, id });
      } catch (error) {
        console.error('command center delete calibration', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to delete calibration asset' });
      }
    },

    importCalibration: async (req, res) => {
      const rows = Array.isArray(req.body && req.body.calibration) ? req.body.calibration : [];
      if (!rows.length) return res.status(400).json({ error: 'calibration array is required' });

      try {
        const result = { created: 0, updated: 0 };
        await gagesSequelize.transaction(async (transaction) => {
          for (const rawRow of rows) {
            const payload = normalizeCalibrationPayload(rawRow || {});
            const template = await resolveCalibrationTemplate(payload, transaction);
            const existing = await CalibrationAsset.findOne({ where: { serial_number: payload.serial_number }, transaction });
            const nextCalDate = await resolveAssetNextCalibrationDate(
              payload.last_cal,
              template,
              transaction,
              existing ? existing.id : null
            );
            const assetPayload = buildAssetPayload(payload, template, nextCalDate);
            if (existing) {
              await existing.update(assetPayload, { transaction });
              result.updated += 1;
            } else {
              await CalibrationAsset.create(assetPayload, { transaction });
              result.created += 1;
            }
          }

          await recordGageLog(req, {
            module: 'calibration',
            entity_type: 'asset',
            entity_id: null,
            action: 'imported',
            detail: `Imported ${rows.length} calibration rows`,
            metadata: result,
          }, transaction);
        });

        return res.json(result);
      } catch (error) {
        return res.status(400).json({ error: (error && error.message) || 'failed to import calibration assets' });
      }
    },

    checkoutCalibration: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const payload = normalizeCheckoutPayload(req.body || {});
        const asset = await CalibrationAsset.findByPk(id, {
          include: [{
            model: CalibrationTemplate,
            as: 'template',
            required: false,
          }],
        });
        if (!asset) return res.status(404).json({ error: 'calibration asset not found' });

        const formattedAsset = formatCalibration(asset);
        if (formattedAsset.locked_for_checkout) {
          return res.status(400).json({ error: 'asset is locked after the grace period and cannot be checked out' });
        }

        await recordGageLog(req, {
          module: 'calibration',
          entity_type: 'asset',
          entity_id: String(asset.id),
          action: 'checked_out',
          detail: `Checked out ${asset.tool_name}`,
          metadata: {
            reason: payload.reason,
            serial_number: asset.serial_number,
            asset_uid: buildAssetUid('calibration', asset.id),
            cfe_uid: buildCfeUid('calibration', asset.id),
          },
        });

        return res.status(201).json({ ok: true, asset: formattedAsset });
      } catch (error) {
        return res.status(500).json({ error: (error && error.message) || 'failed to check out asset' });
      }
    },

    generateCertificate: async (req, res) => {
      try {
        const id = Number(req.params.id);
        const payload = normalizeCertificatePayload(req.body || {});
        const completionDate = new Date().toISOString().slice(0, 10);

        const result = await gagesSequelize.transaction(async (transaction) => {
          const asset = await CalibrationAsset.findByPk(id, {
            include: [{
              model: CalibrationTemplate,
              as: 'template',
              required: false,
            }],
            transaction,
          });
          if (!asset) {
            throw new Error('calibration asset not found');
          }

          const fallbackTemplate = {
            cal_interval_days: normalizePositiveInteger(asset.cal_frequency, DEFAULT_INTERVAL_DAYS),
            interval_mode: DEFAULT_INTERVAL_MODE,
            interval_months: DEFAULT_INTERVAL_MONTHS,
            interval_days: normalizePositiveInteger(asset.cal_frequency, DEFAULT_INTERVAL_DAYS),
            max_daily_calibrations: DEFAULT_MAX_DAILY_CALIBRATIONS,
            allowed_days: DEFAULT_ALLOWED_DAYS,
          };
          const templateSource = asset.template || fallbackTemplate;
          const nextCalDate = await resolveAssetNextCalibrationDate(completionDate, templateSource, transaction, asset.id);

          await asset.update({
            last_cal: completionDate,
            next_cal: nextCalDate,
          }, { transaction });

          const refreshedAsset = await CalibrationAsset.findByPk(id, {
            include: [{
              model: CalibrationTemplate,
              as: 'template',
              required: false,
            }],
            transaction,
          });
          const formattedAsset = formatCalibration(refreshedAsset);

          const certificateId = buildCertificateId(asset.id);
          const issuedAt = new Date().toISOString();
          const qrPayload = JSON.stringify({
            certificate_id: certificateId,
            asset_id: asset.id,
            serial_number: asset.serial_number,
            template_name: formattedAsset.template_name,
            technician: payload.technician,
            issued_at: issuedAt,
          });
          const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 220 });

          await recordGageLog(req, {
            module: 'calibration',
            entity_type: 'asset',
            entity_id: String(asset.id),
            action: 'certificate_generated',
            detail: `Generated certificate ${certificateId}`,
            metadata: {
              certificate_id: certificateId,
              technician: payload.technician,
              completion_date: completionDate,
              next_cal: formattedAsset.next_cal,
              asset_uid: buildAssetUid('calibration', asset.id),
              cfe_uid: buildCfeUid('calibration', asset.id),
            },
          }, transaction);

          return {
            certificateId,
            issuedAt,
            formattedAsset,
            qrDataUrl,
          };
        });

        return res.json({
          certificate_id: result.certificateId,
          issued_at: result.issuedAt,
          technician: payload.technician,
          asset: result.formattedAsset,
          qr_data_url: result.qrDataUrl,
        });
      } catch (error) {
        const message = (error && error.message) || 'failed to generate certificate';
        return res.status(/required|not found/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    importDebugTickets: async (req, res) => {
      if (!ensureDebugLabAvailable(res)) return null;

      const rows = Array.isArray(req.body && req.body.tickets)
        ? req.body.tickets
        : (Array.isArray(req.body && req.body.rows) ? req.body.rows : []);

      if (!rows.length) {
        return res.status(400).json({ error: 'tickets array is required' });
      }

      try {
        const summary = {
          processed: rows.length,
          created: 0,
          reopened: 0,
          updated: 0,
          duplicate_skipped: 0,
          errors: 0,
        };
        const outcomes = [];

        await debugSequelize.transaction(async (transaction) => {
          for (let index = 0; index < rows.length; index += 1) {
            const rawRow = rows[index] || {};
            let payload;

            try {
              payload = normalizeDebugImportPayload(rawRow, index);
            } catch (error) {
              summary.errors += 1;
              outcomes.push({
                row: index + 2,
                serial_number: normalizeDebugSerial(rawRow.serial_number || rawRow.serial || rawRow.sn),
                status: 'error',
                reason: (error && error.message) || 'invalid import row',
              });
              continue;
            }

            try {
              const departmentId = await resolveDebugImportDepartmentId(payload);
              const existing = await findMasterTicketBySerial(payload.serial_number, transaction);

              if (!existing) {
                const created = await FailureTicket.create({
                  serial_number: payload.serial_number,
                  model_rev: payload.model_rev,
                  failure_signature: payload.failure_signature,
                  technician_id: payload.technician_id,
                  department_id: departmentId,
                  status: payload.status || 'OPEN',
                  total_bench_time: payload.total_bench_time,
                  verification_pass: appendImportVerification(payload.verification_pass, payload),
                }, { transaction });

                await recordDebugTimeline({
                  ticket_id: created.id,
                  event_type: 'import_created',
                  source_file: payload.source_file,
                  source_row_number: payload.source_row_number,
                  source_reference: payload.source_reference,
                  technician_list: payload.technicians.join(', '),
                  note_text: payload.note_text,
                  failure_signature_before: '',
                  failure_signature_after: payload.failure_signature,
                  fingerprint_hash: payload.fingerprint_hash,
                  metadata: {
                    status_before: null,
                    status_after: payload.status || 'OPEN',
                    reopened: false,
                    imported: true,
                  },
                }, transaction);

                summary.created += 1;
                outcomes.push({
                  row: payload.source_row_number,
                  serial_number: payload.serial_number,
                  ticket_id: created.id,
                  status: 'created',
                });
                continue;
              }

              const isDuplicate = await isDebugImportDuplicate(existing.id, payload.fingerprint_hash, transaction);
              if (isDuplicate) {
                summary.duplicate_skipped += 1;
                outcomes.push({
                  row: payload.source_row_number,
                  serial_number: payload.serial_number,
                  ticket_id: existing.id,
                  status: 'duplicate_skipped',
                  reason: 'matching import fingerprint already exists',
                });
                continue;
              }

              const statusBefore = normalizeFailureStatus(existing.status);
              const wasClosed = CLOSED_DEBUG_STATUSES.has(statusBefore);
              const signatureBefore = normalizeText(existing.failure_signature);
              const signatureAfter = payload.failure_signature || signatureBefore;
              const techniciansMerged = mergeTechnicianValues(existing.technician_id, payload.technicians);
              const statusAfter = payload.status
                ? (wasClosed && CLOSED_DEBUG_STATUSES.has(payload.status) ? 'OPEN' : payload.status)
                : (wasClosed ? 'OPEN' : statusBefore);
              const verificationPass = appendImportVerification(existing.verification_pass, payload);
              const nextDepartmentId = departmentId || existing.department_id || null;
              const existingBenchTime = Number(existing.total_bench_time || 0);
              const benchTimeFromImport = Number(payload.total_bench_time || 0);
              const totalBenchTime = Number.isFinite(benchTimeFromImport) && benchTimeFromImport > 0
                ? Math.max(existingBenchTime, benchTimeFromImport)
                : existingBenchTime;

              await existing.update({
                model_rev: payload.model_rev || existing.model_rev || '',
                failure_signature: signatureAfter,
                technician_id: compactTechnicianText(techniciansMerged),
                department_id: nextDepartmentId,
                status: statusAfter,
                total_bench_time: totalBenchTime,
                verification_pass: verificationPass,
              }, { transaction });

              const eventType = wasClosed
                ? 'import_reopen'
                : (signatureAfter !== signatureBefore ? 'import_signature_update' : 'import_merge');

              await recordDebugTimeline({
                ticket_id: existing.id,
                event_type: eventType,
                source_file: payload.source_file,
                source_row_number: payload.source_row_number,
                source_reference: payload.source_reference,
                technician_list: techniciansMerged.join(', '),
                note_text: payload.note_text,
                failure_signature_before: signatureBefore,
                failure_signature_after: signatureAfter,
                fingerprint_hash: payload.fingerprint_hash,
                metadata: {
                  status_before: statusBefore,
                  status_after: statusAfter,
                  reopened: wasClosed,
                  imported: true,
                },
              }, transaction);

              if (wasClosed) {
                summary.reopened += 1;
              }
              summary.updated += 1;

              outcomes.push({
                row: payload.source_row_number,
                serial_number: payload.serial_number,
                ticket_id: existing.id,
                status: wasClosed ? 'reopened' : 'updated',
              });
            } catch (error) {
              summary.errors += 1;
              outcomes.push({
                row: payload && payload.source_row_number ? payload.source_row_number : (index + 2),
                serial_number: payload ? payload.serial_number : '',
                status: 'error',
                reason: (error && error.message) || 'failed to import row',
              });
            }
          }

          await recordDebugLog(req, {
            module: 'debug_lab',
            entity_type: 'failure_ticket',
            entity_id: null,
            action: 'imported',
            detail: `Imported ${rows.length} debug rows`,
            metadata: {
              ...summary,
            },
          }, transaction);
        });

        return res.json({
          ...summary,
          outcomes,
        });
      } catch (error) {
        console.error('command center import debug tickets', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to import debug tickets' });
      }
    },

    listDebugTickets: async (req, res) => {
      if (!ensureDebugLabAvailable(res)) return null;

      try {
        const filters = [];
        const requestedStatus = String(req.query.status || '').trim().toUpperCase();
        if (requestedStatus) {
          if (!DEBUG_TICKET_STATUSES.has(requestedStatus)) {
            return res.status(400).json({ error: 'invalid status filter' });
          }
          filters.push({ status: requestedStatus });
        }

        const serial = normalizeDebugSerial(req.query.serial_number || req.query.serial);
        if (serial) {
          filters.push({ serial_number: serial });
        }

        const departmentId = Number(req.query.department_id);
        if (Number.isInteger(departmentId) && departmentId > 0) {
          filters.push({ department_id: departmentId });
        }

        const failureSignatureFilter = String(req.query.failure_signature || '').trim().toLowerCase();
        if (failureSignatureFilter) {
          filters.push(where(fn('lower', col('failure_signature')), {
            [Op.like]: `%${failureSignatureFilter}%`,
          }));
        }

        const includeComponents = String(req.query.include_components || 'true').trim().toLowerCase() !== 'false';
        const limit = normalizePositiveLimit(req.query.limit, 250, 1000);

        const payload = await debugSequelize.transaction(async (transaction) => {
          const [tickets, chronicCounts, departmentById] = await Promise.all([
            FailureTicket.findAll({
              where: filters.length ? { [Op.and]: filters } : undefined,
              include: includeComponents
                ? [{
                  model: FaultyComponent,
                  as: 'faulty_components',
                  required: false,
                }]
                : [],
              order: [
                ['updated_at', 'DESC'],
                ['id', 'DESC'],
              ],
              limit,
              transaction,
            }),
            buildChronicFailureCountMap(transaction),
            buildDepartmentNameMap(transaction),
          ]);

          return {
            tickets,
            chronicCounts,
            departmentById,
          };
        });

        return res.json(payload.tickets.map((ticket) => formatDebugTicket(ticket, {
          chronicCounts: payload.chronicCounts,
          departmentById: payload.departmentById,
        })));
      } catch (error) {
        console.error('command center list debug tickets', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load debug tickets' });
      }
    },

    createDebugTicket: async (req, res) => {
      if (!ensureDebugLabAvailable(res)) return null;

      try {
        const payload = normalizeDebugTicketPayload(req.body || {});
        await ensureDepartmentExists(payload.department_id);

        const componentPayloads = Array.isArray(req.body && req.body.faulty_components)
          ? req.body.faulty_components.map((entry) => normalizeDebugComponentPayload(entry || {}))
          : [];

        const result = await debugSequelize.transaction(async (transaction) => {
          const created = await FailureTicket.create(payload, { transaction });

          for (const componentPayload of componentPayloads) {
            await FaultyComponent.create({
              ticket_id: created.id,
              ...componentPayload,
            }, { transaction });
          }

          await recordDebugLog(req, {
            module: 'debug_lab',
            entity_type: 'failure_ticket',
            entity_id: String(created.id),
            action: 'created',
            detail: `Created failure ticket for ${created.serial_number}`,
            metadata: {
              serial_number: created.serial_number,
              status: created.status,
              component_count: componentPayloads.length,
            },
          }, transaction);

          const [ticket, chronicCounts, departmentById] = await Promise.all([
            fetchDebugTicketById(created.id, transaction),
            buildChronicFailureCountMap(transaction),
            buildDepartmentNameMap(transaction),
          ]);

          return {
            ticket,
            chronicCounts,
            departmentById,
          };
        });

        return res.status(201).json(formatDebugTicket(result.ticket, {
          chronicCounts: result.chronicCounts,
          departmentById: result.departmentById,
        }));
      } catch (error) {
        const message = (error && error.message) || 'failed to create debug ticket';
        return res.status(/required|invalid|not found/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    updateDebugTicket: async (req, res) => {
      if (!ensureDebugLabAvailable(res)) return null;

      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: 'invalid ticket id' });
        }

        const existing = await FailureTicket.findByPk(id);
        if (!existing) {
          return res.status(404).json({ error: 'debug ticket not found' });
        }

        const payload = normalizeDebugTicketPayload({ ...existing.toJSON(), ...(req.body || {}) });
        await ensureDepartmentExists(payload.department_id);

        const replaceComponents = Array.isArray(req.body && req.body.faulty_components);
        const componentPayloads = replaceComponents
          ? req.body.faulty_components.map((entry) => normalizeDebugComponentPayload(entry || {}))
          : [];

        const result = await debugSequelize.transaction(async (transaction) => {
          const ticket = await fetchDebugTicketById(id, transaction);
          if (!ticket) {
            throw new Error('debug ticket not found');
          }

          await ticket.update(payload, { transaction });

          if (replaceComponents) {
            await FaultyComponent.destroy({ where: { ticket_id: id }, transaction });
            for (const componentPayload of componentPayloads) {
              await FaultyComponent.create({
                ticket_id: id,
                ...componentPayload,
              }, { transaction });
            }
          }

          await recordDebugLog(req, {
            module: 'debug_lab',
            entity_type: 'failure_ticket',
            entity_id: String(id),
            action: 'updated',
            detail: `Updated failure ticket for ${ticket.serial_number}`,
            metadata: {
              serial_number: ticket.serial_number,
              status: payload.status,
              replaced_components: replaceComponents,
              component_count: replaceComponents ? componentPayloads.length : undefined,
            },
          }, transaction);

          const [refreshed, chronicCounts, departmentById] = await Promise.all([
            fetchDebugTicketById(id, transaction),
            buildChronicFailureCountMap(transaction),
            buildDepartmentNameMap(transaction),
          ]);

          return {
            refreshed,
            chronicCounts,
            departmentById,
          };
        });

        return res.json(formatDebugTicket(result.refreshed, {
          chronicCounts: result.chronicCounts,
          departmentById: result.departmentById,
        }));
      } catch (error) {
        const message = (error && error.message) || 'failed to update debug ticket';
        const status = /required|invalid|not found/i.test(message) ? 400 : 500;
        return res.status(status).json({ error: message });
      }
    },

    deleteDebugTicket: async (req, res) => {
      if (!ensureDebugLabAvailable(res)) return null;

      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: 'invalid ticket id' });
        }

        const existing = await FailureTicket.findByPk(id);
        if (!existing) {
          return res.status(404).json({ error: 'debug ticket not found' });
        }

        await debugSequelize.transaction(async (transaction) => {
          const componentCount = await FaultyComponent.count({ where: { ticket_id: id }, transaction });
          await FaultyComponent.destroy({ where: { ticket_id: id }, transaction });

          await recordDebugLog(req, {
            module: 'debug_lab',
            entity_type: 'failure_ticket',
            entity_id: String(id),
            action: 'deleted',
            detail: `Deleted failure ticket for ${existing.serial_number}`,
            metadata: {
              serial_number: existing.serial_number,
              component_count: componentCount,
            },
          }, transaction);

          await FailureTicket.destroy({ where: { id }, transaction });
        });

        return res.json({ ok: true, id });
      } catch (error) {
        console.error('command center delete debug ticket', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to delete debug ticket' });
      }
    },

    listDebugComponents: async (req, res) => {
      if (!ensureDebugLabAvailable(res)) return null;

      try {
        const ticketId = Number(req.params.ticketId);
        if (!Number.isInteger(ticketId) || ticketId <= 0) {
          return res.status(400).json({ error: 'invalid ticket id' });
        }

        const ticket = await FailureTicket.findByPk(ticketId);
        if (!ticket) {
          return res.status(404).json({ error: 'debug ticket not found' });
        }

        const components = await FaultyComponent.findAll({
          where: { ticket_id: ticketId },
          order: [
            ['created_at', 'ASC'],
            ['id', 'ASC'],
          ],
        });

        return res.json(components.map(formatDebugComponent));
      } catch (error) {
        console.error('command center list debug components', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load faulty components' });
      }
    },

    createDebugComponent: async (req, res) => {
      if (!ensureDebugLabAvailable(res)) return null;

      try {
        const ticketId = Number(req.params.ticketId);
        if (!Number.isInteger(ticketId) || ticketId <= 0) {
          return res.status(400).json({ error: 'invalid ticket id' });
        }

        const payload = normalizeDebugComponentPayload(req.body || {});
        const result = await debugSequelize.transaction(async (transaction) => {
          const ticket = await FailureTicket.findByPk(ticketId, { transaction });
          if (!ticket) {
            throw new Error('debug ticket not found');
          }

          const component = await FaultyComponent.create({
            ticket_id: ticketId,
            ...payload,
          }, { transaction });

          await recordDebugLog(req, {
            module: 'debug_lab',
            entity_type: 'failure_ticket',
            entity_id: String(ticketId),
            action: 'component_added',
            detail: `Added component ${payload.ref_designator} to ${ticket.serial_number}`,
            metadata: {
              serial_number: ticket.serial_number,
              component_id: component.id,
              ref_designator: payload.ref_designator,
            },
          }, transaction);

          return component;
        });

        return res.status(201).json(formatDebugComponent(result));
      } catch (error) {
        const message = (error && error.message) || 'failed to create faulty component';
        return res.status(/required|invalid|not found/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    updateDebugComponent: async (req, res) => {
      if (!ensureDebugLabAvailable(res)) return null;

      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: 'invalid component id' });
        }

        const existing = await FaultyComponent.findByPk(id);
        if (!existing) {
          return res.status(404).json({ error: 'faulty component not found' });
        }

        const payload = normalizeDebugComponentPayload({ ...existing.toJSON(), ...(req.body || {}) });
        const updated = await debugSequelize.transaction(async (transaction) => {
          const component = await FaultyComponent.findByPk(id, { transaction });
          if (!component) {
            throw new Error('faulty component not found');
          }

          const ticket = await FailureTicket.findByPk(component.ticket_id, { transaction });
          await component.update(payload, { transaction });

          await recordDebugLog(req, {
            module: 'debug_lab',
            entity_type: 'failure_ticket',
            entity_id: String(component.ticket_id),
            action: 'component_updated',
            detail: `Updated component ${payload.ref_designator}`,
            metadata: {
              component_id: component.id,
              serial_number: ticket ? ticket.serial_number : null,
              ref_designator: payload.ref_designator,
            },
          }, transaction);

          return component;
        });

        return res.json(formatDebugComponent(updated));
      } catch (error) {
        const message = (error && error.message) || 'failed to update faulty component';
        return res.status(/required|invalid|not found/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    deleteDebugComponent: async (req, res) => {
      if (!ensureDebugLabAvailable(res)) return null;

      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: 'invalid component id' });
        }

        const existing = await FaultyComponent.findByPk(id);
        if (!existing) {
          return res.status(404).json({ error: 'faulty component not found' });
        }

        await debugSequelize.transaction(async (transaction) => {
          const component = await FaultyComponent.findByPk(id, { transaction });
          if (!component) {
            throw new Error('faulty component not found');
          }

          const ticket = await FailureTicket.findByPk(component.ticket_id, { transaction });

          await recordDebugLog(req, {
            module: 'debug_lab',
            entity_type: 'failure_ticket',
            entity_id: String(component.ticket_id),
            action: 'component_deleted',
            detail: `Removed component ${component.ref_designator}`,
            metadata: {
              component_id: component.id,
              serial_number: ticket ? ticket.serial_number : null,
              ref_designator: component.ref_designator,
            },
          }, transaction);

          await component.destroy({ transaction });
        });

        return res.json({ ok: true, id });
      } catch (error) {
        console.error('command center delete debug component', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to delete faulty component' });
      }
    },

    getDebugPatternAlert: async (req, res) => {
      if (!ensureDebugLabAvailable(res)) return null;

      try {
        const signature = normalizeText((req.query && req.query.failure_signature) || (req.body && req.body.failure_signature));
        if (!signature) {
          return res.status(400).json({ error: 'failure_signature is required' });
        }

        const patternAlert = await debugSequelize.transaction(async (transaction) => {
          return buildDebugPatternAlert(signature, transaction);
        });

        return res.json({
          failure_signature: signature,
          pattern_alert: patternAlert,
        });
      } catch (error) {
        console.error('command center debug pattern alert', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to compute pattern alert' });
      }
    },

    listDebugSystemicIssues: async (req, res) => {
      if (!ensureDebugLabAvailable(res)) return null;

      try {
        const alerts = await debugSequelize.transaction(async (transaction) => {
          return listSystemicIssueAlerts(transaction);
        });

        return res.json(alerts);
      } catch (error) {
        console.error('command center list systemic issues', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load systemic issue alerts' });
      }
    },

    getDebugAnalytics: async (req, res) => {
      if (!ensureDebugLabAvailable(res)) return null;

      try {
        const analytics = await debugSequelize.transaction(async (transaction) => {
          return buildDebugAnalytics(transaction);
        });
        return res.json(analytics);
      } catch (error) {
        console.error('command center debug analytics', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load debug analytics' });
      }
    },

    getDebugTicketReport: async (req, res) => {
      if (!ensureDebugLabAvailable(res)) return null;

      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: 'invalid ticket id' });
        }

        const payload = await debugSequelize.transaction(async (transaction) => {
          const ticket = await fetchDebugTicketById(id, transaction);
          if (!ticket) {
            throw new Error('debug ticket not found');
          }

          const serial = normalizeDebugSerial(ticket.serial_number);
          const history = await FailureTicket.findAll({
            where: { serial_number: serial },
            include: [{
              model: FaultyComponent,
              as: 'faulty_components',
              required: false,
            }],
            order: [
              ['created_at', 'DESC'],
              ['id', 'DESC'],
            ],
            limit: 50,
            transaction,
          });

          const [chronicCounts, departmentById, patternAlert] = await Promise.all([
            buildChronicFailureCountMap(transaction),
            buildDepartmentNameMap(transaction),
            buildDebugPatternAlert(ticket.failure_signature, transaction),
          ]);

          let timelineEvents = [];
          if (DebugTicketHistory) {
            const ticketIds = Array.from(new Set(history
              .map((entry) => Number(entry && entry.id))
              .filter((entryId) => Number.isInteger(entryId) && entryId > 0)));

            if (ticketIds.length) {
              const timelineRows = await DebugTicketHistory.findAll({
                where: {
                  ticket_id: {
                    [Op.in]: ticketIds,
                  },
                },
                order: [
                  ['created_at', 'DESC'],
                  ['id', 'DESC'],
                ],
                limit: 300,
                transaction,
              });
              timelineEvents = timelineRows.map(formatDebugTimelineEntry);
            }
          }

          const technicianRoster = collectDebugTechnicianRoster(ticket, timelineEvents);

          return {
            ticket: formatDebugTicket(ticket, {
              chronicCounts,
              departmentById,
            }),
            serial_history: history.map((entry) => formatDebugTicket(entry, {
              chronicCounts,
              departmentById,
            })),
            timeline_events: timelineEvents,
            technician_roster: technicianRoster,
            pattern_alert: patternAlert,
          };
        });

        return res.json(payload);
      } catch (error) {
        const message = (error && error.message) || 'failed to build debug ticket report';
        return res.status(/invalid|not found/i.test(message) ? 400 : 500).json({ error: message });
      }
    },

    listAssetLogs: async (req, res) => {
      try {
        const source = normalizeAssetSource(req.query.source || req.params.source);
        const entityId = Number(req.query.id || req.params.id);
        const limit = normalizePositiveLimit(req.query.limit, 40, 200);

        if (!source) {
          return res.status(400).json({ error: 'source must be hazmat, calibration, or debug' });
        }

        if (!Number.isInteger(entityId) || entityId <= 0) {
          return res.status(400).json({ error: 'id must be a positive integer' });
        }

        if (source === 'hazmat') {
          const material = await Material.findByPk(entityId);
          if (!material) return res.status(404).json({ error: 'material not found' });

          const logs = await HazmatLog.findAll({
            where: {
              entity_type: 'material',
              entity_id: String(entityId),
            },
            order: [['timestamp', 'DESC']],
            limit,
          });

          return res.json(logs.map((entry) => formatLog(entry, 'hazmat')));
        }

        if (source === 'debug') {
          if (!ensureDebugLabAvailable(res)) return null;

          const ticket = await FailureTicket.findByPk(entityId);
          if (!ticket) return res.status(404).json({ error: 'debug ticket not found' });

          const logs = await DebugLog.findAll({
            where: {
              entity_type: 'failure_ticket',
              entity_id: String(entityId),
            },
            order: [['timestamp', 'DESC']],
            limit,
          });

          return res.json(logs.map((entry) => formatLog(entry, 'debug')));
        }

        const asset = await CalibrationAsset.findByPk(entityId);
        if (!asset) return res.status(404).json({ error: 'calibration asset not found' });

        const logs = await GageLog.findAll({
          where: {
            entity_type: 'asset',
            entity_id: String(entityId),
          },
          order: [['timestamp', 'DESC']],
          limit,
        });

        return res.json(logs.map((entry) => formatLog(entry, 'calibration')));
      } catch (error) {
        console.error('command center list asset logs', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load asset logs' });
      }
    },

    listLogs: async (req, res) => {
      try {
        const requested = Number(req.query.limit);
        const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 150) : 40;
        const [hazmatLogs, gageLogs, debugLogs] = await Promise.all([
          HazmatLog.findAll({
            order: [['timestamp', 'DESC']],
            limit,
          }),
          GageLog.findAll({
            order: [['timestamp', 'DESC']],
            limit,
          }),
          isDebugLabAvailable()
            ? DebugLog.findAll({
              order: [['timestamp', 'DESC']],
              limit,
            })
            : [],
        ]);

        const mergedLogs = [
          ...hazmatLogs.map((entry) => ({ entry, source: 'hazmat' })),
          ...gageLogs.map((entry) => ({ entry, source: 'gages' })),
          ...debugLogs.map((entry) => ({ entry, source: 'debug' })),
        ]
          .sort((left, right) => normalizeLogTimestamp(right.entry.timestamp) - normalizeLogTimestamp(left.entry.timestamp))
          .slice(0, limit)
          .map(({ entry, source }) => formatLog(entry, source));

        return res.json(mergedLogs);
      } catch (error) {
        console.error('command center list logs', error && error.message ? error.message : error);
        return res.status(500).json({ error: 'failed to load logs' });
      }
    },
  };
}

module.exports = {
  createCommandCenterController,
};