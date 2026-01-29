/**
 * SummarizeDocumentService 단위 테스트
 * Phase 3: summarize_document 도구 구현 검증
 */

const { SummarizeDocumentService } = require('../../src/services/mcp/summarize-document-service');
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
    toHaveLength(expected) {
      if (actual.length !== expected) {
        throw new Error(`Expected length ${expected}, got ${actual.length}`);
      }
    },
    toBeGreaterThan(expected) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} > ${expected}`);
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
const testDocsRoot = path.join(__dirname, '../test-docs-summarize');

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
    path.join(testDocsRoot, 'complete-guide.md'),
    `# Complete Guide

This guide covers everything you need to know about the system.

## Getting Started

First, install the dependencies using npm.

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

\`\`\`bash
npm install doclight
\`\`\`

## Configuration

Create \`config.json5\` with the following settings:

\`\`\`json5
{
  docsRoot: "/data"
}
\`\`\`

**port**: The server port (default: 3000)
**docsRoot**: Path to documents directory

## API Reference

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/tree | Get tree |

## Troubleshooting

If you encounter issues, check the logs.
`
  );

  await fs.writeFile(
    path.join(testDocsRoot, 'plain-text.md'),
    `This is a document without any headings.
It just has plain text content.
No structure at all.
`
  );

  await fs.writeFile(
    path.join(testDocsRoot, 'empty.md'),
    ``
  );

  const service = new SummarizeDocumentService(mockConfig, mockLogger);

  try {
  // ==================== extractTOC 테스트 ====================
  describe('extractTOC', () => {});

  if (await it('should extract headings as TOC', async () => {
    const content = `# Title
## Section A
### Subsection A.1
## Section B`;

    const toc = service.extractTOC(content);

    expect(toc).toHaveLength(4);
    expect(toc[0].level).toBe(1);
    expect(toc[0].text).toBe('Title');
    expect(toc[1].level).toBe(2);
    expect(toc[1].text).toBe('Section A');
    expect(toc[2].level).toBe(3);
  })) passed++; else failed++;

  if (await it('should generate anchor IDs', async () => {
    const content = `# My Title Here
## Section With Spaces`;

    const toc = service.extractTOC(content);

    expect(toc[0].anchor).toBe('my-title-here');
    expect(toc[1].anchor).toBe('section-with-spaces');
  })) passed++; else failed++;

  if (await it('should return empty array for document without headings', async () => {
    const content = 'Just plain text.';
    const toc = service.extractTOC(content);
    expect(toc).toHaveLength(0);
  })) passed++; else failed++;

  // ==================== extractKeyPoints 테스트 ====================
  describe('extractKeyPoints', () => {});

  if (await it('should extract first paragraph', async () => {
    const content = `# Guide
This is the introduction paragraph.

## Setup
First step is to install.`;

    const keyPoints = service.extractKeyPoints(content);

    expect(keyPoints.length).toBeGreaterThan(0);
    expect(keyPoints[0]).toContain('introduction');
  })) passed++; else failed++;

  if (await it('should extract bold definitions', async () => {
    const content = `# Config
**port**: The server port
**host**: The host address`;

    const keyPoints = service.extractKeyPoints(content);

    const hasPortDefinition = keyPoints.some(kp => kp.includes('port'));
    expect(hasPortDefinition).toBeTruthy();
  })) passed++; else failed++;

  // ==================== getStatistics 테스트 ====================
  describe('getStatistics', () => {});

  if (await it('should count words and characters', async () => {
    const content = `# Title
Some text here with several words.`;

    const stats = service.getStatistics(content);

    expect(stats.wordCount).toBeGreaterThan(5);
    expect(stats.charCount).toBeGreaterThan(30);
  })) passed++; else failed++;

  if (await it('should count sections', async () => {
    const content = `# Title
## Section 1
## Section 2
### Subsection`;

    const stats = service.getStatistics(content);

    expect(stats.sectionCount).toBe(4);
  })) passed++; else failed++;

  if (await it('should count code blocks', async () => {
    const content = `# Title
\`\`\`js
code here
\`\`\`

\`\`\`bash
more code
\`\`\``;

    const stats = service.getStatistics(content);

    expect(stats.codeBlockCount).toBeGreaterThan(1);
  })) passed++; else failed++;

  if (await it('should estimate tokens', async () => {
    const content = `# Title
Some content here.`;

    const stats = service.getStatistics(content);

    expect(stats.estimatedTokens).toBeGreaterThan(0);
  })) passed++; else failed++;

  // ==================== summarizeDocument 테스트 ====================
  describe('summarizeDocument', () => {});

  if (await it('should return complete summary', async () => {
    const result = await service.summarizeDocument('complete-guide.md');

    expect(result.title).toBe('Complete Guide');
    expect(result.toc.length).toBeGreaterThan(3);
    expect(result.keyPoints.length).toBeGreaterThan(0);
    expect(result.stats.sectionCount).toBeGreaterThan(3);
  })) passed++; else failed++;

  if (await it('should handle document without headings', async () => {
    const result = await service.summarizeDocument('plain-text.md');

    expect(result.title).toBe('(Untitled)');
    expect(result.toc).toHaveLength(0);
  })) passed++; else failed++;

  if (await it('should handle empty document', async () => {
    const result = await service.summarizeDocument('empty.md');

    expect(result.stats.wordCount).toBe(0);
    expect(result.stats.charCount).toBe(0);
  })) passed++; else failed++;

  if (await it('should throw error for non-existent file', async () => {
    await expectReject(
      service.summarizeDocument('nonexistent.md'),
      /not_found|DOCUMENT_NOT_FOUND/i
    );
  })) passed++; else failed++;

  // ==================== formatAsMarkdown 테스트 ====================
  describe('formatAsMarkdown', () => {});

  if (await it('should format summary as markdown', async () => {
    const result = await service.summarizeDocument('complete-guide.md');
    const markdown = service.formatAsMarkdown(result);

    expect(markdown).toContain('# Document Summary');
    expect(markdown).toContain('## Table of Contents');
    expect(markdown).toContain('## Key Points');
    expect(markdown).toContain('## Statistics');
    expect(markdown).toContain('Words');
    expect(markdown).toContain('Estimated tokens');
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
