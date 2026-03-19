const fs = require('fs');
const path = require('path');

const paths = require('../../config/paths');
const { normalizeCasRecord } = require('../services/casService');

function parseInputFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.records)) return parsed.records;
  return [];
}

function readExistingSnapshot(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      dataset: {
        name: 'Extended Offline CAS Index',
        source: 'Local offline extension',
        provider: 'Operations',
        version: 'custom',
        generated_at: null,
        record_count: 0,
        notes: 'Additional CAS records layered on top of the NCBI curated snapshot',
      },
      records: [],
    };
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    dataset: parsed && parsed.dataset && typeof parsed.dataset === 'object' ? parsed.dataset : {},
    records: Array.isArray(parsed && parsed.records) ? parsed.records : [],
  };
}

function main() {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : '';
  if (!inputPath) {
    console.error('Usage: node backend/scripts/merge_cas_extension.js <input-json> [output-json]');
    process.exit(1);
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : paths.CAS_INDEX_EXTENDED_PATH;
  const incomingRaw = parseInputFile(inputPath);
  const existing = readExistingSnapshot(outputPath);

  const merged = new Map();
  existing.records.forEach((entry) => {
    const normalized = normalizeCasRecord(entry);
    if (!normalized) return;
    merged.set(normalized.cas_number, normalized);
  });

  incomingRaw.forEach((entry) => {
    const normalized = normalizeCasRecord(entry);
    if (!normalized) return;
    merged.set(normalized.cas_number, normalized);
  });

  const records = Array.from(merged.values()).sort((left, right) => left.cas_number.localeCompare(right.cas_number));
  const dataset = {
    name: String(existing.dataset.name || 'Extended Offline CAS Index'),
    source: String(existing.dataset.source || 'Local offline extension'),
    provider: String(existing.dataset.provider || 'Operations'),
    version: String(existing.dataset.version || 'custom'),
    generated_at: new Date().toISOString(),
    record_count: records.length,
    notes: String(existing.dataset.notes || 'Additional CAS records layered on top of the NCBI curated snapshot'),
  };

  const output = { dataset, records };
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`CAS extension snapshot updated: ${outputPath}`);
  console.log(`Input records: ${incomingRaw.length}`);
  console.log(`Merged records: ${records.length}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Failed to merge CAS extension', error && error.message ? error.message : error);
    process.exit(1);
  }
}
