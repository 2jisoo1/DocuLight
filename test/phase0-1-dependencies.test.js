/**
 * Phase 0-1: Dependencies Installation Test
 *
 * Purpose: Verify that all required dependencies for server-side rendering are installed and working
 *
 * Dependencies to test:
 * - marked: Markdown parsing
 * - dompurify: HTML sanitization
 * - jsdom: Server-side DOM manipulation
 * - highlight.js: Code syntax highlighting
 * - async-lock: Already installed (concurrency control)
 */

const fs = require('fs');
const path = require('path');

console.log('=== Phase 0-1: Dependencies Installation Test ===\n');

// Test results tracking
const results = {
  passed: [],
  failed: []
};

/**
 * Test helper function
 */
function test(name, fn) {
  try {
    fn();
    results.passed.push(name);
    console.log(`✅ PASS: ${name}`);
  } catch (error) {
    results.failed.push({ name, error: error.message });
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}\n`);
  }
}

// Test 1: Check if dependencies are in package.json
test('package.json contains required dependencies', () => {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

  const required = ['marked', 'dompurify', 'jsdom', 'highlight.js'];
  const missing = [];

  for (const dep of required) {
    if (!packageJson.dependencies[dep]) {
      missing.push(dep);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing dependencies in package.json: ${missing.join(', ')}`);
  }
});

// Test 2: Can require marked
test('Can require marked module', () => {
  const marked = require('marked');
  if (!marked || typeof marked.parse !== 'function') {
    throw new Error('marked.parse is not available');
  }
});

// Test 3: Can require dompurify
test('Can require dompurify module', () => {
  const createDOMPurify = require('dompurify');
  if (!createDOMPurify || typeof createDOMPurify !== 'function') {
    throw new Error('dompurify is not available');
  }
});

// Test 4: Can require jsdom
test('Can require jsdom module', () => {
  const { JSDOM } = require('jsdom');
  if (!JSDOM) {
    throw new Error('JSDOM is not available');
  }
});

// Test 5: Can require highlight.js
test('Can require highlight.js module', () => {
  const hljs = require('highlight.js');
  if (!hljs || typeof hljs.highlight !== 'function') {
    throw new Error('highlight.js is not available');
  }
});

// Test 6: Can initialize DOMPurify with jsdom
test('Can initialize DOMPurify with jsdom', () => {
  const createDOMPurify = require('dompurify');
  const { JSDOM } = require('jsdom');

  const window = new JSDOM('').window;
  const DOMPurify = createDOMPurify(window);

  if (!DOMPurify || typeof DOMPurify.sanitize !== 'function') {
    throw new Error('DOMPurify.sanitize is not available');
  }
});

// Test 7: Test basic marked parsing
test('marked.parse() works correctly', () => {
  const marked = require('marked');
  const html = marked.parse('# Hello World');

  if (!html || !html.includes('Hello World')) {
    throw new Error('marked.parse did not produce expected output');
  }
});

// Test 8: Test DOMPurify sanitization
test('DOMPurify.sanitize() works correctly', () => {
  const createDOMPurify = require('dompurify');
  const { JSDOM } = require('jsdom');

  const window = new JSDOM('').window;
  const DOMPurify = createDOMPurify(window);

  const dirty = '<script>alert("xss")</script><p>Safe content</p>';
  const clean = DOMPurify.sanitize(dirty);

  if (clean.includes('<script>')) {
    throw new Error('DOMPurify did not remove script tag');
  }

  if (!clean.includes('Safe content')) {
    throw new Error('DOMPurify removed safe content');
  }
});

// Test 9: Test highlight.js
test('highlight.js works correctly', () => {
  const hljs = require('highlight.js');

  const code = 'function hello() { console.log("Hello"); }';
  const result = hljs.highlight(code, { language: 'javascript' });

  if (!result || !result.value) {
    throw new Error('highlight.js did not produce expected output');
  }
});

// Test 10: Verify async-lock is already available
test('async-lock is available (already installed)', () => {
  const AsyncLock = require('async-lock');
  if (!AsyncLock) {
    throw new Error('async-lock is not available');
  }

  const lock = new AsyncLock();
  if (!lock || typeof lock.acquire !== 'function') {
    throw new Error('AsyncLock.acquire is not available');
  }
});

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
  process.exit(0);
}
