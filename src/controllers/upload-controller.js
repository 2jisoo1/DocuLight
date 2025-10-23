const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const AdmZip = require('adm-zip');
const { validatePath, isWithinRoot } = require('../utils/path-validator');
const lockManager = require('../utils/lock-manager');

/**
 * Configure multer for file uploads
 */
function configureUpload(config) {
  const storage = multer.memoryStorage();

  return multer({
    storage,
    limits: {
      fileSize: config.maxUploadMB * 1024 * 1024
    }
  });
}

/**
 * Extract ZIP file with security checks
 * @param {Buffer} zipBuffer - ZIP file buffer
 * @param {string} targetDir - Target directory for extraction
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object>} Extraction results
 */
async function extractZipFile(zipBuffer, targetDir, config, logger) {
  const results = {
    extracted: [],
    skipped: [],
    errors: []
  };

  try {
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();

    logger.info('ZIP extraction started', {
      targetDir,
      totalEntries: zipEntries.length
    });

    for (const entry of zipEntries) {
      const entryName = entry.entryName;

      // Skip directory entries (they're created automatically)
      if (entry.isDirectory) {
        continue;
      }

      // Security check: prevent path traversal
      // Check for ../ or absolute paths
      if (entryName.includes('..') || path.isAbsolute(entryName)) {
        logger.warn('ZIP entry blocked: path traversal attempt', {
          entryName,
          reason: 'Contains .. or absolute path'
        });
        results.skipped.push({
          name: entryName,
          reason: 'Path traversal attempt'
        });
        continue;
      }

      // Construct target path
      const extractPath = path.join(targetDir, entryName);

      // Double-check that resolved path is within target directory
      if (!isWithinRoot(targetDir, extractPath)) {
        logger.warn('ZIP entry blocked: outside target directory', {
          entryName,
          extractPath
        });
        results.skipped.push({
          name: entryName,
          reason: 'Outside target directory'
        });
        continue;
      }

      try {
        // Ensure parent directory exists
        const parentDir = path.dirname(extractPath);
        await fs.mkdir(parentDir, { recursive: true });

        // Extract file
        const fileContent = entry.getData();
        await fs.writeFile(extractPath, fileContent);

        results.extracted.push({
          name: entryName,
          size: entry.header.size
        });

        logger.debug('ZIP entry extracted', {
          entryName,
          extractPath,
          size: entry.header.size
        });
      } catch (error) {
        logger.error('ZIP entry extraction failed', {
          entryName,
          error: error.message
        });
        results.errors.push({
          name: entryName,
          error: error.message
        });
      }
    }

    logger.info('ZIP extraction completed', {
      targetDir,
      extracted: results.extracted.length,
      skipped: results.skipped.length,
      errors: results.errors.length
    });

    return results;
  } catch (error) {
    logger.error('ZIP extraction failed', {
      targetDir,
      error: error.message
    });
    throw error;
  }
}

/**
 * Upload file handler
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

    // Validate path
    const targetDir = validatePath(config.docsRoot, userPath);

    // Ensure target directory exists
    await fs.mkdir(targetDir, { recursive: true });

    // Determine file path
    const filePath = path.join(targetDir, file.originalname);

    // Acquire lock for this directory
    await lockManager.acquire(targetDir, async () => {
      // Handle ZIP files
      if (path.extname(file.originalname).toLowerCase() === '.zip') {
        // Extract ZIP file
        const extractResults = await extractZipFile(
          file.buffer,
          targetDir,
          config,
          logger
        );

        // Return extraction results
        return res.json({
          success: true,
          type: 'zip',
          filename: file.originalname,
          size: file.size,
          path: userPath,
          extraction: {
            extracted: extractResults.extracted.length,
            skipped: extractResults.skipped.length,
            errors: extractResults.errors.length,
            details: extractResults
          }
        });
      } else {
        // Save regular file (overwrite if exists)
        await fs.writeFile(filePath, file.buffer);
        logger.info('File uploaded', {
          path: userPath,
          filename: file.originalname,
          size: file.size
        });

        return res.json({
          success: true,
          type: 'file',
          filename: file.originalname,
          size: file.size,
          path: userPath
        });
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  configureUpload,
  uploadFile
};
