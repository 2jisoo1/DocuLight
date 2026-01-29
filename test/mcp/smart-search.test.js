/**
 * SmartSearchService 단위 테스트
 * Phase 4: DocuLight_smart_search 도구 구현 검증
 */

const { SmartSearchService } = require('../../src/services/mcp/smart-search-service');
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
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value, got ${actual}`);
      }
    },
    toContain(expected) {
      if (!actual.includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      }
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
const testDocsRoot = path.join(__dirname, '../test-docs-smart-search');

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
    path.join(testDocsRoot, 'ssl-guide.md'),
    `# SSL Configuration Guide

This guide explains how to configure SSL/TLS for secure connections.

## Prerequisites

- Valid SSL certificate
- Private key file

## Configuration

Create the SSL section in your config file:

\`\`\`json5
{
  ssl: {
    enabled: true,
    cert: "/path/to/cert.pem",
    key: "/path/to/key.pem"
  }
}
\`\`\`

## Troubleshooting SSL Errors

If you see certificate errors, verify:
1. Certificate is not expired
2. Certificate chain is complete
`
  );

  await fs.writeFile(
    path.join(testDocsRoot, 'security.md'),
    `# Security Best Practices

This document covers security recommendations.

## SSL/TLS

Always use SSL for production deployments.

## Authentication

Use API keys for authentication.

## Authorization

Implement proper authorization checks.
`
  );

  await fs.writeFile(
    path.join(testDocsRoot, 'api-reference.md'),
    `# API Reference

Complete API documentation.

## Endpoints

### GET /api/tree

Returns the document tree.

### GET /api/raw

Returns raw document content.

## Authentication

Include X-API-Key header for protected endpoints.
`
  );

  try {
  // ==================== 임베딩 설정 없음 테스트 ====================
  describe('Without embedding config', () => {});

  const configNoEmbed = {
    docsRoot: testDocsRoot,
    excludes: []
  };

  const serviceNoEmbed = new SmartSearchService(configNoEmbed, mockLogger);
  serviceNoEmbed.initialize({});

  if (await it('should return keyword as available mode', async () => {
    const mode = serviceNoEmbed.getAvailableMode();
    expect(mode).toBe('keyword');
  })) passed++; else failed++;

  if (await it('should use keyword search in auto mode', async () => {
    const result = await serviceNoEmbed.smartSearch('SSL', { mode: 'auto' });
    expect(result.mode).toBe('keyword');
    expect(result.documents.length).toBeGreaterThan(0);
  })) passed++; else failed++;

  if (await it('should throw error when semantic mode forced without embedding', async () => {
    await expectReject(
      serviceNoEmbed.smartSearch('test', { mode: 'semantic' }),
      /SEMANTIC_SEARCH_UNAVAILABLE/i
    );
  })) passed++; else failed++;

  if (await it('should respect keyword mode when specified', async () => {
    const result = await serviceNoEmbed.smartSearch('SSL', { mode: 'keyword' });
    expect(result.mode).toBe('keyword');
  })) passed++; else failed++;

  // ==================== 임베딩 설정 있음 (모의) 테스트 ====================
  describe('With embedding config (mocked)', () => {});

  const configWithEmbed = {
    docsRoot: testDocsRoot,
    excludes: [],
    chatbot: {
      embedding: {
        type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'text-embedding-3-small'
      }
    }
  };

  const serviceWithEmbed = new SmartSearchService(configWithEmbed, mockLogger);

  // 모의 VectorStoreManager
  const mockVectorStore = {
    async similaritySearch(query, k) {
      // SSL 관련 문서를 모의 결과로 반환
      const sslContent = await fs.readFile(path.join(testDocsRoot, 'ssl-guide.md'), 'utf-8');
      return [
        { pageContent: sslContent, metadata: { filePath: 'ssl-guide.md' }, score: 0.92 }
      ];
    }
  };

  serviceWithEmbed.initialize({ vectorStoreManager: mockVectorStore });

  if (await it('should return semantic as available mode with embedding config', async () => {
    const mode = serviceWithEmbed.getAvailableMode();
    expect(mode).toBe('semantic');
  })) passed++; else failed++;

  if (await it('should use semantic search in auto mode with embedding', async () => {
    const result = await serviceWithEmbed.smartSearch('SSL configuration', { mode: 'auto' });
    expect(result.mode).toBe('semantic');
    expect(result.embeddingModel).toBe('text-embedding-3-small');
  })) passed++; else failed++;

  if (await it('should include embedding model in result', async () => {
    const result = await serviceWithEmbed.smartSearch('SSL', { mode: 'semantic' });
    expect(result.embeddingModel).toBe('text-embedding-3-small');
  })) passed++; else failed++;

  // ==================== 결과 처리 테스트 ====================
  describe('Result processing', () => {});

  if (await it('should respect maxTokens budget', async () => {
    const result = await serviceNoEmbed.smartSearch('SSL', { maxTokens: 300 });
    expect(result.tokensUsed).toBeLessThanOrEqual(300);
    expect(result.tokenBudget).toBe(300);
  })) passed++; else failed++;

  if (await it('should respect limit parameter', async () => {
    const result = await serviceNoEmbed.smartSearch('SSL', { limit: 1 });
    expect(result.documents.length).toBeLessThanOrEqual(1);
  })) passed++; else failed++;

  if (await it('should return documents with scores', async () => {
    const result = await serviceNoEmbed.smartSearch('SSL configuration');
    // 먼저 결과가 있는지 검증
    expect(result.documents.length).toBeGreaterThan(0);
    // 그 다음 세부 검증
    expect(result.documents[0].score).toBeGreaterThan(0);
  })) passed++; else failed++;

  if (await it('should return sections for each document', async () => {
    const result = await serviceNoEmbed.smartSearch('SSL');
    // 먼저 결과가 있는지 검증
    expect(result.documents.length).toBeGreaterThan(0);
    // 그 다음 세부 검증
    expect(result.documents[0].sections.length).toBeGreaterThan(0);
  })) passed++; else failed++;

  // ==================== 입력 검증 테스트 ====================
  describe('Input validation', () => {});

  if (await it('should throw error for empty query', async () => {
    await expectReject(
      serviceNoEmbed.smartSearch(''),
      /INVALID_QUERY/i
    );
  })) passed++; else failed++;

  if (await it('should handle no results gracefully', async () => {
    const result = await serviceNoEmbed.smartSearch('xyznonexistent123');
    expect(result.documents.length).toBe(0);
  })) passed++; else failed++;

  // ==================== 포맷팅 테스트 ====================
  describe('formatAsMarkdown', () => {});

  if (await it('should format result as markdown', async () => {
    const result = await serviceNoEmbed.smartSearch('SSL');
    const markdown = serviceNoEmbed.formatAsMarkdown(result);

    expect(markdown).toContain('# Search Results');
    expect(markdown).toContain('**Mode**');
    expect(markdown).toContain('**Documents**');
    expect(markdown).toContain('Tokens used');
  })) passed++; else failed++;

  if (await it('should include mode info in markdown', async () => {
    const result = await serviceNoEmbed.smartSearch('SSL');
    const markdown = serviceNoEmbed.formatAsMarkdown(result);

    expect(markdown).toContain('keyword');
  })) passed++; else failed++;

  // ==================== 경계값 테스트 ====================
  describe('Boundary value tests', () => {});

  if (await it('should handle maxTokens = 0 gracefully', async () => {
    // maxTokens 0은 매우 적은 결과만 반환해야 함
    const result = await serviceNoEmbed.smartSearch('SSL', { maxTokens: 0 });
    // 0 토큰 예산에서는 결과가 비거나 최소 토큰만 사용
    expect(result.tokensUsed).toBeLessThanOrEqual(50);
  })) passed++; else failed++;

  if (await it('should handle very small maxTokens', async () => {
    const result = await serviceNoEmbed.smartSearch('SSL', { maxTokens: 10 });
    expect(result.tokensUsed).toBeLessThanOrEqual(50); // 최소 토큰 허용
  })) passed++; else failed++;

  if (await it('should handle limit = 0', async () => {
    const result = await serviceNoEmbed.smartSearch('SSL', { limit: 0 });
    // limit 0은 빈 결과 또는 기본값으로 처리
    expect(result.documents.length).toBeLessThanOrEqual(5);
  })) passed++; else failed++;

  // ==================== 한글 검색 테스트 ====================
  describe('Korean text search', () => {});

  // 한글 테스트 문서 생성
  await fs.writeFile(
    path.join(testDocsRoot, 'korean-security.md'),
    `# 보안 가이드

## SSL 인증서 설정

SSL 인증서를 설정하는 방법입니다.

### 인증서 생성

인증서를 생성합니다.
`
  );

  if (await it('should search Korean text', async () => {
    const result = await serviceNoEmbed.smartSearch('인증서');
    expect(result.documents.length).toBeGreaterThan(0);
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
