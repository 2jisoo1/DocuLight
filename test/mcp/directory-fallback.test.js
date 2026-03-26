/**
 * 디렉토리 폴백 로직 단위 테스트
 * query_document / summarize_document에 디렉토리 경로 전달 시 대표 파일 자동 선택
 */

const { resolveRepresentativeFile, QueryDocumentService } = require('../../src/services/mcp/query-document-service');
const { SummarizeDocumentService } = require('../../src/services/mcp/summarize-document-service');
const path = require('path');
const fs = require('fs').promises;

let passed = 0;
let failed = 0;

async function it(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toContain(expected) {
      if (!actual.includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      }
    }
  };
}

const testRoot = path.join(__dirname, '../test-docs-dir-fallback');

async function setup() {
  await fs.rm(testRoot, { recursive: true, force: true });

  // 1. 단일 파일 디렉토리
  const singleDir = path.join(testRoot, 'single');
  await fs.mkdir(singleDir, { recursive: true });
  await fs.writeFile(path.join(singleDir, 'only-file.md'), '# Only File\nContent');

  // 2. .summary.md 존재
  const summaryDir = path.join(testRoot, 'with-summary');
  await fs.mkdir(summaryDir, { recursive: true });
  await fs.writeFile(path.join(summaryDir, '.summary.md'), '# Summary\nSummary content');
  await fs.writeFile(path.join(summaryDir, 'other.md'), '# Other\nOther content');

  // 3. README.md 존재
  const readmeDir = path.join(testRoot, 'with-readme');
  await fs.mkdir(readmeDir, { recursive: true });
  await fs.writeFile(path.join(readmeDir, 'README.md'), '# README\nReadme content');
  await fs.writeFile(path.join(readmeDir, 'guide.md'), '# Guide\nGuide content');

  // 4. index.md 존재
  const indexDir = path.join(testRoot, 'with-index');
  await fs.mkdir(indexDir, { recursive: true });
  await fs.writeFile(path.join(indexDir, 'index.md'), '# Index\nIndex content');
  await fs.writeFile(path.join(indexDir, 'api.md'), '# API\nAPI content');

  // 5. overview.md 존재
  const overviewDir = path.join(testRoot, 'with-overview');
  await fs.mkdir(overviewDir, { recursive: true });
  await fs.writeFile(path.join(overviewDir, 'overview.md'), '# Overview\nOverview content');
  await fs.writeFile(path.join(overviewDir, 'details.md'), '# Details\nDetails content');

  // 6. 번호순 파일
  const numberedDir = path.join(testRoot, 'numbered');
  await fs.mkdir(numberedDir, { recursive: true });
  await fs.writeFile(path.join(numberedDir, '02-second.md'), '# Second\nSecond');
  await fs.writeFile(path.join(numberedDir, '01-first.md'), '# First\nFirst content');
  await fs.writeFile(path.join(numberedDir, '03-third.md'), '# Third\nThird');

  // 7. 빈 디렉토리
  const emptyDir = path.join(testRoot, 'empty');
  await fs.mkdir(emptyDir, { recursive: true });

  // 8. .md 파일 없는 디렉토리
  const noMdDir = path.join(testRoot, 'no-md');
  await fs.mkdir(noMdDir, { recursive: true });
  await fs.writeFile(path.join(noMdDir, 'data.json'), '{}');

  // 9. 매칭 안 되는 다중 파일
  const ambiguousDir = path.join(testRoot, 'ambiguous');
  await fs.mkdir(ambiguousDir, { recursive: true });
  await fs.writeFile(path.join(ambiguousDir, 'alpha.md'), '# Alpha\nAlpha');
  await fs.writeFile(path.join(ambiguousDir, 'beta.md'), '# Beta\nBeta');
}

async function cleanup() {
  await fs.rm(testRoot, { recursive: true, force: true });
}

async function runTests() {
  await setup();

  console.log('\n' + '='.repeat(60));
  console.log('📦 resolveRepresentativeFile - 폴백 우선순위');
  console.log('='.repeat(60));

  await it('단일 파일 → 해당 파일 선택', async () => {
    const result = await resolveRepresentativeFile(path.join(testRoot, 'single'), 'single');
    expect(path.basename(result.absolutePath)).toBe('only-file.md');
    expect(result.resolvedDocPath).toContain('only-file.md');
  });

  await it('.summary.md 우선 선택', async () => {
    const result = await resolveRepresentativeFile(path.join(testRoot, 'with-summary'), 'with-summary');
    expect(path.basename(result.absolutePath)).toBe('.summary.md');
  });

  await it('README.md 선택', async () => {
    const result = await resolveRepresentativeFile(path.join(testRoot, 'with-readme'), 'with-readme');
    expect(path.basename(result.absolutePath)).toBe('README.md');
  });

  await it('index.md 선택', async () => {
    const result = await resolveRepresentativeFile(path.join(testRoot, 'with-index'), 'with-index');
    expect(path.basename(result.absolutePath)).toBe('index.md');
  });

  await it('overview.md 선택', async () => {
    const result = await resolveRepresentativeFile(path.join(testRoot, 'with-overview'), 'with-overview');
    expect(path.basename(result.absolutePath)).toBe('overview.md');
  });

  await it('번호순 첫 번째 파일 선택', async () => {
    const result = await resolveRepresentativeFile(path.join(testRoot, 'numbered'), 'numbered');
    expect(path.basename(result.absolutePath)).toBe('01-first.md');
  });

  await it('빈 디렉토리 → INVALID_PATH 에러', async () => {
    try {
      await resolveRepresentativeFile(path.join(testRoot, 'empty'), 'empty');
      throw new Error('Expected error');
    } catch (e) {
      expect(e.code).toBe('INVALID_PATH');
      expect(e.message).toContain('no .md files');
    }
  });

  await it('.md 없는 디렉토리 → INVALID_PATH 에러', async () => {
    try {
      await resolveRepresentativeFile(path.join(testRoot, 'no-md'), 'no-md');
      throw new Error('Expected error');
    } catch (e) {
      expect(e.code).toBe('INVALID_PATH');
      expect(e.message).toContain('no .md files');
    }
  });

  await it('매칭 안 되는 다중 파일 → 파일 목록 포함 에러', async () => {
    try {
      await resolveRepresentativeFile(path.join(testRoot, 'ambiguous'), 'ambiguous');
      throw new Error('Expected error');
    } catch (e) {
      expect(e.code).toBe('INVALID_PATH');
      expect(e.message).toContain('Available files');
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log('📦 QueryDocumentService - 디렉토리 경로 통합');
  console.log('='.repeat(60));

  const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  const config = { docsRoot: testRoot, excludes: [] };
  const queryService = new QueryDocumentService(config, mockLogger);

  await it('디렉토리 경로로 query_document 호출 시 대표 파일 자동 선택', async () => {
    const result = await queryService.queryDocument('single', 'content', { maxTokens: 2000 });
    expect(result.path).toContain('only-file.md');
  });

  await it('번호순 디렉토리로 query_document 호출', async () => {
    const result = await queryService.queryDocument('numbered', 'first', { maxTokens: 2000 });
    expect(result.path).toContain('01-first.md');
  });

  console.log('\n' + '='.repeat(60));
  console.log('📦 SummarizeDocumentService - 디렉토리 경로 통합');
  console.log('='.repeat(60));

  const summarizeService = new SummarizeDocumentService(config, mockLogger);

  await it('디렉토리 경로로 summarize_document 호출 시 대표 파일 자동 선택', async () => {
    const result = await summarizeService.summarizeDocument('single');
    expect(result.path).toContain('only-file.md');
  });

  await cleanup();

  console.log('\n' + '='.repeat(60));
  console.log(`📊 테스트 결과: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
