/**
 * Phase 2-1: MarkdownRenderer Service Test
 *
 * Purpose: Verify server-side markdown rendering with marked + DOMPurify
 *
 * Tests:
 * 1. MarkdownRenderer can be instantiated
 * 2. Basic markdown parsing (headings, paragraphs, lists)
 * 3. Heading ID generation matches client-side logic
 * 4. HTML sanitization with DOMPurify
 * 5. GFM (GitHub Flavored Markdown) features
 * 6. Line breaks rendering
 * 7. Code blocks without highlighting (Phase 2-3 will add highlighting)
 * 8. Image rendering with lazy loading attribute
 * 9. XSS prevention validation
 * 10. Korean character handling in headings
 */

const MarkdownRenderer = require('../src/services/markdown-renderer');

console.log('=== Phase 2-1: MarkdownRenderer Service Test ===\n');

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

// Mock logger (silent for tests)
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {}
};

// Test 1: MarkdownRenderer can be instantiated
const test1 = test('MarkdownRenderer can be instantiated', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  if (!renderer) {
    throw new Error('MarkdownRenderer not instantiated');
  }

  if (typeof renderer.render !== 'function') {
    throw new Error('render() method not found');
  }

  if (typeof renderer.extractTOC !== 'function') {
    throw new Error('extractTOC() method not found');
  }
});

// Test 2: Basic markdown parsing
const test2 = test('Basic markdown parsing (headings, paragraphs, lists)', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `# Heading 1
## Heading 2
### Heading 3

This is a paragraph with **bold** and *italic* text.

- List item 1
- List item 2
- List item 3

1. Numbered item 1
2. Numbered item 2
`;

  const result = await renderer.render(markdown);

  if (!result.html) {
    throw new Error('No HTML output');
  }

  // Check for headings
  if (!result.html.includes('<h1')) {
    throw new Error('H1 not rendered');
  }

  if (!result.html.includes('<h2')) {
    throw new Error('H2 not rendered');
  }

  // Check for bold/italic
  if (!result.html.includes('<strong>') && !result.html.includes('<b>')) {
    throw new Error('Bold not rendered');
  }

  if (!result.html.includes('<em>') && !result.html.includes('<i>')) {
    throw new Error('Italic not rendered');
  }

  // Check for lists
  if (!result.html.includes('<ul>')) {
    throw new Error('Unordered list not rendered');
  }

  if (!result.html.includes('<ol>')) {
    throw new Error('Ordered list not rendered');
  }
});

// Test 3: Heading ID generation matches client-side logic
const test3 = test('Heading ID generation matches client-side logic', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const testCases = [
    { input: '# Simple Heading', expectedId: 'simple-heading' },
    { input: '# Korean 한글 제목', expectedId: 'korean-한글-제목' },
    { input: '# Special !@#$%^& Characters', expectedId: 'special-characters' },
    { input: '# Multiple   Spaces', expectedId: 'multiple-spaces' },
    { input: '# Heading-With-Hyphens', expectedId: 'heading-with-hyphens' }
  ];

  for (const testCase of testCases) {
    const result = await renderer.render(testCase.input);

    if (!result.html.includes(`id="${testCase.expectedId}"`)) {
      throw new Error(`Expected ID "${testCase.expectedId}" not found in: ${result.html}`);
    }
  }
});

// Test 4: HTML sanitization with DOMPurify
const test4 = test('HTML sanitization with DOMPurify', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `# Safe Content

<script>alert('XSS')</script>

<div onclick="alert('XSS')">Click me</div>

Safe **bold** text.
`;

  const result = await renderer.render(markdown);

  // Should not contain script tags
  if (result.html.includes('<script>')) {
    throw new Error('Script tag not sanitized');
  }

  // Should not contain onclick handlers
  if (result.html.includes('onclick')) {
    throw new Error('onclick handler not sanitized');
  }

  // Should preserve safe content
  if (!result.html.includes('<strong>') && !result.html.includes('<b>')) {
    throw new Error('Safe bold text was removed');
  }
});

// Test 5: GFM features (tables, strikethrough, task lists)
const test5 = test('GFM (GitHub Flavored Markdown) features', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `# GFM Features

| Column 1 | Column 2 |
|----------|----------|
| Cell 1   | Cell 2   |

~~Strikethrough text~~

- [ ] Task 1
- [x] Task 2 (completed)
`;

  const result = await renderer.render(markdown);

  // Check for table
  if (!result.html.includes('<table>')) {
    throw new Error('Table not rendered');
  }

  // Check for strikethrough
  if (!result.html.includes('<del>') && !result.html.includes('~~')) {
    throw new Error('Strikethrough not rendered');
  }

  // Check for task lists
  if (!result.html.includes('type="checkbox"')) {
    throw new Error('Task list not rendered');
  }
});

// Test 6: Line breaks rendering (GFM mode)
const test6 = test('Line breaks rendering (breaks: true)', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `Line 1
Line 2
Line 3`;

  const result = await renderer.render(markdown);

  // With breaks: true, single line breaks should create <br>
  if (!result.html.includes('<br>')) {
    throw new Error('Line breaks not rendered');
  }
});

// Test 7: Code blocks without highlighting (plain text)
const test7 = test('Code blocks without highlighting', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `\`\`\`
function hello() {
  console.log('Hello');
}
\`\`\``;

  const result = await renderer.render(markdown);

  // Should have code block
  if (!result.html.includes('<pre>')) {
    throw new Error('Pre tag not rendered');
  }

  if (!result.html.includes('<code>')) {
    throw new Error('Code tag not rendered');
  }

  // Should contain function text
  if (!result.html.includes('function hello')) {
    throw new Error('Code content not rendered');
  }
});

// Test 8: Image rendering with lazy loading attribute
const test8 = test('Image rendering with lazy loading attribute', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `![Alt text](/images/test.png "Title text")`;

  const result = await renderer.render(markdown);

  // Should have img tag
  if (!result.html.includes('<img')) {
    throw new Error('Image tag not rendered');
  }

  // Should have lazy loading attribute
  if (!result.html.includes('loading="lazy"')) {
    throw new Error('Lazy loading attribute not found');
  }

  // Should have alt text
  if (!result.html.includes('alt="Alt text"')) {
    throw new Error('Alt attribute not found');
  }

  // Should have title text
  if (!result.html.includes('title="Title text"')) {
    throw new Error('Title attribute not found');
  }
});

// Test 9: XSS prevention validation
const test9 = test('XSS prevention validation', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const xssAttempts = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<a href="javascript:alert(1)">Click</a>',
    '<div onload="alert(1)">Test</div>'
  ];

  for (const xss of xssAttempts) {
    const result = await renderer.render(xss);

    // Should not contain dangerous tags or attributes
    if (result.html.includes('javascript:')) {
      throw new Error('javascript: protocol not sanitized');
    }

    if (result.html.includes('onerror=')) {
      throw new Error('onerror handler not sanitized');
    }

    if (result.html.includes('onload=')) {
      throw new Error('onload handler not sanitized');
    }

    if (result.html.includes('<iframe')) {
      throw new Error('iframe not sanitized');
    }
  }
});

// Test 10: Korean character handling in headings
const test10 = test('Korean character handling in headings', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `# 한글 제목
## 混合된 Title
### Special 특수 !@# 문자`;

  const result = await renderer.render(markdown);

  // Check heading rendering
  if (!result.html.includes('<h1')) {
    throw new Error('H1 not rendered');
  }

  // Check Korean text preservation
  if (!result.html.includes('한글')) {
    throw new Error('Korean text not preserved');
  }

  if (!result.html.includes('混合된')) {
    throw new Error('Mixed characters not preserved');
  }

  // Check ID generation with Korean characters
  if (!result.html.includes('id="한글-제목"')) {
    throw new Error('Korean heading ID not generated correctly');
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
    console.log('\n🎉 Phase 2-1 Complete!');
    console.log('📊 MarkdownRenderer validated:');
    console.log('   ✅ Basic markdown parsing');
    console.log('   ✅ Heading ID generation');
    console.log('   ✅ HTML sanitization');
    console.log('   ✅ GFM features support');
    console.log('   ✅ Ready for Phase 2-2 (Wiki Links)');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
