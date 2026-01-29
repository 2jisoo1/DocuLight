/**
 * QueryDocumentService 단위 테스트
 * Phase 2: query_document 도구 구현 검증
 */

const { QueryDocumentService } = require('../../src/services/mcp/query-document-service');
const path = require('path');
const fs = require('fs').promises;

// 간단한 테스트 유틸리티
function describe(name, fn) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📦 ${name}`);
  console.log('='.repeat(60));
  fn();
}

async function it(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    return false;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeGreaterThan(expected) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} > ${expected}`);
      }
    },
    toBeLessThanOrEqual(expected) {
      if (!(actual <= expected)) {
        throw new Error(`Expected ${actual} <= ${expected}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value, got ${actual}`);
      }
    },
    toContain(expected) {
      if (!actual.includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      }
    },
    toThrow(expectedPattern) {
      // actual은 Promise를 반환하는 함수여야 함
      throw new Error('Use toReject for async functions');
    }
  };
}

async function expectReject(promise, errorPattern) {
  try {
    await promise;
    throw new Error('Expected promise to reject');
  } catch (error) {
    if (errorPattern && !errorPattern.test(error.message)) {
      throw new Error(`Expected error message to match ${errorPattern}, got "${error.message}"`);
    }
  }
}

// 테스트 실행
let passed = 0;
let failed = 0;
const testDocsRoot = path.join(__dirname, '../test-docs-query');

async function runTests() {
  const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
  };

  const mockConfig = {
    docsRoot: testDocsRoot,
    excludes: []
  };

  // 테스트 문서 준비
  await fs.mkdir(testDocsRoot, { recursive: true });

  // 테스트 문서 생성
  await fs.writeFile(
    path.join(testDocsRoot, 'test-doc.md'),
    `# Test Document

## Configuration
This section covers configuration options.
You can set various parameters here.
The config file is config.json5.

## Installation
This section covers installation steps.
Run npm install to get started.

## API Reference
This section covers API endpoints.
The main endpoint is /api/v1.

## Advanced Configuration
For advanced users, there are more configuration options.
You can customize the behavior extensively.
`
  );

  await fs.writeFile(
    path.join(testDocsRoot, 'large-doc.md'),
    `# Large Document

## Section 1
${'Content for section 1. '.repeat(100)}

## Section 2
${'Content for section 2. '.repeat(100)}

## Target Section
This section contains important information about configuration.
The configuration settings are crucial.

## Section 4
${'Content for section 4. '.repeat(100)}

## Section 5
${'Content for section 5. '.repeat(100)}
`
  );

  await fs.writeFile(
    path.join(testDocsRoot, 'no-headings.md'),
    `This is a document without any headings.
It just has plain text content.
No structure at all.
`
  );

  // 서브디렉토리 생성
  await fs.mkdir(path.join(testDocsRoot, 'subdir'), { recursive: true });
  await fs.writeFile(
    path.join(testDocsRoot, 'subdir', 'nested.md'),
    `# Nested Document

## Nested Section
Content in nested document.
`
  );

  const service = new QueryDocumentService(mockConfig, mockLogger);

  try {
  // ==================== queryDocument 테스트 ====================
  describe('queryDocument', () => {});

  if (await it('should return relevant sections for query', async () => {
    const result = await service.queryDocument('test-doc.md', 'configuration');

    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.path).toBe('test-doc.md');
    expect(result.query).toBe('configuration');
    // Configuration 관련 섹션이 포함되어야 함
    const hasConfigSection = result.sections.some(s =>
      s.heading.toLowerCase().includes('configuration') ||
      s.content.toLowerCase().includes('configuration')
    );
    expect(hasConfigSection).toBeTruthy();
  })) passed++; else failed++;

  if (await it('should respect maxTokens budget', async () => {
    const result = await service.queryDocument('large-doc.md', 'configuration', { maxTokens: 500 });

    expect(result.tokensUsed).toBeLessThanOrEqual(500);
    expect(result.tokenBudget).toBe(500);
  })) passed++; else failed++;

  if (await it('should return metadata about sections', async () => {
    const result = await service.queryDocument('test-doc.md', 'api');

    expect(result.totalSections).toBeGreaterThan(0);
    expect(result.selectedSections).toBeLessThanOrEqual(result.totalSections);
  })) passed++; else failed++;

  if (await it('should handle document without headings', async () => {
    const result = await service.queryDocument('no-headings.md', 'text');

    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.sections[0].level).toBe(0); // 헤딩 없음
  })) passed++; else failed++;

  if (await it('should handle nested documents', async () => {
    const result = await service.queryDocument('subdir/nested.md', 'nested');

    expect(result.sections.length).toBeGreaterThan(0);
  })) passed++; else failed++;

  if (await it('should throw error for non-existent file', async () => {
    await expectReject(
      service.queryDocument('nonexistent.md', 'test'),
      /not_found|DOCUMENT_NOT_FOUND/i
    );
  })) passed++; else failed++;

  if (await it('should throw error for path traversal attempt', async () => {
    await expectReject(
      service.queryDocument('../../../etc/passwd', 'test'),
      /path|traversal/i
    );
  })) passed++; else failed++;

  if (await it('should throw error for empty query', async () => {
    await expectReject(
      service.queryDocument('test-doc.md', ''),
      /invalid.*query/i
    );
  })) passed++; else failed++;

  if (await it('should throw error for directory path', async () => {
    // 먼저 디렉토리가 있는지 확인하기 위해 subdir 경로 사용
    await expectReject(
      service.queryDocument('subdir', 'test'),
      /invalid|format/i
    );
  })) passed++; else failed++;

  // ==================== formatAsMarkdown 테스트 ====================
  describe('formatAsMarkdown', () => {});

  if (await it('should format result as markdown', async () => {
    const result = await service.queryDocument('test-doc.md', 'configuration', { maxTokens: 1000 });
    const markdown = service.formatAsMarkdown(result);

    expect(markdown).toContain('# Query Results');
    expect(markdown).toContain('configuration');
    expect(markdown).toContain('Tokens used');
  })) passed++; else failed++;

  if (await it('should include relevance scores when sections are filtered', async () => {
    // 토큰 예산을 작게 설정하여 섹션 필터링 발생
    const result = await service.queryDocument('large-doc.md', 'configuration', { maxTokens: 300 });
    const markdown = service.formatAsMarkdown(result);

    // 필터링된 경우 점수가 포함됨
    if (result.selectedSections < result.totalSections) {
      expect(markdown).toContain('score:');
    }
    // 필터링되지 않은 경우에도 결과는 유효해야 함
    expect(markdown).toContain('Query Results');
  })) passed++; else failed++;

  } finally {
    // 정리 (테스트 성공/실패 관계없이 항상 실행)
    await fs.rm(testDocsRoot, { recursive: true, force: true });
  }

  // 결과 출력
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 테스트 결과: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
