'use strict';

const { CodeBlockExtractorService } = require('../../mcp/code-block-extractor');

/**
 * @param {object} config
 * @param {object} logger
 * @param {object} args
 * @returns {Promise<object>}
 */
async function queryCodeExamples(config, logger, args) {
  const extractor = new CodeBlockExtractorService(config, logger);
  const results = await extractor.extract(args.query, {
    path: args.path || '/',
    language: args.language || null,
    maxTokens: args.maxTokens || 3000,
    limit: args.limit || 10
  });

  const output = extractor.formatAsMarkdown(args.query, results);
  return { content: [{ type: 'text', text: output }] };
}

module.exports = queryCodeExamples;
