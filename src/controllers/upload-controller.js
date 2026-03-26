const multer = require('multer');
const path = require('path');
const { uploadFileData } = require('../services/file-service');
const { validatePath } = require('../utils/path-validator');
const { notifyAdd } = require('../utils/embedding-notifier');
const { decodeFilename } = require('../utils/filename-decoder');

/**
 * Configure multer for file uploads
 * Returns middleware that creates multer instance per-request using runtime config
 */
function configureUpload() {
  return (req, res, next) => {
    try {
      const cfg = (req && req.app && req.app.locals && req.app.locals.config) || {};
      const maxUploadMB = (typeof cfg.maxUploadMB === 'number' ? cfg.maxUploadMB : 10);
      const storage = multer.memoryStorage();

      const upload = multer({
        storage,
        limits: {
          fileSize: maxUploadMB * 1024 * 1024
        }
      });

      // Call the single-file handler
      return upload.single('file')(req, res, (err) => {
        if (err) return next(err);
        if (req.file) {
          req.file.originalname = decodeFilename(req.file.originalname);
        }
        next();
      });
    } catch (e) {
      return next(e);
    }
  };
}

/**
 * Upload file handler (Express wrapper)
 */
async function uploadFile(req, res, next) {
  try {
    const { config, logger } = req.app.locals;
    const userPath = req.query.path || '/';
    const file = req.file;

    if (!file) {
      const error = new Error('PAYLOAD_TOO_LARGE: No file uploaded');
      error.code = 'PAYLOAD_TOO_LARGE';
      throw error;
    }

    const result = await uploadFileData(config, logger, userPath, file.buffer, file.originalname);

    // Embedding notification (fire-and-forget)
    const { chatbotService } = req.app.locals;
    if (result.type === 'file') {
      const targetDir = validatePath(config.docsRoot, userPath || '/');
      notifyAdd(chatbotService, logger, path.join(targetDir, file.originalname));
    } else if (result.type === 'zip' && result.extraction?.details?.extracted) {
      const targetDir = validatePath(config.docsRoot, userPath || '/');
      for (const entry of result.extraction.details.extracted) {
        notifyAdd(chatbotService, logger, path.join(targetDir, entry.name));
      }
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  configureUpload,
  uploadFile
};
