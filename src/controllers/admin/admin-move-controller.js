/**
 * Admin Move Controller
 * Phase 3: Admin API Implementation
 *
 * Handles rename and move operations
 */
const fileService = require('../../services/file-service');

/**
 * Rename file or directory
 * PUT /api/admin/rename
 *
 * Request Body:
 *   - oldPath: Current path (required)
 *   - newName: New name (required, just filename, not full path)
 *
 * Response:
 *   { success: true, oldPath, newPath }
 */
async function renameEntry(req, res, next) {
  try {
    const { oldPath, newName } = req.body;
    const config = req.app.locals.config;
    const logger = req.app.locals.logger;

    if (!oldPath) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PATH',
          message: 'oldPath is required'
        }
      });
    }

    if (!newName) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_NAME',
          message: 'newName is required'
        }
      });
    }

    const result = await fileService.renameEntry(config, logger, oldPath, newName);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    if (error.code === 'INVALID_NAME') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_NAME',
          message: error.message
        }
      });
    }

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Source path does not exist'
        }
      });
    }

    if (error.code === 'ALREADY_EXISTS') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'ALREADY_EXISTS',
          message: error.message
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
 * Move multiple entries to target directory
 * PUT /api/admin/move
 *
 * Request Body:
 *   - sourcePaths: Array of source paths (required)
 *   - targetDirectory: Target directory path (required)
 *
 * Response:
 *   { success: true, moved: [...], errors: [...] }
 */
async function moveEntries(req, res, next) {
  try {
    const { sourcePaths, targetDirectory } = req.body;
    const config = req.app.locals.config;
    const logger = req.app.locals.logger;

    if (!sourcePaths || !Array.isArray(sourcePaths) || sourcePaths.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PATHS',
          message: 'sourcePaths array is required and must not be empty'
        }
      });
    }

    if (!targetDirectory) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TARGET',
          message: 'targetDirectory is required'
        }
      });
    }

    const result = await fileService.moveEntries(config, logger, sourcePaths, targetDirectory);

    res.json({
      success: result.errors.length === 0,
      ...result
    });
  } catch (error) {
    if (error.code === 'INVALID_TARGET') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TARGET',
          message: error.message
        }
      });
    }

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Target directory does not exist'
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
 * Copy multiple entries to target directory
 * POST /api/admin/copy
 *
 * Request Body:
 *   - sourcePaths: Array of source paths (required)
 *   - targetDirectory: Target directory path (required)
 *
 * Response:
 *   { success: true, copied: [...], errors: [...] }
 */
async function copyEntries(req, res, next) {
  try {
    const { sourcePaths, targetDirectory } = req.body;
    const config = req.app.locals.config;
    const logger = req.app.locals.logger;

    if (!sourcePaths || !Array.isArray(sourcePaths) || sourcePaths.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PATHS',
          message: 'sourcePaths array is required and must not be empty'
        }
      });
    }

    if (!targetDirectory) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TARGET',
          message: 'targetDirectory is required'
        }
      });
    }

    const result = await fileService.copyEntries(config, logger, sourcePaths, targetDirectory);

    res.json({
      success: result.errors.length === 0,
      ...result
    });
  } catch (error) {
    if (error.code === 'INVALID_TARGET') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TARGET',
          message: error.message
        }
      });
    }

    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Target directory does not exist'
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

module.exports = {
  renameEntry,
  moveEntries,
  copyEntries
};
