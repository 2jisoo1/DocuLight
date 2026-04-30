'use strict';

/**
 * MCP tool handler registry.
 *
 * Keys are canonical tool names (without dynamic prefix).
 * Prefix-based tools (get_config, search, smart_search) are matched after
 * stripping the runtime prefix in the dispatcher.
 *
 * Handler signature: async (config, logger, args, req, prefix) => result
 */
module.exports = {
  list_documents: require('./list-documents'),
  list_full_tree: require('./list-full-tree'),
  read_document: require('./read-document'),
  create_document: require('./create-document'),
  delete_document: require('./delete-document'),
  get_config: require('./get-config'),
  search: require('./search'),
  query_document: require('./query-document'),
  summarize_document: require('./summarize-document'),
  smart_search: require('./smart-search'),
  resolve_project: require('./resolve-project'),
  query_code_examples: require('./query-code-examples'),
};
