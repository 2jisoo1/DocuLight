'use strict';

const { getTreeData } = require('../../tree-service');

/**
 * @param {object} config
 * @param {object} logger
 * @param {object} args
 * @returns {Promise<object>}
 */
async function listDocuments(config, logger, args) {
  const useDisplayName = args.useDisplayName === true;
  const result = await getTreeData(config, logger, args.path || '/', { useDisplayName });

  let output = '';
  if (result.dirs && result.dirs.length > 0) {
    for (const dir of result.dirs) {
      output += `📁 ${dir.name}/\n`;
    }
  }
  if (result.files && result.files.length > 0) {
    for (const file of result.files) {
      if (useDisplayName && file.displayName) {
        output += `📄 ${file.displayName} (${file.name})\n`;
      } else {
        output += `📄 ${file.name}\n`;
      }
    }
  }
  if (!output) {
    output = '(Empty directory)';
  }

  return {
    content: [{ type: 'text', text: `# Documents at ${result.path}\n\n${output}` }]
  };
}

module.exports = listDocuments;
