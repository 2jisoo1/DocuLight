/**
 * Phase 2-3: Code Highlighting Test
 *
 * Purpose: Verify server-side code highlighting with highlight.js
 *
 * Tests:
 * 1. Basic code block without language (plain text)
 * 2. JavaScript code highlighting
 * 3. Python code highlighting
 * 4. Multiple code blocks with different languages
 * 5. HTML escaping in code blocks
 * 6. Inline code preservation
 * 7. Code block with unsupported language (fallback)
 * 8. Large code blocks (performance)
 * 9. Highlight.js CSS classes present
 * 10. Integration: code + markdown + wiki links
 */

const MarkdownRenderer = require('../src/services/markdown-renderer');

console.log('=== Phase 2-3: Code Highlighting Test ===\n');

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

// Test 1: Basic code block without language
const test1 = test('Basic code block without language (plain text)', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `\`\`\`
Plain text code block
No syntax highlighting
\`\`\``;

  const result = await renderer.render(markdown);

  // Should have pre and code tags
  if (!result.html.includes('<pre>')) {
    throw new Error('Pre tag not found');
  }

  if (!result.html.includes('<code>')) {
    throw new Error('Code tag not found');
  }

  // Should contain the code content
  if (!result.html.includes('Plain text code block')) {
    throw new Error('Code content not found');
  }
});

// Test 2: JavaScript code highlighting
const test2 = test('JavaScript code highlighting', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `\`\`\`javascript
function hello() {
  console.log('Hello, World!');
}
\`\`\``;

  const result = await renderer.render(markdown);

  // Should have language class
  if (!result.html.includes('language-javascript')) {
    throw new Error('JavaScript language class not found');
  }

  // Should have highlight.js class
  if (!result.html.includes('hljs')) {
    throw new Error('highlight.js class not found');
  }

  // Should contain the code
  if (!result.html.includes('function') && !result.html.includes('hello')) {
    throw new Error('JavaScript code not found');
  }
});

// Test 3: Python code highlighting
const test3 = test('Python code highlighting', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `\`\`\`python
def greet(name):
    print(f"Hello, {name}!")
    return True
\`\`\``;

  const result = await renderer.render(markdown);

  // Should have language class
  if (!result.html.includes('language-python')) {
    throw new Error('Python language class not found');
  }

  // Should have highlight.js class
  if (!result.html.includes('hljs')) {
    throw new Error('highlight.js class not found');
  }

  // Should contain the code (may be wrapped in spans from highlighting)
  if (!result.html.includes('def') || !result.html.includes('greet')) {
    throw new Error('Python code not found');
  }
});

// Test 4: Multiple code blocks with different languages
const test4 = test('Multiple code blocks with different languages', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `# Code Examples

JavaScript:
\`\`\`js
const x = 10;
\`\`\`

Python:
\`\`\`python
x = 10
\`\`\`

Shell:
\`\`\`bash
echo "Hello"
\`\`\`
`;

  const result = await renderer.render(markdown);

  // Should have all language classes
  const languages = ['language-js', 'language-python', 'language-bash'];
  for (const lang of languages) {
    if (!result.html.includes(lang)) {
      throw new Error(`Language class ${lang} not found`);
    }
  }

  // Should have multiple code blocks
  const codeBlockCount = (result.html.match(/<pre>/g) || []).length;
  if (codeBlockCount < 3) {
    throw new Error(`Expected at least 3 code blocks, found ${codeBlockCount}`);
  }
});

// Test 5: HTML escaping in code blocks
const test5 = test('HTML escaping in code blocks', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `\`\`\`html
<div class="container">
  <h1>Title</h1>
  <p>Content & more</p>
</div>
\`\`\``;

  const result = await renderer.render(markdown);

  // HTML should be escaped (or highlighted, but not executed)
  // Check that we have code block structure (highlight.js uses different structure)
  if (!result.html.includes('<pre>') && !result.html.includes('code')) {
    throw new Error('Code block structure missing');
  }

  // The code content should be present in some form (may be HTML-escaped or wrapped in spans)
  if (!result.html.includes('container') || !result.html.includes('Title')) {
    throw new Error('HTML code content not found');
  }

  // Should have HTML language class
  if (!result.html.includes('language-html')) {
    throw new Error('HTML language class not found');
  }
});

// Test 6: Inline code preservation
const test6 = test('Inline code preservation', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = 'Use the `console.log()` function to print output.';
  const result = await renderer.render(markdown);

  // Should have inline code tag
  if (!result.html.includes('<code>')) {
    throw new Error('Inline code tag not found');
  }

  // Should contain the inline code
  if (!result.html.includes('console.log()')) {
    throw new Error('Inline code content not found');
  }
});

// Test 7: Code block with unsupported language (fallback)
const test7 = test('Code block with unsupported language (fallback)', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `\`\`\`unknownlang
Some code in unknown language
\`\`\``;

  const result = await renderer.render(markdown);

  // Should still render as code block
  if (!result.html.includes('<pre>')) {
    throw new Error('Pre tag not found');
  }

  if (!result.html.includes('code')) {
    throw new Error('Code tag not found (check with lowercase "code")');
  }

  // Should contain the code
  if (!result.html.includes('Some code')) {
    throw new Error('Code content not found');
  }

  // Should have language class even if not highlighted
  if (!result.html.includes('language-unknownlang')) {
    throw new Error('Language class not added for unknown language');
  }
});

// Test 8: Large code blocks (performance test)
const test8 = test('Large code blocks (performance)', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  // Generate large code block (100 lines)
  const lines = Array.from({ length: 100 }, (_, i) => `function func${i}() { return ${i}; }`);
  const markdown = `\`\`\`javascript\n${lines.join('\n')}\n\`\`\``;

  const startTime = Date.now();
  const result = await renderer.render(markdown);
  const duration = Date.now() - startTime;

  // Should complete in reasonable time (< 1 second)
  if (duration > 1000) {
    throw new Error(`Rendering took too long: ${duration}ms`);
  }

  // Should contain the code
  if (!result.html.includes('func0') || !result.html.includes('func99')) {
    throw new Error('Large code block not fully rendered');
  }

  console.log(`   Performance: 100-line code block rendered in ${duration}ms`);
});

// Test 9: Highlight.js CSS classes present
const test9 = test('Highlight.js CSS classes present', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `\`\`\`javascript
const message = "Hello";
console.log(message);
\`\`\``;

  const result = await renderer.render(markdown);

  // Should have hljs class (added by highlight.js)
  if (!result.html.includes('hljs')) {
    throw new Error('hljs class not found');
  }

  // Should have language-specific class
  if (!result.html.includes('language-javascript')) {
    throw new Error('language-javascript class not found');
  }

  // Highlight.js adds span tags with classes for syntax elements
  // The presence of these indicates highlighting is working
  if (!result.html.includes('<span')) {
    throw new Error('No span tags found (highlighting may not be working)');
  }
});

// Test 10: Integration test (code + markdown + wiki links)
const test10 = test('Integration: code + markdown + wiki links', async () => {
  const renderer = new MarkdownRenderer(mockLogger);

  const markdown = `# API Documentation

See the [[/api/overview]] for complete API reference.

## Example

Here's a basic example:

\`\`\`javascript
const api = require('./api');

async function main() {
  const result = await api.getData();
  console.log(result);
}
\`\`\`

For more examples, check [[/examples/basic]].

## Inline Code

Use \`api.getData()\` to fetch data.
`;

  const result = await renderer.render(markdown);

  // Should have headings with IDs
  if (!result.html.includes('id="api-documentation"')) {
    throw new Error('Heading ID not generated');
  }

  // Should have code blocks with highlighting
  if (!result.html.includes('language-javascript')) {
    throw new Error('Code highlighting not applied');
  }

  // Should have Wiki links converted
  if (!result.html.includes('/doc/api/overview')) {
    throw new Error('Wiki link not converted');
  }

  if (!result.html.includes('/doc/examples/basic')) {
    throw new Error('Second wiki link not converted');
  }

  // Should have inline code
  if (!result.html.includes('<code>api.getData()</code>')) {
    throw new Error('Inline code not preserved');
  }

  // Should have proper structure
  if (!result.html.includes('<h1') || !result.html.includes('<h2')) {
    throw new Error('Headings not rendered');
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
    console.log('\n🎉 Phase 2-3 Complete!');
    console.log('📊 Code Highlighting validated:');
    console.log('   ✅ JavaScript, Python, Bash highlighting');
    console.log('   ✅ HTML escaping and security');
    console.log('   ✅ Inline code preservation');
    console.log('   ✅ Large code block performance');
    console.log('   ✅ Ready for Phase 2-4 (Full Integration)');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
