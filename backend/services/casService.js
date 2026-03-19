const fs = require('fs');
const path = require('path');
const https = require('https');

const KNOWN_HAZARD_SYMBOLS = new Set([
  'explosive',
  'flammable',
  'oxidizing',
  'gas_cylinder',
  'corrosive',
  'toxic',
  'health_hazard',
  'exclamation_mark',
  'environmental_hazard',
  'non_hazardous',
]);

const MATERIAL_CLASS_RULES = [
  { symbol: 'explosive', classCode: '1', division: '1.1' },
  { symbol: 'flammable', classCode: '2', division: '3' },
  { symbol: 'oxidizing', classCode: '3', division: '5.1' },
  { symbol: 'gas_cylinder', classCode: '4', division: '2.2' },
  { symbol: 'corrosive', classCode: '5', division: '8' },
  { symbol: 'toxic', classCode: '6', division: '6.1' },
  { symbol: 'health_hazard', classCode: '7', division: '6.2' },
  { symbol: 'exclamation_mark', classCode: '8', division: '9' },
  { symbol: 'environmental_hazard', classCode: '9', division: '9.1' },
];

const PUBCHEM_PROPERTY_BASE_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name';
const PUBCHEM_GHS_BASE_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound';

function normalizeCasNumber(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const compact = text.replace(/\s+/g, '');
  const match = compact.match(/^(\d{2,7})-(\d{2})-(\d)$/);
  if (!match) return '';
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeSymbol(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function normalizeSymbols(value) {
  let source;
  if (Array.isArray(value)) {
    source = value;
  } else {
    const raw = String(value || '').trim();
    if (!raw) return [];

    if (raw.startsWith('[')) {
      try {
        return normalizeSymbols(JSON.parse(raw));
      } catch (error) {
      }
    }

    source = raw
      .split(/[;,|]/)
      .map((entry) => entry.trim());
  }

  return Array.from(new Set(source
    .map(normalizeSymbol)
    .filter((symbol) => KNOWN_HAZARD_SYMBOLS.has(symbol))));
}

function normalizePrimaryClass(value, fallback = '') {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return fallback;
  const compact = text.startsWith('C') ? text.slice(1) : text;
  const match = compact.match(/[0-9]/);
  return match ? match[0] : fallback;
}

function normalizeDivision(value) {
  const text = String(value || '').trim();
  return text || '';
}

function normalizeListLimit(value, fallback = 200, max = 5000) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeListOffset(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function defaultDivisionForClass(primaryClass) {
  const classCode = normalizePrimaryClass(primaryClass);
  if (!classCode) return '';
  if (classCode === '0') return '0';
  const rule = MATERIAL_CLASS_RULES.find((entry) => entry.classCode === classCode);
  return rule ? rule.division : '';
}

function deriveClassDivisionFromSymbols(symbols) {
  const normalized = normalizeSymbols(symbols);
  if (!normalized.length) {
    return { primary_class: '0', division: '0' };
  }

  const symbolSet = new Set(normalized);
  const hasNonHazardous = symbolSet.has('non_hazardous');
  const hasOtherHazards = normalized.some((symbol) => symbol !== 'non_hazardous');

  if (hasNonHazardous && !hasOtherHazards) {
    return { primary_class: '0', division: '0' };
  }

  for (const rule of MATERIAL_CLASS_RULES) {
    if (symbolSet.has(rule.symbol)) {
      return { primary_class: rule.classCode, division: rule.division };
    }
  }

  return { primary_class: '0', division: '0' };
}

function normalizeHazardDna(value, options = {}) {
  const fallbackSymbols = normalizeSymbols(options.fallbackSymbols);
  const primaryClass = normalizePrimaryClass(options.primaryClass, '');
  const hazardStatus = String(options.hazardStatus || '').trim().toLowerCase();

  let hazardDna = normalizeSymbols(value);
  if (!hazardDna.length) {
    hazardDna = fallbackSymbols;
  }

  const hasNonHazardous = hazardDna.includes('non_hazardous');
  const hasOtherHazards = hazardDna.some((symbol) => symbol !== 'non_hazardous');
  if (hasNonHazardous && hasOtherHazards) {
    hazardDna = hazardDna.filter((symbol) => symbol !== 'non_hazardous');
  }

  if (!hazardDna.length && (hazardStatus === 'non_hazardous' || primaryClass === '0')) {
    hazardDna = ['non_hazardous'];
  }

  return hazardDna;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const token = String(value || '').trim().toLowerCase();
  return token === 'true' || token === '1' || token === 'yes';
}

function deriveRiskFromSymbols(symbols) {
  const symbolSet = new Set(normalizeSymbols(symbols));
  const healthSignals = ['corrosive', 'toxic', 'health_hazard', 'exclamation_mark'];
  return {
    environment: symbolSet.has('environmental_hazard'),
    health: healthSignals.some((signal) => symbolSet.has(signal)),
  };
}

function deriveFlagsFromSymbols(symbols) {
  const symbolSet = new Set(normalizeSymbols(symbols));
  return {
    corrosive: symbolSet.has('corrosive'),
    flammable: symbolSet.has('flammable'),
    oxidizing: symbolSet.has('oxidizing'),
    gas: symbolSet.has('gas_cylinder'),
    toxic: symbolSet.has('toxic'),
    irritant: symbolSet.has('exclamation_mark'),
    explosive: symbolSet.has('explosive'),
  };
}

function normalizeHazardStatus(value, symbols) {
  const token = String(value || '').trim().toLowerCase();
  if (token === 'classified' || token === 'estimated' || token === 'unknown' || token === 'non_hazardous') {
    return token;
  }

  const normalizedSymbols = normalizeSymbols(symbols);
  if (normalizedSymbols.includes('non_hazardous')) return 'non_hazardous';
  if (!normalizedSymbols.length) return 'non_hazardous';
  return 'classified';
}

function normalizeRecord(raw) {
  const casNumber = normalizeCasNumber(raw && (raw.cas_number || raw.cas || raw.CAS));
  if (!casNumber) return null;

  const name = String((raw && (raw.name || raw.chemical_name || raw.title)) || '').trim();
  const ghsSource = raw && (raw.ghs_auto_symbols || raw.ghs_symbols || raw.ghs || raw.hazards);
  const ghsAutoSymbols = normalizeSymbols(ghsSource);
  const hazardStatus = normalizeHazardStatus(raw && raw.hazard_status, ghsAutoSymbols);
  const derivedClassDivision = deriveClassDivisionFromSymbols(
    ghsAutoSymbols.length ? ghsAutoSymbols : (hazardStatus === 'non_hazardous' ? ['non_hazardous'] : [])
  );
  const primaryClass = normalizePrimaryClass(
    raw && (raw.primary_class || raw.primaryClass || raw.class_code || raw.classCode),
    derivedClassDivision.primary_class || '0'
  );
  const division = normalizeDivision(raw && raw.division)
    || (primaryClass === derivedClassDivision.primary_class
      ? derivedClassDivision.division
      : defaultDivisionForClass(primaryClass))
    || '0';
  const hazardDna = normalizeHazardDna(
    raw && (raw.hazard_dna || raw.hazardDNA || raw.hazard_profile || raw.hazardProfile),
    {
      fallbackSymbols: ghsAutoSymbols,
      hazardStatus,
      primaryClass,
    }
  );

  const rawRisk = raw && raw.risk && typeof raw.risk === 'object' ? raw.risk : {};
  const rawFlags = raw && raw.flags && typeof raw.flags === 'object' ? raw.flags : {};

  const riskSource = ghsAutoSymbols.length
    ? ghsAutoSymbols
    : hazardDna.filter((symbol) => symbol !== 'non_hazardous');
  const derivedRisk = deriveRiskFromSymbols(riskSource);
  const derivedFlags = deriveFlagsFromSymbols(riskSource);

  const risk = {
    environment: rawRisk.environment === undefined ? derivedRisk.environment : normalizeBoolean(rawRisk.environment),
    health: rawRisk.health === undefined ? derivedRisk.health : normalizeBoolean(rawRisk.health),
  };

  const flags = {
    corrosive: rawFlags.corrosive === undefined ? derivedFlags.corrosive : normalizeBoolean(rawFlags.corrosive),
    flammable: rawFlags.flammable === undefined ? derivedFlags.flammable : normalizeBoolean(rawFlags.flammable),
    oxidizing: rawFlags.oxidizing === undefined ? derivedFlags.oxidizing : normalizeBoolean(rawFlags.oxidizing),
    gas: rawFlags.gas === undefined ? derivedFlags.gas : normalizeBoolean(rawFlags.gas),
    toxic: rawFlags.toxic === undefined ? derivedFlags.toxic : normalizeBoolean(rawFlags.toxic),
    irritant: rawFlags.irritant === undefined ? derivedFlags.irritant : normalizeBoolean(rawFlags.irritant),
    explosive: rawFlags.explosive === undefined ? derivedFlags.explosive : normalizeBoolean(rawFlags.explosive),
  };

  return {
    cas_number: casNumber,
    name,
    primary_class: primaryClass,
    division,
    hazard_dna: hazardDna,
    ghs_auto_symbols: ghsAutoSymbols,
    hazard_status: hazardStatus,
    risk,
    flags,
  };
}

function extractHazardSymbolsFromPubChem(payload) {
  const haystack = JSON.stringify(payload || {}).toLowerCase();
  if (!haystack) return [];

  const symbols = new Set();

  if (/(^|[^a-z])explosive([^a-z]|$)|organic peroxide|self-reactive/.test(haystack)) {
    symbols.add('explosive');
  }

  if ((/(^|[^a-z])flammable([^a-z]|$)|combustible/.test(haystack)) && !/(non[-\s]?flammable)/.test(haystack)) {
    symbols.add('flammable');
  }

  if (/(^|[^a-z])oxidiz(er|ing)([^a-z]|$)/.test(haystack)) {
    symbols.add('oxidizing');
  }

  if (/gas under pressure|compressed gas|liquefied gas|dissolved gas/.test(haystack)) {
    symbols.add('gas_cylinder');
  }

  if (/corrosive|causes severe skin burns|serious eye damage/.test(haystack)) {
    symbols.add('corrosive');
  }

  if (/acute toxicity|fatal if|toxic if|may be fatal|poison/.test(haystack)) {
    symbols.add('toxic');
  }

  if (/carcinogenicity|carcinogen|germ cell mutagenicity|mutagenicity|reproductive toxicity|specific target organ toxicity|aspiration hazard|respiratory sensitization/.test(haystack)) {
    symbols.add('health_hazard');
  }

  if (/irritat|skin sensitization|harmful if|drowsiness|narcotic effects|eye irritation|respiratory irritation/.test(haystack)) {
    symbols.add('exclamation_mark');
  }

  if (/aquatic toxicity|aquatic acute|aquatic chronic|hazardous to the aquatic environment|environmental hazard|very toxic to aquatic life/.test(haystack)) {
    symbols.add('environmental_hazard');
  }

  return Array.from(symbols);
}

function fetchJson(url, { timeoutMs = 8000, maxRedirects = 2 } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Macktech-CAS/1.0',
      },
    }, (response) => {
      const statusCode = Number(response.statusCode || 0);
      const redirectLocation = response.headers && response.headers.location;

      if ([301, 302, 303, 307, 308].includes(statusCode) && redirectLocation) {
        response.resume();
        if (maxRedirects <= 0) {
          reject(new Error(`Too many redirects while requesting ${url}`));
          return;
        }

        const nextUrl = new URL(redirectLocation, url).toString();
        resolve(fetchJson(nextUrl, { timeoutMs, maxRedirects: maxRedirects - 1 }));
        return;
      }

      let rawText = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        rawText += chunk;
        if (rawText.length > 5 * 1024 * 1024) {
          request.destroy(new Error('Response payload exceeded 5MB limit'));
        }
      });

      response.on('end', () => {
        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`HTTP ${statusCode} from ${url}`));
          return;
        }

        try {
          resolve(JSON.parse(rawText || '{}'));
        } catch (error) {
          reject(new Error(`Invalid JSON from ${url}`));
        }
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    request.on('error', (error) => {
      reject(error);
    });

    request.end();
  });
}

async function resolveCasViaPubChem(casNumber, { timeoutMs = 8000, logger = console } = {}) {
  const encodedCas = encodeURIComponent(casNumber);
  const propertyUrl = `${PUBCHEM_PROPERTY_BASE_URL}/${encodedCas}/property/Title/JSON`;

  let propertyPayload;
  try {
    propertyPayload = await fetchJson(propertyUrl, { timeoutMs });
  } catch (error) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn(`PubChem property lookup failed for ${casNumber}`, error && error.message ? error.message : error);
    }
    return null;
  }

  const properties = propertyPayload
    && propertyPayload.PropertyTable
    && Array.isArray(propertyPayload.PropertyTable.Properties)
    ? propertyPayload.PropertyTable.Properties
    : [];

  const first = properties[0];
  if (!first) return null;

  const cid = Number(first.CID);
  const title = String(first.Title || '').trim();
  let inferredSymbols = [];

  if (Number.isFinite(cid) && cid > 0) {
    const ghsUrl = `${PUBCHEM_GHS_BASE_URL}/${cid}/JSON?heading=${encodeURIComponent('GHS Classification')}`;
    try {
      const ghsPayload = await fetchJson(ghsUrl, { timeoutMs });
      inferredSymbols = extractHazardSymbolsFromPubChem(ghsPayload);
    } catch (error) {
      if (logger && typeof logger.warn === 'function') {
        logger.warn(`PubChem GHS lookup failed for ${casNumber}`, error && error.message ? error.message : error);
      }
    }
  }

  return normalizeRecord({
    cas_number: casNumber,
    name: title || `CAS ${casNumber}`,
    ghs_auto_symbols: inferredSymbols,
    hazard_status: inferredSymbols.length ? 'estimated' : 'unknown',
  });
}

function defaultMetadata() {
  return {
    name: 'NCBI PubChem Curated CAS Snapshot',
    source: 'National Center for Biotechnology Information (NCBI)',
    provider: 'PubChem',
    version: 'unknown',
    generated_at: null,
    record_count: 0,
    source_files: [],
  };
}

function defaultExtensionSnapshot() {
  return {
    dataset: {
      name: 'Extended Offline CAS Index',
      source: 'Local offline extension',
      provider: 'Operations',
      version: new Date().toISOString().slice(0, 10),
      generated_at: new Date().toISOString(),
      record_count: 0,
      notes: 'Additional CAS records layered on top of the NCBI curated snapshot',
    },
    records: [],
  };
}

function upsertSnapshotRecord(snapshotPath, record) {
  const normalizedRecord = normalizeRecord(record);
  if (!normalizedRecord) return null;

  let snapshot = defaultExtensionSnapshot();
  try {
    if (fs.existsSync(snapshotPath)) {
      const rawText = fs.readFileSync(snapshotPath, 'utf8');
      const parsed = JSON.parse(rawText);
      snapshot = {
        dataset: parsed && typeof parsed.dataset === 'object' ? parsed.dataset : snapshot.dataset,
        records: Array.isArray(parsed && parsed.records) ? parsed.records : [],
      };
    }
  } catch (error) {
    snapshot = defaultExtensionSnapshot();
  }

  const merged = new Map();
  snapshot.records.forEach((entry) => {
    const normalized = normalizeRecord(entry);
    if (!normalized) return;
    merged.set(normalized.cas_number, normalized);
  });
  merged.set(normalizedRecord.cas_number, normalizedRecord);

  const records = Array.from(merged.values()).sort((left, right) => left.cas_number.localeCompare(right.cas_number));
  const nowIso = new Date().toISOString();
  const output = {
    dataset: {
      name: String(snapshot.dataset.name || 'Extended Offline CAS Index'),
      source: String(snapshot.dataset.source || 'Local offline extension'),
      provider: String(snapshot.dataset.provider || 'Operations'),
      version: nowIso.slice(0, 10),
      generated_at: nowIso,
      record_count: records.length,
      notes: String(snapshot.dataset.notes || 'Additional CAS records layered on top of the NCBI curated snapshot'),
    },
    records,
  };

  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  return normalizedRecord;
}

function normalizeSnapshotPaths(snapshotPath, snapshotPaths) {
  const values = [];
  if (snapshotPath) values.push(snapshotPath);
  if (Array.isArray(snapshotPaths)) values.push(...snapshotPaths);

  return Array.from(new Set(values
    .map((value) => String(value || '').trim())
    .filter(Boolean)));
}

function buildSnapshotFingerprint(snapshotPaths) {
  return snapshotPaths
    .map((snapshotPath) => {
      try {
        const stats = fs.statSync(snapshotPath);
        return `${snapshotPath}:${stats.size}:${Math.floor(stats.mtimeMs)}`;
      } catch (error) {
        return `${snapshotPath}:missing`;
      }
    })
    .join('|');
}

function mergeMetadata(loadedFiles, mergedCount) {
  if (!loadedFiles.length) return defaultMetadata();

  const primary = loadedFiles[0].metadata || defaultMetadata();
  const sourceValues = Array.from(new Set(loadedFiles
    .map((entry) => String((entry.metadata && entry.metadata.source) || '').trim())
    .filter(Boolean)));
  const providerValues = Array.from(new Set(loadedFiles
    .map((entry) => String((entry.metadata && entry.metadata.provider) || '').trim())
    .filter(Boolean)));
  const versionValues = Array.from(new Set(loadedFiles
    .map((entry) => String((entry.metadata && entry.metadata.version) || '').trim())
    .filter(Boolean)));
  const generatedValues = loadedFiles
    .map((entry) => entry.metadata && entry.metadata.generated_at)
    .filter(Boolean)
    .sort();

  return {
    name: String(primary.name || 'NCBI PubChem Curated CAS Snapshot'),
    source: sourceValues.join(' + ') || String(primary.source || 'National Center for Biotechnology Information (NCBI)'),
    provider: providerValues.join(' + ') || String(primary.provider || 'PubChem'),
    version: versionValues.join('+') || String(primary.version || 'unknown'),
    generated_at: generatedValues.length ? generatedValues[generatedValues.length - 1] : (primary.generated_at || null),
    record_count: mergedCount,
    source_files: loadedFiles.map((entry) => entry.path),
  };
}

function loadSnapshotFile(snapshotPath) {
  const rawText = fs.readFileSync(snapshotPath, 'utf8');
  const parsed = JSON.parse(rawText);

  const dataset = parsed && typeof parsed.dataset === 'object' ? parsed.dataset : {};
  const records = Array.isArray(parsed && parsed.records) ? parsed.records : [];

  const byCas = new Map();
  records.forEach((record) => {
    const normalized = normalizeRecord(record);
    if (!normalized) return;
    byCas.set(normalized.cas_number, normalized);
  });

  return {
    metadata: {
      name: String(dataset.name || 'NCBI PubChem Curated CAS Snapshot'),
      source: String(dataset.source || 'National Center for Biotechnology Information (NCBI)'),
      provider: String(dataset.provider || 'PubChem'),
      version: String(dataset.version || 'unknown'),
      generated_at: dataset.generated_at || null,
      record_count: byCas.size,
    },
    byCas,
  };
}

function createCasService({
  snapshotPath,
  snapshotPaths,
  logger = console,
  writeThroughPath,
  allowRemoteLookup = true,
  remoteLookupTimeoutMs = 8000,
}) {
  const resolvedSnapshotPaths = normalizeSnapshotPaths(snapshotPath, snapshotPaths);
  const resolvedWriteThroughPath = String(writeThroughPath || '').trim();
  let loaded = false;
  let metadata = defaultMetadata();
  let byCas = new Map();
  let snapshotFingerprint = '';
  let writeQueue = Promise.resolve();

  function formatLookupRecord(record, options = {}) {
    const source = String(options.source || metadata.source || '').trim();
    const datasetVersion = String(options.datasetVersion || metadata.version || '').trim();
    const generatedAt = options.generatedAt || metadata.generated_at || null;
    return {
      ...record,
      source,
      dataset_version: datasetVersion,
      dataset_generated_at: generatedAt,
    };
  }

  function queueSnapshotWrite(record) {
    if (!resolvedWriteThroughPath) return Promise.resolve(null);

    writeQueue = writeQueue
      .then(() => upsertSnapshotRecord(resolvedWriteThroughPath, record))
      .catch((error) => {
        if (logger && typeof logger.warn === 'function') {
          logger.warn(`Failed to persist CAS ${record && record.cas_number ? record.cas_number : 'unknown'}`, error && error.message ? error.message : error);
        }
        return null;
      });

    return writeQueue;
  }

  function loadSnapshot(force = false) {
    const nextFingerprint = buildSnapshotFingerprint(resolvedSnapshotPaths);
    if (loaded && !force && nextFingerprint === snapshotFingerprint) return metadata;

    try {
      const loadedFiles = [];
      const mergedByCas = new Map();

      resolvedSnapshotPaths.forEach((pathValue) => {
        if (!fs.existsSync(pathValue)) return;
        const loadedSnapshot = loadSnapshotFile(pathValue);
        loadedSnapshot.byCas.forEach((record, casNumber) => {
          mergedByCas.set(casNumber, record);
        });
        loadedFiles.push({
          path: pathValue,
          metadata: loadedSnapshot.metadata,
        });
      });

      if (!loadedFiles.length) {
        throw new Error('No CAS snapshot files found.');
      }

      metadata = mergeMetadata(loadedFiles, mergedByCas.size);
      byCas = mergedByCas;
      loaded = true;
      snapshotFingerprint = nextFingerprint;
      if (logger && typeof logger.log === 'function') {
        logger.log(`Loaded CAS snapshot ${metadata.version} with ${metadata.record_count} records from ${metadata.source_files.join(', ')}`);
      }
      return metadata;
    } catch (error) {
      loaded = true;
      metadata = defaultMetadata();
      byCas = new Map();
      snapshotFingerprint = nextFingerprint;
      if (logger && typeof logger.warn === 'function') {
        logger.warn('Failed to load CAS snapshot', error && error.message ? error.message : error);
      }
      return metadata;
    }
  }

  function ensureLoaded() {
    if (!loaded) {
      loadSnapshot(false);
      return;
    }

    const nextFingerprint = buildSnapshotFingerprint(resolvedSnapshotPaths);
    if (nextFingerprint !== snapshotFingerprint) {
      loadSnapshot(true);
    }
  }

  async function lookup(casNumber) {
    ensureLoaded();
    const normalized = normalizeCasNumber(casNumber);
    if (!normalized) return null;

    let record = byCas.get(normalized);
    if (!record) {
      // Retry once from disk so newly updated snapshot files are visible without restart.
      loadSnapshot(true);
      record = byCas.get(normalized);
    }

    if (!record && allowRemoteLookup) {
      const remoteRecord = await resolveCasViaPubChem(normalized, {
        timeoutMs: remoteLookupTimeoutMs,
        logger,
      });

      if (remoteRecord) {
        byCas.set(remoteRecord.cas_number, remoteRecord);
        metadata = {
          ...metadata,
          record_count: byCas.size,
        };

        await queueSnapshotWrite(remoteRecord);

        return formatLookupRecord(remoteRecord, {
          source: 'PubChem live lookup',
          datasetVersion: 'pubchem-live',
          generatedAt: new Date().toISOString(),
        });
      }
    }

    if (!record) return null;
    return formatLookupRecord(record);
  }

  function list(options = {}) {
    ensureLoaded();

    const primaryClassFilter = normalizePrimaryClass(options.primary_class || options.primaryClass, '');
    const divisionFilter = normalizeDivision(options.division);
    const hazardStatusFilter = String(options.hazard_status || options.hazardStatus || '').trim().toLowerCase();
    const searchFilter = String(options.search || options.q || '').trim().toLowerCase();
    const limit = normalizeListLimit(options.limit, 200, 5000);
    const offset = normalizeListOffset(options.offset);

    let records = Array.from(byCas.values());

    if (primaryClassFilter) {
      records = records.filter((record) => normalizePrimaryClass(record.primary_class, '') === primaryClassFilter);
    }

    if (divisionFilter) {
      records = records.filter((record) => normalizeDivision(record.division) === divisionFilter);
    }

    if (hazardStatusFilter) {
      records = records.filter((record) => String(record.hazard_status || '').trim().toLowerCase() === hazardStatusFilter);
    }

    if (searchFilter) {
      records = records.filter((record) => {
        const cas = String(record.cas_number || '').toLowerCase();
        const name = String(record.name || '').toLowerCase();
        return cas.includes(searchFilter) || name.includes(searchFilter);
      });
    }

    records.sort((left, right) => {
      const casDelta = String(left.cas_number || '').localeCompare(String(right.cas_number || ''));
      if (casDelta !== 0) return casDelta;
      return String(left.name || '').localeCompare(String(right.name || ''));
    });

    const total = records.length;
    const sliced = records.slice(offset, offset + limit).map((record) => formatLookupRecord(record));

    return {
      total,
      limit,
      offset,
      records: sliced,
    };
  }

  function getClassSummary() {
    ensureLoaded();

    const classMap = new Map();
    byCas.forEach((record) => {
      const primaryClass = normalizePrimaryClass(record.primary_class, '0') || '0';
      const division = normalizeDivision(record.division)
        || defaultDivisionForClass(primaryClass)
        || '0';

      if (!classMap.has(primaryClass)) {
        classMap.set(primaryClass, {
          primary_class: primaryClass,
          record_count: 0,
          divisions: new Map(),
        });
      }

      const classEntry = classMap.get(primaryClass);
      classEntry.record_count += 1;
      classEntry.divisions.set(division, (classEntry.divisions.get(division) || 0) + 1);
    });

    const class_counts = Array.from(classMap.values())
      .sort((left, right) => left.primary_class.localeCompare(right.primary_class, undefined, { numeric: true }))
      .map((entry) => ({
        primary_class: entry.primary_class,
        record_count: entry.record_count,
        divisions: Array.from(entry.divisions.entries())
          .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))
          .map(([division, recordCount]) => ({
            division,
            record_count: recordCount,
          })),
      }));

    return {
      total_records: byCas.size,
      class_counts,
      dataset_version: metadata.version,
      dataset_generated_at: metadata.generated_at,
      source: metadata.source,
    };
  }

  function getMetadata() {
    ensureLoaded();
    return { ...metadata };
  }

  return {
    loadSnapshot,
    lookup,
    list,
    getClassSummary,
    getMetadata,
    normalizeCasNumber,
  };
}

module.exports = {
  createCasService,
  normalizeCasNumber,
  normalizeCasRecord: normalizeRecord,
};
