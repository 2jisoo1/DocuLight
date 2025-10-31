const multer = require('multer');
const { uploadFileData } = require('../routes/api-ctrl');

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
      return upload.single('file')(req, res, next);
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
    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  configureUpload,
  uploadFile
};
