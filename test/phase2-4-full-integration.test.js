/**
 * Phase 2-4: Full Integration Test
 *
 * Purpose: Verify complete rendering pipeline and CacheManager integration
 *
 * Tests:
 * 1. CacheManager uses MarkdownRenderer for rendering
 * 2. Rendered HTML is cached in memory
 * 3. Cache hit returns previously rendered HTML
 * 4. Wiki links work in cached content
 * 5. Code highlighting persists in cache
 * 6. Heading IDs are consistent across renders
 * 7. Multiple file rendering and caching
 * 8. Memory cache efficiency with rendered HTML
 * 9. Full document rendering (complex markdown)
 * 10. End-to-end: scan + render + cache + retrieve
 */

const fs = require('fs');
const path = require('path');
const CacheManager = require('../src/services/cache-manager');

console.log('=== Phase 2-4: Full Integration Test ===\n');

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

// Create test directory
const testDir = path.join(__dirname, '.temp-integration-test');
const cacheDir = path.join(testDir, '.cache');

function setupTestDirectory() {
  // Clean up if exists
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  // Create structure
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.join(testDir, 'docs'), { recursive: true });

  // Create test markdown files with various features
  fs.writeFileSync(
    path.join(testDir, 'docs', 'basic.md'),
    '# Basic Document\n\nThis is a **basic** document.',
    'utf-8'
  );

  fs.writeFileSync(
    path.join(testDir, 'docs', 'wikilinks.md'),
    '# Wiki Links\n\nSee [[/docs/basic]] for basics.\n\nAlso check [[/docs/code]].',
    'utf-8'
  );

  fs.writeFileSync(
    path.join(testDir, 'docs', 'code.md'),
    '# Code Examples\n\n```javascript\nconst x = 10;\nconsole.log(x);\n```\n\nUse `console.log()` for debugging.',
    'utf-8'
  );

  fs.writeFileSync(
    path.join(testDir, 'docs', 'complex.md'),
    `# Complex Document

## Features

### Wiki Links
See [[/docs/basic]] and [[/docs/code]].

### Code Blocks
\`\`\`python
def hello():
    print("Hello")
\`\`\`

### Lists
- Item 1
- Item 2
- Item 3

### Table
| Column 1 | Column 2 |
|----------|----------|
| A        | B        |

### Inline Code
Use \`console.log()\` for output.
`,
    'utf-8'
  );
}

function cleanupTestDirectory() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

// Mock logger
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {}
};

// Test 1: CacheManager uses MarkdownRenderer for rendering
const test1 = test('CacheManager uses MarkdownRenderer for rendering', async () => {
  setupTestDirectory();

  const config = {
    docsRoot: path.join(testDir, 'docs'),
    excludes: [],
    cache: {
      enabled: true,
      scanThrottle: 500,
      maxMemorySize: 100,
      cacheDir: cacheDir,
      preRenderOnStartup: false
    }
  };

  const manager = new CacheManager(config, mockLogger);
  await manager.initialize();

  const result = await manager.getOrRender('basic.md');

  // Should have rendered HTML (not placeholder)
  if (result.html.includes('TODO: Render HTML')) {
    throw new Error('Still using placeholder rendering');
  }

  // Should have actual markdown rendered
  if (!result.html.includes('<h1')) {
    throw new Error('Markdown not rendered to HTML');
  }

  if (!result.html.includes('Basic Document')) {
    throw new Error('Content not rendered');
  }

  cleanupTestDirectory();
});

// Test 2: Rendered HTML is cached in memory
const test2 = test('Rendered HTML is cached in memory', async () => {
  setupTestDirectory();

  const config = {
    docsRoot: path.join(testDir, 'docs'),
    excludes: [],
    cache: {
      enabled: true,
      scanThrottle: 500,
      maxMemorySize: 100,
      cacheDir: cacheDir,
      preRenderOnStartup: false
    }
  };

  const manager = new CacheManager(config, mockLogger);
  await manager.initialize();

  // First render
  const result1 = await manager.getOrRender('basic.md');

  // Check cache
  const cached = manager.memoryCache.get('basic.md');
  if (!cached) {
    throw new Error('Entry not cached');
  }

  if (!cached.html || cached.html.includes('TODO')) {
    throw new Error('Cached HTML is placeholder');
  }

  // Should have actual rendered content
  if (!cached.html.includes('Basic Document')) {
    throw new Error('Cached HTML missing content');
  }

  cleanupTestDirectory();
});

// Test 3: Cache hit returns previously rendered HTML
const test3 = test('Cache hit returns previously rendered HTML', async () => {
  setupTestDirectory();

  const config = {
    docsRoot: path.join(testDir, 'docs'),
    excludes: [],
    cache: {
      enabled: true,
      scanThrottle: 500,
      maxMemorySize: 100,
      cacheDir: cacheDir,
      preRenderOnStartup: false
    }
  };

  const manager = new CacheManager(config, mockLogger);
  await manager.initialize();

  // First render
  const result1 = await manager.getOrRender('basic.md');
  if (result1.fromCache) {
    throw new Error('First call should be cache miss');
  }

  // Second call should hit cache
  const result2 = await manager.getOrRender('basic.md');
  if (!result2.fromCache) {
    throw new Error('Second call should be cache hit');
  }

  // HTML should be identical
  if (result1.html !== result2.html) {
    throw new Error('Cached HTML differs from original');
  }

  cleanupTestDirectory();
});

// Test 4: Wiki links work in cached content
const test4 = test('Wiki links work in cached content', async () => {
  setupTestDirectory();

  const config = {
    docsRoot: path.join(testDir, 'docs'),
    excludes: [],
    cache: {
      enabled: true,
      scanThrottle: 500,
      maxMemorySize: 100,
      cacheDir: cacheDir,
      preRenderOnStartup: false
    }
  };

  const manager = new CacheManager(config, mockLogger);
  await manager.initialize();

  const result = await manager.getOrRender('wikilinks.md');

  // Should have Wiki links converted
  if (!result.html.includes('/doc/docs/basic')) {
    throw new Error('First wiki link not converted');
  }

  if (!result.html.includes('/doc/docs/code')) {
    throw new Error('Second wiki link not converted');
  }

  cleanupTestDirectory();
});

// Test 5: Code highlighting persists in cache
const test5 = test('Code highlighting persists in cache', async () => {
  setupTestDirectory();

  const config = {
    docsRoot: path.join(testDir, 'docs'),
    excludes: [],
    cache: {
      enabled: true,
      scanThrottle: 500,
      maxMemorySize: 100,
      cacheDir: cacheDir,
      preRenderOnStartup: false
    }
  };

  const manager = new CacheManager(config, mockLogger);
  await manager.initialize();

  const result = await manager.getOrRender('code.md');

  // Should have code highlighting
  if (!result.html.includes('language-javascript')) {
    throw new Error('Code highlighting not applied');
  }

  if (!result.html.includes('hljs')) {
    throw new Error('highlight.js class not found');
  }

  // Should have inline code
  if (!result.html.includes('<code>console.log()</code>')) {
    throw new Error('Inline code not preserved');
  }

  cleanupTestDirectory();
});

// Test 6: Heading IDs are consistent across renders
const test6 = test('Heading IDs are consistent across renders', async () => {
  setupTestDirectory();

  const config = {
    docsRoot: path.join(testDir, 'docs'),
    excludes: [],
    cache: {
      enabled: true,
      scanThrottle: 500,
      maxMemorySize: 100,
      cacheDir: cacheDir,
      preRenderOnStartup: false
    }
  };

  const manager = new CacheManager(config, mockLogger);
  await manager.initialize();

  // Render twice
  const result1 = await manager.getOrRender('basic.md');

  // Clear cache
  manager.memoryCache.delete('basic.md');

  // Render again
  const result2 = await manager.getOrRender('basic.md');

  // Both should have same heading ID
  if (!result1.html.includes('id="basic-document"')) {
    throw new Error('First render missing heading ID');
  }

  if (!result2.html.includes('id="basic-document"')) {
    throw new Error('Second render missing heading ID');
  }

  cleanupTestDirectory();
});

// Test 7: Multiple file rendering and caching
const test7 = test('Multiple file rendering and caching', async () => {
  setupTestDirectory();

  const config = {
    docsRoot: path.join(testDir, 'docs'),
    excludes: [],
    cache: {
      enabled: true,
      scanThrottle: 500,
      maxMemorySize: 100,
      cacheDir: cacheDir,
      preRenderOnStartup: false
    }
  };

  const manager = new CacheManager(config, mockLogger);
  await manager.initialize();

  // Render all files
  const files = ['basic.md', 'wikilinks.md', 'code.md', 'complex.md'];
  for (const file of files) {
    await manager.getOrRender(file);
  }

  // All should be cached
  if (manager.memoryCache.size !== 4) {
    throw new Error(`Expected 4 cached entries, got ${manager.memoryCache.size}`);
  }

  // Verify each cache entry
  for (const file of files) {
    const cached = manager.memoryCache.get(file);
    if (!cached || !cached.html || cached.html.includes('TODO')) {
      throw new Error(`File ${file} not properly cached`);
    }
  }

  cleanupTestDirectory();
});

// Test 8: Memory cache efficiency with rendered HTML
const test8 = test('Memory cache efficiency with rendered HTML', async () => {
  setupTestDirectory();

  const config = {
    docsRoot: path.join(testDir, 'docs'),
    excludes: [],
    cache: {
      enabled: true,
      scanThrottle: 500,
      maxMemorySize: 100,
      cacheDir: cacheDir,
      preRenderOnStartup: false
    }
  };

  const manager = new CacheManager(config, mockLogger);
  await manager.initialize();

  // Render files
  await manager.getOrRender('basic.md');
  await manager.getOrRender('complex.md');

  // Calculate memory usage
  let totalSize = 0;
  for (const [key, entry] of manager.memoryCache.entries()) {
    if (entry.html) {
      totalSize += entry.html.length;
    }
  }

  const totalKB = totalSize / 1024;
  console.log(`   Memory usage for 2 files: ${totalKB.toFixed(2)} KB`);

  // Rendered HTML should be larger than placeholder, but still reasonable
  if (totalKB > 100) {
    throw new Error(`Memory usage too high: ${totalKB.toFixed(2)} KB`);
  }

  cleanupTestDirectory();
});

// Test 9: Full document rendering (complex markdown)
const test9 = test('Full document rendering (complex markdown)', async () => {
  setupTestDirectory();

  const config = {
    docsRoot: path.join(testDir, 'docs'),
    excludes: [],
    cache: {
      enabled: true,
      scanThrottle: 500,
      maxMemorySize: 100,
      cacheDir: cacheDir,
      preRenderOnStartup: false
    }
  };

  const manager = new CacheManager(config, mockLogger);
  await manager.initialize();

  const result = await manager.getOrRender('complex.md');

  // Should have all features rendered
  // Headings with IDs
  if (!result.html.includes('id="complex-document"')) {
    throw new Error('Main heading ID not found');
  }

  // Wiki links
  if (!result.html.includes('/doc/docs/basic')) {
    throw new Error('Wiki links not converted');
  }

  // Code highlighting
  if (!result.html.includes('language-python')) {
    throw new Error('Code highlighting not applied');
  }

  // Lists
  if (!result.html.includes('<ul>') && !result.html.includes('<li>')) {
    throw new Error('Lists not rendered');
  }

  // Tables
  if (!result.html.includes('<table>')) {
    throw new Error('Table not rendered');
  }

  // Inline code
  if (!result.html.includes('<code>console.log()</code>')) {
    throw new Error('Inline code not preserved');
  }

  cleanupTestDirectory();
});

// Test 10: End-to-end workflow
const test10 = test('End-to-end: scan + render + cache + retrieve', async () => {
  setupTestDirectory();

  const config = {
    docsRoot: path.join(testDir, 'docs'),
    excludes: [],
    cache: {
      enabled: true,
      scanThrottle: 500,
      maxMemorySize: 100,
      cacheDir: cacheDir,
      preRenderOnStartup: false
    }
  };

  const manager = new CacheManager(config, mockLogger);

  // 1. Initialize (scan)
  await manager.initialize();
  if (manager.fileList.length !== 4) {
    throw new Error(`Expected 4 files, found ${manager.fileList.length}`);
  }

  // 2. Render a file (cache miss)
  const result1 = await manager.getOrRender('basic.md');
  if (result1.fromCache) {
    throw new Error('First call should be cache miss');
  }

  // 3. Retrieve from cache (cache hit)
  const result2 = await manager.getOrRender('basic.md');
  if (!result2.fromCache) {
    throw new Error('Second call should be cache hit');
  }

  // 4. Modify file
  await new Promise(resolve => setTimeout(resolve, 10));
  fs.writeFileSync(
    path.join(testDir, 'docs', 'basic.md'),
    '# Modified Document\n\nThis is **modified**.',
    'utf-8'
  );

  // 5. Trigger scan
  await new Promise(resolve => setTimeout(resolve, 550)); // Wait for throttle
  await manager.triggerScanIfNeeded();

  // 6. Cache should be invalidated
  if (manager.memoryCache.has('basic.md')) {
    throw new Error('Cache was not invalidated after file modification');
  }

  // 7. Re-render should get new content
  const result3 = await manager.getOrRender('basic.md');
  if (!result3.html.includes('Modified Document')) {
    throw new Error('Modified content not rendered');
  }

  cleanupTestDirectory();
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
    console.log('\n🎉 Phase 2 Complete!');
    console.log('📊 Full integration validated:');
    console.log('   ✅ MarkdownRenderer integrated with CacheManager');
    console.log('   ✅ Memory caching with rendered HTML');
    console.log('   ✅ Wiki links, code highlighting, heading IDs');
    console.log('   ✅ Cache invalidation on file changes');
    console.log('   ✅ Ready for Phase 3 (TOC Generation)');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  cleanupTestDirectory();
  process.exit(1);
});
