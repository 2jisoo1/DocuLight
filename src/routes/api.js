const express = require('express');
const authMiddleware = require('../middleware/auth');
const { getTree, getFullTree } = require('../controllers/tree-controller');
const { getRaw } = require('../controllers/raw-controller');
const { getHtml } = require('../controllers/html-controller');
const { searchDocuments } = require('../controllers/search-controller');
const { configureUpload, uploadFile } = require('../controllers/upload-controller');
const { deleteEntry } = require('../controllers/delete-controller');
const { downloadFile, downloadDirectory } = require('../controllers/download-controller');

function createApiRouter(config) {
  const router = express.Router();
  const upload = configureUpload();

  // Public routes (no authentication required)
  router.get('/tree/full', getFullTree);  // Get complete recursive tree structure
  router.get('/tree', getTree);           // Get single directory tree
  router.get('/raw', getRaw);
  router.get('/html', getHtml);           // Get pre-rendered HTML from cache (Step 13: Phase 6)
  router.get('/search', searchDocuments); // Search documents by keyword

  // Protected routes (authentication required)
  // Do not capture `config` at module/router creation time; auth middleware reads runtime config from req.app.locals
  const auth = authMiddleware();

  router.post('/upload', auth, upload, uploadFile);
  router.delete('/entry', auth, deleteEntry);
  router.get('/download/file', auth, downloadFile);
  router.get('/download/dir', auth, downloadDirectory);

  return router;
}

module.exports = createApiRouter;
