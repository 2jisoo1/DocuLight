/**
 * Phase 2 Tests - Document Pipeline
 * Run: node test/chatbot/test-phase2.js
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const { parseFrontmatter, loadMarkdownWithFrontmatter, findMarkdownFiles } = require('../../src/services/chatbot/doc-loader.js');
const { VectorStoreManager } = require('../../src/services/chatbot/vector-store.js');
const { DocWatcher } = require('../../src/services/chatbot/doc-watcher.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return (async () => {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (error) {
      console.log(`  ❌ ${name}`);
      console.log(`     Error: ${error.message}`);
      failed++;
    }
  })();
}

function expect(value) {
  return {
    toBe(expected) {
      if (value !== expected) {
        throw new Error(`Expected ${expected}, got ${value}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(value) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
    },
    toBeDefined() {
      if (value === undefined) {
        throw new Error('Expected value to be defined');
      }
    },
    toBeGreaterThan(num) {
      if (!(value > num)) {
        throw new Error(`Expected ${value} to be greater than ${num}`);
      }
    },
    toContain(item) {
      if (typeof value === 'string') {
        if (!value.includes(item)) {
          throw new Error(`Expected string to contain "${item}"`);
        }
      } else if (Array.isArray(value)) {
        if (!value.includes(item)) {
          throw new Error(`Expected array to contain "${item}"`);
        }
      }
    },
    toBeTruthy() {
      if (!value) {
        throw new Error(`Expected truthy value, got ${value}`);
      }
    },
    toBeFalsy() {
      if (value) {
        throw new Error(`Expected falsy value, got ${value}`);
      }
    }
  };
}

async function runTests() {
  console.log('\n🧪 Phase 2: Document Pipeline Tests\n');

  // ==========================================
  console.log('DocLoader - parseFrontmatter:');
  // ==========================================

  await test('should parse YAML frontmatter', () => {
    const content = `---
name: Test Doc
description: A test document
---
# Heading
Body content`;

    const { frontmatter, body } = parseFrontmatter(content);

    expect(frontmatter.name).toBe('Test Doc');
    expect(frontmatter.description).toBe('A test document');
    expect(body.trim()).toContain('# Heading');
  });

  await test('should handle no frontmatter', () => {
    const content = '# Heading\nBody content';
    const { frontmatter, body } = parseFrontmatter(content);

    expect(Object.keys(frontmatter).length).toBe(0);
    expect(body).toBe(content);
  });

  await test('should handle quoted values', () => {
    const content = `---
name: "Quoted Value"
other: 'Single Quoted'
---
Body`;

    const { frontmatter } = parseFrontmatter(content);

    expect(frontmatter.name).toBe('Quoted Value');
    expect(frontmatter.other).toBe('Single Quoted');
  });

  await test('should parse numeric values', () => {
    const content = `---
count: 42
price: 19.99
enabled: true
disabled: false
---
Body`;

    const { frontmatter } = parseFrontmatter(content);

    expect(frontmatter.count).toBe(42);
    expect(frontmatter.price).toBe(19.99);
    expect(frontmatter.enabled).toBe(true);
    expect(frontmatter.disabled).toBe(false);
  });

  // ==========================================
  console.log('\nDocLoader - loadMarkdownWithFrontmatter:');
  // ==========================================

  await test('should load file and parse frontmatter', async () => {
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, 'test-doc-' + Date.now() + '.md');
    await fs.writeFile(tmpFile, `---
name: Test
description: Test file
---
# Content
Some body text`);

    try {
      const result = await loadMarkdownWithFrontmatter(tmpFile);

      expect(result.metadata.name).toBe('Test');
      expect(result.metadata.description).toBe('Test file');
      expect(result.metadata.filePath).toBe(tmpFile);
      expect(result.metadata.source).toContain('test-doc-');
      expect(result.pageContent).toContain('# Content');
    } finally {
      await fs.unlink(tmpFile);
    }
  });

  // ==========================================
  console.log('\nDocLoader - findMarkdownFiles:');
  // ==========================================

  await test('should find markdown files in directory', async () => {
    const tmpDir = path.join(os.tmpdir(), 'doclight-test-' + Date.now());
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'subdir'), { recursive: true });

    await fs.writeFile(path.join(tmpDir, 'test1.md'), '# Test 1');
    await fs.writeFile(path.join(tmpDir, 'test2.md'), '# Test 2');
    await fs.writeFile(path.join(tmpDir, 'subdir', 'test3.md'), '# Test 3');
    await fs.writeFile(path.join(tmpDir, 'ignore.txt'), 'Not markdown');

    try {
      const files = await findMarkdownFiles(tmpDir);

      expect(files.length).toBe(3);
      expect(files.some(f => f.endsWith('test1.md'))).toBeTruthy();
      expect(files.some(f => f.endsWith('test3.md'))).toBeTruthy();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  // ==========================================
  console.log('\nVectorStoreManager:');
  // ==========================================

  await test('should initialize correctly', async () => {
    // Mock embeddings
    const mockEmbeddings = {
      embedDocuments: async (docs) => docs.map(() => new Array(1536).fill(0.1)),
      embedQuery: async (query) => new Array(1536).fill(0.1)
    };

    const manager = new VectorStoreManager(mockEmbeddings, {
      chunkSize: 500,
      chunkOverlap: 100
    });

    await manager.initialize();

    const stats = manager.getStats();
    expect(stats.isInitialized).toBe(true);
    expect(stats.totalDocs).toBe(0);
    expect(stats.totalChunks).toBe(0);
  });

  await test('should add document and create chunks', async () => {
    const mockEmbeddings = {
      embedDocuments: async (docs) => docs.map(() => new Array(1536).fill(0.1)),
      embedQuery: async (query) => new Array(1536).fill(0.1)
    };

    const manager = new VectorStoreManager(mockEmbeddings, {
      chunkSize: 100,
      chunkOverlap: 20
    });

    await manager.initialize();

    const content = '# Title\n\n' + 'Lorem ipsum dolor sit amet. '.repeat(50);
    const result = await manager.addDocument('/test/doc.md', content, { name: 'Test' });

    expect(result.added).toBe(true);
    expect(result.chunks).toBeGreaterThan(0);

    const stats = manager.getStats();
    expect(stats.totalDocs).toBe(1);
    expect(stats.totalChunks).toBe(result.chunks);
  });

  await test('should skip unchanged document', async () => {
    const mockEmbeddings = {
      embedDocuments: async (docs) => docs.map(() => new Array(1536).fill(0.1)),
      embedQuery: async (query) => new Array(1536).fill(0.1)
    };

    const manager = new VectorStoreManager(mockEmbeddings, {
      chunkSize: 500,
      chunkOverlap: 100
    });

    await manager.initialize();

    const content = '# Test\n\nSome content here.';
    await manager.addDocument('/test/doc.md', content, {});

    // 같은 내용으로 다시 추가
    const result = await manager.addDocument('/test/doc.md', content, {});

    expect(result.added).toBe(false);
    expect(result.chunks).toBe(0);
  });

  await test('should check document existence', async () => {
    const mockEmbeddings = {
      embedDocuments: async (docs) => docs.map(() => new Array(1536).fill(0.1)),
      embedQuery: async (query) => new Array(1536).fill(0.1)
    };

    const manager = new VectorStoreManager(mockEmbeddings);
    await manager.initialize();

    await manager.addDocument('/test/exists.md', '# Exists', {});

    expect(manager.hasDocument('/test/exists.md')).toBe(true);
    expect(manager.hasDocument('/test/not-exists.md')).toBe(false);
  });

  await test('should remove document tracking', async () => {
    const mockEmbeddings = {
      embedDocuments: async (docs) => docs.map(() => new Array(1536).fill(0.1)),
      embedQuery: async (query) => new Array(1536).fill(0.1)
    };

    const manager = new VectorStoreManager(mockEmbeddings);
    await manager.initialize();

    await manager.addDocument('/test/doc.md', '# Test', {});
    expect(manager.hasDocument('/test/doc.md')).toBe(true);

    manager.removeDocument('/test/doc.md');
    expect(manager.hasDocument('/test/doc.md')).toBe(false);
  });

  // ==========================================
  console.log('\nDocWatcher:');
  // ==========================================

  await test('should check chokidar availability', () => {
    // chokidar는 optionalDependency이므로 사용 가능 여부 확인
    const available = DocWatcher.isAvailable();
    expect(typeof available).toBe('boolean');
    console.log(`     (chokidar available: ${available})`);
  });

  await test('should create DocWatcher instance', () => {
    const watcher = new DocWatcher('/test/docs', {
      debounceMs: 500,
      excludePatterns: ['**/node_modules/**']
    });

    expect(watcher.docsRoot).toBe('/test/docs');
    expect(watcher.debounceMs).toBe(500);
    expect(watcher.isActive()).toBe(false);
  });

  // ==========================================
  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
