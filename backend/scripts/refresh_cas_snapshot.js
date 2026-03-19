const fs = require('fs');
const path = require('path');

const paths = require('../../config/paths');
const { normalizeCasRecord } = require('../services/casService');

function loadSourceRecords(inputPath) {
  const sourcePath = inputPath || paths.CAS_INDEX_PATH;
  const rawText = fs.readFileSync(sourcePath, 'utf8');
  const parsed = JSON.parse(rawText);
  return {
    sourcePath,
    dataset: parsed && typeof parsed.dataset === 'object' ? parsed.dataset : {},
    records: Array.isArray(parsed && parsed.records) ? parsed.records : [],
  };
}

function buildSnapshot(records, datasetOverride) {
  const normalized = records
    .map(normalizeCasRecord)
    .filter(Boolean)
    .sort((left, right) => left.cas_number.localeCompare(right.cas_number));

  const unique = [];
  const seen = new Set();
  normalized.forEach((record) => {
    if (seen.has(record.cas_number)) return;
    seen.add(record.cas_number);
    unique.push(record);
  });

  const dataset = {
    name: String((datasetOverride && datasetOverride.name) || 'NCBI PubChem Curated CAS Snapshot'),
    source: String((datasetOverride && datasetOverride.source) || 'National Center for Biotechnology Information (NCBI)'),
    provider: String((datasetOverride && datasetOverride.provider) || 'PubChem'),
    version: String((datasetOverride && datasetOverride.version) || new Date().toISOString().slice(0, 10)),
    generated_at: new Date().toISOString(),
    record_count: unique.length,
    notes: String((datasetOverride && datasetOverride.notes) || 'Offline-first curated subset for command-center hazard auto-detection'),
  };

  return { dataset, records: unique };
}

function main() {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const source = loadSourceRecords(inputPath);
  const snapshot = buildSnapshot(source.records, source.dataset);

  fs.writeFileSync(paths.CAS_INDEX_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  console.log(`CAS snapshot refreshed: ${paths.CAS_INDEX_PATH}`);
  console.log(`Source: ${source.sourcePath}`);
  console.log(`Records: ${snapshot.dataset.record_count}`);
  console.log(`Version: ${snapshot.dataset.version}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Failed to refresh CAS snapshot', error && error.message ? error.message : error);
    process.exit(1);
  }
}
