// Simple test to verify CAS lookup works via API
const http = require('http');

function makeRequest(casNumber) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path: `/api/command-center/cas/${casNumber}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function test() {
  console.log('Testing CAS Lookup API\n');
  console.log('Request: GET /api/command-center/cas/77-92-9');
  console.log('(No auth token - testing if endpoint is accessible without auth)\n');

  try {
    const response = await makeRequest('77-92-9');
    console.log(`Status: ${response.status}`);
    console.log(`Headers:`, response.headers);
    console.log(`Body:`, response.body);
    console.log('');
    
    if (response.status === 200) {
      const json = JSON.parse(response.body);
      console.log('✓ SUCCESS - Record found:');
      console.log(`  CAS Number: ${json.cas_number}`);
      console.log(`  Name: ${json.name}`);
      console.log(`  Primary Class: ${json.primary_class}`);
      console.log(`  Division: ${json.division}`);
      console.log(`  Hazard DNA: [${Array.isArray(json.hazard_dna) ? json.hazard_dna.join(', ') : 'N/A'}]`);
    } else {
      console.log(`✗ FAILED - Status ${response.status}: ${response.body}`);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
