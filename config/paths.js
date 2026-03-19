const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const FRONTEND_PAGES_DIR = path.join(FRONTEND_DIR, 'pages');
const FRONTEND_COMPONENTS_DIR = path.join(FRONTEND_DIR, 'components');
const FRONTEND_SCRIPTS_DIR = path.join(FRONTEND_DIR, 'scripts');
const FRONTEND_STYLES_DIR = path.join(FRONTEND_DIR, 'styles');
const FRONTEND_ASSETS_DIR = path.join(FRONTEND_DIR, 'assets');
const FRONTEND_VENDOR_DIR = path.join(FRONTEND_ASSETS_DIR, 'vendor');
const FRONTEND_ICONS_DIR = path.join(FRONTEND_ASSETS_DIR, 'icons');
const LEGACY_FRONTEND_ICONS_DIR = path.join(FRONTEND_DIR, 'icons');

const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const LEGACY_PUBLIC_DIR = path.join(BACKEND_DIR, 'public');
const LEGACY_PDF_HANDBOOK_DIR = path.join(LEGACY_PUBLIC_DIR, 'PDF handbook');
const LEGACY_ANNOUNCEMENTS_PATH = path.join(LEGACY_PUBLIC_DIR, 'announcements.json');
const LEGACY_ANNOUNCEMENT_FILES_DIR = path.join(LEGACY_PUBLIC_DIR, 'announcements_files');
const LEGACY_MAP_ASSETS_DIR = path.join(LEGACY_PUBLIC_DIR, 'map_assets');
const LEGACY_STYLES_DIR = path.join(LEGACY_PUBLIC_DIR, 'css');
const LEGACY_PUBLIC_JS_DIR = path.join(LEGACY_PUBLIC_DIR, 'js');
const LEGACY_PUBLIC_SDS_DIR = path.join(LEGACY_PUBLIC_DIR, 'sds');
const LEGACY_PUBLIC_CERTS_DIR = path.join(LEGACY_PUBLIC_DIR, 'certs');
const LEGACY_VENDOR_DIR = path.join(LEGACY_PUBLIC_DIR, 'vendor');
const LEGACY_ICONS_DIR = path.join(LEGACY_PUBLIC_DIR, 'icons');

const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const APP_DB_PATH = path.join(DATA_DIR, 'app.db');
const HAZMAT_DB_PATH = path.join(DATA_DIR, 'hazmat.db');
const GAGES_DB_PATH = path.join(DATA_DIR, 'gages.db');
const DEBUG_LAB_DB_PATH = path.join(DATA_DIR, 'debug_lab.sqlite');
const CAS_INDEX_PATH = path.join(DATA_DIR, 'cas_index_ncbi.json');
const CAS_INDEX_MASTER_PATH = path.join(DATA_DIR, 'cas_index_master.json');
const CAS_INDEX_EXTENDED_PATH = path.join(DATA_DIR, 'cas_index_extended.json');
const HANDBOOK_DIR = path.join(UPLOADS_DIR, 'handbook');
const ANNOUNCEMENT_FILES_DIR = path.join(UPLOADS_DIR, 'announcements');
const MAP_ASSETS_DIR = path.join(UPLOADS_DIR, 'maps');
const CALIBRATION_ATTACHMENTS_DIR = path.join(UPLOADS_DIR, 'calibration');
const SDS_UPLOADS_DIR = path.join(UPLOADS_DIR, 'sds');
const HAZMAT_IMAGE_UPLOADS_DIR = path.join(UPLOADS_DIR, 'hazmat-images');
const CERT_UPLOADS_DIR = path.join(UPLOADS_DIR, 'certs');
const LEGACY_DATA_HANDBOOK_DIR = path.join(DATA_DIR, 'handbook');
const LEGACY_DATA_ANNOUNCEMENT_FILES_DIR = path.join(DATA_DIR, 'announcements_files');
const LEGACY_DATA_MAP_ASSETS_DIR = path.join(DATA_DIR, 'map_assets');
const LEGACY_DATA_CALIBRATION_ATTACHMENTS_DIR = path.join(DATA_DIR, 'calibration_attachments');
const ANNOUNCEMENTS_PATH = path.join(DATA_DIR, 'announcements.json');
const HANDBOOK_VISIBILITY_PATH = path.join(DATA_DIR, 'handbook_visibility.json');
const HANDBOOK_METADATA_PATH = path.join(DATA_DIR, 'handbook_metadata.json');
const FACILITY_MAP_PATH = path.join(DATA_DIR, 'facility_map.json');
const FACILITY_MAP_STORE_PATH = path.join(DATA_DIR, 'facility_maps.json');

const BACKUPS_DIR = path.join(ROOT_DIR, 'backups');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

module.exports = {
  ROOT_DIR,
  FRONTEND_DIR,
  FRONTEND_PAGES_DIR,
  FRONTEND_COMPONENTS_DIR,
  FRONTEND_SCRIPTS_DIR,
  FRONTEND_STYLES_DIR,
  FRONTEND_ASSETS_DIR,
  FRONTEND_VENDOR_DIR,
  FRONTEND_ICONS_DIR,
  LEGACY_FRONTEND_ICONS_DIR,
  BACKEND_DIR,
  LEGACY_PUBLIC_DIR,
  LEGACY_PDF_HANDBOOK_DIR,
  LEGACY_ANNOUNCEMENTS_PATH,
  LEGACY_ANNOUNCEMENT_FILES_DIR,
  LEGACY_MAP_ASSETS_DIR,
  LEGACY_STYLES_DIR,
  LEGACY_PUBLIC_JS_DIR,
  LEGACY_PUBLIC_SDS_DIR,
  LEGACY_PUBLIC_CERTS_DIR,
  LEGACY_VENDOR_DIR,
  LEGACY_ICONS_DIR,
  DATA_DIR,
  UPLOADS_DIR,
  APP_DB_PATH,
  HAZMAT_DB_PATH,
  GAGES_DB_PATH,
  DEBUG_LAB_DB_PATH,
  CAS_INDEX_PATH,
  CAS_INDEX_MASTER_PATH,
  CAS_INDEX_EXTENDED_PATH,
  HANDBOOK_DIR,
  ANNOUNCEMENT_FILES_DIR,
  MAP_ASSETS_DIR,
  CALIBRATION_ATTACHMENTS_DIR,
  SDS_UPLOADS_DIR,
  HAZMAT_IMAGE_UPLOADS_DIR,
  CERT_UPLOADS_DIR,
  LEGACY_DATA_HANDBOOK_DIR,
  LEGACY_DATA_ANNOUNCEMENT_FILES_DIR,
  LEGACY_DATA_MAP_ASSETS_DIR,
  LEGACY_DATA_CALIBRATION_ATTACHMENTS_DIR,
  ANNOUNCEMENTS_PATH,
  HANDBOOK_VISIBILITY_PATH,
  HANDBOOK_METADATA_PATH,
  FACILITY_MAP_PATH,
  FACILITY_MAP_STORE_PATH,
  BACKUPS_DIR,
  DOCS_DIR,
};
