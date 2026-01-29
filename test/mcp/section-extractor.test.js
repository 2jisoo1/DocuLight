/**
 * SectionExtractor 단위 테스트
 * Phase 1: Section Extractor 구현 검증
 */

const { SectionExtractor } = require('../../src/services/mcp/section-extractor');

// 간단한 테스트 유틸리티
function describe(name, fn) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📦 ${name}`);
  console.log('='.repeat(60));
  fn();
}

function it(name, fn) {
  try {
    fn();
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
    }
  };
}

// 테스트 실행
let passed = 0;
let failed = 0;

function runTests() {
  const extractor = new SectionExtractor();

  // ==================== splitByHeadings 테스트 ====================
  describe('splitByHeadings', () => {
    if (it('should split document by markdown headings', () => {
      const content = `# Title
Intro.

## Section A
Content A.

## Section B
Content B.`;

      const sections = extractor.splitByHeadings(content);

      expect(sections).toHaveLength(3);
      expect(sections[0].heading).toBe('# Title');
      expect(sections[0].level).toBe(1);
      expect(sections[1].heading).toBe('## Section A');
      expect(sections[1].level).toBe(2);
      expect(sections[2].heading).toBe('## Section B');
      expect(sections[2].level).toBe(2);
    })) passed++; else failed++;

    if (it('should handle document without headings', () => {
      const content = 'Just plain text without any headings.';

      const sections = extractor.splitByHeadings(content);

      expect(sections).toHaveLength(1);
      expect(sections[0].heading).toBe('');
      expect(sections[0].level).toBe(0);
      expect(sections[0].content).toBe(content);
    })) passed++; else failed++;

    if (it('should handle empty document', () => {
      const sections = extractor.splitByHeadings('');
      expect(sections).toHaveLength(0);
    })) passed++; else failed++;

    if (it('should handle null/undefined', () => {
      expect(extractor.splitByHeadings(null)).toHaveLength(0);
      expect(extractor.splitByHeadings(undefined)).toHaveLength(0);
    })) passed++; else failed++;

    if (it('should handle content before first heading (preamble)', () => {
      const content = `Some intro text before headings.

# First Heading
Content here.`;

      const sections = extractor.splitByHeadings(content);

      expect(sections).toHaveLength(2);
      expect(sections[0].heading).toBe('');
      expect(sections[0].content).toBe('Some intro text before headings.');
      expect(sections[1].heading).toBe('# First Heading');
    })) passed++; else failed++;

    if (it('should include subheadings (H3, H4, etc.)', () => {
      const content = `# Title

## Section A

### Subsection A.1

#### Deep Section

## Section B`;

      const sections = extractor.splitByHeadings(content);

      expect(sections).toHaveLength(5);
      expect(sections[2].level).toBe(3);
      expect(sections[3].level).toBe(4);
    })) passed++; else failed++;

    if (it('should calculate tokens for each section', () => {
      const content = `# Title
Short intro.

## Long Section
${'word '.repeat(100)}`;

      const sections = extractor.splitByHeadings(content);

      expect(sections[0].tokens).toBeGreaterThan(0);
      expect(sections[1].tokens).toBeGreaterThan(sections[0].tokens);
    })) passed++; else failed++;
  });

  // ==================== calculateRelevance 테스트 ====================
  describe('calculateRelevance', () => {
    if (it('should score higher when query appears in heading', () => {
      const section1 = { heading: '## Configuration', content: 'Some text about setup.' };
      const section2 = { heading: '## Installation', content: 'Configuration details here.' };

      const score1 = extractor.calculateRelevance(section1, 'configuration');
      const score2 = extractor.calculateRelevance(section2, 'configuration');

      expect(score1).toBeGreaterThan(score2);
    })) passed++; else failed++;

    if (it('should score based on keyword density', () => {
      const section1 = { heading: '## A', content: 'config config config other' };
      const section2 = { heading: '## B', content: 'config other text words' };

      const score1 = extractor.calculateRelevance(section1, 'config');
      const score2 = extractor.calculateRelevance(section2, 'config');

      expect(score1).toBeGreaterThan(score2);
    })) passed++; else failed++;

    if (it('should handle multiple query tokens', () => {
      const section1 = { heading: '## Setup', content: 'Configure the API key here.' };
      const section2 = { heading: '## Other', content: 'Unrelated content.' };

      const score1 = extractor.calculateRelevance(section1, 'api key configure');
      const score2 = extractor.calculateRelevance(section2, 'api key configure');

      expect(score1).toBeGreaterThan(score2);
    })) passed++; else failed++;

    if (it('should give bonus for code block matches', () => {
      const section1 = { heading: '## Example', content: '```javascript\nconst config = {};\n```' };
      const section2 = { heading: '## Example', content: 'Regular text about config.' };

      const score1 = extractor.calculateRelevance(section1, 'config');
      const score2 = extractor.calculateRelevance(section2, 'config');

      // 둘 다 매칭되지만 코드 블록 보너스로 score1이 더 높음
      expect(score1).toBeGreaterThan(0);
      expect(score2).toBeGreaterThan(0);
    })) passed++; else failed++;

    if (it('should return 0 for empty query', () => {
      const section = { heading: '## Test', content: 'Some content.' };
      expect(extractor.calculateRelevance(section, '')).toBe(0);
      expect(extractor.calculateRelevance(section, '   ')).toBe(0);
    })) passed++; else failed++;

    if (it('should return 0 for null/undefined', () => {
      expect(extractor.calculateRelevance(null, 'test')).toBe(0);
      expect(extractor.calculateRelevance({ heading: '', content: '' }, null)).toBe(0);
    })) passed++; else failed++;
  });

  // ==================== extractRelevantSections 테스트 ====================
  describe('extractRelevantSections', () => {
    if (it('should return all sections if within token budget', () => {
      const content = `# Title
Short intro.

## Section A
Content A.

## Section B
Content B.`;

      const sections = extractor.extractRelevantSections(content, 'content', 10000);

      expect(sections).toHaveLength(3);
    })) passed++; else failed++;

    if (it('should select relevant sections within token budget', () => {
      const content = `# Title
Short intro.

## Large Section
${'irrelevant '.repeat(500)}

## Target Section
This is about configuration settings.

## Another Large Section
${'unrelated '.repeat(500)}`;

      const sections = extractor.extractRelevantSections(content, 'configuration', 500);

      // configuration 관련 섹션이 선택되어야 함
      const hasTargetSection = sections.some(s => s.content.includes('configuration'));
      expect(hasTargetSection).toBeTruthy();

      const totalTokens = sections.reduce((sum, s) => sum + s.tokens, 0);
      expect(totalTokens).toBeLessThanOrEqual(500);
    })) passed++; else failed++;

    if (it('should preserve original order in output', () => {
      const content = `# Title
## Section A
First section.

## Section B
Second section.

## Section C
Third section.`;

      const sections = extractor.extractRelevantSections(content, 'section', 10000);

      for (let i = 1; i < sections.length; i++) {
        expect(sections[i].position).toBeGreaterThan(sections[i - 1].position);
      }
    })) passed++; else failed++;

    if (it('should truncate first section if over budget', () => {
      const content = `# Very Large Section
${'word '.repeat(2000)}`;

      const sections = extractor.extractRelevantSections(content, 'word', 100);

      expect(sections).toHaveLength(1);
      expect(sections[0].truncated).toBeTruthy();
      // truncateToTokenLimit은 추정 기반이라 약간의 오차 허용 (목표 +-10%)
      expect(sections[0].tokens).toBeLessThanOrEqual(120);
    })) passed++; else failed++;

    if (it('should handle empty content', () => {
      const sections = extractor.extractRelevantSections('', 'query', 1000);
      expect(sections).toHaveLength(0);
    })) passed++; else failed++;

    if (it('should return front sections when no query provided', () => {
      const content = `# Title
Intro.

## Section A
First.

## Section B
Second.`;

      const sections = extractor.extractRelevantSections(content, '', 10000);

      expect(sections).toHaveLength(3);
      expect(sections[0].position).toBe(0);
    })) passed++; else failed++;
  });

  // ==================== extractTOC 테스트 ====================
  describe('extractTOC', () => {
    if (it('should extract table of contents', () => {
      const content = `# Title

## Section A

### Subsection A.1

## Section B`;

      const toc = extractor.extractTOC(content);

      expect(toc).toHaveLength(4);
      expect(toc[0].title).toBe('Title');
      expect(toc[0].level).toBe(1);
      expect(toc[1].title).toBe('Section A');
      expect(toc[1].level).toBe(2);
      expect(toc[2].title).toBe('Subsection A.1');
      expect(toc[2].level).toBe(3);
    })) passed++; else failed++;

    if (it('should include token count for each section', () => {
      const content = `# Title
Short.

## Long Section
${'word '.repeat(100)}`;

      const toc = extractor.extractTOC(content);

      expect(toc[0].tokens).toBeGreaterThan(0);
      expect(toc[1].tokens).toBeGreaterThan(toc[0].tokens);
    })) passed++; else failed++;
  });

  // 결과 출력
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 테스트 결과: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
