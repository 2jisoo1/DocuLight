const fs = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');
const { validatePath, isWithinRoot } = require('../utils/path-validator');
const lockManager = require('../utils/lock-manager');

/**
 * File Service - File operations (read, upload, delete)
 */

/**
 * Read raw markdown file content
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string} userPath - User-provided file path
 * @returns {Promise<string>} File content
 */
async function getRawContent(config, logger, userPath) {
  if (!userPath) {
    const error = new Error('PATH_TRAVERSAL: Path parameter is required');
    error.code = 'PATH_TRAVERSAL';
    throw error;
  }

  // Validate path
  const absolutePath = validatePath(config.docsRoot, userPath);

  // Check if file exists
  const stats = await fs.stat(absolutePath);
  if (!stats.isFile()) {
    const error = new Error('NOT_FOUND: Path is not a file');
    error.code = 'NOT_FOUND';
    throw error;
  }

  // Check if file is markdown
  const ext = path.extname(absolutePath).toLowerCase();
  if (ext !== '.md') {
    const error = new Error('UNSUPPORTED_TYPE: Only .md files are supported');
    error.code = 'UNSUPPORTED_TYPE';
    throw error;
  }

  // Read file content
  const content = await fs.readFile(absolutePath, 'utf-8');

  logger.info('Raw file accessed', {
    path: userPath,
    size: content.length
  });

  return content;
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

  const zip = new AdmZip(zipBuffer);
  const zipEntries = zip.getEntries();

  logger.info('ZIP extraction started', {
    targetDir,
    totalEntries: zipEntries.length
  });

  for (const entry of zipEntries) {
    const entryName = entry.entryName;

    // Skip directory entries
    if (entry.isDirectory) {
      continue;
    }

    // Security check: prevent path traversal
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
}

/**
 * Upload file or extract ZIP
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string} userPath - Target directory path
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} filename - Original filename
 * @returns {Promise<Object>} Upload result
 */
async function uploadFileData(config, logger, userPath, fileBuffer, filename) {
  // Validate path
  const targetDir = validatePath(config.docsRoot, userPath || '/');

  // Ensure target directory exists
  await fs.mkdir(targetDir, { recursive: true });

  // Determine file path
  const filePath = path.join(targetDir, filename);

  // Acquire lock for this directory
  return await lockManager.acquire(targetDir, async () => {
    // Handle ZIP files
    if (path.extname(filename).toLowerCase() === '.zip') {
      const extractResults = await extractZipFile(
        fileBuffer,
        targetDir,
        config,
        logger
      );

      return {
        success: true,
        type: 'zip',
        filename,
        size: fileBuffer.length,
        path: userPath,
        extraction: {
          extracted: extractResults.extracted.length,
          skipped: extractResults.skipped.length,
          errors: extractResults.errors.length,
          details: extractResults
        }
      };
    } else {
      // Save regular file (overwrite if exists)
      await fs.writeFile(filePath, fileBuffer);
      logger.info('File uploaded', {
        path: userPath,
        filename,
        size: fileBuffer.length
      });

      return {
        success: true,
        type: 'file',
        filename,
        size: fileBuffer.length,
        path: userPath
      };
    }
  });
}

/**
 * Delete file or directory
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string} userPath - Path to delete
 * @returns {Promise<Object>} Deletion result
 */
async function deleteEntryData(config, logger, userPath) {
  if (!userPath) {
    const error = new Error('PATH_TRAVERSAL: Path parameter is required');
    error.code = 'PATH_TRAVERSAL';
    throw error;
  }

  // Validate path
  const absolutePath = validatePath(config.docsRoot, userPath);

  // Check if path exists
  try {
    await fs.access(absolutePath);
  } catch {
    const error = new Error('NOT_FOUND: Path does not exist');
    error.code = 'NOT_FOUND';
    throw error;
  }

  // Acquire lock and delete
  await lockManager.acquire(absolutePath, async () => {
    const maxRetries = 2;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Recursive delete with force option
        await fs.rm(absolutePath, { recursive: true, force: true });

        logger.info('Entry deleted', {
          path: userPath,
          attempt: attempt + 1
        });

        return;
      } catch (error) {
        lastError = error;

        // If file is busy, retry
        if (error.code === 'EBUSY' && attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        throw error;
      }
    }

    // If we get here, all retries failed
    if (lastError) {
      const error = new Error('FILE_BUSY: File is in use and cannot be deleted');
      error.code = 'FILE_BUSY';
      throw error;
    }
  });

  return {
    success: true,
    path: userPath,
    message: 'Entry deleted successfully'
  };
}

module.exports = {
  getRawContent,
  uploadFileData,
  deleteEntryData
};
