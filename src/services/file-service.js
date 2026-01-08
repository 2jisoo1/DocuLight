const fs = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');
const { validatePath, isWithinRoot } = require('../utils/path-validator');
const lockManager = require('../utils/lock-manager');
const { parseFrontmatter } = require('./frontmatter-service');

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

/**
 * Get file content with metadata (Admin API)
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string} userPath - User-provided file path
 * @returns {Promise<Object>} File content with metadata
 */
async function getContentWithMeta(config, logger, userPath) {
  if (!userPath) {
    const error = new Error('PATH_TRAVERSAL: Path parameter is required');
    error.code = 'PATH_TRAVERSAL';
    throw error;
  }

  const absolutePath = validatePath(config.docsRoot, userPath);
  const stats = await fs.stat(absolutePath);

  if (stats.isDirectory()) {
    const error = new Error('INVALID_PATH: Cannot read directory as file');
    error.code = 'INVALID_PATH';
    throw error;
  }

  const rawContent = await fs.readFile(absolutePath, 'utf-8');

  // Frontmatter 파싱 (md 파일만)
  let content = rawContent;
  let metadata = {};
  if (userPath.endsWith('.md')) {
    const parsed = parseFrontmatter(rawContent);
    content = parsed.content;
    metadata = {
      name: parsed.name || null,
      description: parsed.description || null
    };
  }

  logger.info('File content retrieved with metadata', {
    path: userPath,
    size: stats.size,
    hasFrontmatter: Object.keys(metadata).some(k => metadata[k] !== null)
  });

  return {
    path: userPath,
    content,
    metadata,
    encoding: 'utf-8',
    size: stats.size,
    modifiedAt: stats.mtime.toISOString()
  };
}

/**
 * Save content to file with conflict detection (Admin API)
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string} userPath - User-provided file path
 * @param {string} content - Content to save
 * @param {string} originalModifiedAt - Original modification timestamp for conflict detection
 * @returns {Promise<Object>} Save result with new metadata
 */
async function saveContent(config, logger, userPath, content, originalModifiedAt) {
  if (!userPath) {
    const error = new Error('PATH_TRAVERSAL: Path parameter is required');
    error.code = 'PATH_TRAVERSAL';
    throw error;
  }

  const absolutePath = validatePath(config.docsRoot, userPath);

  // Check if file exists
  try {
    const stats = await fs.stat(absolutePath);

    // Conflict detection
    if (originalModifiedAt) {
      const serverModifiedAt = stats.mtime.toISOString();

      if (new Date(serverModifiedAt) > new Date(originalModifiedAt)) {
        const error = new Error('CONFLICT: File was modified by another user');
        error.code = 'CONFLICT';
        error.serverModifiedAt = serverModifiedAt;
        throw error;
      }
    }
  } catch (err) {
    // Re-throw conflict errors
    if (err.code === 'CONFLICT') {
      throw err;
    }
    // File doesn't exist - that's ok for new files
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  // Acquire lock and save
  return await lockManager.acquire(absolutePath, async () => {
    await fs.writeFile(absolutePath, content, 'utf-8');
    const newStats = await fs.stat(absolutePath);

    logger.info('File content saved', {
      path: userPath,
      size: newStats.size
    });

    return {
      path: userPath,
      size: newStats.size,
      modifiedAt: newStats.mtime.toISOString()
    };
  });
}

/**
 * Create a new file (Admin API)
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string} userPath - User-provided file path
 * @param {string} content - Initial content (default: empty)
 * @returns {Promise<Object>} Creation result
 */
async function createFile(config, logger, userPath, content = '') {
  if (!userPath) {
    const error = new Error('PATH_TRAVERSAL: Path parameter is required');
    error.code = 'PATH_TRAVERSAL';
    throw error;
  }

  const absolutePath = validatePath(config.docsRoot, userPath);

  // Check if already exists
  try {
    await fs.access(absolutePath);
    const error = new Error('ALREADY_EXISTS: File already exists');
    error.code = 'ALREADY_EXISTS';
    throw error;
  } catch (err) {
    if (err.code === 'ALREADY_EXISTS') {
      throw err;
    }
    // ENOENT is expected - file doesn't exist
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  // Check parent directory exists
  const parentDir = path.dirname(absolutePath);
  try {
    await fs.access(parentDir);
  } catch {
    const error = new Error('NOT_FOUND: Parent directory does not exist');
    error.code = 'NOT_FOUND';
    throw error;
  }

  await fs.writeFile(absolutePath, content, 'utf-8');

  logger.info('File created', {
    path: userPath,
    size: content.length
  });

  return {
    path: userPath,
    type: 'file'
  };
}

/**
 * Create a new directory (Admin API)
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string} userPath - User-provided directory path
 * @returns {Promise<Object>} Creation result
 */
async function createDirectory(config, logger, userPath) {
  if (!userPath) {
    const error = new Error('PATH_TRAVERSAL: Path parameter is required');
    error.code = 'PATH_TRAVERSAL';
    throw error;
  }

  const absolutePath = validatePath(config.docsRoot, userPath);

  // Check if already exists
  try {
    await fs.access(absolutePath);
    const error = new Error('ALREADY_EXISTS: Directory already exists');
    error.code = 'ALREADY_EXISTS';
    throw error;
  } catch (err) {
    if (err.code === 'ALREADY_EXISTS') {
      throw err;
    }
    // ENOENT is expected - directory doesn't exist
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  // Check parent directory exists
  const parentDir = path.dirname(absolutePath);
  try {
    await fs.access(parentDir);
  } catch {
    const error = new Error('NOT_FOUND: Parent directory does not exist');
    error.code = 'NOT_FOUND';
    throw error;
  }

  await fs.mkdir(absolutePath);

  logger.info('Directory created', {
    path: userPath
  });

  return {
    path: userPath,
    type: 'directory'
  };
}

/**
 * Rename file or directory (Admin API)
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string} oldPath - Current path
 * @param {string} newName - New name (just the name, not full path)
 * @returns {Promise<Object>} Rename result
 */
async function renameEntry(config, logger, oldPath, newName) {
  if (!oldPath || !newName) {
    const error = new Error('PATH_TRAVERSAL: oldPath and newName are required');
    error.code = 'PATH_TRAVERSAL';
    throw error;
  }

  // Validate filename characters (Windows-compatible)
  if (/[<>:"|?*\x00-\x1f]/.test(newName) || newName.includes('/') || newName.includes('\\')) {
    const error = new Error('INVALID_NAME: Filename contains invalid characters');
    error.code = 'INVALID_NAME';
    throw error;
  }

  // Prevent hidden files
  if (newName.startsWith('.')) {
    const error = new Error('INVALID_NAME: Filename cannot start with a dot');
    error.code = 'INVALID_NAME';
    throw error;
  }

  const absoluteOldPath = validatePath(config.docsRoot, oldPath);
  const parentDir = path.dirname(absoluteOldPath);
  const absoluteNewPath = path.join(parentDir, newName);

  // Check source exists
  try {
    await fs.access(absoluteOldPath);
  } catch {
    const error = new Error('NOT_FOUND: Source path does not exist');
    error.code = 'NOT_FOUND';
    throw error;
  }

  // Check target doesn't exist
  try {
    await fs.access(absoluteNewPath);
    const error = new Error('ALREADY_EXISTS: Target name already exists');
    error.code = 'ALREADY_EXISTS';
    throw error;
  } catch (err) {
    if (err.code === 'ALREADY_EXISTS') {
      throw err;
    }
    // ENOENT is expected - target doesn't exist
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  await lockManager.acquire(absoluteOldPath, async () => {
    await fs.rename(absoluteOldPath, absoluteNewPath);
  });

  const newUserPath = path.posix.join(path.dirname(oldPath).replace(/\\/g, '/'), newName);

  logger.info('Entry renamed', {
    oldPath,
    newPath: newUserPath
  });

  return {
    oldPath,
    newPath: newUserPath
  };
}

/**
 * Move multiple entries to target directory (Admin API)
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string[]} sourcePaths - Array of source paths
 * @param {string} targetDirectory - Target directory path
 * @returns {Promise<Object>} Move results
 */
async function moveEntries(config, logger, sourcePaths, targetDirectory) {
  if (!sourcePaths || !Array.isArray(sourcePaths) || sourcePaths.length === 0) {
    const error = new Error('INVALID_PARAMS: sourcePaths must be a non-empty array');
    error.code = 'INVALID_PARAMS';
    throw error;
  }

  if (!targetDirectory) {
    const error = new Error('INVALID_PARAMS: targetDirectory is required');
    error.code = 'INVALID_PARAMS';
    throw error;
  }

  const absoluteTargetDir = validatePath(config.docsRoot, targetDirectory);

  // Check target is a directory
  try {
    const targetStats = await fs.stat(absoluteTargetDir);
    if (!targetStats.isDirectory()) {
      const error = new Error('INVALID_TARGET: Target must be a directory');
      error.code = 'INVALID_TARGET';
      throw error;
    }
  } catch (err) {
    if (err.code === 'INVALID_TARGET') {
      throw err;
    }
    const error = new Error('NOT_FOUND: Target directory does not exist');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const results = {
    moved: [],
    errors: []
  };

  for (const sourcePath of sourcePaths) {
    try {
      const absoluteSourcePath = validatePath(config.docsRoot, sourcePath);
      const fileName = path.basename(absoluteSourcePath);
      const absoluteDestPath = path.join(absoluteTargetDir, fileName);

      // Check source exists
      await fs.access(absoluteSourcePath);

      // Prevent moving into self (for directories)
      const normalizedSourcePath = path.normalize(absoluteSourcePath).toLowerCase();
      const normalizedDestPath = path.normalize(absoluteDestPath).toLowerCase();

      if (normalizedDestPath.startsWith(normalizedSourcePath + path.sep)) {
        const error = new Error('INVALID_MOVE: Cannot move directory into itself');
        error.code = 'INVALID_MOVE';
        throw error;
      }

      // Check destination doesn't already exist
      try {
        await fs.access(absoluteDestPath);
        const error = new Error('ALREADY_EXISTS: Destination already exists');
        error.code = 'ALREADY_EXISTS';
        throw error;
      } catch (err) {
        if (err.code === 'ALREADY_EXISTS') {
          throw err;
        }
        // ENOENT is expected
      }

      await lockManager.acquire(absoluteSourcePath, async () => {
        await fs.rename(absoluteSourcePath, absoluteDestPath);
      });

      const newPath = path.posix.join(targetDirectory.replace(/\\/g, '/'), fileName);
      results.moved.push({
        from: sourcePath,
        to: newPath
      });

      logger.info('Entry moved', {
        from: sourcePath,
        to: newPath
      });
    } catch (err) {
      results.errors.push({
        path: sourcePath,
        error: err.message
      });

      logger.warn('Entry move failed', {
        path: sourcePath,
        error: err.message
      });
    }
  }

  return results;
}

/**
 * Copy multiple entries to target directory (Admin API)
 * @param {Object} config - Application configuration
 * @param {Object} logger - Logger instance
 * @param {string[]} sourcePaths - Array of source paths
 * @param {string} targetDirectory - Target directory path
 * @returns {Promise<Object>} Copy results
 */
async function copyEntries(config, logger, sourcePaths, targetDirectory) {
  if (!sourcePaths || !Array.isArray(sourcePaths) || sourcePaths.length === 0) {
    const error = new Error('INVALID_PARAMS: sourcePaths must be a non-empty array');
    error.code = 'INVALID_PARAMS';
    throw error;
  }

  if (!targetDirectory) {
    const error = new Error('INVALID_PARAMS: targetDirectory is required');
    error.code = 'INVALID_PARAMS';
    throw error;
  }

  const absoluteTargetDir = validatePath(config.docsRoot, targetDirectory);

  // Check target is a directory
  try {
    const targetStats = await fs.stat(absoluteTargetDir);
    if (!targetStats.isDirectory()) {
      const error = new Error('INVALID_TARGET: Target must be a directory');
      error.code = 'INVALID_TARGET';
      throw error;
    }
  } catch (err) {
    if (err.code === 'INVALID_TARGET') {
      throw err;
    }
    const error = new Error('NOT_FOUND: Target directory does not exist');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const results = {
    copied: [],
    errors: []
  };

  for (const sourcePath of sourcePaths) {
    try {
      const absoluteSourcePath = validatePath(config.docsRoot, sourcePath);
      const fileName = path.basename(absoluteSourcePath);
      let absoluteDestPath = path.join(absoluteTargetDir, fileName);

      // Check source exists
      const sourceStats = await fs.stat(absoluteSourcePath);

      // Prevent copying into self (for directories)
      const normalizedSourcePath = path.normalize(absoluteSourcePath).toLowerCase();
      const normalizedDestPath = path.normalize(absoluteDestPath).toLowerCase();

      if (normalizedDestPath.startsWith(normalizedSourcePath + path.sep)) {
        const error = new Error('INVALID_COPY: Cannot copy directory into itself');
        error.code = 'INVALID_COPY';
        throw error;
      }

      // Handle name collision - generate unique name
      let destFileName = fileName;
      let counter = 1;
      while (true) {
        try {
          await fs.access(absoluteDestPath);
          // File exists, generate new name
          const ext = path.extname(fileName);
          const baseName = path.basename(fileName, ext);
          destFileName = `${baseName} (${counter})${ext}`;
          absoluteDestPath = path.join(absoluteTargetDir, destFileName);
          counter++;
        } catch {
          // File doesn't exist, use this name
          break;
        }
      }

      // Copy file or directory
      if (sourceStats.isDirectory()) {
        await copyDirectoryRecursive(absoluteSourcePath, absoluteDestPath);
      } else {
        await fs.copyFile(absoluteSourcePath, absoluteDestPath);
      }

      const newPath = path.posix.join(targetDirectory.replace(/\\/g, '/'), destFileName);
      results.copied.push({
        from: sourcePath,
        to: newPath
      });

      logger.info('Entry copied', {
        from: sourcePath,
        to: newPath
      });
    } catch (err) {
      results.errors.push({
        path: sourcePath,
        error: err.message
      });

      logger.warn('Entry copy failed', {
        path: sourcePath,
        error: err.message
      });
    }
  }

  return results;
}

/**
 * Recursively copy a directory
 * @param {string} src - Source directory path
 * @param {string} dest - Destination directory path
 */
async function copyDirectoryRecursive(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

module.exports = {
  getRawContent,
  uploadFileData,
  deleteEntryData,
  getContentWithMeta,
  saveContent,
  createFile,
  createDirectory,
  renameEntry,
  moveEntries,
  copyEntries
};
