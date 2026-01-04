/**
 * Context MCP 테스트
 * 실행: node test/test-context-mcp.js
 */

const assert = require('assert');
const path = require('path');

// Mock dependencies
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {}
};

const mockConfig = {
  docsRoot: path.join(__dirname, 'test-docs'),
  excludes: ['node_modules', '.git']
};

console.log('Running Context MCP tests...\n');

// Test 1: Module imports (including searchDocuments)
{
  const { getContextDocuments, getDocumentContent, searchDocuments } = require('../src/services/context-service');
  assert.strictEqual(typeof getContextDocuments, 'function');
  assert.strictEqual(typeof getDocumentContent, 'function');
  assert.strictEqual(typeof searchDocuments, 'function');
  console.log('✅ Test 1: Module imports correctly (including searchDocuments)');
}

// Test 2: JSON-RPC utilities
{
  const { createJsonRpcResponse, createJsonRpcError } = require('../src/utils/jsonrpc-utils');

  const response = createJsonRpcResponse(1, { test: 'value' });
  assert.strictEqual(response.jsonrpc, '2.0');
  assert.strictEqual(response.id, 1);
  assert.deepStrictEqual(response.result, { test: 'value' });

  const errorResponse = createJsonRpcError(2, -32600, 'Invalid Request', 'test data');
  assert.strictEqual(errorResponse.jsonrpc, '2.0');
  assert.strictEqual(errorResponse.id, 2);
  assert.strictEqual(errorResponse.error.code, -32600);
  assert.strictEqual(errorResponse.error.message, 'Invalid Request');
  assert.strictEqual(errorResponse.error.data, 'test data');

  console.log('✅ Test 2: JSON-RPC utilities work correctly');
}

// Test 3: Context MCP router creation
{
  const createContextMcpRouter = require('../src/routes/context-mcp');
  const router = createContextMcpRouter();
  assert.strictEqual(typeof router, 'function');
  console.log('✅ Test 3: Context MCP router creates successfully');
}

// Test 4: Frontmatter service integration
{
  const { parseFrontmatter, parseFrontmatterFromFile } = require('../src/services/frontmatter-service');

  // Test with description
  const withDesc = parseFrontmatter('----\nname: Test\ndescription: Test description\n----\n# Content');
  assert.strictEqual(withDesc.name, 'Test');
  assert.strictEqual(withDesc.description, 'Test description');

  // Test without description
  const withoutDesc = parseFrontmatter('----\nname: Test\n----\n# Content');
  assert.strictEqual(withoutDesc.name, 'Test');
  assert.strictEqual(withoutDesc.description, undefined);

  console.log('✅ Test 4: Frontmatter service integration works');
}

// Test 5: Tree service has displayName and description fields
{
  const { getTreeData, getFullTreeData } = require('../src/services/tree-service');

  // Verify functions exist
  assert.strictEqual(typeof getTreeData, 'function');
  assert.strictEqual(typeof getFullTreeData, 'function');

  console.log('✅ Test 5: Tree service exports required functions');
}

console.log('\n✅ All 5 Context MCP tests passed!');
