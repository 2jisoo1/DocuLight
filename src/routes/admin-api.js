/**
 * Admin API Router
 * Phase 2-3: Admin Mode Implementation
 *
 * Provides admin authentication, session management, and file operations
 * Base path: /api/admin
 */
const express = require('express');
const { adminAuth, requirePermission } = require('../middleware/admin-auth');
const treeController = require('../controllers/admin/admin-tree-controller');
const fileController = require('../controllers/admin/admin-file-controller');
const moveController = require('../controllers/admin/admin-move-controller');
const uploadController = require('../controllers/admin/admin-upload-controller');
const groupController = require('../controllers/admin/admin-group-controller');
const userController = require('../controllers/admin/admin-user-controller');
const authSettingsController = require('../controllers/admin/admin-auth-settings-controller');
const registrationController = require('../controllers/admin/admin-registration-controller');

const router = express.Router();

// =============================================================================
// Deprecated Authentication Endpoints (Step 17: Migration)
// These endpoints are replaced by /api/auth/* routes
// =============================================================================

router.post('/auth', (req, res) => {
  res.status(410).json({
    error: { code: 'ENDPOINT_DEPRECATED', message: 'POST /api/auth/login 을 사용하세요' }
  });
});

router.post('/logout', (req, res) => {
  res.status(410).json({
    error: { code: 'ENDPOINT_DEPRECATED', message: 'POST /api/auth/logout 을 사용하세요' }
  });
});

router.get('/session', (req, res) => {
  res.status(410).json({
    error: { code: 'ENDPOINT_DEPRECATED', message: 'GET /api/auth/session 을 사용하세요' }
  });
});

router.post('/session/refresh', (req, res) => {
  res.status(410).json({
    error: { code: 'ENDPOINT_DEPRECATED', message: 'POST /api/auth/session/refresh 를 사용하세요' }
  });
});

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
router.delete('/entry', adminAuth(), requirePermission('write'), fileController.deleteEntry);

// =============================================================================
// Group Management Endpoints (Superuser only)
// =============================================================================

router.get('/groups', adminAuth(), requirePermission('superuser'), groupController.listGroups);
router.post('/groups', adminAuth(), requirePermission('superuser'), groupController.createGroup);
router.put('/groups/:id', adminAuth(), requirePermission('superuser'), groupController.updateGroup);
router.delete('/groups/:id', adminAuth(), requirePermission('superuser'), groupController.deleteGroup);

// =============================================================================
// User Management Endpoints (Superuser only)
// =============================================================================

router.get('/users', adminAuth(), requirePermission('superuser'), userController.listUsers);
router.post('/users', adminAuth(), requirePermission('superuser'), userController.createUser);
router.put('/users/:id', adminAuth(), requirePermission('superuser'), userController.updateUser);
router.delete('/users/:id', adminAuth(), requirePermission('superuser'), userController.deleteUser);
router.post('/users/:id/reset-password', adminAuth(), requirePermission('superuser'), userController.resetPassword);
router.post('/users/:id/unlock', adminAuth(), requirePermission('superuser'), userController.unlockUser);

// =============================================================================
// Auth Settings Endpoints (Superuser only)
// =============================================================================

router.get('/auth-settings', adminAuth(), requirePermission('superuser'), authSettingsController.getSettings);
router.put('/auth-settings', adminAuth(), requirePermission('superuser'), authSettingsController.updateSettings);

// =============================================================================
// Registration Management Endpoints (Superuser only)
// =============================================================================

router.get('/registrations', adminAuth(), requirePermission('superuser'), registrationController.listPending);
router.post('/registrations/:id/approve', adminAuth(), requirePermission('superuser'), registrationController.approve);
router.post('/registrations/:id/reject', adminAuth(), requirePermission('superuser'), registrationController.reject);

module.exports = router;
