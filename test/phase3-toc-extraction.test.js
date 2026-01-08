/**
 * Phase 3: TOC (Table of Contents) Extraction Test
 *
 * Purpose: Verify server-side TOC generation from rendered HTML
 *
 * Tests:
 * 1. Basic TOC extraction from single heading
 * 2. Multiple headings at same level
 * 3. Nested heading structure (h1 > h2 > h3)
 * 4. Heading ID extraction
 * 5. Heading text extraction (strip HTML tags)
 * 6. Skip headings without IDs
 * 7. Korean heading text preservation
 * 8. Complex document with all heading levels
 * 9. Empty document (no headings)
 * 10. Integration: render + TOC extraction
 */

const MarkdownRenderer = require('../src/services/markdown-renderer');

console.log('=== Phase 3: TOC Extraction Test ===\n');

// Test results tracking
const results = {
  passed: [],
  failed: []
};

/**
 * Test helper function
 */
function test(name, fn) {
  return async () => {
    try {
      await fn();
      results.passed.push(name);
      console.log(`✅ PASS: ${name}`);
    } catch (error) {
      results.failed.push({ name, error: error.message });
      console.log(`❌ FAIL: ${name}`);
      console.log(`   Error: ${error.message}\n`);
    }
  };
}

// Mock logger
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {}
};

// Test 1: Basic TOC extraction from single heading
const test1 = test('Basic TOC extraction from single heading', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = '# Main Heading';
  const result = await renderer.render(markdown);

  if (!result.toc) {
    throw new Error('TOC not returned');
  }

  if (result.toc.length !== 1) {
    throw new Error(`Expected 1 TOC entry, got ${result.toc.length}`);
  }

  const entry = result.toc[0];

  if (entry.id !== 'main-heading') {
    throw new Error(`Expected ID "main-heading", got "${entry.id}"`);
  }

  if (entry.level !== 1) {
    throw new Error(`Expected level 1, got ${entry.level}`);
  }

  if (entry.text !== 'Main Heading') {
    throw new Error(`Expected text "Main Heading", got "${entry.text}"`);
  }
});

// Test 2: Multiple headings at same level
const test2 = test('Multiple headings at same level', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `# Heading 1
# Heading 2
# Heading 3`;

  const result = await renderer.render(markdown);

  if (result.toc.length !== 3) {
    throw new Error(`Expected 3 TOC entries, got ${result.toc.length}`);
  }

  const texts = result.toc.map(item => item.text);
  const expectedTexts = ['Heading 1', 'Heading 2', 'Heading 3'];

  for (let i = 0; i < expectedTexts.length; i++) {
    if (texts[i] !== expectedTexts[i]) {
      throw new Error(`Expected "${expectedTexts[i]}", got "${texts[i]}"`);
    }
  }

  // All should be level 1
  for (const item of result.toc) {
    if (item.level !== 1) {
      throw new Error(`Expected all level 1, got level ${item.level}`);
    }
  }
});

// Test 3: Nested heading structure
const test3 = test('Nested heading structure (h1 > h2 > h3)', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `# Level 1
## Level 2
### Level 3
## Another Level 2
### Another Level 3`;

  const result = await renderer.render(markdown);

  if (result.toc.length !== 5) {
    throw new Error(`Expected 5 TOC entries, got ${result.toc.length}`);
  }

  const expectedLevels = [1, 2, 3, 2, 3];

  for (let i = 0; i < expectedLevels.length; i++) {
    if (result.toc[i].level !== expectedLevels[i]) {
      throw new Error(`Entry ${i}: Expected level ${expectedLevels[i]}, got ${result.toc[i].level}`);
    }
  }
});

// Test 4: Heading ID extraction
const test4 = test('Heading ID extraction', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `# Simple
## With-Hyphens
### Special !@# Characters`;

  const result = await renderer.render(markdown);

  const expectedIds = ['simple', 'with-hyphens', 'special-characters'];

  for (let i = 0; i < expectedIds.length; i++) {
    if (result.toc[i].id !== expectedIds[i]) {
      throw new Error(`Expected ID "${expectedIds[i]}", got "${result.toc[i].id}"`);
    }
  }
});

// Test 5: Heading text extraction (strip HTML if present)
const test5 = test('Heading text extraction (clean text)', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = '# **Bold** and *italic* heading';
  const result = await renderer.render(markdown);

  if (result.toc.length !== 1) {
    throw new Error(`Expected 1 TOC entry, got ${result.toc.length}`);
  }

  // Text should be clean (markdown already converted to HTML, so we get plain text)
  const text = result.toc[0].text;

  // Should contain the words but not markdown syntax
  if (!text.includes('Bold') || !text.includes('italic')) {
    throw new Error(`Expected clean text with "Bold" and "italic", got "${text}"`);
  }
});

// Test 6: Skip headings without IDs (if any)
const test6 = test('All headings should have IDs (none skipped)', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `# Heading 1
## Heading 2
### Heading 3`;

  const result = await renderer.render(markdown);

  // All headings should have IDs from our renderer
  for (const item of result.toc) {
    if (!item.id || item.id === '') {
      throw new Error('Found TOC entry without ID');
    }
  }

  // Should have all 3 headings
  if (result.toc.length !== 3) {
    throw new Error(`Expected 3 TOC entries, got ${result.toc.length}`);
  }
});

// Test 7: Korean heading text preservation
const test7 = test('Korean heading text preservation', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `# 한글 제목
## 混合된 Title
### Special 특수 문자`;

  const result = await renderer.render(markdown);

  if (result.toc.length !== 3) {
    throw new Error(`Expected 3 TOC entries, got ${result.toc.length}`);
  }

  const expectedTexts = ['한글 제목', '混合된 Title', 'Special 특수 문자'];

  for (let i = 0; i < expectedTexts.length; i++) {
    if (result.toc[i].text !== expectedTexts[i]) {
      throw new Error(`Expected text "${expectedTexts[i]}", got "${result.toc[i].text}"`);
    }
  }

  // Check IDs are also correct
  // Note: 한자(混合) is not included in \w or 가-힣 range, so it's stripped
  const expectedIds = ['한글-제목', '된-title', 'special-특수-문자'];

  for (let i = 0; i < expectedIds.length; i++) {
    if (result.toc[i].id !== expectedIds[i]) {
      throw new Error(`Expected ID "${expectedIds[i]}", got "${result.toc[i].id}"`);
    }
  }
});

// Test 8: Complex document with all heading levels
const test8 = test('Complex document with all heading levels', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `# H1 Title
## H2 Section
### H3 Subsection
#### H4 Detail
##### H5 Subdetail
###### H6 Note

Some content here.

## Another H2
### Another H3`;

  const result = await renderer.render(markdown);

  // Should have 8 headings
  if (result.toc.length !== 8) {
    throw new Error(`Expected 8 TOC entries, got ${result.toc.length}`);
  }

  // Check levels are correct
  const expectedLevels = [1, 2, 3, 4, 5, 6, 2, 3];

  for (let i = 0; i < expectedLevels.length; i++) {
    if (result.toc[i].level !== expectedLevels[i]) {
      throw new Error(`Entry ${i}: Expected level ${expectedLevels[i]}, got ${result.toc[i].level}`);
    }
  }

  // Check all have IDs
  for (const item of result.toc) {
    if (!item.id) {
      throw new Error(`TOC entry "${item.text}" missing ID`);
    }
  }
});

// Test 9: Empty document (no headings)
const test9 = test('Empty document (no headings)', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = 'This is a document with no headings.\n\nJust paragraphs.';
  const result = await renderer.render(markdown);

  // Should return empty TOC array
  if (!Array.isArray(result.toc)) {
    throw new Error('TOC should be an array');
  }

  if (result.toc.length !== 0) {
    throw new Error(`Expected empty TOC, got ${result.toc.length} entries`);
  }
});

// Test 10: Integration test with complex features
const test10 = test('Integration: render + TOC extraction', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `# API Documentation

## Overview

This is the overview section. See [[/api/reference]] for details.

## Getting Started

### Installation

\`\`\`bash
npm install
\`\`\`

### Configuration

Configure your **settings** here.

## Advanced Topics

### Security

Important security notes.

### Performance

Optimization tips.
`;

  const result = await renderer.render(markdown);

  // Should have HTML
  if (!result.html) {
    throw new Error('No HTML output');
  }

  // Should have TOC
  if (!result.toc || result.toc.length === 0) {
    throw new Error('No TOC generated');
  }

  // Expected structure: 1 H1, 3 H2, 4 H3
  if (result.toc.length !== 8) {
    throw new Error(`Expected 8 TOC entries, got ${result.toc.length}`);
  }

  // Check first entry
  if (result.toc[0].level !== 1 || result.toc[0].text !== 'API Documentation') {
    throw new Error('First TOC entry incorrect');
  }

  // Check H2 entries
  const h2Texts = result.toc.filter(item => item.level === 2).map(item => item.text);
  const expectedH2s = ['Overview', 'Getting Started', 'Advanced Topics'];

  for (const expected of expectedH2s) {
    if (!h2Texts.includes(expected)) {
      throw new Error(`Expected H2 "${expected}" not found in TOC`);
    }
  }

  // Verify HTML has the headings
  if (!result.html.includes('id="api-documentation"')) {
    throw new Error('Heading ID not in HTML');
  }

  // Verify Wiki links were processed
  if (!result.html.includes('/doc/api/reference')) {
    throw new Error('Wiki link not processed');
  }

  // Verify code blocks were highlighted
  if (!result.html.includes('language-bash')) {
    throw new Error('Code highlighting not applied');
  }
});

// Run all tests sequentially
async function runTests() {
  await test1();
  await test2();
  await test3();
  await test4();
  await test5();
  await test6();
  await test7();
  await test8();
  await test9();
  await test10();

  // Print summary
  console.log('\n=== Test Summary ===');
  console.log(`Total tests: ${results.passed.length + results.failed.length}`);
  console.log(`Passed: ${results.passed.length}`);
  console.log(`Failed: ${results.failed.length}`);

  if (results.failed.length > 0) {
    console.log('\n❌ Failed tests:');
    results.failed.forEach(({ name, error }) => {
      console.log(`  - ${name}: ${error}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    console.log('\n🎉 Phase 3 Complete!');
    console.log('📊 TOC extraction validated:');
    console.log('   ✅ Single and multiple headings');
    console.log('   ✅ Nested structure (h1-h6)');
    console.log('   ✅ ID and text extraction');
    console.log('   ✅ Korean character support');
    console.log('   ✅ Integration with rendering pipeline');
    console.log('   ✅ Ready for Phase 4 (Cache Persistence)');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
