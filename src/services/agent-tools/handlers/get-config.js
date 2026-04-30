'use strict';

const { getConfig } = require('../../config-service');

/**
 * @param {object} config
 * @param {object} logger
 * @param {object} args
 * @returns {Promise<object>}
 */
async function getConfigHandler(config, logger, args) {
  const section = args.section || 'all';
  const configResult = await getConfig(config, logger, section);
  const output = JSON.stringify(configResult, null, 2);

  return {
    content: [{
      type: 'text',
      text: `# Configuration (section: ${section})\n\n\`\`\`json\n${output}\n\`\`\``
    }]
  };
}

module.exports = getConfigHandler;
