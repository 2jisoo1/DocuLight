'use strict';

const { SummarizeDocumentService } = require('../../mcp/summarize-document-service');

/**
 * @param {object} config
 * @param {object} logger
 * @param {object} args
 * @returns {Promise<object>}
 */
async function summarizeDocument(config, logger, args) {
  const summarizeService = new SummarizeDocumentService(config, logger);
  const summary = await summarizeService.summarizeDocument(args.path);
  const output = summarizeService.formatAsMarkdown(summary);
  return { content: [{ type: 'text', text: output }] };
}

module.exports = summarizeDocument;
