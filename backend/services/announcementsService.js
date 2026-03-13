const fs = require('fs');
const path = require('path');
const {
  ANNOUNCEMENTS_PATH,
  ANNOUNCEMENT_FILES_DIR,
} = require('../../config/paths');

function normalizeAnnouncementId(value) {
  if (value === null || typeof value === 'undefined') return null;
  const stringValue = String(value);
  if (stringValue && stringValue.trim() !== '' && !Number.isNaN(Number(stringValue))) {
    return String(Number(stringValue));
  }
  return stringValue;
}

function ensureAnnouncementsFile() {
  if (!fs.existsSync(ANNOUNCEMENTS_PATH)) {
    fs.writeFileSync(ANNOUNCEMENTS_PATH, '[]', 'utf8');
  }
}

function readAnnouncements() {
  ensureAnnouncementsFile();
  try {
    const raw = fs.readFileSync(ANNOUNCEMENTS_PATH, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('failed to read announcements', error && error.message ? error.message : error);
    return [];
  }
}

function writeAnnouncements(announcements) {
  fs.writeFileSync(ANNOUNCEMENTS_PATH, JSON.stringify(Array.isArray(announcements) ? announcements : [], null, 2), 'utf8');
}

function ensureAnnouncementIds(announcements) {
  let mutated = false;
  const list = (Array.isArray(announcements) ? announcements : []).map((announcement, index) => {
    if (!announcement || typeof announcement !== 'object') return announcement;
    if (typeof announcement.id !== 'undefined' && announcement.id !== null && announcement.id !== '') {
      return announcement;
    }
    mutated = true;
    return Object.assign({}, announcement, {
      id: Date.now() + index + Math.floor(Math.random() * 1000),
    });
  });

  return { list, mutated };
}

function extractAnnouncementFileNames(announcement) {
  const refs = new Set();
  if (!announcement) return refs;

  const pushRef = (value) => {
    if (!value || typeof value !== 'string') return;
    const match = value.match(/\/announcements-files\/([^"'\s)<>?#]+)/i);
    if (match && match[1]) {
      try {
        refs.add(decodeURIComponent(match[1]));
      } catch (error) {
        refs.add(match[1]);
      }
    }
  };

  if (typeof announcement.image === 'string') pushRef(announcement.image);
  if (typeof announcement.body === 'string') {
    const regex = /\/announcements-files\/([^"'\s)<>?#]+)/ig;
    let match;
    while ((match = regex.exec(announcement.body)) !== null) {
      try {
        refs.add(decodeURIComponent(match[1]));
      } catch (error) {
        refs.add(match[1]);
      }
    }
  }

  return refs;
}

function cleanupUnusedAnnouncementFiles(currentAnnouncements) {
  try {
    const announcements = Array.isArray(currentAnnouncements) ? currentAnnouncements : readAnnouncements();
    const referenced = new Set();

    for (const announcement of announcements) {
      for (const fileName of extractAnnouncementFileNames(announcement)) {
        referenced.add(fileName);
      }
    }

    if (!fs.existsSync(ANNOUNCEMENT_FILES_DIR)) return;
    const entries = fs.readdirSync(ANNOUNCEMENT_FILES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.startsWith('.')) continue;
      if (referenced.has(entry.name)) continue;

      const target = path.join(ANNOUNCEMENT_FILES_DIR, entry.name);
      try {
        fs.unlinkSync(target);
      } catch (error) {
        console.error('failed to remove announcement file', target, error && error.message ? error.message : error);
      }
    }
  } catch (error) {
    console.error('cleanup announcement files failed', error && error.message ? error.message : error);
  }
}

module.exports = {
  ANNOUNCEMENTS_PATH,
  readAnnouncements,
  writeAnnouncements,
  normalizeAnnouncementId,
  ensureAnnouncementIds,
  extractAnnouncementFileNames,
  cleanupUnusedAnnouncementFiles,
};
