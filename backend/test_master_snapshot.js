const path = require('path');
const paths = require('../config/paths');
const { createCasService } = require('./services/casService');

async function test() {
  console.log('Testing CAS Master Snapshot Lookups\n');
  console.log('Snapshot paths:');
  console.log('  Base NCBI:', paths.CAS_INDEX_PATH);
  console.log('  Master:', paths.CAS_INDEX_MASTER_PATH);
  console.log('  Extended:', paths.CAS_INDEX_EXTENDED_PATH);
  console.log('');

  const casService = createCasService({
    snapshotPaths: [paths.CAS_INDEX_PATH, paths.CAS_INDEX_MASTER_PATH, paths.CAS_INDEX_EXTENDED_PATH],
    writeThroughPath: paths.CAS_INDEX_EXTENDED_PATH,
    allowRemoteLookup: false, // Offline only
    logger: console,
  });

  // Test chemicals from master snapshot
  const testCases = [
    { cas: '67-63-0', name: 'Isopropyl Alcohol (Solvent)' },
    { cas: '7647-01-0', name: 'Hydrochloric Acid (Etchant)' },
    { cas: '7440-31-5', name: 'Tin (Solder)' },
    { cas: '64-17-5', name: 'Ethanol (Cleaner)' },
    { cas: '77-92-9', name: 'Citric Acid (Etchant/Cleaner)' },
    { cas: '108-88-3', name: 'Toluene (PCB Solvent)' },
    { cas: '999-99-9', name: 'Unknown CAS (should fail offline)' },
  ];

  console.log('Lookup Results (Offline Mode - CAS_REMOTE_LOOKUP=false):\n');

  for (const test of testCases) {
    const record = await casService.lookup(test.cas);
    if (record) {
      console.log(`✓ ${test.cas} - ${test.name}`);
      console.log(`  Name: ${record.name}`);
      console.log(`  Primary Class: ${record.primary_class}`);
      console.log(`  Division: ${record.division}`);
      console.log(`  Hazard DNA: [${record.hazard_dna ? record.hazard_dna.join(', ') : 'none'}]`);
      console.log(`  Source: ${record.source}`);
    } else {
      console.log(`✗ ${test.cas} - ${test.name} [NOT FOUND]`);
    }
    console.log('');
  }
}

test().catch(console.error);
