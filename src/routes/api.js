const express = require('express');
const authMiddleware = require('../middleware/auth');
const { getTree } = require('../controllers/tree-controller');
const { getRaw } = require('../controllers/raw-controller');
const { configureUpload, uploadFile } = require('../controllers/upload-controller');
const { deleteEntry } = require('../controllers/delete-controller');
const { downloadFile, downloadDirectory } = require('../controllers/download-controller');

function createApiRouter(config) {
  const router = express.Router();
  const upload = configureUpload(config);

  // Public routes (no authentication required)
  router.get('/tree', getTree);
  router.get('/raw', getRaw);

  // Protected routes (authentication required)
  const auth = authMiddleware(config);

  router.post('/upload', auth, upload.single('file'), uploadFile);
  router.delete('/entry', auth, deleteEntry);
  router.get('/download/file', auth, downloadFile);
  router.get('/download/dir', auth, downloadDirectory);

  return router;
}

module.exports = createApiRouter;
