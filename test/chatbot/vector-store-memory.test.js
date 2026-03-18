/**
 * 인메모리 벡터 스토어 버그 수정 테스트
 * Run: node test/chatbot/vector-store-memory.test.js
 */

const { VectorStoreManager } = require('../../src/services/chatbot/vector-store.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn().then(() => {
    console.log(`  ✅ ${name}`);
    passed++;
  }).catch((error) => {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    failed++;
  });
}

function expect(value) {
  return {
    toBe(expected) {
      if (value !== expected) {
        throw new Error(`Expected ${expected}, got ${value}`);
      }
    },
    toBeGreaterThan(num) {
      if (!(value > num)) {
        throw new Error(`Expected ${value} > ${num}`);
      }
    }
  };
}

/** 가짜 Embeddings - 단어 수 기반 결정적 벡터 생성 */
class FakeEmbeddings {
  async embedDocuments(texts) {
    return texts.map(t => this._vectorize(t));
  }
  async embedQuery(query) {
    return this._vectorize(query);
  }
  _vectorize(text) {
    const words = text.toLowerCase().split(/\s+/);
    // 간단한 bag-of-words 해시 → 고정 길이 벡터
    const vec = new Array(32).fill(0);
    for (const w of words) {
      for (let i = 0; i < w.length; i++) {
        vec[(w.charCodeAt(i) + i) % 32] += 1;
      }
    }
    // normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map(v => v / norm);
  }
}

function createManager() {
  return new VectorStoreManager(new FakeEmbeddings(), {
    chunkSize: 200,
    chunkOverlap: 0,
    retrievalCount: 4
  });
}

async function run() {
  console.log('\n🧪 In-Memory VectorStore Bug Fix Tests\n');

  // --- SimpleMemoryVectorStore.removeDocumentsByFilePath ---
  console.log('SimpleMemoryVectorStore.removeDocumentsByFilePath:');

  await test('should remove vectors matching filePath', async () => {
    const mgr = createManager();
    await mgr.initialize();
    await mgr.addDocument('/docs/a.md', 'Alpha content about apples', { source: '/docs/a.md' });
    await mgr.addDocument('/docs/b.md', 'Beta content about bananas', { source: '/docs/b.md' });

    const before = mgr.vectorStore.vectors.length;
    expect(before).toBeGreaterThan(0);

    const removed = mgr.vectorStore.removeDocumentsByFilePath('/docs/a.md');
    expect(removed).toBeGreaterThan(0);

    // b.md 벡터는 남아있어야 함
    const remaining = mgr.vectorStore.vectors.every(
      item => item.document.metadata.filePath === '/docs/b.md'
    );
    if (!remaining) throw new Error('Non-matching vectors were removed');
  });

  await test('should return 0 for non-existent filePath', async () => {
    const mgr = createManager();
    await mgr.initialize();
    await mgr.addDocument('/docs/a.md', 'Some content', {});

    const removed = mgr.vectorStore.removeDocumentsByFilePath('/docs/nonexistent.md');
    expect(removed).toBe(0);
  });

  // --- VectorStoreManager.removeDocument (인메모리) ---
  console.log('\nVectorStoreManager.removeDocument (in-memory):');

  await test('should remove both tracking and vectors', async () => {
    const mgr = createManager();
    await mgr.initialize();
    await mgr.addDocument('/docs/a.md', 'Alpha content', {});
    await mgr.addDocument('/docs/b.md', 'Beta content', {});

    const vectorsBefore = mgr.vectorStore.vectors.length;

    await mgr.removeDocument('/docs/a.md');

    // 트래킹 제거 확인
    if (mgr.documentHashes.has('/docs/a.md')) {
      throw new Error('documentHashes still has /docs/a.md');
    }
    if (mgr.documentChunkIds.has('/docs/a.md')) {
      throw new Error('documentChunkIds still has /docs/a.md');
    }

    // 벡터 제거 확인 (벡터 수 감소)
    const vectorsAfter = mgr.vectorStore.vectors.length;
    if (vectorsAfter >= vectorsBefore) {
      throw new Error(`Vectors not removed: before=${vectorsBefore}, after=${vectorsAfter}`);
    }

    // a.md 벡터가 남아있지 않은지 확인
    const hasA = mgr.vectorStore.vectors.some(
      item => item.document.metadata.filePath === '/docs/a.md'
    );
    if (hasA) throw new Error('Vectors for /docs/a.md still exist');
  });

  // --- VectorStoreManager.addDocument 갱신 ---
  console.log('\nVectorStoreManager.addDocument (update):');

  await test('should replace old vectors on content update', async () => {
    const mgr = createManager();
    await mgr.initialize();

    // 초기 추가
    const r1 = await mgr.addDocument('/docs/a.md', 'Original apple content', {});
    expect(r1.added).toBe(true);
    const vectorsAfterFirst = mgr.vectorStore.vectors.length;

    // 내용 변경하여 재추가
    const r2 = await mgr.addDocument('/docs/a.md', 'Updated banana content', {});
    expect(r2.added).toBe(true);
    const vectorsAfterUpdate = mgr.vectorStore.vectors.length;

    // 벡터 수가 동일해야 함 (구버전 제거 + 신버전 추가)
    expect(vectorsAfterUpdate).toBe(vectorsAfterFirst);
  });

  await test('should only return new content in search after update', async () => {
    const mgr = createManager();
    await mgr.initialize();

    await mgr.addDocument('/docs/a.md', 'The old version talks about dinosaurs exclusively', {});
    await mgr.addDocument('/docs/a.md', 'The new version discusses modern rockets and space', {});

    const results = await mgr.vectorStore.similaritySearch('dinosaurs', 10);

    // 결과에 구버전 콘텐츠가 없어야 함
    const hasOld = results.some(doc => doc.pageContent.includes('dinosaurs'));
    if (hasOld) throw new Error('Old content still found in search results');

    // 신버전 콘텐츠만 존재
    const hasNew = results.some(doc => doc.pageContent.includes('rockets'));
    if (!hasNew) throw new Error('New content not found in search results');
  });

  // --- 결과 ---
  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
