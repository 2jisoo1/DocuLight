/**
 * Admin File Controller
 * Phase 3: Admin API Implementation
 *
 * Handles file content operations: read, save, create, delete
 */
const fileService = require('../../services/file-service');
const path = require('path');
const fs = require('fs').promises;
const { validatePath } = require('../../utils/path-validator');

/**
 * Get file content with metadata
 * GET /api/admin/content
 *
 * Query Parameters:
 *   - path: File path (required)
 *
 * Response:
 *   { success: true, path, content, encoding, size, modifiedAt }
 */
async function getContent(req, res, next) {
  try {
    const { path: filePath } = req.query;
    const config = req.app.locals.config;
    const logger = req.app.locals.logger;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PATH',
          message: 'Path is required'
        }
      });
    }

    const result = await fileService.getContentWithMeta(config, logger, filePath);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    if (error.code === 'INVALID_PATH') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PATH',
          message: error.message
        }
      });
    }

    if (error.code === 'NOT_FOUND' || error.code === 'ENOENT') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'File not found'
        }
      });
    }

    if (error.code === 'PATH_VIOLATION') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access to path denied'
        }
      });
    }

    next(error);
  }
}

/**
 * Save file content
 * PUT /api/admin/content
 *
 * Request Body:
 *   - path: File path (required)
 *   - content: File content (required)
 *   - originalModifiedAt: Original modification timestamp for conflict detection (optional)
 *
 * Response:
 *   { success: true, path, size, modifiedAt }
 */
async function saveContent(req, res, next) {
  try {
    const { path: filePath, content, originalModifiedAt } = req.body;
    const config = req.app.locals.config;
    const logger = req.app.locals.logger;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PATH',
          message: 'Path is required'
        }
      });
    }

    if (content === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CONTENT',
          message: 'Content is required'
        }
      });
    }

    const result = await fileService.saveContent(config, logger, filePath, content, originalModifiedAt);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    if (error.code === 'CONFLICT') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: error.message,
          serverModifiedAt: error.serverModifiedAt
        }
      });
    }

    if (error.code === 'PATH_VIOLATION') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access to path denied'
        }
      });
    }

    next(error);
  }
}

/**
 * Create file or directory
 * POST /api/admin/create
 *
 * Request Body:
 *   - path: Entry path (required)
 *   - type: 'file' or 'directory' (required)
 *   - content: Initial content for file (optional, default: '')
 *
 * Response:
 *   { success: true, path, type }
 */
async function createEntry(req, res, next) {
  try {
    const { path: entryPath, type, content } = req.body;
    const config = req.app.locals.config;
    const logger = req.app.locals.logger;

    if (!entryPath) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PATH',
          message: 'Path is required'
        }
      });
    }

    if (!type) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TYPE',
          message: 'Type is required'
        }
      });
    }

    if (type !== 'file' && type !== 'directory') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TYPE',
          message: 'Type must be "file" or "directory"'
        }
      });
    }

    let result;
    if (type === 'file') {
      result = await fileService.createFile(config, logger, entryPath, content || '');
    } else {
      result = await fileService.createDirectory(config, logger, entryPath);
    }

    res.status(201).json({
      success: true,
      ...result
    });
  } catch (error) {
    if (error.code === 'ALREADY_EXISTS') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'ALREADY_EXISTS',
          message: error.message
        }
      });
    }

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Parent directory does not exist'
        }
      });
    }

    if (error.code === 'PATH_VIOLATION') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access to path denied'
        }
      });
    }

    next(error);
  }
}

/**
 * Delete one or more entries
 * DELETE /api/admin/entry
 *
 * Request Body:
 *   - paths: Array of paths to delete (required)
 *
 * Response:
 *   { success: true, deleted: [...] }
 */
async function deleteEntry(req, res, next) {
  try {
    const { paths } = req.body;
    const config = req.app.locals.config;
    const logger = req.app.locals.logger;

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PATHS',
          message: 'Paths array is required and must not be empty'
        }
      });
    }

    const deleted = [];
    const errors = [];

    for (const p of paths) {
      try {
        await fileService.deleteEntryData(config, logger, p);
        deleted.push(p);
      } catch (err) {
        // Record errors but continue with other deletions
        if (err.code === 'NOT_FOUND' || err.code === 'ENOENT') {
          // Path doesn't exist - treat as "already deleted", don't add to errors
          deleted.push(p);
        } else {
          errors.push({
            path: p,
            error: err.message
          });
        }
      }
    }

    res.json({
      success: errors.length === 0,
      deleted,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    if (error.code === 'PATH_VIOLATION') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access to path denied'
        }
      });
    }

    next(error);
  }
}

/**
 * Get raw file content (binary safe)
 * GET /api/admin/file
 *
 * Query Parameters:
 *   - path: File path (required)
 *
 * Response:
 *   Raw file content with appropriate Content-Type header
 */
async function getRawFile(req, res, next) {
  try {
    const { path: filePath } = req.query;
    const config = req.app.locals.config;
    const logger = req.app.locals.logger;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PATH',
          message: 'Path is required'
        }
      });
    }

    const absolutePath = validatePath(config.docsRoot, filePath);
    const stats = await fs.stat(absolutePath);

    if (stats.isDirectory()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PATH',
          message: 'Cannot read directory as file'
        }
      });
    }

    // Determine MIME type based on extension
    const ext = path.extname(absolutePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.ico': 'image/x-icon',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.html': 'text/html'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';

    logger.info('Raw file served', {
      path: filePath,
      contentType,
      size: stats.size
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);

    // Read and send file
    const content = await fs.readFile(absolutePath);
    res.send(content);
  } catch (error) {
    if (error.code === 'PATH_VIOLATION') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access to path denied'
        }
      });
    }

    if (error.code === 'ENOENT') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'File not found'
        }
      });
    }

    next(error);
  }
}

module.exports = {
  getContent,
  saveContent,
  createEntry,
  deleteEntry,
  getRawFile
};
