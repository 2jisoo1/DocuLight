'use strict';

const { QueryDocumentService } = require('../../mcp/query-document-service');

/**
 * @param {object} config
 * @param {object} logger
 * @param {object} args
 * @returns {Promise<object>}
 */
async function queryDocument(config, logger, args) {
  const queryService = new QueryDocumentService(config, logger);
  const result = await queryService.queryDocument(args.path, args.query, {
    maxTokens: args.maxTokens || 2000
  });
  const output = queryService.formatAsMarkdown(result);
  return { content: [{ type: 'text', text: output }] };
}

module.exports = queryDocument;
