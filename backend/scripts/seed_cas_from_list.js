const fs = require('fs');
const path = require('path');

const paths = require('../../config/paths');
const { createCasService, normalizeCasNumber } = require('../services/casService');

function printUsage() {
  console.log('Usage:');
  console.log('  node backend/scripts/seed_cas_from_list.js --input <file> [--limit <n>] [--timeout <ms>] [--report <path>]');
  console.log('');
  console.log('Options:');
  console.log('  --input, -i      Input file path (txt/csv/json/jsonl). Required.');
  console.log('  --limit          Max CAS numbers to process (default: 0 = unlimited).');
  console.log('  --timeout        Remote lookup timeout in ms (default: 10000).');
  console.log('  --report         Optional output JSON report path.');
  console.log('  --help, -h       Show this help text.');
}

function parseArgs(argv) {
  const options = {
    inputPath: '',
    limit: 0,
    timeoutMs: 10000,
    reportPath: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--help' || token === '-h') {
      options.help = true;
      continue;
    }

    if (token === '--input' || token === '-i') {
      options.inputPath = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (token.startsWith('--input=')) {
      options.inputPath = String(token.slice('--input='.length)).trim();
      continue;
    }

    if (token === '--limit') {
      options.limit = Number.parseInt(String(argv[index + 1] || '0').trim(), 10) || 0;
      index += 1;
      continue;
    }

    if (token.startsWith('--limit=')) {
      options.limit = Number.parseInt(String(token.slice('--limit='.length)).trim(), 10) || 0;
      continue;
    }

    if (token === '--timeout') {
      options.timeoutMs = Number.parseInt(String(argv[index + 1] || '10000').trim(), 10) || 10000;
      index += 1;
      continue;
    }

    if (token.startsWith('--timeout=')) {
      options.timeoutMs = Number.parseInt(String(token.slice('--timeout='.length)).trim(), 10) || 10000;
      continue;
    }

    if (token === '--report') {
      options.reportPath = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (token.startsWith('--report=')) {
      options.reportPath = String(token.slice('--report='.length)).trim();
      continue;
    }

    if (token.startsWith('-')) {
      throw new Error(`Unknown option: ${token}`);
    }

    if (!options.inputPath) options.inputPath = String(token || '').trim();
  }

  options.inputPath = options.inputPath ? path.resolve(options.inputPath) : '';
  options.reportPath = options.reportPath ? path.resolve(options.reportPath) : '';
  if (!Number.isFinite(options.limit) || options.limit < 0) options.limit = 0;
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) options.timeoutMs = 10000;
  return options;
}

function extractCasNumbers(rawText) {
  const matches = String(rawText || '').match(/\b\d{2,7}-\d{2}-\d\b/g) || [];
  const deduped = new Set();
  matches.forEach((candidate) => {
    const normalized = normalizeCasNumber(candidate);
    if (normalized) deduped.add(normalized);
  });
  return Array.from(deduped).sort((left, right) => left.localeCompare(right));
}

function loadCasNumbersFromFile(filePath) {
  const rawText = fs.readFileSync(filePath, 'utf8');
  return extractCasNumbers(rawText);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  if (!options.inputPath) {
    printUsage();
    throw new Error('Missing required --input path.');
  }

  if (!fs.existsSync(options.inputPath)) {
    throw new Error(`Input file not found: ${options.inputPath}`);
  }

  const casNumbers = loadCasNumbersFromFile(options.inputPath);
  if (!casNumbers.length) {
    throw new Error('No valid CAS numbers were found in the input file.');
  }

  const targets = options.limit > 0 ? casNumbers.slice(0, options.limit) : casNumbers;
  const casService = createCasService({
    snapshotPaths: [paths.CAS_INDEX_PATH, paths.CAS_INDEX_MASTER_PATH, paths.CAS_INDEX_EXTENDED_PATH],
    writeThroughPath: paths.CAS_INDEX_EXTENDED_PATH,
    allowRemoteLookup: true,
    remoteLookupTimeoutMs: options.timeoutMs,
    logger: console,
  });

  let foundCount = 0;
  const missing = [];

  for (let index = 0; index < targets.length; index += 1) {
    const casNumber = targets[index];
    const record = await casService.lookup(casNumber);
    if (record) {
      foundCount += 1;
    } else {
      missing.push(casNumber);
    }

    if ((index + 1) % 25 === 0 || index + 1 === targets.length) {
      console.log(`Progress: ${index + 1}/${targets.length} processed`);
    }
  }

  const report = {
    input_path: options.inputPath,
    processed: targets.length,
    found: foundCount,
    missing_count: missing.length,
    missing,
    generated_at: new Date().toISOString(),
  };

  console.log(`CAS seed completed from ${options.inputPath}`);
  console.log(`Processed: ${report.processed}`);
  console.log(`Found: ${report.found}`);
  console.log(`Missing: ${report.missing_count}`);

  if (options.reportPath) {
    fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
    fs.writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`Report written: ${options.reportPath}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to seed CAS list', error && error.message ? error.message : error);
    process.exit(1);
  });
}
