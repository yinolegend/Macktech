const fs = require('fs');
const path = require('path');
const paths = require('../../config/paths');

function ensureDir(targetPath) {
  if (fs.existsSync(targetPath)) {
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) return;

    const displacedPath = `${targetPath}.legacy-file`;
    if (!fs.existsSync(displacedPath)) {
      fs.renameSync(targetPath, displacedPath);
    } else {
      fs.unlinkSync(targetPath);
    }
  }

  fs.mkdirSync(targetPath, { recursive: true });
}

function copyFileIfMissing(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) return;
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function copyDirectoryContentsIfMissing(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return;
  ensureDir(targetDir);

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryContentsIfMissing(sourcePath, targetPath);
      continue;
    }
    copyFileIfMissing(sourcePath, targetPath);
  }
}

function copyMatchingFilesIfMissing(sourceDir, targetDir, predicate) {
  if (!fs.existsSync(sourceDir)) return;
  ensureDir(targetDir);

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!predicate(entry.name)) continue;
    copyFileIfMissing(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
  }
}

function initializeWorkspaceStructure() {
  const requiredDirs = [
    paths.FRONTEND_DIR,
    paths.FRONTEND_PAGES_DIR,
    paths.FRONTEND_COMPONENTS_DIR,
    paths.FRONTEND_SCRIPTS_DIR,
    paths.FRONTEND_STYLES_DIR,
    paths.FRONTEND_ASSETS_DIR,
    paths.FRONTEND_VENDOR_DIR,
    paths.FRONTEND_ICONS_DIR,
    paths.DATA_DIR,
    paths.HANDBOOK_DIR,
    paths.ANNOUNCEMENT_FILES_DIR,
    paths.MAP_ASSETS_DIR,
    paths.CALIBRATION_ATTACHMENTS_DIR,
    paths.BACKUPS_DIR,
    paths.DOCS_DIR,
    paths.LEGACY_STYLES_DIR,
    paths.LEGACY_PUBLIC_JS_DIR,
    paths.LEGACY_PUBLIC_SDS_DIR,
    paths.LEGACY_PUBLIC_CERTS_DIR,
  ];

  for (const dir of requiredDirs) {
    ensureDir(dir);
  }

  copyMatchingFilesIfMissing(paths.LEGACY_PUBLIC_DIR, paths.FRONTEND_PAGES_DIR, (fileName) => fileName.toLowerCase().endsWith('.html'));
  copyDirectoryContentsIfMissing(paths.LEGACY_STYLES_DIR, paths.FRONTEND_STYLES_DIR);
  copyDirectoryContentsIfMissing(paths.LEGACY_VENDOR_DIR, paths.FRONTEND_VENDOR_DIR);
  copyDirectoryContentsIfMissing(paths.LEGACY_ICONS_DIR, paths.FRONTEND_ICONS_DIR);
  copyFileIfMissing(path.join(paths.LEGACY_PUBLIC_DIR, 'app.js'), path.join(paths.FRONTEND_SCRIPTS_DIR, 'app.js'));
  copyFileIfMissing(paths.LEGACY_ANNOUNCEMENTS_PATH, paths.ANNOUNCEMENTS_PATH);
  copyDirectoryContentsIfMissing(paths.LEGACY_PDF_HANDBOOK_DIR, paths.HANDBOOK_DIR);
  copyDirectoryContentsIfMissing(paths.LEGACY_ANNOUNCEMENT_FILES_DIR, paths.ANNOUNCEMENT_FILES_DIR);
  copyDirectoryContentsIfMissing(paths.LEGACY_MAP_ASSETS_DIR, paths.MAP_ASSETS_DIR);

  if (!fs.existsSync(paths.ANNOUNCEMENTS_PATH)) {
    fs.writeFileSync(paths.ANNOUNCEMENTS_PATH, '[]', 'utf8');
  }
}

module.exports = {
  ensureDir,
  initializeWorkspaceStructure,
};
