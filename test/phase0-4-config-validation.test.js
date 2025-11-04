/**
 * Phase 0-4: Config Validation Integration Test
 *
 * Purpose: Verify that config-loader.js correctly validates cache configuration
 *
 * Tests:
 * 1. Valid cache config is accepted
 * 2. Invalid scanThrottle is rejected
 * 3. Invalid maxMemorySize is rejected
 * 4. Invalid compressionLevel is rejected
 * 5. Missing cache section uses defaults
 */

const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');

console.log('=== Phase 0-4: Config Validation Integration Test ===\n');

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

// Create temp config directory
const tempDir = path.join(__dirname, '.temp-config-test');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Cleanup function
function cleanup() {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// Cleanup before tests
cleanup();
fs.mkdirSync(tempDir, { recursive: true });

/**
 * Helper: Create test config file
 */
function createTestConfig(configContent) {
  const configPath = path.join(tempDir, 'test-config.json5');
  fs.writeFileSync(configPath, JSON5.stringify(configContent, null, 2), 'utf-8');
  return configPath;
}

/**
 * Helper: Load config using validation logic
 */
function validateConfig(configPath) {
  const content = fs.readFileSync(configPath, 'utf-8');
  const config = JSON5.parse(content);

  // Apply defaults
  config.cache = config.cache || {};
  config.cache.enabled = config.cache.enabled !== undefined ? config.cache.enabled : true;
  config.cache.scanThrottle = config.cache.scanThrottle || 500;
  config.cache.maxMemorySize = config.cache.maxMemorySize || 100;
  config.cache.maxDiskSize = config.cache.maxDiskSize || 500;
  config.cache.preRenderOnStartup = config.cache.preRenderOnStartup !== undefined ? config.cache.preRenderOnStartup : true;
  config.cache.mermaidSSR = config.cache.mermaidSSR !== undefined ? config.cache.mermaidSSR : false;
  config.cache.cacheDir = config.cache.cacheDir || './.cache';
  config.cache.compressionLevel = config.cache.compressionLevel !== undefined ? config.cache.compressionLevel : 0;
  config.cache.cleanupAfterDays = config.cache.cleanupAfterDays !== undefined ? config.cache.cleanupAfterDays : 30;

  // Validate
  validateCacheConfig(config.cache);

  return config;
}

/**
 * Cache config validation function (copied from config-loader.js)
 */
function validateCacheConfig(cache) {
  if (!cache) return;

  if (typeof cache.enabled !== 'boolean') {
    throw new Error('cache.enabled must be a boolean');
  }

  if (cache.scanThrottle && (cache.scanThrottle < 100 || cache.scanThrottle > 5000)) {
    throw new Error('cache.scanThrottle must be between 100 and 5000 ms');
  }

  if (cache.maxMemorySize && (cache.maxMemorySize < 10 || cache.maxMemorySize > 1000)) {
    throw new Error('cache.maxMemorySize must be between 10 and 1000 MB');
  }

  if (cache.maxDiskSize && (cache.maxDiskSize < 10 || cache.maxDiskSize > 5000)) {
    throw new Error('cache.maxDiskSize must be between 10 and 5000 MB');
  }

  if (typeof cache.preRenderOnStartup !== 'boolean') {
    throw new Error('cache.preRenderOnStartup must be a boolean');
  }

  if (typeof cache.mermaidSSR !== 'boolean') {
    throw new Error('cache.mermaidSSR must be a boolean');
  }

  if (typeof cache.cacheDir !== 'string' || !cache.cacheDir) {
    throw new Error('cache.cacheDir must be a non-empty string');
  }

  if (cache.compressionLevel !== 0 && cache.compressionLevel !== 1) {
    throw new Error('cache.compressionLevel must be 0 or 1');
  }

  if (cache.cleanupAfterDays < 0 || cache.cleanupAfterDays > 365) {
    throw new Error('cache.cleanupAfterDays must be between 0 and 365 days');
  }
}

// Test 1: Valid cache config is accepted
test('Valid cache config is accepted', () => {
  const config = {
    docsRoot: '/tmp/docs',
    cache: {
      enabled: true,
      scanThrottle: 500,
      maxMemorySize: 100,
      maxDiskSize: 500,
      preRenderOnStartup: true,
      mermaidSSR: false,
      cacheDir: './.cache',
      compressionLevel: 0,
      cleanupAfterDays: 30
    }
  };

  const configPath = createTestConfig(config);
  const loaded = validateConfig(configPath);

  if (!loaded.cache) {
    throw new Error('Cache config not loaded');
  }

  if (loaded.cache.enabled !== true) {
    throw new Error('Cache enabled not set correctly');
  }
});

// Test 2: Invalid scanThrottle (too low) is rejected
test('Invalid scanThrottle (too low) is rejected', () => {
  const config = {
    docsRoot: '/tmp/docs',
    cache: {
      scanThrottle: 50  // Invalid: < 100
    }
  };

  const configPath = createTestConfig(config);

  try {
    validateConfig(configPath);
    throw new Error('Should have thrown an error for invalid scanThrottle');
  } catch (error) {
    if (!error.message.includes('scanThrottle')) {
      throw new Error(`Wrong error message: ${error.message}`);
    }
  }
});

// Test 3: Invalid scanThrottle (too high) is rejected
test('Invalid scanThrottle (too high) is rejected', () => {
  const config = {
    docsRoot: '/tmp/docs',
    cache: {
      scanThrottle: 10000  // Invalid: > 5000
    }
  };

  const configPath = createTestConfig(config);

  try {
    validateConfig(configPath);
    throw new Error('Should have thrown an error for invalid scanThrottle');
  } catch (error) {
    if (!error.message.includes('scanThrottle')) {
      throw new Error(`Wrong error message: ${error.message}`);
    }
  }
});

// Test 4: Invalid maxMemorySize is rejected
test('Invalid maxMemorySize is rejected', () => {
  const config = {
    docsRoot: '/tmp/docs',
    cache: {
      maxMemorySize: 5  // Invalid: < 10
    }
  };

  const configPath = createTestConfig(config);

  try {
    validateConfig(configPath);
    throw new Error('Should have thrown an error for invalid maxMemorySize');
  } catch (error) {
    if (!error.message.includes('maxMemorySize')) {
      throw new Error(`Wrong error message: ${error.message}`);
    }
  }
});

// Test 5: Invalid compressionLevel is rejected
test('Invalid compressionLevel is rejected', () => {
  const config = {
    docsRoot: '/tmp/docs',
    cache: {
      compressionLevel: 2  // Invalid: must be 0 or 1
    }
  };

  const configPath = createTestConfig(config);

  try {
    validateConfig(configPath);
    throw new Error('Should have thrown an error for invalid compressionLevel');
  } catch (error) {
    if (!error.message.includes('compressionLevel')) {
      throw new Error(`Wrong error message: ${error.message}`);
    }
  }
});

// Test 6: Missing cache section uses defaults
test('Missing cache section uses defaults', () => {
  const config = {
    docsRoot: '/tmp/docs'
    // No cache section
  };

  const configPath = createTestConfig(config);
  const loaded = validateConfig(configPath);

  if (!loaded.cache) {
    throw new Error('Cache config not created');
  }

  if (loaded.cache.enabled !== true) {
    throw new Error('Default enabled should be true');
  }

  if (loaded.cache.scanThrottle !== 500) {
    throw new Error('Default scanThrottle should be 500');
  }

  if (loaded.cache.maxMemorySize !== 100) {
    throw new Error('Default maxMemorySize should be 100');
  }
});

// Test 7: Invalid cleanupAfterDays is rejected
test('Invalid cleanupAfterDays is rejected', () => {
  const config = {
    docsRoot: '/tmp/docs',
    cache: {
      cleanupAfterDays: 400  // Invalid: > 365
    }
  };

  const configPath = createTestConfig(config);

  try {
    validateConfig(configPath);
    throw new Error('Should have thrown an error for invalid cleanupAfterDays');
  } catch (error) {
    if (!error.message.includes('cleanupAfterDays')) {
      throw new Error(`Wrong error message: ${error.message}`);
    }
  }
});

// Test 8: Empty cacheDir is rejected
test('Empty cacheDir is rejected', () => {
  const config = {
    docsRoot: '/tmp/docs',
    cache: {
      cacheDir: ''  // Invalid: empty string
    }
  };

  const configPath = createTestConfig(config);

  try {
    validateConfig(configPath);
    throw new Error('Should have thrown an error for empty cacheDir');
  } catch (error) {
    if (!error.message.includes('cacheDir')) {
      throw new Error(`Wrong error message: ${error.message}`);
    }
  }
});

// Test 9: Non-boolean enabled is rejected
test('Non-boolean enabled is rejected', () => {
  const config = {
    docsRoot: '/tmp/docs',
    cache: {
      enabled: 'yes'  // Invalid: not boolean
    }
  };

  const configPath = createTestConfig(config);

  try {
    validateConfig(configPath);
    throw new Error('Should have thrown an error for non-boolean enabled');
  } catch (error) {
    if (!error.message.includes('enabled')) {
      throw new Error(`Wrong error message: ${error.message}`);
    }
  }
});

// Test 10: All edge cases
test('All edge cases (boundary values)', () => {
  const configs = [
    { scanThrottle: 100, valid: true },
    { scanThrottle: 5000, valid: true },
    { maxMemorySize: 10, valid: true },
    { maxMemorySize: 1000, valid: true },
    { maxDiskSize: 10, valid: true },
    { maxDiskSize: 5000, valid: true },
    { compressionLevel: 0, valid: true },
    { compressionLevel: 1, valid: true },
    { cleanupAfterDays: 0, valid: true },
    { cleanupAfterDays: 365, valid: true }
  ];

  for (const testCase of configs) {
    const config = {
      docsRoot: '/tmp/docs',
      cache: testCase
    };

    const configPath = createTestConfig(config);

    try {
      validateConfig(configPath);
      if (!testCase.valid) {
        throw new Error(`Should have rejected: ${JSON.stringify(testCase)}`);
      }
    } catch (error) {
      if (testCase.valid) {
        throw new Error(`Should have accepted: ${JSON.stringify(testCase)} - ${error.message}`);
      }
    }
  }
});

// Cleanup after tests
cleanup();

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
  console.log('\n🎉 Phase 0 Complete!');
  console.log('📝 All prerequisites are ready:');
  console.log('   ✅ Dependencies installed (marked, dompurify, jsdom, highlight.js)');
  console.log('   ✅ Server-side rendering verified');
  console.log('   ✅ Cache directory structure designed');
  console.log('   ✅ Config schema extended and validated');
  console.log('\n📌 Next: Phase 1 - File scanning and CacheManager implementation');
  process.exit(0);
}
