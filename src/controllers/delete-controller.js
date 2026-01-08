const { deleteEntryData } = require('../services/file-service');

/**
 * Delete file or directory (Express wrapper)
 */
async function deleteEntry(req, res, next) {
  try {
    const { config, logger } = req.app.locals;
    const userPath = req.query.path;

    const result = await deleteEntryData(config, logger, userPath);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = { deleteEntry };
