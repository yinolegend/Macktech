const fs = require('fs');
const path = require('path');

const paths = require('../../config/paths');
const { createCasService, normalizeCasNumber } = require('../services/casService');

function parseArgs(argv) {
  const options = {
    inputPath: path.join(paths.DATA_DIR, 'cas_required_list.txt'),
    outputPath: path.join(paths.DATA_DIR, 'cas_required_lookup_verify.json'),
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
  console.log('  node backend/scripts/verify_required_cas_lookup.js [--input <cas-list.txt>] [--output <report.json>]');
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

async function main() {
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
    throw new Error('No valid CAS numbers were found in input list.');
  }

  const casService = createCasService({
    snapshotPaths: [paths.CAS_INDEX_PATH, paths.CAS_INDEX_MASTER_PATH, paths.CAS_INDEX_EXTENDED_PATH],
    writeThroughPath: paths.CAS_INDEX_EXTENDED_PATH,
    allowRemoteLookup: false,
    logger: { log: () => {}, warn: () => {} },
  });

  casService.loadSnapshot(true);

  const missingLookup = [];
  const missingClassOrDivision = [];

  for (const casNumber of requiredCas) {
    const record = await casService.lookup(casNumber);
    if (!record) {
      missingLookup.push(casNumber);
      continue;
    }

    const primaryClass = String(record.primary_class || '').trim();
    const division = String(record.division || '').trim();
    if (!primaryClass || !division) {
      missingClassOrDivision.push(casNumber);
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: 'offline',
    required_unique_count: requiredCas.length,
    missing_lookup_count: missingLookup.length,
    missing_lookup: missingLookup,
    missing_class_or_division_count: missingClassOrDivision.length,
    missing_class_or_division: missingClassOrDivision,
  };

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.writeFileSync(options.outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Required CAS unique count: ${report.required_unique_count}`);
  console.log(`Offline missing lookups: ${report.missing_lookup_count}`);
  console.log(`Offline missing class/division: ${report.missing_class_or_division_count}`);
  console.log(`Verification report written: ${options.outputPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to verify required CAS lookups', error && error.message ? error.message : error);
    process.exit(1);
  });
}
