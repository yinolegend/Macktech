const CALIBRATION_CATEGORIES = ['Mechanical', 'Electrical', 'Pressure'];
const DEFAULT_CATEGORY = CALIBRATION_CATEGORIES[0];
const DEFAULT_INTERVAL_DAYS = 365;
const DEFAULT_INTERVAL_MONTHS = 12;
const DEFAULT_INTERVAL_MODE = 'days';
const DEFAULT_UNIT_OF_MEASURE = 'Unitless';
const DEFAULT_DEPARTMENT = 'Unassigned';
const DEFAULT_MAX_DAILY_CALIBRATIONS = 10;
const DEFAULT_ALLOWED_DAYS = [1, 2, 3, 4, 5];

const DAYS_PER_MONTH_AVERAGE = 365 / 12;

function normalizeDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizePositiveInteger(value, fallback = DEFAULT_INTERVAL_DAYS) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function normalizeIntervalMode(value, fallback = DEFAULT_INTERVAL_MODE) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'months') return 'months';
  if (mode === 'days') return 'days';
  return fallback;
}

function normalizeIntervalDays(value, fallback = DEFAULT_INTERVAL_DAYS) {
  return normalizePositiveInteger(value, fallback);
}

function normalizeIntervalMonths(value, fallback = DEFAULT_INTERVAL_MONTHS) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return fallback;
  return Math.min(12, numeric);
}

function normalizeMaxDailyCalibrations(value, fallback = DEFAULT_MAX_DAILY_CALIBRATIONS) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return fallback;
  return Math.min(10, numeric);
}

function parseAllowedDayValues(value) {
  if (Array.isArray(value)) return value;

  const text = String(value || '').trim();
  if (!text) return [];

  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
    }
  }

  return text.split(/[|,;\s]+/).map((entry) => entry.trim()).filter(Boolean);
}

function normalizeAllowedDays(value, fallback = DEFAULT_ALLOWED_DAYS) {
  const fallbackDays = Array.from(new Set(parseAllowedDayValues(fallback)
    .map((entry) => Number(entry))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)))
    .sort((left, right) => left - right);

  const candidateDays = Array.from(new Set(parseAllowedDayValues(value)
    .map((entry) => Number(entry))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)))
    .sort((left, right) => left - right);

  if (candidateDays.length) return candidateDays;
  if (fallbackDays.length) return fallbackDays;
  return DEFAULT_ALLOWED_DAYS.slice();
}

function deriveIntervalDays(options = {}) {
  const mode = normalizeIntervalMode(options.intervalMode || options.interval_mode, DEFAULT_INTERVAL_MODE);
  if (mode === 'months') {
    const months = normalizeIntervalMonths(options.intervalMonths || options.interval_months, DEFAULT_INTERVAL_MONTHS);
    return Math.max(1, Math.round(months * DAYS_PER_MONTH_AVERAGE));
  }

  return normalizeIntervalDays(options.intervalDays || options.interval_days, DEFAULT_INTERVAL_DAYS);
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
}

function normalizeText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeUnitOfMeasure(value, fallback = DEFAULT_UNIT_OF_MEASURE) {
  const normalized = normalizeText(value, fallback);
  if (/^days?$/i.test(normalized)) {
    return fallback;
  }
  return normalized;
}

function normalizeCategory(value, fallback = DEFAULT_CATEGORY) {
  const candidate = normalizeText(value, fallback).toLowerCase();
  const match = CALIBRATION_CATEGORIES.find((entry) => entry.toLowerCase() === candidate);
  return match || fallback;
}

function defaultAlertLeadDays(intervalDays = DEFAULT_INTERVAL_DAYS) {
  const interval = normalizeIntervalDays(intervalDays, DEFAULT_INTERVAL_DAYS);
  return Math.min(30, Math.max(3, Math.round(interval * 0.15)));
}

function defaultGracePeriodDays(intervalDays = DEFAULT_INTERVAL_DAYS) {
  const interval = normalizeIntervalDays(intervalDays, DEFAULT_INTERVAL_DAYS);
  return Math.min(14, Math.max(2, Math.round(interval * 0.05)));
}

function toUtcDate(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatUtcDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

function shiftUtcDate(value, dayDelta) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + Number(dayDelta || 0));
  return next;
}

function addMonths(dateString, months) {
  if (!dateString) return null;
  const parsed = toUtcDate(dateString);
  if (!parsed) return null;

  const monthOffset = normalizeIntervalMonths(months, DEFAULT_INTERVAL_MONTHS);
  const dayOfMonth = parsed.getUTCDate();
  parsed.setUTCDate(1);
  parsed.setUTCMonth(parsed.getUTCMonth() + monthOffset);
  const monthEnd = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)).getUTCDate();
  parsed.setUTCDate(Math.min(dayOfMonth, monthEnd));
  return formatUtcDate(parsed);
}

function isAllowedWeekday(dateObj, allowedDaySet) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return false;
  const day = dateObj.getUTCDay();
  const normalizedDay = day === 0 ? 7 : day;
  if (!allowedDaySet || !allowedDaySet.size) return true;
  return allowedDaySet.has(normalizedDay);
}

function rollbackToAllowedDate(dateObj, allowedDaySet) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null;

  let cursor = new Date(dateObj.getTime());
  for (let step = 0; step < 3660; step += 1) {
    if (isAllowedWeekday(cursor, allowedDaySet)) {
      return cursor;
    }
    cursor = shiftUtcDate(cursor, -1);
  }

  return cursor;
}

function buildDateLoadMap(existingDates) {
  const loadMap = new Map();
  const dates = Array.isArray(existingDates) ? existingDates : [];

  dates.forEach((entry) => {
    const key = normalizeDate(entry);
    if (!key) return;
    loadMap.set(key, (loadMap.get(key) || 0) + 1);
  });

  return loadMap;
}

function allocateCalibrationDate(targetDate, options = {}) {
  const normalizedTarget = normalizeDate(targetDate);
  if (!normalizedTarget) return null;

  const maxDailyCalibrations = normalizeMaxDailyCalibrations(
    options.maxDailyCalibrations || options.max_daily_calibrations,
    DEFAULT_MAX_DAILY_CALIBRATIONS
  );
  const allowedDays = normalizeAllowedDays(options.allowedDays || options.allowed_days, DEFAULT_ALLOWED_DAYS);
  const allowedDaySet = new Set(allowedDays);
  const existingDates = Array.isArray(options.existingDates || options.existing_dates)
    ? (options.existingDates || options.existing_dates)
    : [];
  const loadMap = buildDateLoadMap(existingDates);

  let cursor = rollbackToAllowedDate(toUtcDate(normalizedTarget), allowedDaySet);
  if (!cursor) return normalizedTarget;

  for (let step = 0; step < 3660; step += 1) {
    const dayKey = formatUtcDate(cursor);
    if (!dayKey) return normalizedTarget;

    const currentLoad = loadMap.get(dayKey) || 0;
    if (currentLoad < maxDailyCalibrations) {
      loadMap.set(dayKey, currentLoad + 1);
      return dayKey;
    }

    cursor = rollbackToAllowedDate(shiftUtcDate(cursor, -1), allowedDaySet);
    if (!cursor) return dayKey;
  }

  return formatUtcDate(cursor) || normalizedTarget;
}

function addDays(dateString, days) {
  if (!dateString) return null;
  const parsed = toUtcDate(dateString);
  if (!parsed) return null;
  const next = shiftUtcDate(parsed, Number(days || 0));
  return formatUtcDate(next);
}

function computeNextCalibrationDate(lastCalDate, intervalDays = DEFAULT_INTERVAL_DAYS, options = {}) {
  const lastCal = normalizeDate(lastCalDate);
  if (!lastCal) return null;

  const intervalMode = normalizeIntervalMode(options.intervalMode || options.interval_mode, DEFAULT_INTERVAL_MODE);
  const normalizedIntervalDays = normalizeIntervalDays(
    options.intervalDays || options.interval_days || intervalDays,
    DEFAULT_INTERVAL_DAYS
  );
  const normalizedIntervalMonths = normalizeIntervalMonths(
    options.intervalMonths || options.interval_months,
    DEFAULT_INTERVAL_MONTHS
  );

  const nextAnchor = intervalMode === 'months'
    ? addMonths(lastCal, normalizedIntervalMonths)
    : addDays(lastCal, normalizedIntervalDays);

  return allocateCalibrationDate(nextAnchor, {
    maxDailyCalibrations: options.maxDailyCalibrations || options.max_daily_calibrations,
    allowedDays: options.allowedDays || options.allowed_days,
    existingDates: options.existingDates || options.existing_dates,
  });
}

function computeCalibrationStatus({ nextCalDate, alertLeadDays, gracePeriodDays }) {
  if (!nextCalDate) return 'WARNING';

  const nextCal = new Date(`${nextCalDate}T00:00:00Z`);
  if (Number.isNaN(nextCal.getTime())) return 'WARNING';

  const today = new Date();
  const todayKey = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const warningStart = new Date(nextCal);
  warningStart.setUTCDate(warningStart.getUTCDate() - normalizeNonNegativeInteger(alertLeadDays, 0));

  const hardLockDate = new Date(nextCal);
  hardLockDate.setUTCDate(hardLockDate.getUTCDate() + normalizeNonNegativeInteger(gracePeriodDays, 0));

  if (todayKey.getTime() < warningStart.getTime()) return 'SAFE';
  if (todayKey.getTime() <= nextCal.getTime()) return 'WARNING';
  if (todayKey.getTime() <= hardLockDate.getTime()) return 'EXPIRED';
  return 'LOCKED';
}

module.exports = {
  CALIBRATION_CATEGORIES,
  DEFAULT_CATEGORY,
  DEFAULT_DEPARTMENT,
  DEFAULT_ALLOWED_DAYS,
  DEFAULT_INTERVAL_DAYS,
  DEFAULT_INTERVAL_MODE,
  DEFAULT_INTERVAL_MONTHS,
  DEFAULT_MAX_DAILY_CALIBRATIONS,
  DEFAULT_UNIT_OF_MEASURE,
  addDays,
  addMonths,
  allocateCalibrationDate,
  computeCalibrationStatus,
  computeNextCalibrationDate,
  defaultAlertLeadDays,
  defaultGracePeriodDays,
  deriveIntervalDays,
  normalizeAllowedDays,
  normalizeCategory,
  normalizeDate,
  normalizeIntervalDays,
  normalizeIntervalMode,
  normalizeIntervalMonths,
  normalizeMaxDailyCalibrations,
  normalizeNonNegativeInteger,
  normalizePositiveInteger,
  normalizeText,
  normalizeUnitOfMeasure,
};