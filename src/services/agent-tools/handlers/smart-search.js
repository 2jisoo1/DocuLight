'use strict';

const { SmartSearchService } = require('../../mcp/smart-search-service');

/**
 * @param {object} config
 * @param {object} logger
 * @param {object} args
 * @param {object} req
 * @returns {Promise<object>}
 */
async function smartSearch(config, logger, args, req) {
  const smartSearchService = new SmartSearchService(config, logger);
  smartSearchService.initialize(req.app.locals);

  const result = await smartSearchService.smartSearch(args.query, {
    path: args.path || '/',
    mode: args.mode || 'auto',
    maxTokens: args.maxTokens || 2000,
    limit: args.limit || 5
  });

  const output = smartSearchService.formatAsMarkdown(result);
  return { content: [{ type: 'text', text: output }] };
}

module.exports = smartSearch;
