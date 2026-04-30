'use strict';

const path = require('path');
const { uploadFileData } = require('../../file-service');
const { validatePath } = require('../../../utils/path-validator');
const { notifyAdd } = require('../../../utils/embedding-notifier');

/**
 * @param {object} config
 * @param {object} logger
 * @param {object} args
 * @param {object} req
 * @returns {Promise<object>}
 */
async function createDocument(config, logger, args, req) {
  const pathParts = args.path.split('/').filter(p => p);
  const filename = pathParts.pop();
  const dirPath = pathParts.join('/');

  const buffer = Buffer.from(args.content, 'utf-8');
  await uploadFileData(config, logger, dirPath, buffer, filename);

  const { chatbotService } = req.app.locals;
  // dirPath || '/' prevents validatePath from receiving an empty string when
  // the file is placed directly in the docs root (e.g., args.path = 'file.md')
  const targetDir = validatePath(config.docsRoot, dirPath || '/');
  notifyAdd(chatbotService, logger, path.join(targetDir, filename));

  return {
    content: [{ type: 'text', text: `Successfully created/updated: ${args.path}` }]
  };
}

module.exports = createDocument;
