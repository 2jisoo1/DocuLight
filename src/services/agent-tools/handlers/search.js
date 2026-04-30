'use strict';

const { searchDocuments } = require('../../search-service');

/**
 * @param {object} config
 * @param {object} logger
 * @param {object} args
 * @returns {Promise<object>}
 */
async function search(config, logger, args) {
  const searchMode = args.mode || 'snippets';
  const searchResult = await searchDocuments(config, logger, args.query, {
    limit: args.limit || 10,
    path: args.path || '/',
    mode: searchMode
  });

  let output = `# Search Results for "${searchResult.query}"\n\n`;
  output += `**Mode**: ${searchResult.mode}\n`;
  output += `**Statistics**: ${searchResult.total} matches in ${searchResult.filesScanned} files scanned (${searchResult.duration})\n\n`;

  if (searchResult.results.length === 0) {
    output += '(No matches found)';
  } else if (searchResult.mode === 'titles_only') {
    for (let i = 0; i < searchResult.results.length; i++) {
      const fileResult = searchResult.results[i];
      output += `${i + 1}. ${fileResult.path} - "${fileResult.title}"\n`;
    }
  } else if (searchResult.mode === 'full_context') {
    for (let i = 0; i < searchResult.results.length; i++) {
      const fileResult = searchResult.results[i];
      output += `## ${i + 1}. ${fileResult.path}\n\n`;
      output += `**Title**: ${fileResult.title}\n\n`;
      if (fileResult.sections && fileResult.sections.length > 0) {
        for (const section of fileResult.sections) {
          if (section.heading) {
            output += `${section.heading}\n\n`;
          }
          const content = section.heading
            ? section.content.replace(section.heading, '').trim()
            : section.content;
          output += `${content}\n\n`;
        }
      }
      output += '---\n\n';
    }
  } else {
    for (let i = 0; i < searchResult.results.length; i++) {
      const fileResult = searchResult.results[i];
      output += `## ${i + 1}. ${fileResult.path}\n\n`;
      for (const match of fileResult.matches) {
        output += `**Line ${match.line}**: ${match.content}\n\n`;
        output += '```\n' + match.context + '\n```\n\n';
      }
    }
  }

  return { content: [{ type: 'text', text: output }] };
}

module.exports = search;
