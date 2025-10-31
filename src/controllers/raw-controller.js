const { getRawContent } = require('../services/file-service');

/**
 * Get raw markdown file content (Express wrapper)
 */
async function getRaw(req, res, next) {
  try {
    const { config, logger } = req.app.locals;
    const userPath = req.query.path;

    const content = await getRawContent(config, logger, userPath);
    res.type('text/plain').send(content);
  } catch (error) {
    next(error);
  }
}

module.exports = { getRaw };
