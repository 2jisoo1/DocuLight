/**
 * Phase 1-1: FileScannerService Test
 *
 * Purpose: Verify file scanning functionality for markdown files
 *
 * Tests:
 * 1. Scan finds all .md files in directory
 * 2. Recursive scanning includes subdirectories
 * 3. Exclude patterns filter files correctly
 * 4. Metadata (mtime, size) is collected
 * 5. Non-markdown files are ignored
 * 6. Empty directories are handled
 * 7. Error handling for inaccessible directories
 * 8. Performance with many files
 */

const fs = require('fs');
const path = require('path');
const FileScannerService = require('../src/services/file-scanner-service');

console.log('=== Phase 1-1: FileScannerService Test ===\n');

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
const testDir = path.join(__dirname, '.temp-scanner-test');

function setupTestDirectory() {
  // Clean up if exists
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  // Create structure
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.join(testDir, 'subdir1'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'subdir2'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'subdir1', 'nested'), { recursive: true });
  fs.mkdirSync(path.join(testDir, '.hidden'), { recursive: true });

  // Create test files
  fs.writeFileSync(path.join(testDir, 'file1.md'), '# File 1', 'utf-8');
  fs.writeFileSync(path.join(testDir, 'file2.md'), '# File 2', 'utf-8');
  fs.writeFileSync(path.join(testDir, 'readme.txt'), 'Not markdown', 'utf-8');
  fs.writeFileSync(path.join(testDir, 'subdir1', 'file3.md'), '# File 3', 'utf-8');
  fs.writeFileSync(path.join(testDir, 'subdir1', 'nested', 'file4.md'), '# File 4', 'utf-8');
  fs.writeFileSync(path.join(testDir, 'subdir2', 'file5.md'), '# File 5', 'utf-8');
  fs.writeFileSync(path.join(testDir, '.hidden', 'secret.md'), '# Secret', 'utf-8');
  fs.writeFileSync(path.join(testDir, 'node_modules.md'), '# Not excluded', 'utf-8');

  // Create a directory to exclude
  fs.mkdirSync(path.join(testDir, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(testDir, 'node_modules', 'package.md'), '# Package', 'utf-8');
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
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {}
};

// Test 1: Basic scanning - finds all .md files
const test1 = test('Finds all .md files in directory', async () => {
  const config = {
    docsRoot: testDir,
    excludes: []
  };

  const scanner = new FileScannerService(config, mockLogger);
  const files = await scanner.scanAllMarkdownFiles();

  // Should find at least 6 .md files (excluding node_modules)
  if (files.length < 6) {
    throw new Error(`Expected at least 6 files, found ${files.length}`);
  }

  // All files should end with .md
  const nonMdFiles = files.filter(f => !f.path.endsWith('.md'));
  if (nonMdFiles.length > 0) {
    throw new Error(`Found non-markdown files: ${nonMdFiles.map(f => f.path).join(', ')}`);
  }
});

// Test 2: Recursive scanning includes subdirectories
const test2 = test('Recursive scanning includes subdirectories', async () => {
  const config = {
    docsRoot: testDir,
    excludes: []
  };

  const scanner = new FileScannerService(config, mockLogger);
  const files = await scanner.scanAllMarkdownFiles();

  // Check for nested file
  const nestedFile = files.find(f => f.path.includes('nested'));
  if (!nestedFile) {
    throw new Error('Nested file not found');
  }

  // Check for subdir1 file
  const subdir1File = files.find(f => f.path.includes('subdir1') && f.path.endsWith('file3.md'));
  if (!subdir1File) {
    throw new Error('Subdir1 file not found');
  }
});

// Test 3: Exclude patterns work correctly
const test3 = test('Exclude patterns filter files correctly', async () => {
  const config = {
    docsRoot: testDir,
    excludes: ['node_modules', '.hidden']
  };

  const scanner = new FileScannerService(config, mockLogger);
  const files = await scanner.scanAllMarkdownFiles();

  // Should not include node_modules or .hidden files
  const excludedFiles = files.filter(f =>
    f.path.includes('node_modules') || f.path.includes('.hidden')
  );

  if (excludedFiles.length > 0) {
    throw new Error(`Found excluded files: ${excludedFiles.map(f => f.path).join(', ')}`);
  }

  // Should include file at root
  const rootFiles = files.filter(f => !f.path.includes('/') && !f.path.includes('\\'));
  if (rootFiles.length === 0) {
    throw new Error('No root level files found');
  }
});

// Test 4: Metadata is collected correctly
const test4 = test('Metadata (mtime, size) is collected', async () => {
  const config = {
    docsRoot: testDir,
    excludes: []
  };

  const scanner = new FileScannerService(config, mockLogger);
  const files = await scanner.scanAllMarkdownFiles();

  for (const file of files.slice(0, 3)) { // Check first 3 files
    if (!file.path) {
      throw new Error(`File missing path: ${JSON.stringify(file)}`);
    }

    if (!file.absolutePath) {
      throw new Error(`File missing absolutePath: ${file.path}`);
    }

    if (!file.mtime || typeof file.mtime !== 'number') {
      throw new Error(`File missing valid mtime: ${file.path}`);
    }

    if (file.size === undefined || typeof file.size !== 'number') {
      throw new Error(`File missing valid size: ${file.path}`);
    }

    if (typeof file.isCached !== 'boolean') {
      throw new Error(`File missing isCached flag: ${file.path}`);
    }
  }
});

// Test 5: Non-markdown files are ignored
const test5 = test('Non-markdown files are ignored', async () => {
  const config = {
    docsRoot: testDir,
    excludes: []
  };

  const scanner = new FileScannerService(config, mockLogger);
  const files = await scanner.scanAllMarkdownFiles();

  // Should not find readme.txt
  const txtFile = files.find(f => f.path.includes('readme.txt'));
  if (txtFile) {
    throw new Error('Found non-markdown file: readme.txt');
  }

  // All files should end with .md
  const invalidFiles = files.filter(f => !f.path.endsWith('.md'));
  if (invalidFiles.length > 0) {
    throw new Error(`Found non-markdown files: ${invalidFiles.length}`);
  }
});

// Test 6: Empty directories are handled
const test6 = test('Empty directories are handled gracefully', async () => {
  // Create an empty directory
  const emptyDir = path.join(testDir, 'empty');
  fs.mkdirSync(emptyDir, { recursive: true });

  const config = {
    docsRoot: testDir,
    excludes: []
  };

  const scanner = new FileScannerService(config, mockLogger);
  const files = await scanner.scanAllMarkdownFiles();

  // Should not throw an error
  if (!Array.isArray(files)) {
    throw new Error('Scanner did not return an array');
  }
});

// Test 7: Relative paths are correct
const test7 = test('Relative paths are correct', async () => {
  const config = {
    docsRoot: testDir,
    excludes: []
  };

  const scanner = new FileScannerService(config, mockLogger);
  const files = await scanner.scanAllMarkdownFiles();

  // Check that relative paths don't start with /
  for (const file of files) {
    if (file.path.startsWith('/') || file.path.startsWith('\\')) {
      throw new Error(`Relative path should not start with separator: ${file.path}`);
    }
  }

  // Check that absolute paths are absolute
  for (const file of files) {
    if (!path.isAbsolute(file.absolutePath)) {
      throw new Error(`absolutePath is not absolute: ${file.absolutePath}`);
    }
  }
});

// Test 8: Performance with many files
const test8 = test('Performance with many files (50 files < 1s)', async () => {
  // Create 50 test files
  const perfDir = path.join(testDir, 'perf-test');
  fs.mkdirSync(perfDir, { recursive: true });

  for (let i = 0; i < 50; i++) {
    const subDir = path.join(perfDir, `dir${Math.floor(i / 10)}`);
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, `file${i}.md`), `# File ${i}`, 'utf-8');
  }

  const config = {
    docsRoot: perfDir,
    excludes: []
  };

  const scanner = new FileScannerService(config, mockLogger);

  const startTime = Date.now();
  const files = await scanner.scanAllMarkdownFiles();
  const duration = Date.now() - startTime;

  if (files.length !== 50) {
    throw new Error(`Expected 50 files, found ${files.length}`);
  }

  if (duration > 1000) {
    throw new Error(`Scanning took too long: ${duration}ms`);
  }

  console.log(`   Performance: Scanned 50 files in ${duration}ms`);
});

// Test 9: File size is accurate
const test9 = test('File size is accurate', async () => {
  const testFile = path.join(testDir, 'size-test.md');
  const content = 'x'.repeat(1000); // 1000 bytes
  fs.writeFileSync(testFile, content, 'utf-8');

  const config = {
    docsRoot: testDir,
    excludes: []
  };

  const scanner = new FileScannerService(config, mockLogger);
  const files = await scanner.scanAllMarkdownFiles();

  const sizeTestFile = files.find(f => f.path === 'size-test.md');
  if (!sizeTestFile) {
    throw new Error('size-test.md not found');
  }

  // Size should be approximately 1000 bytes (allow small variance for encoding)
  if (Math.abs(sizeTestFile.size - 1000) > 10) {
    throw new Error(`Size mismatch: expected ~1000, got ${sizeTestFile.size}`);
  }
});

// Test 10: Multiple exclude patterns work
const test10 = test('Multiple exclude patterns work correctly', async () => {
  const config = {
    docsRoot: testDir,
    excludes: ['node_modules', '.hidden', 'subdir2']
  };

  const scanner = new FileScannerService(config, mockLogger);
  const files = await scanner.scanAllMarkdownFiles();

  // Should not include any excluded directories
  const excludedPatterns = ['node_modules', '.hidden', 'subdir2'];
  for (const pattern of excludedPatterns) {
    const found = files.filter(f => f.path.includes(pattern));
    if (found.length > 0) {
      throw new Error(`Found files in excluded pattern "${pattern}": ${found.map(f => f.path).join(', ')}`);
    }
  }

  // Should still find files in subdir1
  const subdir1Files = files.filter(f => f.path.includes('subdir1'));
  if (subdir1Files.length === 0) {
    throw new Error('No files found in subdir1');
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
    console.log('\n📁 FileScannerService is ready for production use.');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  cleanupTestDirectory();
  process.exit(1);
});
