const fs = require('fs');
const path = require('path');

const paths = require('../../config/paths');
const { normalizeCasRecord } = require('../services/casService');

function parseArgs(argv) {
  const options = {
    inputPath: paths.CAS_INDEX_MASTER_PATH,
    outputDir: path.join(paths.DATA_DIR, 'cas_segments'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--input' || token === '-i') {
      options.inputPath = String(argv[index + 1] || '').trim() || options.inputPath;
      index += 1;
      continue;
    }

    if (token.startsWith('--input=')) {
      options.inputPath = String(token.slice('--input='.length)).trim() || options.inputPath;
      continue;
    }

    if (token === '--output-dir' || token === '-o') {
      options.outputDir = String(argv[index + 1] || '').trim() || options.outputDir;
      index += 1;
      continue;
    }

    if (token.startsWith('--output-dir=')) {
      options.outputDir = String(token.slice('--output-dir='.length)).trim() || options.outputDir;
      continue;
    }

    if (token === '--help' || token === '-h') {
      options.help = true;
      continue;
    }

    if (token.startsWith('-')) {
      throw new Error(`Unknown option: ${token}`);
    }

    options.inputPath = String(token || '').trim() || options.inputPath;
  }

  options.inputPath = path.resolve(options.inputPath);
  options.outputDir = path.resolve(options.outputDir);
  return options;
}

function printUsage() {
  console.log('Usage:');
  console.log('  node backend/scripts/split_cas_master_segments.js [--input <master.json>] [--output-dir <directory>]');
  console.log('');
  console.log('Defaults:');
  console.log(`  --input      ${paths.CAS_INDEX_MASTER_PATH}`);
  console.log(`  --output-dir ${path.join(paths.DATA_DIR, 'cas_segments')}`);
}

function sanitizeDivisionToken(value) {
  const token = String(value || '').trim();
  if (!token) return '0';
  return token.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || '0';
}

function readSnapshot(filePath) {
  const rawText = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(rawText);
  const dataset = parsed && typeof parsed.dataset === 'object' ? parsed.dataset : {};
  const rawRecords = Array.isArray(parsed && parsed.records) ? parsed.records : [];

  const records = rawRecords
    .map(normalizeCasRecord)
    .filter(Boolean)
    .sort((left, right) => left.cas_number.localeCompare(right.cas_number));

  return { dataset, records };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function buildSegmentDataset(baseDataset, options, recordCount, notes) {
  const nowIso = new Date().toISOString();
  return {
    name: String(baseDataset.name || 'Master Offline CAS Index'),
    source: String(baseDataset.source || 'Aggregated CAS source'),
    provider: String(baseDataset.provider || 'Operations'),
    version: String(baseDataset.version || nowIso.slice(0, 10)),
    generated_at: nowIso,
    record_count: recordCount,
    notes,
    segmented_from: options.inputPath,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  if (!fs.existsSync(options.inputPath)) {
    throw new Error(`Input snapshot not found: ${options.inputPath}`);
  }

  const { dataset, records } = readSnapshot(options.inputPath);
  if (!records.length) {
    throw new Error('Input snapshot has no normalized records to segment.');
  }

  const byClass = new Map();
  const byDivision = new Map();

  records.forEach((record) => {
    const primaryClass = String(record.primary_class || '0').trim() || '0';
    const division = String(record.division || '0').trim() || '0';

    if (!byClass.has(primaryClass)) byClass.set(primaryClass, []);
    if (!byDivision.has(division)) byDivision.set(division, []);

    byClass.get(primaryClass).push(record);
    byDivision.get(division).push(record);
  });

  const indexPayload = {
    dataset: {
      ...buildSegmentDataset(
        dataset,
        options,
        records.length,
        'Segment index generated from master CAS snapshot by primary_class and division.'
      ),
      total_primary_classes: byClass.size,
      total_divisions: byDivision.size,
    },
    classes: [],
    divisions: [],
  };

  Array.from(byClass.entries())
    .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))
    .forEach(([classCode, classRecords]) => {
      const outputPath = path.join(options.outputDir, `cas_primary_class_${classCode}.json`);
      const payload = {
        dataset: buildSegmentDataset(
          dataset,
          options,
          classRecords.length,
          `Primary class ${classCode} records generated from master snapshot.`
        ),
        filters: {
          primary_class: classCode,
        },
        records: classRecords,
      };
      writeJson(outputPath, payload);

      indexPayload.classes.push({
        primary_class: classCode,
        record_count: classRecords.length,
        file: path.relative(paths.ROOT_DIR, outputPath).replace(/\\/g, '/'),
      });
    });

  Array.from(byDivision.entries())
    .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))
    .forEach(([division, divisionRecords]) => {
      const token = sanitizeDivisionToken(division);
      const outputPath = path.join(options.outputDir, `cas_division_${token}.json`);
      const payload = {
        dataset: buildSegmentDataset(
          dataset,
          options,
          divisionRecords.length,
          `Division ${division} records generated from master snapshot.`
        ),
        filters: {
          division,
        },
        records: divisionRecords,
      };
      writeJson(outputPath, payload);

      indexPayload.divisions.push({
        division,
        record_count: divisionRecords.length,
        file: path.relative(paths.ROOT_DIR, outputPath).replace(/\\/g, '/'),
      });
    });

  writeJson(path.join(options.outputDir, 'index.json'), indexPayload);

  console.log(`CAS segmentation complete from: ${options.inputPath}`);
  console.log(`Output directory: ${options.outputDir}`);
  console.log(`Total records: ${records.length}`);
  console.log(`Primary class files: ${indexPayload.classes.length}`);
  console.log(`Division files: ${indexPayload.divisions.length}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Failed to split CAS master segments', error && error.message ? error.message : error);
    process.exit(1);
  }
}
