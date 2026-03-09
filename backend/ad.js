// Simple AD/LDAP helper. Config via environment variables:
// AD_URL, AD_BIND_DN, AD_BIND_PW, AD_BASE_DN
// Returns user info for a given sAMAccountName (username).
const ldap = require('ldapjs');

const AD_URL = process.env.AD_URL;
const AD_BIND_DN = process.env.AD_BIND_DN;
const AD_BIND_PW = process.env.AD_BIND_PW;
const AD_BASE_DN = process.env.AD_BASE_DN;

function configured() {
  return !!(AD_URL && AD_BIND_DN && AD_BIND_PW && AD_BASE_DN);
}

async function lookupUserBySamAccountName(sam) {
  if (!configured()) return null;
  const client = ldap.createClient({ url: AD_URL });
  // Promisify bind and search
  function bind() {
    return new Promise((resolve, reject) => {
      client.bind(AD_BIND_DN, AD_BIND_PW, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  function search() {
    return new Promise((resolve, reject) => {
      const opts = {
        scope: 'sub',
        filter: `(&(objectClass=user)(sAMAccountName=${sam}))`,
        attributes: ['sAMAccountName', 'displayName', 'mail', 'userPrincipalName']
      };
      const entries = [];
      client.search(AD_BASE_DN, opts, (err, res) => {
        if (err) return reject(err);
        res.on('searchEntry', (entry) => entries.push(entry.object));
        res.on('error', (e) => reject(e));
        res.on('end', () => resolve(entries));
      });
    });
  }

  try {
    await bind();
    const entries = await search();
    client.unbind();
    if (!entries || entries.length === 0) return null;
    const e = entries[0];
    return {
      username: e.sAMAccountName,
      displayName: e.displayName || e.userPrincipalName || e.sAMAccountName,
      email: e.mail || e.userPrincipalName || null
    };
  } catch (err) {
    try { client.unbind(); } catch (e) {}
    console.error('AD lookup error', err && err.message ? err.message : err);
    return null;
  }
}

module.exports = { configured, lookupUserBySamAccountName };
// Search AD for users matching a query (displayName or sAMAccountName). Returns an array.
async function searchUsers(query, limit = 50) {
  if (!configured()) return [];
  const client = ldap.createClient({ url: AD_URL });
  function bind() {
    return new Promise((resolve, reject) => {
      client.bind(AD_BIND_DN, AD_BIND_PW, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
  function search() {
    return new Promise((resolve, reject) => {
      const q = query ? `*${query}*` : '*';
      const opts = {
        scope: 'sub',
        filter: `(&(objectClass=user)(|(displayName=${q})(sAMAccountName=${q})))`,
        attributes: ['sAMAccountName', 'displayName', 'mail', 'userPrincipalName'],
        sizeLimit: limit
      };
      const entries = [];
      client.search(AD_BASE_DN, opts, (err, res) => {
        if (err) return reject(err);
        res.on('searchEntry', (entry) => entries.push(entry.object));
        res.on('error', (e) => reject(e));
        res.on('end', () => resolve(entries));
      });
    });
  }

  try {
    await bind();
    const entries = await search();
    client.unbind();
    if (!entries || entries.length === 0) return [];
    return entries.map(e => ({
      username: e.sAMAccountName,
      displayName: e.displayName || e.userPrincipalName || e.sAMAccountName,
      email: e.mail || e.userPrincipalName || null
    }));
  } catch (err) {
    try { client.unbind(); } catch (e) {}
    console.error('AD search error', err && err.message ? err.message : err);
    return [];
  }
}

module.exports = { configured, lookupUserBySamAccountName, searchUsers };
