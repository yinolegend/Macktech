const multer = require('multer');
const {
  ANNOUNCEMENT_FILES_DIR,
  MAP_ASSETS_DIR,
  HANDBOOK_DIR,
  CALIBRATION_ATTACHMENTS_DIR,
  SDS_UPLOADS_DIR,
  HAZMAT_IMAGE_UPLOADS_DIR,
} = require('../../config/paths');

function sanitizeUploadName(originalName, fallbackName) {
  return String(originalName || fallbackName)
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '');
}

const announcementStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ANNOUNCEMENT_FILES_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${sanitizeUploadName(file.originalname, 'upload')}`),
});

const mapAssetStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MAP_ASSETS_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${sanitizeUploadName(file.originalname, 'map_image')}`),
});

const handbookStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, HANDBOOK_DIR),
  filename: (req, file, cb) => cb(null, sanitizeUploadName(file.originalname, 'handbook.pdf')),
});

const calibrationAttachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CALIBRATION_ATTACHMENTS_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${sanitizeUploadName(file.originalname, 'calibration_attachment')}`),
});

const hazmatSdsStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, SDS_UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${sanitizeUploadName(file.originalname, 'hazmat_sds.pdf')}`),
});

const hazmatImageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, HAZMAT_IMAGE_UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${sanitizeUploadName(file.originalname, 'hazmat_image')}`),
});

function allowCalibrationAttachment(file) {
  const mime = String(file && file.mimetype ? file.mimetype : '').toLowerCase();
  const extension = String(file && file.originalname ? file.originalname : '').toLowerCase().split('.').pop();
  const allowedExtensions = new Set(['pdf', 'doc', 'jpg', 'jpeg', 'png']);
  const allowedMimes = new Set([
    'application/pdf',
    'application/msword',
    'image/jpeg',
    'image/png',
  ]);
  return allowedExtensions.has(extension) || allowedMimes.has(mime);
}

function allowPdfOnly(file) {
  const mime = String(file && file.mimetype ? file.mimetype : '').toLowerCase();
  const extension = String(file && file.originalname ? file.originalname : '').toLowerCase().split('.').pop();
  return extension === 'pdf' || mime === 'application/pdf';
}

function allowImageOnly(file) {
  const mime = String(file && file.mimetype ? file.mimetype : '').toLowerCase();
  return mime.startsWith('image/');
}

const announcementUpload = multer({ storage: announcementStorage });
const mapAssetUpload = multer({
  storage: mapAssetStorage,
  fileFilter: (req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) return cb(null, true);
    return cb(new Error('Only image files are allowed'));
  },
});
const handbookUpload = multer({
  storage: handbookStorage,
  fileFilter: (req, file, cb) => {
    if (!String(file.originalname || '').toLowerCase().endsWith('.pdf')) {
      return cb(new Error('Only PDF files are allowed'));
    }
    return cb(null, true);
  },
});

const calibrationAttachmentUpload = multer({
  storage: calibrationAttachmentStorage,
  fileFilter: (req, file, cb) => {
    if (!allowCalibrationAttachment(file)) {
      return cb(new Error('Only PDF, DOC, JPG, and PNG files are allowed'));
    }
    return cb(null, true);
  },
});

const hazmatSdsUpload = multer({
  storage: hazmatSdsStorage,
  fileFilter: (req, file, cb) => {
    if (!allowPdfOnly(file)) {
      return cb(new Error('Only PDF files are allowed'));
    }
    return cb(null, true);
  },
});

const hazmatImageUpload = multer({
  storage: hazmatImageStorage,
  fileFilter: (req, file, cb) => {
    if (!allowImageOnly(file)) {
      return cb(new Error('Only image files are allowed'));
    }
    return cb(null, true);
  },
});

module.exports = {
  announcementUpload,
  mapAssetUpload,
  handbookUpload,
  calibrationAttachmentUpload,
  hazmatSdsUpload,
  hazmatImageUpload,
};
