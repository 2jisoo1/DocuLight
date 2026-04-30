'use strict';

const { getFullTreeData } = require('../../tree-service');

/**
 * @param {object} config
 * @param {object} logger
 * @param {object} args
 * @returns {Promise<object>}
 */
async function listFullTree(config, logger, args) {
  const startPath = args.path || '/';
  const useDisplayName = args.useDisplayName === true;
  const result = await getFullTreeData(config, logger, startPath, {
    maxDepth: args.maxDepth,
    useDisplayName
  });

  function formatTree(node, indent = '') {
    let lines = [];
    for (const dir of node.dirs) {
      lines.push(`${indent}📁 ${dir.name}/`);
      lines = lines.concat(formatTree(dir, indent + '  '));
    }
    for (const file of node.files) {
      if (useDisplayName && file.displayName) {
        lines.push(`${indent}📄 ${file.displayName} (${file.name})`);
      } else {
        lines.push(`${indent}📄 ${file.name}`);
      }
    }
    return lines;
  }

  const lines = formatTree(result.root);
  // Empty directory produces blank body (same as original switch case behavior).
  // list_documents returns '(Empty directory)' instead; this asymmetry is intentional.
  const outputText = lines.join('\n');

  const header =
    `# Full Tree at ${result.startPath}\n\n` +
    `Stats: Directories=${result.stats.totalDirs}, Files=${result.stats.totalFiles}` +
    (typeof args.maxDepth === 'number' ? `, MaxDepth=${args.maxDepth}` : '') +
    '\n\n';

  return {
    content: [{ type: 'text', text: header + outputText }]
  };
}

module.exports = listFullTree;
