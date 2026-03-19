const fs = require('fs');
const path = require('path');

const paths = require('../../config/paths');
const { normalizeCasRecord, normalizeCasNumber } = require('../services/casService');

function parseArgs(argv) {
  const options = {
    inputPath: path.join(paths.DATA_DIR, 'cas_required_list.txt'),
    outputPath: path.join(paths.DATA_DIR, 'cas_required_audit.json'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--input' || token === '-i') {
      options.inputPath = String(argv[i + 1] || '').trim() || options.inputPath;
      i += 1;
      continue;
    }

    if (token.startsWith('--input=')) {
      options.inputPath = String(token.slice('--input='.length)).trim() || options.inputPath;
      continue;
    }

    if (token === '--output' || token === '-o') {
      options.outputPath = String(argv[i + 1] || '').trim() || options.outputPath;
      i += 1;
      continue;
    }

    if (token.startsWith('--output=')) {
      options.outputPath = String(token.slice('--output='.length)).trim() || options.outputPath;
      continue;
    }

    if (token === '--help' || token === '-h') {
      options.help = true;
      continue;
    }

    if (token.startsWith('-')) {
      throw new Error(`Unknown option: ${token}`);
    }

    options.inputPath = token;
  }

  options.inputPath = path.resolve(options.inputPath);
  options.outputPath = path.resolve(options.outputPath);
  return options;
}

function printUsage() {
  console.log('Usage:');
  console.log('  node backend/scripts/audit_required_cas.js [--input <cas-list.txt>] [--output <report.json>]');
  console.log('');
  console.log('Defaults:');
  console.log(`  --input  ${path.join(paths.DATA_DIR, 'cas_required_list.txt')}`);
  console.log(`  --output ${path.join(paths.DATA_DIR, 'cas_required_audit.json')}`);
}

function parseRequiredCasList(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const matches = String(raw || '').match(/\b\d{2,7}-\d{2}-\d\b/g) || [];
  const unique = new Set();

  matches.forEach((candidate) => {
    const normalized = normalizeCasNumber(candidate);
    if (normalized) unique.add(normalized);
  });

  return Array.from(unique).sort((left, right) => left.localeCompare(right));
}

function loadSnapshotMap(snapshotPath) {
  if (!fs.existsSync(snapshotPath)) {
    return {
      path: snapshotPath,
      exists: false,
      records_count: 0,
      normalized_count: 0,
      byCas: new Map(),
    };
  }

  const raw = fs.readFileSync(snapshotPath, 'utf8');
  const parsed = JSON.parse(raw);
  const records = Array.isArray(parsed && parsed.records) ? parsed.records : [];
  const byCas = new Map();

  records.forEach((entry) => {
    const normalized = normalizeCasRecord(entry);
    if (!normalized) return;
    byCas.set(normalized.cas_number, normalized);
  });

  return {
    path: snapshotPath,
    exists: true,
    records_count: records.length,
    normalized_count: byCas.size,
    byCas,
  };
}

function auditMap(requiredCas, byCas) {
  const present = [];
  const missing = [];

  requiredCas.forEach((casNumber) => {
    if (byCas.has(casNumber)) {
      present.push(casNumber);
    } else {
      missing.push(casNumber);
    }
  });

  return {
    present_count: present.length,
    missing_count: missing.length,
    present,
    missing,
  };
}

function summarizeMerged(requiredCas, mergedByCas) {
  const coverage = auditMap(requiredCas, mergedByCas);
  const missingClassOrDivision = [];

  requiredCas.forEach((casNumber) => {
    const record = mergedByCas.get(casNumber);
    if (!record) return;

    const primaryClass = String(record.primary_class || '').trim();
    const division = String(record.division || '').trim();

    if (!primaryClass || !division) {
      missingClassOrDivision.push(casNumber);
    }
  });

  return {
    ...coverage,
    missing_class_or_division_count: missingClassOrDivision.length,
    missing_class_or_division: missingClassOrDivision,
  };
}

function buildMergedMap(snapshotsInOrder) {
  const merged = new Map();
  snapshotsInOrder.forEach((snapshot) => {
    snapshot.byCas.forEach((record, casNumber) => {
      merged.set(casNumber, record);
    });
  });
  return merged;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  if (!fs.existsSync(options.inputPath)) {
    throw new Error(`Input list not found: ${options.inputPath}`);
  }

  const requiredCas = parseRequiredCasList(options.inputPath);
  if (!requiredCas.length) {
    throw new Error('No valid CAS numbers found in the required list.');
  }

  const ncbi = loadSnapshotMap(paths.CAS_INDEX_PATH);
  const master = loadSnapshotMap(paths.CAS_INDEX_MASTER_PATH);
  const extended = loadSnapshotMap(paths.CAS_INDEX_EXTENDED_PATH);

  const mergedByCas = buildMergedMap([ncbi, master, extended]);

  const report = {
    generated_at: new Date().toISOString(),
    required_list_path: options.inputPath,
    required_unique_count: requiredCas.length,
    required_cas: requiredCas,
    files: {
      ncbi: {
        path: ncbi.path,
        exists: ncbi.exists,
        records_count: ncbi.records_count,
        normalized_count: ncbi.normalized_count,
        coverage: auditMap(requiredCas, ncbi.byCas),
      },
      master: {
        path: master.path,
        exists: master.exists,
        records_count: master.records_count,
        normalized_count: master.normalized_count,
        coverage: auditMap(requiredCas, master.byCas),
      },
      extended: {
        path: extended.path,
        exists: extended.exists,
        records_count: extended.records_count,
        normalized_count: extended.normalized_count,
        coverage: auditMap(requiredCas, extended.byCas),
      },
    },
    merged: {
      precedence: ['ncbi', 'master', 'extended'],
      normalized_count: mergedByCas.size,
      coverage: summarizeMerged(requiredCas, mergedByCas),
    },
  };

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.writeFileSync(options.outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Required CAS unique count: ${report.required_unique_count}`);
  console.log(`Merged present: ${report.merged.coverage.present_count}`);
  console.log(`Merged missing: ${report.merged.coverage.missing_count}`);
  console.log(`Merged missing class/division: ${report.merged.coverage.missing_class_or_division_count}`);
  console.log(`Audit report written: ${options.outputPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Failed to audit required CAS list', error && error.message ? error.message : error);
    process.exit(1);
  }
}
