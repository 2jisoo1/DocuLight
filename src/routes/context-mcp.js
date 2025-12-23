/**
 * Context MCP over HTTP (JSON-RPC 2.0)
 *
 * AI 에이전트용 문서 컨텍스트 조회
 * 인증 불필요 (읽기 전용)
 */

const express = require('express');
const { createJsonRpcResponse, createJsonRpcError } = require('../utils/jsonrpc-utils');
const { getContextDocuments, getDocumentContent } = require('../services/context-service');

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

      // Unknown action
      return res.status(400).json({
        error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}. Use 'list' or 'read'` }
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
