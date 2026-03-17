const express = require('express');
const authMiddleware = require('../middleware/auth');
const { requireApiPermission } = require('../middleware/auth');
const conditionalAuth = require('../middleware/conditional-auth');
const { getTree, getFullTree } = require('../controllers/tree-controller');
const { getRaw } = require('../controllers/raw-controller');
const { getHtml } = require('../controllers/html-controller');
const { searchDocuments } = require('../controllers/search-controller');
const { configureUpload, uploadFile } = require('../controllers/upload-controller');
const { deleteEntry } = require('../controllers/delete-controller');
const { downloadFile, downloadDirectory } = require('../controllers/download-controller');
const activityLogger = require('../utils/activity-logger');

function createApiRouter(config) {
  const router = express.Router();
  const upload = configureUpload();

  // Public/conditional routes (requireReadLogin controls access)
  const condAuth = conditionalAuth();
  router.get('/tree/full', condAuth, getFullTree);
  router.get('/tree', condAuth, getTree);
  router.get('/raw', condAuth, (req, res, next) => {
    const p = req.query.path || '';
    activityLogger.doc('API_READ', { path: p, user: activityLogger.extractUser(req), ip: activityLogger.extractIp(req) });
    getRaw(req, res, next);
  });
  router.get('/html', condAuth, getHtml);
  router.get('/search', condAuth, searchDocuments);

  // Protected routes (always require authentication + write permission)
  const auth = authMiddleware();
  router.post('/upload', auth, requireApiPermission('write'), upload, (req, res, next) => {
    const p = req.query.path || req.body.path || '';
    activityLogger.doc('UPLOAD', { path: p, user: activityLogger.extractUser(req), ip: activityLogger.extractIp(req) });
    uploadFile(req, res, next);
  });
  router.delete('/entry', auth, requireApiPermission('write'), (req, res, next) => {
    const p = req.query.path || req.body.path || '';
    activityLogger.doc('DELETE', { path: p, user: activityLogger.extractUser(req), ip: activityLogger.extractIp(req) });
    deleteEntry(req, res, next);
  });
  router.get('/download/file', auth, downloadFile);
  router.get('/download/dir', auth, downloadDirectory);

  return router;
}

module.exports = createApiRouter;
