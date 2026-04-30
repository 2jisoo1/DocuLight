'use strict';

/**
 * @param {object} config
 * @param {object} logger
 * @param {object} args
 * @param {object} req
 * @param {string} prefix
 * @returns {Promise<object>}
 */
async function resolveProject(config, logger, args, req, prefix) {
  const resolver = req.app.locals.projectResolver;
  if (!resolver) {
    throw new Error('Project resolver not initialized');
  }

  const results = resolver.resolve(args.name, {
    limit: args.limit || 5,
    version: args.version || null
  });

  const output = resolver.formatAsMarkdown(args.name, results, { prefix });
  return { content: [{ type: 'text', text: output }] };
}

module.exports = resolveProject;
