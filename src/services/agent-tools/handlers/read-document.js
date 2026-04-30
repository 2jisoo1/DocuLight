'use strict';

const { getRawContent } = require('../../file-service');

/**
 * @param {object} config
 * @param {object} logger
 * @param {object} args
 * @returns {Promise<object>}
 */
async function readDocument(config, logger, args) {
  const content = await getRawContent(config, logger, args.path);
  return {
    content: [{ type: 'text', text: `# ${args.path}\n\n${content}` }]
  };
}

module.exports = readDocument;
