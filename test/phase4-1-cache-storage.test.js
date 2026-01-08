/**
 * Phase 4-1: Cache Storage Test
 *
 * Purpose: Verify disk-based cache persistence
 *
 * Tests:
 * 1. CacheStorage initialization creates directories
 * 2. Save HTML to disk
 * 3. Save TOC to disk
 * 4. Load HTML from disk
 * 5. Load TOC from disk
 * 6. Cache miss returns null
 * 7. Nested directory structure handling
 * 8. Manifest save and load
 * 9. Invalid cache file handling
 * 10. Integration: save + load workflow
 */

const fs = require('fs');
const path = require('path');
const CacheStorage = require('../src/services/cache-storage');

console.log('=== Phase 4-1: Cache Storage Test ===\n');

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

// Test directory
const testDir = path.join(__dirname, '.temp-cache-storage-test');
const cacheDir = path.join(testDir, '.cache');

function setupTestDirectory() {
  // Clean up if exists
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  fs.mkdirSync(testDir, { recursive: true });
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

// Test 1: CacheStorage initialization creates directories
const test1 = test('CacheStorage initialization creates directories', async () => {
  setupTestDirectory();

  const config = {
    cache: {
      cacheDir: cacheDir
    }
  };

  const storage = new CacheStorage(config, mockLogger);
  await storage.initialize();

  // Check directories exist
  const htmlDir = path.join(cacheDir, 'html');
  const tocDir = path.join(cacheDir, 'toc');

  if (!fs.existsSync(htmlDir)) {
    throw new Error('HTML directory not created');
  }

  if (!fs.existsSync(tocDir)) {
    throw new Error('TOC directory not created');
  }

  cleanupTestDirectory();
});

// Test 2: Save HTML to disk
const test2 = test('Save HTML to disk', async () => {
  setupTestDirectory();

  const config = {
    cache: {
      cacheDir: cacheDir
    }
  };

  const storage = new CacheStorage(config, mockLogger);
  await storage.initialize();

  const html = '<h1 id="test">Test</h1><p>Content</p>';
  const toc = [{ id: 'test', level: 1, text: 'Test' }];

  await storage.saveToFile('test.md', html, toc);

  // Check HTML file exists
  const htmlPath = path.join(cacheDir, 'html', 'test.html');
  if (!fs.existsSync(htmlPath)) {
    throw new Error('HTML file not saved');
  }

  // Read and verify content
  const savedHtml = fs.readFileSync(htmlPath, 'utf-8');
  if (savedHtml !== html) {
    throw new Error('HTML content mismatch');
  }

  cleanupTestDirectory();
});

// Test 3: Save TOC to disk
const test3 = test('Save TOC to disk', async () => {
  setupTestDirectory();

  const config = {
    cache: {
      cacheDir: cacheDir
    }
  };

  const storage = new CacheStorage(config, mockLogger);
  await storage.initialize();

  const html = '<h1>Test</h1>';
  const toc = [
    { id: 'heading-1', level: 1, text: 'Heading 1' },
    { id: 'heading-2', level: 2, text: 'Heading 2' }
  ];

  await storage.saveToFile('test.md', html, toc);

  // Check TOC file exists
  const tocPath = path.join(cacheDir, 'toc', 'test.json');
  if (!fs.existsSync(tocPath)) {
    throw new Error('TOC file not saved');
  }

  // Read and verify content
  const savedToc = JSON.parse(fs.readFileSync(tocPath, 'utf-8'));
  if (savedToc.length !== 2) {
    throw new Error('TOC length mismatch');
  }

  if (savedToc[0].id !== 'heading-1') {
    throw new Error('TOC content mismatch');
  }

  cleanupTestDirectory();
});

// Test 4: Load HTML from disk
const test4 = test('Load HTML from disk', async () => {
  setupTestDirectory();

  const config = {
    cache: {
      cacheDir: cacheDir
    }
  };

  const storage = new CacheStorage(config, mockLogger);
  await storage.initialize();

  // Save first
  const html = '<h1>Test HTML</h1><p>Paragraph</p>';
  const toc = [{ id: 'test', level: 1, text: 'Test' }];
  await storage.saveToFile('doc.md', html, toc);

  // Load
  const loaded = await storage.loadFromDisk('doc.md');

  if (!loaded) {
    throw new Error('Failed to load from disk');
  }

  if (loaded.html !== html) {
    throw new Error('Loaded HTML mismatch');
  }

  cleanupTestDirectory();
});

// Test 5: Load TOC from disk
const test5 = test('Load TOC from disk', async () => {
  setupTestDirectory();

  const config = {
    cache: {
      cacheDir: cacheDir
    }
  };

  const storage = new CacheStorage(config, mockLogger);
  await storage.initialize();

  // Save first
  const html = '<h1>Test</h1>';
  const toc = [
    { id: 'h1', level: 1, text: 'H1' },
    { id: 'h2', level: 2, text: 'H2' }
  ];
  await storage.saveToFile('doc.md', html, toc);

  // Load
  const loaded = await storage.loadFromDisk('doc.md');

  if (!loaded) {
    throw new Error('Failed to load from disk');
  }

  if (!Array.isArray(loaded.toc)) {
    throw new Error('TOC not an array');
  }

  if (loaded.toc.length !== 2) {
    throw new Error('TOC length mismatch');
  }

  if (loaded.toc[0].id !== 'h1') {
    throw new Error('TOC content mismatch');
  }

  cleanupTestDirectory();
});

// Test 6: Cache miss returns null
const test6 = test('Cache miss returns null', async () => {
  setupTestDirectory();

  const config = {
    cache: {
      cacheDir: cacheDir
    }
  };

  const storage = new CacheStorage(config, mockLogger);
  await storage.initialize();

  // Try to load non-existent file
  const loaded = await storage.loadFromDisk('nonexistent.md');

  if (loaded !== null) {
    throw new Error('Cache miss should return null');
  }

  cleanupTestDirectory();
});

// Test 7: Nested directory structure handling
const test7 = test('Nested directory structure handling', async () => {
  setupTestDirectory();

  const config = {
    cache: {
      cacheDir: cacheDir
    }
  };

  const storage = new CacheStorage(config, mockLogger);
  await storage.initialize();

  const html = '<h1>Nested Document</h1>';
  const toc = [{ id: 'nested', level: 1, text: 'Nested' }];

  // Save nested file
  await storage.saveToFile('guide/advanced/nested.md', html, toc);

  // Check directories created
  const htmlPath = path.join(cacheDir, 'html', 'guide', 'advanced', 'nested.html');
  if (!fs.existsSync(htmlPath)) {
    throw new Error('Nested HTML file not created');
  }

  // Load back
  const loaded = await storage.loadFromDisk('guide/advanced/nested.md');
  if (!loaded || loaded.html !== html) {
    throw new Error('Failed to load nested file');
  }

  cleanupTestDirectory();
});

// Test 8: Manifest save and load
const test8 = test('Manifest save and load', async () => {
  setupTestDirectory();

  const config = {
    cache: {
      cacheDir: cacheDir
    }
  };

  const storage = new CacheStorage(config, mockLogger);
  await storage.initialize();

  // Create manifest
  const manifest = {
    version: 1,
    lastUpdated: Date.now(),
    files: [
      { path: 'file1.md', mtime: 123456, size: 1000 },
      { path: 'file2.md', mtime: 234567, size: 2000 }
    ]
  };

  // Save manifest
  await storage.saveManifest(manifest);

  // Load manifest
  const loaded = await storage.loadManifest();

  if (loaded.version !== 1) {
    throw new Error('Manifest version mismatch');
  }

  if (loaded.files.length !== 2) {
    throw new Error('Manifest files count mismatch');
  }

  if (loaded.files[0].path !== 'file1.md') {
    throw new Error('Manifest file path mismatch');
  }

  cleanupTestDirectory();
});

// Test 9: Invalid cache file handling
const test9 = test('Invalid cache file handling', async () => {
  setupTestDirectory();

  const config = {
    cache: {
      cacheDir: cacheDir
    }
  };

  const storage = new CacheStorage(config, mockLogger);
  await storage.initialize();

  // Create invalid JSON file
  const tocPath = path.join(cacheDir, 'toc', 'invalid.json');
  fs.mkdirSync(path.dirname(tocPath), { recursive: true });
  fs.writeFileSync(tocPath, '{invalid json', 'utf-8');

  // Try to load (should return null, not throw)
  const loaded = await storage.loadFromDisk('invalid.md');

  if (loaded !== null) {
    throw new Error('Invalid cache should return null');
  }

  cleanupTestDirectory();
});

// Test 10: Integration test
const test10 = test('Integration: save + load workflow', async () => {
  setupTestDirectory();

  const config = {
    cache: {
      cacheDir: cacheDir
    }
  };

  const storage = new CacheStorage(config, mockLogger);
  await storage.initialize();

  // Save multiple files
  const files = [
    {
      path: 'doc1.md',
      html: '<h1>Doc 1</h1>',
      toc: [{ id: 'doc-1', level: 1, text: 'Doc 1' }]
    },
    {
      path: 'doc2.md',
      html: '<h1>Doc 2</h1>',
      toc: [{ id: 'doc-2', level: 1, text: 'Doc 2' }]
    },
    {
      path: 'guide/intro.md',
      html: '<h1>Intro</h1>',
      toc: [{ id: 'intro', level: 1, text: 'Intro' }]
    }
  ];

  for (const file of files) {
    await storage.saveToFile(file.path, file.html, file.toc);
  }

  // Load all back
  for (const file of files) {
    const loaded = await storage.loadFromDisk(file.path);

    if (!loaded) {
      throw new Error(`Failed to load ${file.path}`);
    }

    if (loaded.html !== file.html) {
      throw new Error(`HTML mismatch for ${file.path}`);
    }

    if (JSON.stringify(loaded.toc) !== JSON.stringify(file.toc)) {
      throw new Error(`TOC mismatch for ${file.path}`);
    }
  }

  // Save manifest
  const manifest = {
    version: 1,
    lastUpdated: Date.now(),
    files: files.map(f => ({ path: f.path, mtime: Date.now(), size: f.html.length }))
  };

  await storage.saveManifest(manifest);

  // Load and verify manifest
  const loadedManifest = await storage.loadManifest();

  if (loadedManifest.files.length !== 3) {
    throw new Error('Manifest file count mismatch');
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
    console.log('\n🎉 Phase 4-1 Complete!');
    console.log('📊 Cache storage validated:');
    console.log('   ✅ Directory initialization');
    console.log('   ✅ HTML/TOC disk persistence');
    console.log('   ✅ Load from disk');
    console.log('   ✅ Nested directory handling');
    console.log('   ✅ Manifest management');
    console.log('   ✅ Ready for Phase 4-2 (LRU Eviction)');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  cleanupTestDirectory();
  process.exit(1);
});
