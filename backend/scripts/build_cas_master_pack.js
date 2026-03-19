const fs = require('fs');
const path = require('path');

const paths = require('../../config/paths');
const { normalizeCasRecord } = require('../services/casService');

const DEFAULT_LIMIT = 25000;

function printUsage() {
  console.log('Usage:');
  console.log('  node backend/scripts/build_cas_master_pack.js --input <file1.json,file2.jsonl> [--output <output.json>]');
  console.log('');
  console.log('Options:');
  console.log('  --input, -i                 Comma-separated input file paths (JSON/JSONL/NDJSON).');
  console.log('  --output, -o                Output snapshot path (default: data/cas_index_master.json).');
  console.log(`  --limit                     Max records to keep after scoring (default: ${DEFAULT_LIMIT}, 0 = unlimited).`);
  console.log('  --include-nonhazardous      Keep explicit non-hazardous records (default: false).');
  console.log('  --name                      Dataset display name.');
  console.log('  --source                    Dataset source text.');
  console.log('  --provider                  Dataset provider text.');
  console.log('  --version                   Dataset version tag (default: YYYY-MM-DD).');
  console.log('  --notes                     Dataset notes string.');
  console.log('  --help                      Show this help text.');
  console.log('');
  console.log('Positional arguments are also treated as input files.');
}

function splitPathList(value) {
  return String(value || '')
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const token = String(value).trim().toLowerCase();
  if (token === 'true' || token === '1' || token === 'yes') return true;
  if (token === 'false' || token === '0' || token === 'no') return false;
  return fallback;
}

function parseLimit(value) {
  const numeric = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`Invalid --limit value: ${value}`);
  }
  return numeric;
}

function parseArgs(argv) {
  const nowVersion = new Date().toISOString().slice(0, 10);
  const options = {
    inputPaths: [],
    outputPath: paths.CAS_INDEX_MASTER_PATH,
    limit: DEFAULT_LIMIT,
    includeNonHazardous: false,
    name: 'Master Offline CAS Index',
    source: 'Public-source aggregated hazard dataset',
    provider: 'Operations',
    version: nowVersion,
    notes: 'Hazard-qualified CAS records with primary_class, division, and hazard_dna for offline command-center lookup.',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--help' || token === '-h') {
      options.help = true;
      continue;
    }

    if (token === '--input' || token === '-i') {
      options.inputPaths.push(...splitPathList(argv[index + 1]));
      index += 1;
      continue;
    }

    if (token.startsWith('--input=')) {
      options.inputPaths.push(...splitPathList(token.slice('--input='.length)));
      continue;
    }

    if (token === '--output' || token === '-o') {
      options.outputPath = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (token.startsWith('--output=')) {
      options.outputPath = String(token.slice('--output='.length)).trim();
      continue;
    }

    if (token === '--limit') {
      options.limit = parseLimit(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token.startsWith('--limit=')) {
      options.limit = parseLimit(token.slice('--limit='.length));
      continue;
    }

    if (token === '--include-nonhazardous') {
      options.includeNonHazardous = parseBoolean(argv[index + 1], true);
      index += 1;
      continue;
    }

    if (token.startsWith('--include-nonhazardous=')) {
      options.includeNonHazardous = parseBoolean(token.slice('--include-nonhazardous='.length), true);
      continue;
    }

    if (token === '--name') {
      options.name = String(argv[index + 1] || '').trim() || options.name;
      index += 1;
      continue;
    }

    if (token.startsWith('--name=')) {
      options.name = String(token.slice('--name='.length)).trim() || options.name;
      continue;
    }

    if (token === '--source') {
      options.source = String(argv[index + 1] || '').trim() || options.source;
      index += 1;
      continue;
    }

    if (token.startsWith('--source=')) {
      options.source = String(token.slice('--source='.length)).trim() || options.source;
      continue;
    }

    if (token === '--provider') {
      options.provider = String(argv[index + 1] || '').trim() || options.provider;
      index += 1;
      continue;
    }

    if (token.startsWith('--provider=')) {
      options.provider = String(token.slice('--provider='.length)).trim() || options.provider;
      continue;
    }

    if (token === '--version') {
      options.version = String(argv[index + 1] || '').trim() || options.version;
      index += 1;
      continue;
    }

    if (token.startsWith('--version=')) {
      options.version = String(token.slice('--version='.length)).trim() || options.version;
      continue;
    }

    if (token === '--notes') {
      options.notes = String(argv[index + 1] || '').trim() || options.notes;
      index += 1;
      continue;
    }

    if (token.startsWith('--notes=')) {
      options.notes = String(token.slice('--notes='.length)).trim() || options.notes;
      continue;
    }

    if (token.startsWith('-')) {
      throw new Error(`Unknown option: ${token}`);
    }

    options.inputPaths.push(token);
  }

  options.outputPath = path.resolve(options.outputPath || paths.CAS_INDEX_MASTER_PATH);
  options.inputPaths = Array.from(new Set(options.inputPaths
    .map((entry) => path.resolve(String(entry || '').trim()))
    .filter(Boolean)));

  return options;
}

function looksLikeCasRecord(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  return Boolean(payload.cas_number || payload.cas || payload.CAS || payload.registry_number || payload.registryNumber);
}

function extractRecordsFromJson(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const arrayCandidates = [
    payload.records,
    payload.items,
    payload.results,
    payload.data,
    payload.compounds,
  ];

  for (const candidate of arrayCandidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return looksLikeCasRecord(payload) ? [payload] : [];
}

function parseJsonLines(rawText, filePath) {
  const records = [];
  const lines = String(rawText || '').split(/\r?\n/);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        records.push(...parsed);
      } else {
        records.push(parsed);
      }
    } catch (error) {
      throw new Error(`Invalid JSONL at ${filePath}:${index + 1}`);
    }
  });

  return records;
}

function loadSourceRecords(filePath) {
  const rawText = fs.readFileSync(filePath, 'utf8');
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.jsonl' || extension === '.ndjson') {
    return parseJsonLines(rawText, filePath);
  }

  const parsed = JSON.parse(rawText);
  return extractRecordsFromJson(parsed);
}

function normalizeStatusRank(value) {
  const token = String(value || '').trim().toLowerCase();
  if (token === 'classified') return 4;
  if (token === 'estimated') return 3;
  if (token === 'non_hazardous') return 2;
  if (token === 'unknown') return 1;
  return 0;
}

function scoreRecord(record) {
  let score = 0;

  const name = String(record.name || '').trim();
  if (name && !/^cas\s+\d+/i.test(name)) {
    score += 3;
  } else if (name) {
    score += 1;
  }

  score += Math.min(8, Array.isArray(record.ghs_auto_symbols) ? record.ghs_auto_symbols.length : 0);
  score += Math.min(8, Array.isArray(record.hazard_dna) ? record.hazard_dna.length : 0);

  if (String(record.primary_class || '').trim() && String(record.primary_class || '').trim() !== '0') {
    score += 2;
  }

  if (String(record.division || '').trim() && String(record.division || '').trim() !== '0') {
    score += 1;
  }

  score += normalizeStatusRank(record.hazard_status);

  if (record.risk && record.risk.environment) score += 1;
  if (record.risk && record.risk.health) score += 1;

  return score;
}

function bestStatus(left, right) {
  return normalizeStatusRank(right) > normalizeStatusRank(left) ? right : left;
}

function mergeSymbolLists(first, second) {
  const merged = [];
  const seen = new Set();

  [first, second].forEach((source) => {
    if (!Array.isArray(source)) return;
    source.forEach((entry) => {
      const token = String(entry || '').trim();
      if (!token || seen.has(token)) return;
      seen.add(token);
      merged.push(token);
    });
  });

  return merged;
}

function mergeRecords(existingRecord, incomingRecord) {
  const existingScore = scoreRecord(existingRecord);
  const incomingScore = scoreRecord(incomingRecord);
  const preferred = incomingScore >= existingScore ? incomingRecord : existingRecord;
  const secondary = preferred === incomingRecord ? existingRecord : incomingRecord;

  const mergedRaw = {
    ...secondary,
    ...preferred,
    cas_number: preferred.cas_number || secondary.cas_number,
    name: String(preferred.name || '').trim() || String(secondary.name || '').trim(),
    ghs_auto_symbols: mergeSymbolLists(preferred.ghs_auto_symbols, secondary.ghs_auto_symbols),
    hazard_dna: mergeSymbolLists(preferred.hazard_dna, secondary.hazard_dna),
    hazard_status: bestStatus(preferred.hazard_status, secondary.hazard_status),
  };

  return normalizeCasRecord(mergedRaw) || preferred;
}

function isHazardQualified(record, includeNonHazardous) {
  const symbols = Array.isArray(record.ghs_auto_symbols)
    ? record.ghs_auto_symbols.filter((symbol) => symbol !== 'non_hazardous')
    : [];

  const hazardDna = Array.isArray(record.hazard_dna)
    ? record.hazard_dna.filter((symbol) => symbol !== 'non_hazardous')
    : [];

  if (symbols.length || hazardDna.length) return true;
  if (!includeNonHazardous) return false;

  return String(record.hazard_status || '').trim().toLowerCase() === 'non_hazardous';
}

function buildSnapshot(records, options, summary) {
  const nowIso = new Date().toISOString();
  const outputRecords = records.map((record) => ({
    ...record,
    source: undefined,
    dataset_version: undefined,
    dataset_generated_at: undefined,
  })).map((record) => {
    const cleaned = { ...record };
    delete cleaned.source;
    delete cleaned.dataset_version;
    delete cleaned.dataset_generated_at;
    return cleaned;
  });

  return {
    dataset: {
      name: String(options.name || 'Master Offline CAS Index'),
      source: String(options.source || 'Public-source aggregated hazard dataset'),
      provider: String(options.provider || 'Operations'),
      version: String(options.version || nowIso.slice(0, 10)),
      generated_at: nowIso,
      record_count: outputRecords.length,
      notes: String(options.notes || ''),
      source_files: options.inputPaths,
      include_non_hazardous: options.includeNonHazardous,
      limit: options.limit,
      input_records: summary.inputRecords,
      normalized_records: summary.normalizedRecords,
      excluded_records: summary.excludedRecords,
      deduped_records: summary.dedupedRecords,
    },
    records: outputRecords,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  if (!options.inputPaths.length) {
    printUsage();
    throw new Error('At least one input file is required.');
  }

  options.inputPaths.forEach((inputPath) => {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }
  });

  const mergedByCas = new Map();
  let inputRecords = 0;
  let normalizedRecords = 0;

  options.inputPaths.forEach((inputPath) => {
    const records = loadSourceRecords(inputPath);
    inputRecords += records.length;

    records.forEach((entry) => {
      const normalized = normalizeCasRecord(entry);
      if (!normalized) return;
      normalizedRecords += 1;

      const existing = mergedByCas.get(normalized.cas_number);
      if (!existing) {
        mergedByCas.set(normalized.cas_number, normalized);
        return;
      }

      mergedByCas.set(normalized.cas_number, mergeRecords(existing, normalized));
    });
  });

  const dedupedRecords = Array.from(mergedByCas.values());
  const hazardQualified = dedupedRecords.filter((record) => isHazardQualified(record, options.includeNonHazardous));
  const excludedRecords = dedupedRecords.length - hazardQualified.length;

  const prioritized = hazardQualified
    .slice()
    .sort((left, right) => {
      const scoreDelta = scoreRecord(right) - scoreRecord(left);
      if (scoreDelta !== 0) return scoreDelta;
      return left.cas_number.localeCompare(right.cas_number);
    });

  const limited = options.limit > 0 ? prioritized.slice(0, options.limit) : prioritized;
  const finalRecords = limited.sort((left, right) => left.cas_number.localeCompare(right.cas_number));

  const snapshot = buildSnapshot(finalRecords, options, {
    inputRecords,
    normalizedRecords,
    excludedRecords,
    dedupedRecords: dedupedRecords.length,
  });

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.writeFileSync(options.outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  console.log(`CAS master snapshot written: ${options.outputPath}`);
  console.log(`Input records: ${inputRecords}`);
  console.log(`Normalized records: ${normalizedRecords}`);
  console.log(`Deduped records: ${dedupedRecords.length}`);
  console.log(`Excluded (no hazard data): ${excludedRecords}`);
  console.log(`Final records: ${snapshot.dataset.record_count}`);
  console.log(`Limit: ${options.limit}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Failed to build CAS master pack', error && error.message ? error.message : error);
    process.exit(1);
  }
}
