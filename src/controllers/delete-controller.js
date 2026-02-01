const { deleteEntryData } = require('../services/file-service');
const { validatePath } = require('../utils/path-validator');
const { notifyBatchRemove, collectMdFiles } = require('../utils/embedding-notifier');

/**
 * Delete file or directory (Express wrapper)
 */
async function deleteEntry(req, res, next) {
  try {
    const { config, logger, chatbotService } = req.app.locals;
    const userPath = req.query.path;

    // Collect .md paths before deletion for embedding notification
    const absPath = validatePath(config.docsRoot, userPath);
    const mdFiles = chatbotService ? await collectMdFiles(absPath) : [];

    const result = await deleteEntryData(config, logger, userPath);

    // Embedding notification (fire-and-forget)
    notifyBatchRemove(chatbotService, logger, mdFiles);

    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = { deleteEntry };
