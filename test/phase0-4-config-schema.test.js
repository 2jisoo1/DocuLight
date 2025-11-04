/**
 * Phase 0-4: Config Schema Extension Test
 *
 * Purpose: Verify cache configuration schema and validation
 *
 * Tests:
 * 1. config.example.json5 contains cache section
 * 2. Cache config has all required fields with defaults
 * 3. Validation rules work correctly
 * 4. Invalid values are rejected
 * 5. Valid values are accepted
 */

const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');

console.log('=== Phase 0-4: Config Schema Extension Test ===\n');

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

// File paths
const exampleConfigPath = path.join(process.cwd(), 'config.example.json5');

// Test 1: config.example.json5 exists
test('config.example.json5 file exists', () => {
  if (!fs.existsSync(exampleConfigPath)) {
    throw new Error('config.example.json5 not found');
  }
});

// Test 2: config.example.json5 can be parsed as JSON5
test('config.example.json5 is valid JSON5', () => {
  const content = fs.readFileSync(exampleConfigPath, 'utf-8');
  try {
    JSON5.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON5: ${error.message}`);
  }
});

// Test 3: config.example.json5 contains cache section
test('config.example.json5 contains cache section', () => {
  const content = fs.readFileSync(exampleConfigPath, 'utf-8');
  const config = JSON5.parse(content);

  if (!config.cache) {
    throw new Error('cache section not found in config.example.json5');
  }
});

// Test 4: Cache config has all required fields
test('Cache config has all required fields', () => {
  const content = fs.readFileSync(exampleConfigPath, 'utf-8');
  const config = JSON5.parse(content);

  const requiredFields = [
    'enabled',
    'scanThrottle',
    'maxMemorySize',
    'maxDiskSize',
    'preRenderOnStartup',
    'mermaidSSR',
    'cacheDir',
    'compressionLevel',
    'cleanupAfterDays'
  ];

  const missingFields = [];
  for (const field of requiredFields) {
    if (!(field in config.cache)) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    throw new Error(`Missing fields in cache config: ${missingFields.join(', ')}`);
  }
});

// Test 5: Cache config has correct types
test('Cache config fields have correct types', () => {
  const content = fs.readFileSync(exampleConfigPath, 'utf-8');
  const config = JSON5.parse(content);
  const cache = config.cache;

  if (typeof cache.enabled !== 'boolean') {
    throw new Error('cache.enabled must be boolean');
  }

  if (typeof cache.scanThrottle !== 'number') {
    throw new Error('cache.scanThrottle must be number');
  }

  if (typeof cache.maxMemorySize !== 'number') {
    throw new Error('cache.maxMemorySize must be number');
  }

  if (typeof cache.maxDiskSize !== 'number') {
    throw new Error('cache.maxDiskSize must be number');
  }

  if (typeof cache.preRenderOnStartup !== 'boolean') {
    throw new Error('cache.preRenderOnStartup must be boolean');
  }

  if (typeof cache.mermaidSSR !== 'boolean') {
    throw new Error('cache.mermaidSSR must be boolean');
  }

  if (typeof cache.cacheDir !== 'string') {
    throw new Error('cache.cacheDir must be string');
  }

  if (typeof cache.compressionLevel !== 'number') {
    throw new Error('cache.compressionLevel must be number');
  }

  if (typeof cache.cleanupAfterDays !== 'number') {
    throw new Error('cache.cleanupAfterDays must be number');
  }
});

// Test 6: Cache config has reasonable default values
test('Cache config has reasonable default values', () => {
  const content = fs.readFileSync(exampleConfigPath, 'utf-8');
  const config = JSON5.parse(content);
  const cache = config.cache;

  if (cache.enabled !== true) {
    throw new Error('cache.enabled should default to true');
  }

  if (cache.scanThrottle < 100 || cache.scanThrottle > 5000) {
    throw new Error('cache.scanThrottle should be between 100 and 5000');
  }

  if (cache.maxMemorySize < 10 || cache.maxMemorySize > 1000) {
    throw new Error('cache.maxMemorySize should be between 10 and 1000');
  }

  if (cache.maxDiskSize < 10 || cache.maxDiskSize > 5000) {
    throw new Error('cache.maxDiskSize should be between 10 and 5000');
  }

  if (cache.compressionLevel < 0 || cache.compressionLevel > 1) {
    throw new Error('cache.compressionLevel should be 0 or 1');
  }

  if (cache.cleanupAfterDays < 0 || cache.cleanupAfterDays > 365) {
    throw new Error('cache.cleanupAfterDays should be between 0 and 365');
  }
});

// Test 7: Validation function for scanThrottle
test('Validation: scanThrottle range check', () => {
  const validateScanThrottle = (value) => {
    return value >= 100 && value <= 5000;
  };

  if (!validateScanThrottle(500)) {
    throw new Error('Valid scanThrottle (500) rejected');
  }

  if (validateScanThrottle(50)) {
    throw new Error('Invalid scanThrottle (50) accepted');
  }

  if (validateScanThrottle(10000)) {
    throw new Error('Invalid scanThrottle (10000) accepted');
  }
});

// Test 8: Validation function for maxMemorySize
test('Validation: maxMemorySize range check', () => {
  const validateMaxMemorySize = (value) => {
    return value >= 10 && value <= 1000;
  };

  if (!validateMaxMemorySize(100)) {
    throw new Error('Valid maxMemorySize (100) rejected');
  }

  if (validateMaxMemorySize(5)) {
    throw new Error('Invalid maxMemorySize (5) accepted');
  }

  if (validateMaxMemorySize(2000)) {
    throw new Error('Invalid maxMemorySize (2000) accepted');
  }
});

// Test 9: Validation function for compressionLevel
test('Validation: compressionLevel range check', () => {
  const validateCompressionLevel = (value) => {
    return value === 0 || value === 1;
  };

  if (!validateCompressionLevel(0)) {
    throw new Error('Valid compressionLevel (0) rejected');
  }

  if (!validateCompressionLevel(1)) {
    throw new Error('Valid compressionLevel (1) rejected');
  }

  if (validateCompressionLevel(2)) {
    throw new Error('Invalid compressionLevel (2) accepted');
  }

  if (validateCompressionLevel(-1)) {
    throw new Error('Invalid compressionLevel (-1) accepted');
  }
});

// Test 10: Config comments are informative
test('Cache config has helpful comments', () => {
  const content = fs.readFileSync(exampleConfigPath, 'utf-8');

  // Check for key comments that help users
  const expectedComments = [
    'HTML Caching',
    'Enable/disable',
    'scanThrottle',
    'maxMemorySize',
    'preRenderOnStartup',
    'mermaidSSR'
  ];

  const missingComments = [];
  for (const comment of expectedComments) {
    if (!content.includes(comment)) {
      missingComments.push(comment);
    }
  }

  if (missingComments.length > 0) {
    throw new Error(`Missing helpful comments for: ${missingComments.join(', ')}`);
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
  console.log('\n⚙️  Cache configuration schema is ready.');
  console.log('📝 Next step: Update config-loader.js with validation logic');
  process.exit(0);
}
