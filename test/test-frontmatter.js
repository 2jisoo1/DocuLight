/**
 * Frontmatter 파싱 테스트
 * 실행: node test/test-frontmatter.js
 */

const assert = require('assert');
const { parseFrontmatter } = require('../src/services/frontmatter-service');

console.log('Running frontmatter parsing tests...\n');

// Test 1: Valid frontmatter with 4 dashes
{
  const content = '----\nname: Test\ndescription: Desc\n----\n# Content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, 'Test');
  assert.strictEqual(result.description, 'Desc');
  assert.strictEqual(result.content, '# Content');
  console.log('✅ Test 1: Valid frontmatter with 4 dashes');
}

// Test 2: Different dash counts (10 start, 5 end)
{
  const content = '----------\nname: Test\n-----\n# Content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, 'Test');
  console.log('✅ Test 2: Different dash counts (10 start, 5 end)');
}

// Test 3: Reject 3 dashes (YAML format)
{
  const content = '---\nname: Test\n---\n# Content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, undefined);
  assert.strictEqual(result.content, content);
  console.log('✅ Test 3: Reject 3 dashes (YAML format)');
}

// Test 4: Missing frontmatter
{
  const content = '# Just content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, undefined);
  assert.strictEqual(result.content, '# Just content');
  console.log('✅ Test 4: Missing frontmatter');
}

// Test 5: Windows CRLF line endings
{
  const content = '----\r\nname: Test\r\n----\r\n# Content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, 'Test');
  console.log('✅ Test 5: Windows CRLF line endings');
}

// Test 6: BOM (Byte Order Mark)
{
  const content = '\ufeff----\nname: Test\n----\n# Content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, 'Test');
  console.log('✅ Test 6: BOM (Byte Order Mark)');
}

// Test 7: Empty value (should be null)
{
  const content = '----\nname:\ndescription: Valid\n----\n# Content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, undefined);
  assert.strictEqual(result.description, 'Valid');
  console.log('✅ Test 7: Empty value ignored');
}

// Test 8: Not at file start
{
  const content = 'Some text\n----\nname: Test\n----\n# Content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, undefined);
  console.log('✅ Test 8: Not at file start');
}

// Test 9: Only description (no name)
{
  const content = '----\ndescription: Only desc\n----\n# Content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, undefined);
  assert.strictEqual(result.description, 'Only desc');
  console.log('✅ Test 9: Only description (no name)');
}

// Test 10: Empty content
{
  const result = parseFrontmatter('');
  assert.strictEqual(result.content, '');
  console.log('✅ Test 10: Empty content');
}

// Test 11: null/undefined input
{
  const result1 = parseFrontmatter(null);
  const result2 = parseFrontmatter(undefined);
  assert.strictEqual(result1.content, '');
  assert.strictEqual(result2.content, '');
  console.log('✅ Test 11: null/undefined input');
}

// Test 12: No trailing newline after frontmatter
{
  const content = '----\nname: Test\n----';  // No content after
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, 'Test');
  assert.strictEqual(result.content, '');
  console.log('✅ Test 12: No trailing newline after frontmatter');
}

// Test 13: Multiline description (colon in value)
{
  const content = '----\nname: API: Getting Started\ndescription: Learn how to use our API\n----\n# Content';
  const result = parseFrontmatter(content);
  assert.strictEqual(result.name, 'API: Getting Started');
  assert.strictEqual(result.description, 'Learn how to use our API');
  console.log('✅ Test 13: Colon in value');
}

console.log('\n✅ All 13 tests passed!');
