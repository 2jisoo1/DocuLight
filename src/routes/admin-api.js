/**
 * Admin API Router
 * Phase 2-3: Admin Mode Implementation
 *
 * Provides admin authentication, session management, and file operations
 * Base path: /api/admin
 */
const express = require('express');
const { adminAuth, requirePermission } = require('../middleware/admin-auth');
const authController = require('../controllers/admin/admin-auth-controller');
const treeController = require('../controllers/admin/admin-tree-controller');
const fileController = require('../controllers/admin/admin-file-controller');
const moveController = require('../controllers/admin/admin-move-controller');
const uploadController = require('../controllers/admin/admin-upload-controller');

const router = express.Router();

// =============================================================================
// Authentication Endpoints (Public)
// =============================================================================

/**
 * POST /api/admin/auth
 * Login with API key and create session
 *
 * Request Body:
 *   { apiKey: string }
 *
 * Response:
 *   { success: true, session: { token, name, permissions, expiresAt } }
 *
 * Errors:
 *   400 - MISSING_KEY: API key not provided
 *   401 - INVALID_KEY: API key is invalid
 */
router.post('/auth', authController.login);

// =============================================================================
// Session Endpoints (Authenticated)
// =============================================================================

/**
 * POST /api/admin/logout
 * Invalidate current session
 *
 * Requires: Valid session token (Cookie or Authorization header)
 *
 * Response:
 *   { success: true }
 */
router.post('/logout', adminAuth(), authController.logout);

/**
 * GET /api/admin/session
 * Get current session information
 *
 * Requires: Valid session token
 *
 * Response:
 *   { success: true, session: { name, permissions, expiresAt, createdAt } }
 *
 * Errors:
 *   401 - UNAUTHORIZED: No session token
 *   401 - SESSION_EXPIRED: Session expired or invalid
 */
router.get('/session', adminAuth(), authController.getSession);

/**
 * POST /api/admin/session/refresh
 * Refresh session expiry time
 *
 * Requires: Valid session token
 *
 * Response:
 *   { success: true, session: { name, permissions, expiresAt } }
 */
router.post('/session/refresh', adminAuth(), authController.refreshSession);

// =============================================================================
// Tree Endpoints (Authenticated, Read permission)
// =============================================================================

/**
 * GET /api/admin/tree
 * Get directory tree with all files and metadata
 *
 * Requires: Valid session token with 'read' permission
 *
 * Query Parameters:
 *   - path: Starting path (default: '/')
 *   - maxDepth: Maximum depth to traverse (optional)
 *
 * Response:
 *   { success: true, tree: { root, startPath, stats } }
 */
router.get('/tree', adminAuth(), requirePermission('read'), treeController.getTree);

// =============================================================================
// File Content Endpoints (Authenticated)
// =============================================================================

/**
 * GET /api/admin/content
 * Get file content with metadata
 *
 * Requires: Valid session token with 'read' permission
 *
 * Query Parameters:
 *   - path: File path (required)
 *
 * Response:
 *   { success: true, path, content, encoding, size, modifiedAt }
 */
router.get('/content', adminAuth(), requirePermission('read'), fileController.getContent);

/**
 * GET /api/admin/file
 * Get raw file content (binary safe, for images etc.)
 *
 * Requires: Valid session token with 'read' permission
 *
 * Query Parameters:
 *   - path: File path (required)
 *
 * Response:
 *   Raw file content with appropriate Content-Type header
 */
router.get('/file', adminAuth(), requirePermission('read'), fileController.getRawFile);

/**
 * PUT /api/admin/content
 * Save file content
 *
 * Requires: Valid session token with 'write' permission
 *
 * Request Body:
 *   { path, content, originalModifiedAt? }
 *
 * Response:
 *   { success: true, path, size, modifiedAt }
 *
 * Errors:
 *   409 - CONFLICT: File modified by another user
 */
router.put('/content', adminAuth(), requirePermission('write'), fileController.saveContent);

// =============================================================================
// File/Directory Management Endpoints (Authenticated)
// =============================================================================

/**
 * POST /api/admin/create
 * Create file or directory
 *
 * Requires: Valid session token with 'write' permission
 *
 * Request Body:
 *   { path, type: 'file'|'directory', content? }
 *
 * Response:
 *   { success: true, path, type }
 */
router.post('/create', adminAuth(), requirePermission('write'), fileController.createEntry);

/**
 * PUT /api/admin/rename
 * Rename file or directory
 *
 * Requires: Valid session token with 'write' permission
 *
 * Request Body:
 *   { oldPath, newName }
 *
 * Response:
 *   { success: true, oldPath, newPath }
 */
router.put('/rename', adminAuth(), requirePermission('write'), moveController.renameEntry);

/**
 * PUT /api/admin/move
 * Move multiple entries to target directory
 *
 * Requires: Valid session token with 'write' permission
 *
 * Request Body:
 *   { sourcePaths: [...], targetDirectory }
 *
 * Response:
 *   { success: true, moved: [...], errors: [...] }
 */
router.put('/move', adminAuth(), requirePermission('write'), moveController.moveEntries);

/**
 * POST /api/admin/copy
 * Copy multiple entries to target directory
 *
 * Requires: Valid session token with 'write' permission
 *
 * Request Body:
 *   { sourcePaths: [...], targetDirectory }
 *
 * Response:
 *   { success: true, copied: [...], errors: [...] }
 */
router.post('/copy', adminAuth(), requirePermission('write'), moveController.copyEntries);

/**
 * POST /api/admin/upload
 * Upload multiple files via drag-and-drop
 *
 * Requires: Valid session token with 'write' permission
 *
 * Query Parameters:
 *   - path: Target directory path (default: '/')
 *
 * Request Body:
 *   multipart/form-data with field 'files' (multiple files)
 *
 * Response:
 *   { success: true, results: [...], errors: [...] }
 */
router.post('/upload',
  adminAuth(),
  requirePermission('write'),
  uploadController.configureMultiUpload(),
  uploadController.uploadFiles
);

/**
 * DELETE /api/admin/entry
 * Delete one or more entries
 *
 * Requires: Valid session token with 'delete' permission
 *
 * Request Body:
 *   { paths: [...] }
 *
 * Response:
 *   { success: true, deleted: [...] }
 */
router.delete('/entry', adminAuth(), requirePermission('delete'), fileController.deleteEntry);

module.exports = router;
