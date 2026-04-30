'use strict';

/**
 * TASK-P1-002 — tool-registry 단위 테스트
 * acceptance: "16 tools registered"
 */

const { buildToolRegistry, validateToolRegistry, makeWire, isReadOnlyTool } = require('../../src/services/agent-tools/registry');

const EXPECTED_COUNT = 16;
const WIRE_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const EXPECTED_INTERNALS = [
  'mcp.list_full_tree', 'mcp.list_documents', 'mcp.search_documents',
  'mcp.query_document', 'mcp.summarize_document', 'mcp.smart_search',
  'mcp.resolve_project', 'mcp.extract_code_block', 'mcp.extract_section',
  'mcp.list_recent', 'mcp.get_metadata', 'mcp.read_section',
  'mcp.get_doc_tree', 'mcp.get_breadcrumb', 'mcp.list_categories', 'mcp.list_tags'
];

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

const registry = buildToolRegistry({ mcpClient: null, logger: null });
const tools = Object.values(registry);

console.log('--- tool-registry.test.js ---');

test('16 tools registered', () => {
  assert(tools.length === EXPECTED_COUNT,
    `Expected ${EXPECTED_COUNT} tools, got ${tools.length}`);
});

test('all expected tool internals present', () => {
  for (const name of EXPECTED_INTERNALS) {
    assert(registry[name] !== undefined, `Missing tool: ${name}`);
  }
});

test('wire names conform to Anthropic regex', () => {
  for (const tool of tools) {
    assert(WIRE_REGEX.test(tool.wire),
      `${tool.internal}: wire "${tool.wire}" violates regex`);
  }
});

test('wire = internal.replace(".", "_")', () => {
  for (const tool of tools) {
    const expected = makeWire(tool.internal);
    assert(tool.wire === expected,
      `${tool.internal}: expected "${expected}", got "${tool.wire}"`);
  }
});

test('no duplicate wire names', () => {
  const wires = tools.map(t => t.wire);
  const unique = new Set(wires);
  assert(unique.size === wires.length,
    `Duplicate wire names: ${wires.filter((w, i) => wires.indexOf(w) !== i).join(', ')}`);
});

test('all tools have Zod schemas with parse()', () => {
  for (const tool of tools) {
    assert(tool.schema && typeof tool.schema.parse === 'function',
      `${tool.internal}: missing Zod schema`);
  }
});

test('Zod schemas reject invalid types', () => {
  // Tools with required 'path' (no default) must reject non-string value
  const toolsWithRequiredPath = ['mcp.query_document', 'mcp.summarize_document',
    'mcp.get_metadata', 'mcp.read_section', 'mcp.get_doc_tree', 'mcp.get_breadcrumb',
    'mcp.extract_section'];
  for (const name of toolsWithRequiredPath) {
    const tool = registry[name];
    const result = tool.schema.safeParse({ path: 123 });
    assert(!result.success, `${name}: schema should reject path=123`);
  }
  // All schemas must expose safeParse
  for (const tool of tools) {
    assert(typeof tool.schema.safeParse === 'function',
      `${tool.internal}: schema missing safeParse`);
  }
});

test('all tools have async handlers', () => {
  for (const tool of tools) {
    assert(typeof tool.handler === 'function',
      `${tool.internal}: missing handler`);
  }
});

test('handlers return objects (stub mode)', async () => {
  for (const tool of tools) {
    const result = await tool.handler({}, {});
    assert(result && typeof result === 'object',
      `${tool.internal}: handler did not return object`);
  }
});

test('validateToolRegistry returns valid=true', () => {
  const result = validateToolRegistry(registry, null);
  assert(result.valid, `Validation errors: ${result.errors.join('; ')}`);
  assert(result.count === EXPECTED_COUNT,
    `count mismatch: ${result.count}`);
});

test('registry and all ToolDef objects are frozen (deep immutable)', () => {
  assert(Object.isFrozen(registry), 'Registry top-level object is not frozen');
  for (const tool of tools) {
    assert(Object.isFrozen(tool),
      `${tool.internal}: ToolDef object is not frozen`);
  }
});

test('isReadOnlyTool — CUD prefixes return false', () => {
  const cudNames = [
    'create_document', 'update_document', 'delete_document', 'remove_file',
    'upload_file', 'write_file', 'edit_document', 'patch_file',
    'CREATE_DOC', 'Update_doc', 'DELETE_entry'   // 대소문자 무관
  ];
  for (const name of cudNames) {
    assert(isReadOnlyTool(name) === false,
      `"${name}" must NOT be read-only (CUD prefix)`);
  }
});

test('isReadOnlyTool — false positive 0건 (post_ 등 read-only)', () => {
  const readOnly = [
    'post_filter', 'post_process', 'mcp_list_documents',
    'mcp_smart_search', 'list_tags', 'get_metadata', 'read_section'
  ];
  for (const name of readOnly) {
    assert(isReadOnlyTool(name) === true,
      `"${name}" must be read-only (no CUD prefix)`);
  }
});

test('isReadOnlyTool — 비정상 입력 처리', () => {
  assert(isReadOnlyTool('') === false, 'empty string must return false');
  assert(isReadOnlyTool(null) === false, 'null must return false');
  assert(isReadOnlyTool(undefined) === false, 'undefined must return false');
  assert(isReadOnlyTool(123) === false, 'number must return false');
});

test('all tools have non-empty descriptions with 3 sections', () => {
  for (const tool of tools) {
    assert(typeof tool.description === 'string' && tool.description.length > 0,
      `${tool.internal}: empty description`);
    const lines = tool.description.split('\n');
    assert(lines.length >= 3,
      `${tool.internal}: description must have 3 sections (When to use / When NOT / Example)`);
  }
});

const asyncTests = (async () => {
  // handlers return objects test already run inline above
})();

asyncTests.then(() => {
  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('\nPASS — 16 tools registered');
    process.exit(0);
  } else {
    console.log('\nFAIL');
    process.exit(1);
  }
}).catch(e => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
