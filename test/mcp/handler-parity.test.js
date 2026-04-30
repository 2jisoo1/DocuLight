'use strict';

/**
 * handler-parity.test.js
 *
 * Verifies that src/services/agent-tools/handlers/ contains all expected MCP
 * tool handlers, and that each handler is a callable function.
 *
 * Acceptance: exits 0 and prints "parity OK"
 */

const handlers = require('../../src/services/agent-tools/handlers');

const EXPECTED_HANDLERS = [
  'list_documents',
  'list_full_tree',
  'read_document',
  'create_document',
  'delete_document',
  'get_config',
  'search',
  'query_document',
  'summarize_document',
  'smart_search',
  'resolve_project',
  'query_code_examples',
];

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

console.log('handler-parity: checking handler registry\n');

// 1. All expected keys present
for (const key of EXPECTED_HANDLERS) {
  assert(key in handlers, `handler registered: ${key}`);
}

// 2. No unexpected keys
const registeredKeys = Object.keys(handlers);
for (const key of registeredKeys) {
  assert(EXPECTED_HANDLERS.includes(key), `no unexpected handler: ${key}`);
}

// 3. All handlers are functions
for (const key of EXPECTED_HANDLERS) {
  if (key in handlers) {
    assert(typeof handlers[key] === 'function', `handler is callable: ${key}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}

console.log('parity OK');
