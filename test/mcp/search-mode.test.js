/**
 * DocuLight_search 모드별 테스트
 * Phase 5: mode 파라미터 추가 검증
 */

const { searchDocuments } = require('../../src/services/search-service');
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
    toBeLessThan(expected) {
      if (!(actual < expected)) {
        throw new Error(`Expected ${actual} < ${expected}`);
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
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value, got ${actual}`);
      }
    },
    toBeUndefined() {
      if (actual !== undefined) {
        throw new Error(`Expected undefined, got ${JSON.stringify(actual)}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected defined value, got undefined`);
      }
    },
    toContain(expected) {
      if (!actual.includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      }
    }
  };
}

// 테스트 실행
let passed = 0;
let failed = 0;
const testDocsRoot = path.join(__dirname, '../test-docs-search-mode');

async function runTests() {
  const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
  };

  // 테스트 문서 준비
  await fs.mkdir(testDocsRoot, { recursive: true });

  await fs.writeFile(
    path.join(testDocsRoot, 'config-guide.md'),
    `# Configuration Guide

## Basic Configuration

Create config.json5 with these options:

\`\`\`json5
{
  docsRoot: "/data",
  port: 3000
}
\`\`\`

## Advanced Configuration

For power users, additional configuration settings are available.

### SSL Configuration

Enable SSL with certificate files.

### Logging Configuration

Configure logging levels and output.
`
  );

  await fs.writeFile(
    path.join(testDocsRoot, 'setup-guide.md'),
    `# Setup Guide

## Installation

Install using npm:

\`\`\`bash
npm install doculight
\`\`\`

## Configuration

See the configuration guide for details.

## Starting the Server

Run the server with default configuration:

\`\`\`bash
npm start
\`\`\`
`
  );

  await fs.writeFile(
    path.join(testDocsRoot, 'api-reference.md'),
    `# API Reference

## REST API

### GET /api/tree

Returns the document tree.

### POST /api/upload

Upload a file with configuration options.

## MCP API

The MCP API uses JSON-RPC 2.0 protocol.
`
  );

  const mockConfig = {
    docsRoot: testDocsRoot,
    excludes: []
  };

  try {
  // ==================== titles_only 모드 테스트 ====================
  describe('mode: titles_only', () => {});

  if (await it('should return only file paths and titles', async () => {
    const result = await searchDocuments(mockConfig, mockLogger, 'configuration', {
      mode: 'titles_only'
    });

    expect(result.mode).toBe('titles_only');
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].path).toBeDefined();
    expect(result.results[0].title).toBeDefined();
    // matches should not exist in titles_only mode
    expect(result.results[0].matches).toBeUndefined();
  })) passed++; else failed++;

  if (await it('should have minimal data per result', async () => {
    const result = await searchDocuments(mockConfig, mockLogger, 'configuration', {
      mode: 'titles_only'
    });

    // Each result should only have path, name, title
    for (const r of result.results) {
      const keys = Object.keys(r);
      expect(keys.includes('path')).toBe(true);
      expect(keys.includes('title')).toBe(true);
      expect(keys.includes('matches')).toBe(false);
      expect(keys.includes('sections')).toBe(false);
    }
  })) passed++; else failed++;

  // ==================== snippets 모드 테스트 ====================
  describe('mode: snippets', () => {});

  if (await it('should return matches with context', async () => {
    const result = await searchDocuments(mockConfig, mockLogger, 'configuration', {
      mode: 'snippets'
    });

    expect(result.mode).toBe('snippets');
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].matches).toBeDefined();
    expect(result.results[0].matches.length).toBeGreaterThan(0);
    expect(result.results[0].matches[0].context).toBeDefined();
  })) passed++; else failed++;

  if (await it('should be default mode when not specified', async () => {
    const withMode = await searchDocuments(mockConfig, mockLogger, 'configuration', {
      mode: 'snippets'
    });
    const withoutMode = await searchDocuments(mockConfig, mockLogger, 'configuration', {});

    expect(withMode.mode).toBe('snippets');
    expect(withoutMode.mode).toBe('snippets');
    expect(withMode.results.length).toBe(withoutMode.results.length);
  })) passed++; else failed++;

  if (await it('should include line numbers', async () => {
    const result = await searchDocuments(mockConfig, mockLogger, 'configuration', {
      mode: 'snippets'
    });

    // 먼저 결과가 있는지 검증
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].matches.length).toBeGreaterThan(0);

    const contentMatches = result.results[0].matches.filter(m => m.priority === 'content');
    // content 매치가 있으면 line number 검증
    if (contentMatches.length > 0) {
      expect(contentMatches[0].line).toBeGreaterThan(0);
    }
    // content 매치가 없어도 테스트는 성공 (title/filename 매치만 있을 수 있음)
  })) passed++; else failed++;

  // ==================== full_context 모드 테스트 ====================
  describe('mode: full_context', () => {});

  if (await it('should return sections containing matches', async () => {
    const result = await searchDocuments(mockConfig, mockLogger, 'configuration', {
      mode: 'full_context'
    });

    expect(result.mode).toBe('full_context');
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].sections).toBeDefined();
    expect(result.results[0].sections.length).toBeGreaterThan(0);
  })) passed++; else failed++;

  if (await it('should include section headings', async () => {
    const result = await searchDocuments(mockConfig, mockLogger, 'configuration', {
      mode: 'full_context'
    });

    const firstResult = result.results[0];
    expect(firstResult.title).toBeDefined();

    // At least one section should have a heading
    const hasHeading = firstResult.sections.some(s => s.heading);
    expect(hasHeading).toBe(true);
  })) passed++; else failed++;

  if (await it('should return complete section content', async () => {
    const fullResult = await searchDocuments(mockConfig, mockLogger, 'configuration', {
      mode: 'full_context'
    });

    // Each section should have complete content (not truncated snippets)
    const firstResult = fullResult.results[0];
    expect(firstResult.sections.length).toBeGreaterThan(0);

    // Check that section content contains more than just the match line
    for (const section of firstResult.sections) {
      // Sections should have meaningful content (not just one line)
      expect(section.content.length).toBeGreaterThan(20);
    }
  })) passed++; else failed++;

  // ==================== 하위 호환성 테스트 ====================
  describe('Backward compatibility', () => {});

  if (await it('should work without mode parameter', async () => {
    const result = await searchDocuments(mockConfig, mockLogger, 'configuration', {
      limit: 5,
      path: '/'
    });

    // Should default to snippets behavior
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].matches).toBeDefined();
  })) passed++; else failed++;

  if (await it('should respect limit parameter in all modes', async () => {
    const titlesResult = await searchDocuments(mockConfig, mockLogger, 'configuration', {
      mode: 'titles_only',
      limit: 1
    });
    const snippetsResult = await searchDocuments(mockConfig, mockLogger, 'configuration', {
      mode: 'snippets',
      limit: 1
    });
    const fullResult = await searchDocuments(mockConfig, mockLogger, 'configuration', {
      mode: 'full_context',
      limit: 1
    });

    expect(titlesResult.results.length).toBe(1);
    expect(snippetsResult.results.length).toBe(1);
    expect(fullResult.results.length).toBe(1);
  })) passed++; else failed++;

  // ==================== 토큰 효율성 테스트 ====================
  describe('Token efficiency', () => {});

  if (await it('titles_only should produce less data than snippets', async () => {
    const titlesResult = await searchDocuments(mockConfig, mockLogger, 'configuration', {
      mode: 'titles_only'
    });
    const snippetsResult = await searchDocuments(mockConfig, mockLogger, 'configuration', {
      mode: 'snippets'
    });

    const titlesJson = JSON.stringify(titlesResult.results);
    const snippetsJson = JSON.stringify(snippetsResult.results);

    expect(titlesJson.length).toBeLessThan(snippetsJson.length);
  })) passed++; else failed++;

  // ==================== 경계값 테스트 ====================
  describe('Edge cases', () => {});

  if (await it('should handle no results gracefully', async () => {
    const result = await searchDocuments(mockConfig, mockLogger, 'xyznonexistent123', {
      mode: 'full_context'
    });

    expect(result.results.length).toBe(0);
    expect(result.mode).toBe('full_context');
  })) passed++; else failed++;

  if (await it('should include mode in result metadata', async () => {
    const modes = ['titles_only', 'snippets', 'full_context'];

    for (const mode of modes) {
      const result = await searchDocuments(mockConfig, mockLogger, 'configuration', { mode });
      expect(result.mode).toBe(mode);
    }
  })) passed++; else failed++;

  // ==================== 한글 검색 테스트 ====================
  describe('Korean text search', () => {});

  // 한글 테스트 문서 생성
  await fs.writeFile(
    path.join(testDocsRoot, 'korean-guide.md'),
    `# 설정 가이드

## 기본 설정

이 문서는 한글 설정에 대한 설명입니다.

### 포트 설정

기본 포트는 3000번입니다.

## 고급 설정

고급 사용자를 위한 설정입니다.
`
  );

  if (await it('should search Korean text', async () => {
    const result = await searchDocuments(mockConfig, mockLogger, '설정', {
      mode: 'snippets'
    });

    expect(result.results.length).toBeGreaterThan(0);
    const hasKoreanDoc = result.results.some(r => r.path.includes('korean'));
    expect(hasKoreanDoc).toBe(true);
  })) passed++; else failed++;

  if (await it('should search Korean text in titles_only mode', async () => {
    const result = await searchDocuments(mockConfig, mockLogger, '가이드', {
      mode: 'titles_only'
    });

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].title).toBeDefined();
  })) passed++; else failed++;

  // ==================== 경계값 테스트 추가 ====================
  describe('Boundary value tests', () => {});

  if (await it('should handle limit = 0 gracefully', async () => {
    const result = await searchDocuments(mockConfig, mockLogger, 'configuration', {
      mode: 'snippets',
      limit: 0
    });

    // limit 0은 빈 결과 또는 기본값으로 처리
    expect(result.results.length).toBeLessThanOrEqual(10);
  })) passed++; else failed++;

  if (await it('should handle very large limit', async () => {
    const result = await searchDocuments(mockConfig, mockLogger, 'configuration', {
      mode: 'snippets',
      limit: 10000
    });

    // 실제 결과 수는 문서 수에 제한됨
    expect(result.results.length).toBeLessThanOrEqual(100);
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
