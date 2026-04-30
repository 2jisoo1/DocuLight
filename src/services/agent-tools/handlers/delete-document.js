'use strict';

const { deleteEntryData } = require('../../file-service');
const { validatePath } = require('../../../utils/path-validator');
const { notifyBatchRemove, collectMdFiles } = require('../../../utils/embedding-notifier');

/**
 * @param {object} config
 * @param {object} logger
 * @param {object} args
 * @param {object} req
 * @returns {Promise<object>}
 */
async function deleteDocument(config, logger, args, req) {
  const { chatbotService } = req.app.locals;
  const delAbsPath = validatePath(config.docsRoot, args.path);
  const mdFiles = chatbotService ? await collectMdFiles(delAbsPath) : [];

  await deleteEntryData(config, logger, args.path);

  notifyBatchRemove(chatbotService, logger, mdFiles);

  return {
    content: [{ type: 'text', text: `Successfully deleted: ${args.path}` }]
  };
}

module.exports = deleteDocument;
