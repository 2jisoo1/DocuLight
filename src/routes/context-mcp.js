/**
 * Context MCP over HTTP (JSON-RPC 2.0)
 *
 * AI 에이전트용 문서 컨텍스트 조회
 * 인증 불필요 (읽기 전용)
 */

const express = require('express');
const { createJsonRpcResponse, createJsonRpcError } = require('../utils/jsonrpc-utils');
const { getContextDocuments, getDocumentContent, searchDocuments } = require('../services/context-service');

/**
 * Context MCP Tool 목록
 */
const TOOLS = [
  {
    name: 'list_context_documents',
    description: 'List all documents with description metadata. Only documents with frontmatter description are included.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to search (default: /)',
          default: '/'
        }
      }
    }
  },
  {
    name: 'read_document',
    description: 'Read a document by path. Returns content without frontmatter.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Document path (e.g., /guide/getting-started.md)'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'search_documents',
    description: 'Search for text across all markdown documents. Returns matching excerpts with surrounding context. Results are limited to 500 total matches across 1000 files maximum.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search keyword or phrase (required, 1-200 chars, trimmed)',
          minLength: 1,
          maxLength: 200
        },
        context_chars: {
          type: 'number',
          description: 'Characters before/after match (default: 50, range: 10-500)',
          default: 50,
          minimum: 10,
          maximum: 500
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Case-sensitive search (default: false)',
          default: false
        },
        path: {
          type: 'string',
          description: 'Directory path to search in (default: /)',
          default: '/'
        },
        max_results: {
          type: 'number',
          description: 'Max matches per file (default: 10, range: 1-100)',
          default: 10,
          minimum: 1,
          maximum: 100
        }
      },
      required: ['query']
    }
  }
];

/**
 * Execute Context MCP tool
 */
async function executeTool(config, logger, name, args) {
  switch (name) {
    case 'list_context_documents': {
      const documents = await getContextDocuments(config, logger, args.path || '/');

      if (documents.length === 0) {
        return {
          content: [{
            type: 'text',
            text: '# Documents with Context\n\n(No documents with description found)'
          }]
        };
      }

      let output = '# Documents with Context\n\n';
      documents.forEach((doc, i) => {
        output += `${i + 1}. **${doc.name}** (\`${doc.path}\`)\n`;
        output += `   ${doc.description}\n\n`;
      });

      return {
        content: [{
          type: 'text',
          text: output
        }]
      };
    }

    case 'read_document': {
      if (!args.path) {
        throw new Error('path is required');
      }

      const content = await getDocumentContent(config, logger, args.path);
      return {
        content: [{
          type: 'text',
          text: `# ${args.path}\n\n${content}`
        }]
      };
    }

    case 'search_documents': {
      const searchResults = await searchDocuments(config, logger, args.query, {
        context_chars: args.context_chars,
        case_sensitive: args.case_sensitive,
        path: args.path,
        max_results: args.max_results
      });

      if (searchResults.total_matches === 0) {
        return { content: [{ type: 'text', text: `# Search Results for '${searchResults.query}'\n\nNo matches found.` }] };
      }

      let output = `# Search Results for '${searchResults.query}'\n\n`;
      output += `Found ${searchResults.total_matches} matches in ${searchResults.total_files} files`;
      if (searchResults.truncated) output += ` (truncated)`;
      output += '\n\n';

      searchResults.results.forEach(file => {
        output += `## ${file.path} (${file.name})\n\n`;
        file.matches.forEach((m, i) => output += `${i + 1}. Line ${m.line}: ${m.excerpt}\n`);
        output += '\n';
      });

      return { content: [{ type: 'text', text: output }] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Create Context MCP router
 */
function createContextMcpRouter() {
  const router = express.Router();

  // GET handler for simple REST-like access
  router.get('/context', async (req, res) => {
    const { config, logger } = req.app.locals;
    const { action, path: docPath } = req.query;

    try {
      // No action specified: return server info and tools
      if (!action) {
        logger.info('Context MCP: GET info');
        return res.json({
          server: {
            name: 'DocLight-Context',
            version: '1.0.0',
            protocol: 'JSON-RPC 2.0 (POST) / REST (GET)'
          },
          tools: TOOLS,
          usage: {
            list: 'GET /context?action=list&path=/',
            read: 'GET /context?action=read&path=/path/to/doc.md',
            search: 'GET /context?action=search&query=keyword',
            post: 'POST /context with JSON-RPC 2.0 body'
          }
        });
      }

      // action=list: list context documents
      if (action === 'list') {
        logger.info('Context MCP: GET list', { path: docPath });
        const documents = await getContextDocuments(config, logger, docPath || '/');
        return res.json({
          success: true,
          path: docPath || '/',
          count: documents.length,
          documents
        });
      }

      // action=read: read document content
      if (action === 'read') {
        if (!docPath) {
          return res.status(400).json({
            error: { code: 'INVALID_PARAMS', message: 'path parameter is required for action=read' }
          });
        }

        logger.info('Context MCP: GET read', { path: docPath });
        const content = await getDocumentContent(config, logger, docPath);
        return res.json({
          success: true,
          path: docPath,
          content
        });
      }

      // action=search: search documents
      if (action === 'search') {
        const { query, context_chars, case_sensitive, max_results } = req.query;

        if (!query || query.trim().length === 0) {
          return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: 'query required' } });
        }

        logger.info('Context MCP: GET search', { query, path: docPath });
        try {
          const searchResults = await searchDocuments(config, logger, query, {
            context_chars: context_chars ? parseInt(context_chars, 10) : undefined,
            case_sensitive: case_sensitive === 'true',
            path: docPath || '/',
            max_results: max_results ? parseInt(max_results, 10) : undefined
          });
          return res.json({ success: true, ...searchResults });
        } catch (error) {
          return res.status(400).json({ error: { code: 'INVALID_PARAMS', message: error.message } });
        }
      }

      // Unknown action
      return res.status(400).json({
        error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}. Use 'list', 'read', or 'search'` }
      });
    } catch (error) {
      logger.error('Context MCP GET error', { action, path: docPath, error: error.message });

      const statusCode = error.code === 'NOT_FOUND' ? 404 : 500;
      return res.status(statusCode).json({
        error: { code: error.code || 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // POST handler for JSON-RPC 2.0
  router.post('/context', express.json(), async (req, res) => {
    const { config, logger } = req.app.locals;
    const { jsonrpc, id, method, params } = req.body;

    // JSON-RPC 2.0 validation
    if (jsonrpc !== '2.0') {
      return res.json(createJsonRpcError(id, -32600, 'Invalid Request', 'jsonrpc must be "2.0"'));
    }

    if (!method) {
      return res.json(createJsonRpcError(id, -32600, 'Invalid Request', 'method is required'));
    }

    try {
      switch (method) {
        case 'tools/list':
          logger.info('Context MCP: tools/list called');
          return res.json(createJsonRpcResponse(id, { tools: TOOLS }));

        case 'tools/call': {
          if (!params || !params.name) {
            return res.json(createJsonRpcError(id, -32602, 'Invalid params', 'tool name is required'));
          }

          const { name, arguments: args } = params;
          logger.info('Context MCP: tools/call', { tool: name, args });

          const result = await executeTool(config, logger, name, args || {});
          return res.json(createJsonRpcResponse(id, result));
        }

        case 'initialize':
          logger.info('Context MCP: initialize called');
          return res.json(createJsonRpcResponse(id, {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'DocLight-Context',
              version: '1.0.0'
            }
          }));

        default:
          return res.json(createJsonRpcError(id, -32601, 'Method not found', `Method ${method} not supported`));
      }
    } catch (error) {
      logger.error('Context MCP error', {
        method,
        error: error.message
      });

      return res.json(createJsonRpcError(id, -32603, 'Internal error', error.message));
    }
  });

  return router;
}

module.exports = createContextMcpRouter;
