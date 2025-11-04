/**
 * Phase 0-3: Cache Directory Structure Test
 *
 * Purpose: Verify cache directory structure and gitignore configuration
 *
 * Tests:
 * 1. .cache directory can be created
 * 2. .cache/html subdirectory can be created
 * 3. .cache/toc subdirectory can be created
 * 4. .gitignore contains .cache/ entry
 * 5. manifest.json schema is valid
 */

const fs = require('fs');
const path = require('path');

console.log('=== Phase 0-3: Cache Directory Structure Test ===\n');

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

// Cache directory paths
const projectRoot = process.cwd();
const cacheDir = path.join(projectRoot, '.cache');
const htmlDir = path.join(cacheDir, 'html');
const tocDir = path.join(cacheDir, 'toc');
const manifestPath = path.join(cacheDir, 'manifest.json');
const gitignorePath = path.join(projectRoot, '.gitignore');

// Cleanup function
function cleanup() {
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
    console.log('🧹 Cleaned up .cache directory\n');
  }
}

// Cleanup before tests
cleanup();

// Test 1: Create .cache directory
test('Can create .cache directory', () => {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  if (!fs.existsSync(cacheDir)) {
    throw new Error('.cache directory was not created');
  }

  const stats = fs.statSync(cacheDir);
  if (!stats.isDirectory()) {
    throw new Error('.cache exists but is not a directory');
  }
});

// Test 2: Create .cache/html subdirectory
test('Can create .cache/html subdirectory', () => {
  if (!fs.existsSync(htmlDir)) {
    fs.mkdirSync(htmlDir, { recursive: true });
  }

  if (!fs.existsSync(htmlDir)) {
    throw new Error('.cache/html directory was not created');
  }

  const stats = fs.statSync(htmlDir);
  if (!stats.isDirectory()) {
    throw new Error('.cache/html exists but is not a directory');
  }
});

// Test 3: Create .cache/toc subdirectory
test('Can create .cache/toc subdirectory', () => {
  if (!fs.existsSync(tocDir)) {
    fs.mkdirSync(tocDir, { recursive: true });
  }

  if (!fs.existsSync(tocDir)) {
    throw new Error('.cache/toc directory was not created');
  }

  const stats = fs.statSync(tocDir);
  if (!stats.isDirectory()) {
    throw new Error('.cache/toc exists but is not a directory');
  }
});

// Test 4: Verify .gitignore contains .cache/
test('.gitignore contains .cache/ entry', () => {
  if (!fs.existsSync(gitignorePath)) {
    throw new Error('.gitignore file not found');
  }

  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');

  if (!gitignoreContent.includes('.cache/')) {
    throw new Error('.gitignore does not contain .cache/ entry');
  }
});

// Test 5: Create and validate manifest.json schema
test('Can create valid manifest.json', () => {
  const manifest = {
    version: 1,
    lastUpdated: Date.now(),
    files: [
      {
        path: 'guide/intro.md',
        mtime: 1730734567890,
        size: 12345,
        cacheKey: 'guide/intro.md:1730734567890',
        htmlSize: 45678,
        tocItems: 10
      }
    ]
  };

  // Write manifest
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  // Read back and validate
  if (!fs.existsSync(manifestPath)) {
    throw new Error('manifest.json was not created');
  }

  const loadedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  // Validate schema
  if (!loadedManifest.version) {
    throw new Error('manifest.version is missing');
  }

  if (!loadedManifest.lastUpdated) {
    throw new Error('manifest.lastUpdated is missing');
  }

  if (!Array.isArray(loadedManifest.files)) {
    throw new Error('manifest.files is not an array');
  }

  if (loadedManifest.files.length === 0) {
    throw new Error('manifest.files is empty');
  }

  const file = loadedManifest.files[0];
  const requiredFields = ['path', 'mtime', 'size', 'cacheKey', 'htmlSize', 'tocItems'];

  for (const field of requiredFields) {
    if (!(field in file)) {
      throw new Error(`manifest.files[0].${field} is missing`);
    }
  }
});

// Test 6: Verify directory permissions
test('Cache directories have correct permissions', () => {
  const dirs = [cacheDir, htmlDir, tocDir];

  for (const dir of dirs) {
    try {
      // Try to write a test file
      const testFile = path.join(dir, 'test.tmp');
      fs.writeFileSync(testFile, 'test', 'utf-8');

      // Try to read it back
      const content = fs.readFileSync(testFile, 'utf-8');
      if (content !== 'test') {
        throw new Error(`Cannot read test file in ${dir}`);
      }

      // Clean up
      fs.unlinkSync(testFile);
    } catch (error) {
      throw new Error(`Cannot write/read in ${dir}: ${error.message}`);
    }
  }
});

// Test 7: Verify nested directory creation
test('Can create nested cache directories', () => {
  const nestedHtmlDir = path.join(htmlDir, 'guide', 'advanced');
  const nestedTocDir = path.join(tocDir, 'guide', 'advanced');

  fs.mkdirSync(nestedHtmlDir, { recursive: true });
  fs.mkdirSync(nestedTocDir, { recursive: true });

  if (!fs.existsSync(nestedHtmlDir)) {
    throw new Error('Nested HTML directory was not created');
  }

  if (!fs.existsSync(nestedTocDir)) {
    throw new Error('Nested TOC directory was not created');
  }

  // Create test files
  const testHtmlFile = path.join(nestedHtmlDir, 'test.html');
  const testTocFile = path.join(nestedTocDir, 'test.json');

  fs.writeFileSync(testHtmlFile, '<p>Test</p>', 'utf-8');
  fs.writeFileSync(testTocFile, '[]', 'utf-8');

  if (!fs.existsSync(testHtmlFile) || !fs.existsSync(testTocFile)) {
    throw new Error('Test files were not created in nested directories');
  }
});

// Test 8: Verify .cache directory is excluded from git
test('.cache directory should be git-ignored', () => {
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
  const lines = gitignoreContent.split('\n').map(line => line.trim());

  const hasCacheEntry = lines.some(line => {
    return line === '.cache/' || line === '.cache' || line === '/.cache/';
  });

  if (!hasCacheEntry) {
    throw new Error('.cache directory is not properly ignored in .gitignore');
  }
});

// Test 9: Verify manifest can handle large file lists
test('Manifest can handle large file lists', () => {
  const largeManifest = {
    version: 1,
    lastUpdated: Date.now(),
    files: []
  };

  // Generate 1000 files
  for (let i = 0; i < 1000; i++) {
    largeManifest.files.push({
      path: `test/file${i}.md`,
      mtime: Date.now() + i,
      size: 1000 + i,
      cacheKey: `test/file${i}.md:${Date.now() + i}`,
      htmlSize: 5000 + i,
      tocItems: 5
    });
  }

  // Write large manifest
  const largeManifestPath = path.join(cacheDir, 'manifest-large.json');
  fs.writeFileSync(largeManifestPath, JSON.stringify(largeManifest, null, 2), 'utf-8');

  // Read back and validate
  const loaded = JSON.parse(fs.readFileSync(largeManifestPath, 'utf-8'));

  if (loaded.files.length !== 1000) {
    throw new Error(`Expected 1000 files, got ${loaded.files.length}`);
  }

  // Clean up
  fs.unlinkSync(largeManifestPath);
});

// Test 10: Verify cache directory structure matches spec
test('Cache directory structure matches specification', () => {
  const expectedStructure = {
    '.cache': {
      'html': true,
      'toc': true,
      'manifest.json': true
    }
  };

  // Check .cache directory
  if (!fs.existsSync(cacheDir)) {
    throw new Error('.cache directory does not exist');
  }

  // Check html subdirectory
  if (!fs.existsSync(htmlDir)) {
    throw new Error('.cache/html directory does not exist');
  }

  // Check toc subdirectory
  if (!fs.existsSync(tocDir)) {
    throw new Error('.cache/toc directory does not exist');
  }

  // Check manifest.json
  if (!fs.existsSync(manifestPath)) {
    throw new Error('.cache/manifest.json does not exist');
  }

  console.log('   Cache structure is correct:');
  console.log('   ├── .cache/');
  console.log('   │   ├── html/');
  console.log('   │   ├── toc/');
  console.log('   │   └── manifest.json');
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

  // Cleanup on failure
  cleanup();
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  console.log('\n📁 Cache directory structure is ready for use.');
  console.log('ℹ️  Note: .cache directory will be cleaned up to keep the repository clean.');

  // Cleanup on success (for clean test environment)
  cleanup();
  process.exit(0);
}
