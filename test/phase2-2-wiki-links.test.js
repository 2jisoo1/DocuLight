/**
 * Phase 2-2: Wiki Links Preprocessing Test
 *
 * Purpose: Verify Wiki Links [[path]] → [name](url) conversion
 *
 * Tests:
 * 1. Basic Wiki link conversion [[/path]] → [name](/doc/path)
 * 2. Wiki links without leading slash
 * 3. Wiki links with .md extension removal
 * 4. Multiple Wiki links in same document
 * 5. Nested directory paths
 * 6. Korean file names in Wiki links
 * 7. Wiki links with spaces
 * 8. Mixed Wiki links and standard markdown links
 * 9. Wiki link edge cases (empty, invalid)
 * 10. Full rendering integration with MarkdownRenderer
 */

const MarkdownRenderer = require('../src/services/markdown-renderer');

console.log('=== Phase 2-2: Wiki Links Preprocessing Test ===\n');

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

// Test 1: Basic Wiki link conversion
const test1 = test('Basic Wiki link conversion [[/path]] → [name](/doc/path)', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = 'See the [[/guide/setup]] for details.';
  const result = await renderer.render(markdown);

  // Should convert to standard markdown link
  // Expected: [setup](/doc/guide/setup)
  if (!result.html.includes('/doc/guide/setup')) {
    throw new Error('Wiki link URL not converted correctly');
  }

  // Should extract filename as display name
  if (!result.html.includes('>setup</a>')) {
    throw new Error('Wiki link display name not extracted correctly');
  }
});

// Test 2: Wiki links without leading slash
const test2 = test('Wiki links without leading slash', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = 'Check [[guide/setup]] and [[api/reference]].';
  const result = await renderer.render(markdown);

  // Should add /doc prefix
  if (!result.html.includes('/doc/guide/setup') || !result.html.includes('/doc/api/reference')) {
    throw new Error('Wiki links without leading slash not converted correctly');
  }
});

// Test 3: Wiki links with .md extension removal
const test3 = test('Wiki links with .md extension removal', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = 'See [[/guide/setup.md]] for setup.';
  const result = await renderer.render(markdown);

  // Should remove .md extension
  if (!result.html.includes('/doc/guide/setup"')) {
    throw new Error('.md extension not removed from Wiki link');
  }

  // Should not contain .md in URL
  if (result.html.includes('/doc/guide/setup.md"')) {
    throw new Error('.md extension still present in Wiki link URL');
  }
});

// Test 4: Multiple Wiki links in same document
const test4 = test('Multiple Wiki links in same document', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `# Documentation

See [[/guide/setup]] first, then [[/guide/configuration]], and finally [[/api/reference]].`;

  const result = await renderer.render(markdown);

  // Should convert all Wiki links
  const expectedUrls = ['/doc/guide/setup', '/doc/guide/configuration', '/doc/api/reference'];

  for (const url of expectedUrls) {
    if (!result.html.includes(url)) {
      throw new Error(`Wiki link ${url} not converted`);
    }
  }
});

// Test 5: Nested directory paths
const test5 = test('Nested directory paths', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = 'See [[/docs/advanced/deployment/kubernetes]].';
  const result = await renderer.render(markdown);

  // Should handle deep nesting
  if (!result.html.includes('/doc/docs/advanced/deployment/kubernetes')) {
    throw new Error('Deep nested path not converted correctly');
  }

  // Should extract last path segment as display name
  if (!result.html.includes('>kubernetes</a>')) {
    throw new Error('Display name from nested path not extracted correctly');
  }
});

// Test 6: Korean file names in Wiki links
const test6 = test('Korean file names in Wiki links', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = '한글 문서는 [[/가이드/설치]] 참조.';
  const result = await renderer.render(markdown);

  // Should handle Korean characters in path (URL-encoded by marked)
  // marked automatically URL-encodes non-ASCII characters in href attributes
  const expectedEncodedPath = '/doc/%EA%B0%80%EC%9D%B4%EB%93%9C/%EC%84%A4%EC%B9%98';
  if (!result.html.includes(expectedEncodedPath)) {
    throw new Error('Korean path not converted correctly (expected URL-encoded)');
  }

  // Should preserve Korean in display name (not URL-encoded)
  if (!result.html.includes('>설치</a>')) {
    throw new Error('Korean display name not preserved');
  }
});

// Test 7: Wiki links with spaces
const test7 = test('Wiki links with spaces', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = 'See [[ /guide/setup ]] (with spaces).';
  const result = await renderer.render(markdown);

  // Should trim spaces
  if (!result.html.includes('/doc/guide/setup"')) {
    throw new Error('Spaces not trimmed from Wiki link');
  }
});

// Test 8: Mixed Wiki links and standard markdown links
const test8 = test('Mixed Wiki links and standard markdown links', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `# Links

- Wiki: [[/guide/setup]]
- Standard: [External](https://example.com)
- Another Wiki: [[/api/reference]]
`;

  const result = await renderer.render(markdown);

  // Should convert Wiki links
  if (!result.html.includes('/doc/guide/setup')) {
    throw new Error('Wiki link not converted');
  }

  // Should preserve standard links
  if (!result.html.includes('https://example.com')) {
    throw new Error('Standard link was modified');
  }
});

// Test 9: Wiki link edge cases
const test9 = test('Wiki link edge cases (empty, invalid)', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `# Edge Cases

- Empty: [[]]
- Just slash: [[/]]
- No path: [[  ]]
`;

  const result = await renderer.render(markdown);

  // Should handle gracefully (convert to links even if empty)
  // At minimum, should not crash
  if (!result.html) {
    throw new Error('Rendering failed on edge cases');
  }
});

// Test 10: Full rendering integration
const test10 = test('Full rendering integration with MarkdownRenderer', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `# Documentation Guide

This guide covers the basics.

## Setup

First, read the [[/guide/installation]] guide.

Then configure your system using [[/guide/configuration.md]].

## API Reference

See the [[/api/overview]] for API documentation.

### Advanced Topics

- [[/advanced/caching]]
- [[/advanced/security]]
- [[/advanced/performance]]

## External Resources

- [Official Docs](https://example.com)
- [[/guide/troubleshooting]]
`;

  const result = await renderer.render(markdown);

  // Should have all Wiki links converted
  const expectedUrls = [
    '/doc/guide/installation',
    '/doc/guide/configuration',
    '/doc/api/overview',
    '/doc/advanced/caching',
    '/doc/advanced/security',
    '/doc/advanced/performance',
    '/doc/guide/troubleshooting'
  ];

  for (const url of expectedUrls) {
    if (!result.html.includes(url)) {
      throw new Error(`Expected URL ${url} not found in rendered HTML`);
    }
  }

  // Should preserve external links
  if (!result.html.includes('https://example.com')) {
    throw new Error('External link was modified');
  }

  // Should have proper headings with IDs
  if (!result.html.includes('<h1')) {
    throw new Error('Headings not rendered');
  }

  // Should have lists
  if (!result.html.includes('<ul>')) {
    throw new Error('Lists not rendered');
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
    console.log('\n🎉 Phase 2-2 Complete!');
    console.log('📊 Wiki Links validated:');
    console.log('   ✅ Basic Wiki link conversion');
    console.log('   ✅ Path normalization (.md removal)');
    console.log('   ✅ Korean character support');
    console.log('   ✅ Full integration with MarkdownRenderer');
    console.log('   ✅ Ready for Phase 2-3 (Code Highlighting)');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
