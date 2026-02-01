/**
 * Admin Upload Controller
 * Handles file uploads via drag-and-drop in Admin mode
 */
const multer = require('multer');
const path = require('path');
const { uploadFileData } = require('../../services/file-service');
const { validatePath } = require('../../utils/path-validator');
const { notifyAdd } = require('../../utils/embedding-notifier');

/**
 * Configure multer for multiple file uploads
 * Returns middleware that creates multer instance per-request using runtime config
 */
function configureMultiUpload() {
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

      // Handle multiple files with field name 'files'
      return upload.array('files', 50)(req, res, next);
    } catch (e) {
      return next(e);
    }
  };
}

/**
 * Upload multiple files handler
 * POST /api/admin/upload?path=/target/directory
 *
 * Request:
 *   - Content-Type: multipart/form-data
 *   - Field: files (multiple files)
 *   - Query: path (target directory, default: /)
 *
 * Response:
 *   { success: true, results: [...], errors: [...] }
 */
async function uploadFiles(req, res, next) {
  try {
    const { config, logger, chatbotService } = req.app.locals;
    const targetPath = req.query.path || '/';
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILES',
          message: 'No files provided'
        }
      });
    }

    const results = [];
    const errors = [];

    // Process each file
    for (const file of files) {
      try {
        const result = await uploadFileData(
          config,
          logger,
          targetPath,
          file.buffer,
          file.originalname
        );

        // Embedding notification (fire-and-forget)
        if (result.type === 'file') {
          const targetDir = validatePath(config.docsRoot, targetPath);
          notifyAdd(chatbotService, logger, path.join(targetDir, file.originalname));
        } else if (result.type === 'zip' && result.extraction?.details?.extracted) {
          const targetDir = validatePath(config.docsRoot, targetPath);
          for (const entry of result.extraction.details.extracted) {
            notifyAdd(chatbotService, logger, path.join(targetDir, entry.name));
          }
        }

        results.push({
          success: true,
          filename: file.originalname,
          size: file.size,
          path: targetPath,
          ...result
        });
      } catch (err) {
        logger.error('File upload failed', {
          filename: file.originalname,
          error: err.message
        });
        errors.push({
          filename: file.originalname,
          error: err.message
        });
      }
    }

    res.json({
      success: errors.length === 0,
      results,
      errors
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  configureMultiUpload,
  uploadFiles
};
