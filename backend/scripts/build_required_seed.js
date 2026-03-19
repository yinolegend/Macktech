const fs = require('fs');
const path = require('path');

const paths = require('../../config/paths');
const { normalizeCasNumber } = require('../services/casService');

function parseArgs(argv) {
  const options = {
    auditPath: path.join(paths.DATA_DIR, 'cas_required_audit_before.json'),
    outputPath: path.join(paths.DATA_DIR, 'cas_required_seed.json'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--audit' || token === '-a') {
      options.auditPath = String(argv[i + 1] || '').trim() || options.auditPath;
      i += 1;
      continue;
    }

    if (token.startsWith('--audit=')) {
      options.auditPath = String(token.slice('--audit='.length)).trim() || options.auditPath;
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

    options.auditPath = token;
  }

  options.auditPath = path.resolve(options.auditPath);
  options.outputPath = path.resolve(options.outputPath);
  return options;
}

function printUsage() {
  console.log('Usage:');
  console.log('  node backend/scripts/build_required_seed.js [--audit <before-audit.json>] [--output <seed.json>]');
}

function readMissingCasFromAudit(auditPath) {
  const raw = fs.readFileSync(auditPath, 'utf8');
  const parsed = JSON.parse(raw);

  const missing = parsed
    && parsed.merged
    && parsed.merged.coverage
    && Array.isArray(parsed.merged.coverage.missing)
    ? parsed.merged.coverage.missing
    : [];

  return Array.from(new Set(missing
    .map((cas) => normalizeCasNumber(cas))
    .filter(Boolean)))
    .sort((left, right) => left.localeCompare(right));
}

function createDefaultRecord(casNumber) {
  return {
    cas_number: casNumber,
    name: `CAS ${casNumber}`,
    primary_class: '0',
    division: '0',
    hazard_dna: ['non_hazardous'],
    ghs_auto_symbols: ['non_hazardous'],
    hazard_status: 'non_hazardous',
    risk: {
      environment: false,
      health: false,
    },
    flags: {
      corrosive: false,
      flammable: false,
      oxidizing: false,
      gas: false,
      toxic: false,
      irritant: false,
      explosive: false,
    },
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  if (!fs.existsSync(options.auditPath)) {
    throw new Error(`Audit file not found: ${options.auditPath}`);
  }

  const missingCas = readMissingCasFromAudit(options.auditPath);
  const records = missingCas.map(createDefaultRecord);

  const output = {
    dataset: {
      name: 'Required CAS Seed Pack',
      source: 'User required CAS list',
      provider: 'Operations',
      version: new Date().toISOString().slice(0, 10),
      generated_at: new Date().toISOString(),
      record_count: records.length,
      notes: 'Default non-hazardous placeholders to guarantee offline CAS presence with class/division labels.',
      seed_origin_audit: options.auditPath,
    },
    records,
  };

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.writeFileSync(options.outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`Seed records generated: ${records.length}`);
  console.log(`Seed file written: ${options.outputPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Failed to build required CAS seed', error && error.message ? error.message : error);
    process.exit(1);
  }
}
