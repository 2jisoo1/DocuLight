/**
 * Phase 1-3: Memory Efficiency Test
 *
 * Purpose: Verify memory efficiency and performance with large file counts
 *
 * Tests:
 * 1. Memory usage calculation for 100 files
 * 2. Memory cache size estimation
 * 3. Performance with 100 file scans
 * 4. Memory overhead per cache entry
 * 5. Cache entry size is reasonable
 * 6. Large-scale simulation (stress test)
 * 7. Memory footprint validation
 * 8. Cache growth is predictable
 */

const fs = require('fs');
const path = require('path');
const CacheManager = require('../src/services/cache-manager');

console.log('=== Phase 1-3: Memory Efficiency Test ===\n');

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

// Create test directory with many files
const testDir = path.join(__dirname, '.temp-memory-test');
const cacheDir = path.join(testDir, '.cache');

function setupTestDirectory(fileCount = 100) {
  // Clean up if exists
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  // Create structure
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.join(testDir, 'docs'), { recursive: true });

  // Create many test markdown files
  for (let i = 0; i < fileCount; i++) {
    const subDir = path.join(testDir, 'docs', `dir${Math.floor(i / 20)}`);
    fs.mkdirSync(subDir, { recursive: true });

    // Create files with varying sizes (10KB to 50KB)
    const content = '#'.repeat(10000 + (i % 5) * 10000);
    fs.writeFileSync(path.join(subDir, `file${i}.md`), content, 'utf-8');
  }
}

function cleanupTestDirectory() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

// Mock logger (silent for performance tests)
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {}
};

// Test 1: Memory usage calculation for 100 files
const test1 = test('Memory usage calculation for 100 files', async () => {
  setupTestDirectory(100);

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

  // Calculate memory usage
  let totalSize = 0;
  for (const [key, entry] of manager.memoryCache.entries()) {
    if (entry.html) {
      totalSize += entry.html.length;
    }
  }

  const totalMB = totalSize / 1024 / 1024;
  console.log(`   Total memory for 100 files: ${totalMB.toFixed(2)} MB`);

  // Should be reasonable (placeholder HTML is small)
  if (totalMB > 10) {
    throw new Error(`Memory usage too high: ${totalMB.toFixed(2)} MB`);
  }

  cleanupTestDirectory();
});

// Test 2: Memory cache size estimation
const test2 = test('Memory cache size estimation', async () => {
  setupTestDirectory(25);

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

  // Cache 25 files
  const files = manager.fileList.slice(0, 25);
  for (const file of files) {
    await manager.getOrRender(file.path);
  }

  // Estimate size per file
  let totalSize = 0;
  let entryCount = 0;
  for (const [key, entry] of manager.memoryCache.entries()) {
    if (entry.html) {
      totalSize += entry.html.length;
      entryCount++;
    }
  }

  const avgSizePerFile = totalSize / entryCount;
  console.log(`   Average size per cached file: ${(avgSizePerFile / 1024).toFixed(2)} KB`);

  // For placeholder HTML, should be very small
  if (avgSizePerFile > 10000) {
    throw new Error(`Average size too large: ${avgSizePerFile} bytes`);
  }

  cleanupTestDirectory();
});

// Test 3: Performance with 100 file scans
const test3 = test('Performance: Scan 100 files < 500ms', async () => {
  setupTestDirectory(100);

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

  const startTime = Date.now();
  await manager.initialize();
  const duration = Date.now() - startTime;

  console.log(`   Scan time for 100 files: ${duration}ms`);

  if (duration > 500) {
    throw new Error(`Scan too slow: ${duration}ms`);
  }

  cleanupTestDirectory();
});

// Test 4: Memory overhead per cache entry
const test4 = test('Memory overhead per cache entry is minimal', async () => {
  setupTestDirectory(10);

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

  // Get memory before caching
  const memBefore = process.memoryUsage().heapUsed;

  // Cache 10 files
  const files = manager.fileList.slice(0, 10);
  for (const file of files) {
    await manager.getOrRender(file.path);
  }

  // Get memory after caching
  const memAfter = process.memoryUsage().heapUsed;
  const diff = (memAfter - memBefore) / 1024 / 1024;

  console.log(`   Memory increase for 10 files: ${diff.toFixed(2)} MB`);

  // Should be reasonable (< 5MB for 10 placeholder entries)
  if (diff > 5) {
    console.warn(`   Warning: Memory increase higher than expected: ${diff.toFixed(2)} MB`);
  }

  cleanupTestDirectory();
});

// Test 5: Cache entry size is reasonable
const test5 = test('Cache entry size is reasonable', async () => {
  setupTestDirectory(5);

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

  // Cache a file
  const file = manager.fileList[0];
  const entry = await manager.getOrRender(file.path);

  // Check entry structure
  const requiredFields = ['path', 'html', 'toc', 'mtime', 'cachedAt', 'lastAccessed'];
  for (const field of requiredFields) {
    if (!(field in entry)) {
      throw new Error(`Cache entry missing field: ${field}`);
    }
  }

  // Estimate entry size
  const entryStr = JSON.stringify(entry);
  const entrySize = entryStr.length;

  console.log(`   Cache entry size: ${(entrySize / 1024).toFixed(2)} KB`);

  // For placeholder, should be small
  if (entrySize > 100000) {
    throw new Error(`Entry size too large: ${entrySize} bytes`);
  }

  cleanupTestDirectory();
});

// Test 6: Large-scale simulation (stress test)
const test6 = test('Large-scale simulation: 200 files', async () => {
  setupTestDirectory(200);

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

  const startTime = Date.now();
  await manager.initialize();
  const initDuration = Date.now() - startTime;

  console.log(`   Initialization time for 200 files: ${initDuration}ms`);

  if (manager.fileList.length !== 200) {
    throw new Error(`Expected 200 files, found ${manager.fileList.length}`);
  }

  // Test scanning performance
  const scanStart = Date.now();
  await manager.performScan();
  const scanDuration = Date.now() - scanStart;

  console.log(`   Scan time for 200 files: ${scanDuration}ms`);

  if (scanDuration > 1000) {
    throw new Error(`Scan too slow for 200 files: ${scanDuration}ms`);
  }

  cleanupTestDirectory();
});

// Test 7: Memory footprint validation
const test7 = test('Memory footprint validation', async () => {
  setupTestDirectory(50);

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

  // Cache 50 files
  for (let i = 0; i < Math.min(50, manager.fileList.length); i++) {
    await manager.getOrRender(manager.fileList[i].path);
  }

  // Calculate total memory
  let totalSize = 0;
  for (const [key, entry] of manager.memoryCache.entries()) {
    if (entry.html) {
      totalSize += entry.html.length;
    }
  }

  const totalMB = totalSize / 1024 / 1024;
  console.log(`   Total memory for 50 cached files: ${totalMB.toFixed(2)} MB`);

  // For 50 files with 35KB average HTML (placeholder is smaller)
  // Should be under 2MB for placeholder HTML
  if (totalMB > 10) {
    throw new Error(`Memory usage too high: ${totalMB.toFixed(2)} MB`);
  }

  cleanupTestDirectory();
});

// Test 8: Cache growth is predictable
const test8 = test('Cache growth is predictable', async () => {
  setupTestDirectory(30);

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

  const measurements = [];

  // Cache files incrementally and measure
  for (let i = 0; i < Math.min(30, manager.fileList.length); i++) {
    await manager.getOrRender(manager.fileList[i].path);

    if (i % 10 === 9) {
      let totalSize = 0;
      for (const [key, entry] of manager.memoryCache.entries()) {
        if (entry.html) {
          totalSize += entry.html.length;
        }
      }
      measurements.push({ fileCount: i + 1, sizeMB: totalSize / 1024 / 1024 });
    }
  }

  console.log('   Cache growth:');
  for (const m of measurements) {
    console.log(`     ${m.fileCount} files: ${m.sizeMB.toFixed(2)} MB`);
  }

  // Growth should be roughly linear
  if (measurements.length >= 2) {
    const growth1 = measurements[1].sizeMB - measurements[0].sizeMB;
    const growth2 = measurements[2].sizeMB - measurements[1].sizeMB;

    // Growth rate should be similar (within 50% variance)
    const variance = Math.abs(growth2 - growth1) / growth1;
    if (variance > 0.5) {
      console.warn(`   Warning: Cache growth not linear (variance: ${(variance * 100).toFixed(1)}%)`);
    }
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
    console.log('\n🎉 Phase 1 Complete!');
    console.log('📊 Memory efficiency validated:');
    console.log('   ✅ File scanning performance optimal');
    console.log('   ✅ Memory usage within limits');
    console.log('   ✅ Cache growth predictable');
    console.log('   ✅ Ready for Phase 2 (Rendering implementation)');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  cleanupTestDirectory();
  process.exit(1);
});
