/**
 * Phase 1-2: CacheManager Test
 *
 * Purpose: Verify CacheManager initialization and basic functionality
 *
 * Tests:
 * 1. CacheManager can be instantiated
 * 2. Initialize scans all files
 * 3. triggerScanIfNeeded respects throttle
 * 4. getOrRender returns placeholder (Phase 2 will implement rendering)
 * 5. Memory cache stores entries
 * 6. File list updates on scan
 * 7. Cache invalidation on file modification
 * 8. Concurrent scan prevention (isScanning flag)
 * 9. performScan updates file metadata
 * 10. Lock mechanism prevents race conditions
 */

const fs = require('fs');
const path = require('path');
const CacheManager = require('../src/services/cache-manager');

console.log('=== Phase 1-2: CacheManager Test ===\n');

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

// Create test directory structure
const testDir = path.join(__dirname, '.temp-cache-manager-test');
const cacheDir = path.join(testDir, '.cache');

function setupTestDirectory() {
  // Clean up if exists
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  // Create structure
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.join(testDir, 'docs'), { recursive: true });

  // Create test markdown files
  fs.writeFileSync(path.join(testDir, 'docs', 'file1.md'), '# File 1', 'utf-8');
  fs.writeFileSync(path.join(testDir, 'docs', 'file2.md'), '# File 2', 'utf-8');
  fs.writeFileSync(path.join(testDir, 'docs', 'file3.md'), '# File 3', 'utf-8');
}

function cleanupTestDirectory() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

// Setup before tests
setupTestDirectory();

// Mock logger
const mockLogger = {
  info: (msg, meta) => console.log(`  [INFO] ${msg}`, meta || ''),
  error: (msg, meta) => console.error(`  [ERROR] ${msg}`, meta || ''),
  warn: (msg, meta) => console.warn(`  [WARN] ${msg}`, meta || ''),
  debug: () => {}
};

// Test 1: CacheManager can be instantiated
const test1 = test('CacheManager can be instantiated', async () => {
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

  if (!manager) {
    throw new Error('CacheManager not instantiated');
  }

  if (!manager.memoryCache) {
    throw new Error('Memory cache not initialized');
  }

  if (!manager.scanner) {
    throw new Error('File scanner not initialized');
  }
});

// Test 2: Initialize scans all files
const test2 = test('Initialize scans all files', async () => {
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

  // Should have scanned files
  if (manager.fileList.length !== 3) {
    throw new Error(`Expected 3 files, found ${manager.fileList.length}`);
  }
});

// Test 3: triggerScanIfNeeded respects throttle
const test3 = test('triggerScanIfNeeded respects throttle', async () => {
  const config = {
    docsRoot: path.join(testDir, 'docs'),
    excludes: [],
    cache: {
      enabled: true,
      scanThrottle: 1000, // 1 second throttle
      maxMemorySize: 100,
      cacheDir: cacheDir,
      preRenderOnStartup: false
    }
  };

  const manager = new CacheManager(config, mockLogger);
  await manager.initialize();

  // First scan should succeed
  const result1 = await manager.triggerScanIfNeeded();
  if (!result1) {
    throw new Error('First scan should have been triggered');
  }

  // Immediate second scan should be throttled
  const result2 = await manager.triggerScanIfNeeded();
  if (result2) {
    throw new Error('Second scan should have been throttled');
  }

  // Wait for throttle period
  await new Promise(resolve => setTimeout(resolve, 1100));

  // Third scan should succeed
  const result3 = await manager.triggerScanIfNeeded();
  if (!result3) {
    throw new Error('Third scan should have been triggered after throttle period');
  }
});

// Test 4: getOrRender returns placeholder
const test4 = test('getOrRender returns placeholder (rendering not yet implemented)', async () => {
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

  const result = await manager.getOrRender('file1.md');

  if (!result) {
    throw new Error('getOrRender returned null');
  }

  if (!result.html) {
    throw new Error('Result missing html field');
  }

  if (!Array.isArray(result.toc)) {
    throw new Error('Result missing toc array');
  }
});

// Test 5: Memory cache stores entries
const test5 = test('Memory cache stores entries', async () => {
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

  // First call - cache miss
  const result1 = await manager.getOrRender('file1.md');
  if (result1.fromCache) {
    throw new Error('First call should be cache miss');
  }

  // Second call - cache hit
  const result2 = await manager.getOrRender('file1.md');
  if (!result2.fromCache) {
    throw new Error('Second call should be cache hit');
  }

  // Check memory cache
  if (manager.memoryCache.size === 0) {
    throw new Error('Memory cache is empty');
  }
});

// Test 6: File list updates on scan
const test6 = test('File list updates on scan', async () => {
  const config = {
    docsRoot: path.join(testDir, 'docs'),
    excludes: [],
    cache: {
      enabled: true,
      scanThrottle: 100,
      maxMemorySize: 100,
      cacheDir: cacheDir,
      preRenderOnStartup: false
    }
  };

  const manager = new CacheManager(config, mockLogger);
  await manager.initialize();

  const initialCount = manager.fileList.length;

  // Add a new file
  fs.writeFileSync(path.join(testDir, 'docs', 'file4.md'), '# File 4', 'utf-8');

  // Wait for throttle
  await new Promise(resolve => setTimeout(resolve, 150));

  // Trigger scan
  await manager.triggerScanIfNeeded();

  // File list should be updated
  if (manager.fileList.length !== initialCount + 1) {
    throw new Error(`Expected ${initialCount + 1} files, found ${manager.fileList.length}`);
  }
});

// Test 7: Cache invalidation on file modification
const test7 = test('Cache invalidation on file modification', async () => {
  const config = {
    docsRoot: path.join(testDir, 'docs'),
    excludes: [],
    cache: {
      enabled: true,
      scanThrottle: 100,
      maxMemorySize: 100,
      cacheDir: cacheDir,
      preRenderOnStartup: false
    }
  };

  const manager = new CacheManager(config, mockLogger);
  await manager.initialize();

  // Cache a file
  await manager.getOrRender('file1.md');

  // Verify it's cached
  if (!manager.memoryCache.has('file1.md')) {
    throw new Error('file1.md not in cache');
  }

  // Modify the file
  await new Promise(resolve => setTimeout(resolve, 10)); // Ensure mtime changes
  fs.writeFileSync(path.join(testDir, 'docs', 'file1.md'), '# Modified File 1', 'utf-8');

  // Wait for throttle
  await new Promise(resolve => setTimeout(resolve, 150));

  // Trigger scan
  await manager.triggerScanIfNeeded();

  // Cache should be invalidated
  if (manager.memoryCache.has('file1.md')) {
    throw new Error('Cache was not invalidated after file modification');
  }
});

// Test 8: Concurrent scan prevention
const test8 = test('Concurrent scan prevention (isScanning flag)', async () => {
  const config = {
    docsRoot: path.join(testDir, 'docs'),
    excludes: [],
    cache: {
      enabled: true,
      scanThrottle: 50,
      maxMemorySize: 100,
      cacheDir: cacheDir,
      preRenderOnStartup: false
    }
  };

  const manager = new CacheManager(config, mockLogger);
  await manager.initialize();

  // Trigger multiple scans concurrently
  const results = await Promise.all([
    manager.triggerScanIfNeeded(),
    manager.triggerScanIfNeeded(),
    manager.triggerScanIfNeeded()
  ]);

  // Only one should succeed
  const successCount = results.filter(r => r === true).length;
  if (successCount !== 1) {
    throw new Error(`Expected 1 successful scan, got ${successCount}`);
  }
});

// Test 9: performScan updates file metadata
const test9 = test('performScan updates file metadata', async () => {
  const config = {
    docsRoot: path.join(testDir, 'docs'),
    excludes: [],
    cache: {
      enabled: true,
      scanThrottle: 100,
      maxMemorySize: 100,
      cacheDir: cacheDir,
      preRenderOnStartup: false
    }
  };

  const manager = new CacheManager(config, mockLogger);
  await manager.initialize();

  const initialFileList = [...manager.fileList];

  // Wait and trigger scan
  await new Promise(resolve => setTimeout(resolve, 150));
  await manager.performScan();

  // File list should have metadata
  if (manager.fileList.length === 0) {
    throw new Error('File list is empty after scan');
  }

  for (const file of manager.fileList) {
    if (!file.path || !file.mtime || file.size === undefined) {
      throw new Error(`File missing metadata: ${JSON.stringify(file)}`);
    }
  }
});

// Test 10: Lock mechanism prevents race conditions
const test10 = test('Lock mechanism prevents race conditions', async () => {
  const config = {
    docsRoot: path.join(testDir, 'docs'),
    excludes: [],
    cache: {
      enabled: true,
      scanThrottle: 50,
      maxMemorySize: 100,
      cacheDir: cacheDir,
      preRenderOnStartup: false
    }
  };

  const manager = new CacheManager(config, mockLogger);
  await manager.initialize();

  // Trigger multiple renders for the same file concurrently
  const results = await Promise.all([
    manager.renderAndCache('file1.md'),
    manager.renderAndCache('file1.md'),
    manager.renderAndCache('file1.md')
  ]);

  // All should succeed
  if (results.length !== 3) {
    throw new Error(`Expected 3 results, got ${results.length}`);
  }

  // All should have the same content (lock prevented concurrent rendering)
  const firstHtml = results[0].html;
  for (let i = 1; i < results.length; i++) {
    if (results[i].html !== firstHtml) {
      throw new Error('Race condition detected - different HTML results');
    }
  }

  // Cache should only have one entry
  if (manager.memoryCache.size > 1) {
    throw new Error(`Expected 1 cache entry, got ${manager.memoryCache.size}`);
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

  // Cleanup after tests
  cleanupTestDirectory();

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
    console.log('\n🔧 CacheManager is ready for rendering implementation (Phase 2).');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  cleanupTestDirectory();
  process.exit(1);
});
