/**
 * Section Extractor - 마크다운 문서의 섹션 기반 추출
 * @module services/mcp/section-extractor
 *
 * 마크다운 문서를 헤딩 기준으로 섹션 분할하고,
 * 쿼리 관련성에 따라 섹션을 선택하여 토큰 사용량을 최적화합니다.
 */

const { estimateTokens, truncateToTokenLimit } = require('../chatbot/token-estimator');

/**
 * 섹션 정보 타입
 * @typedef {Object} Section
 * @property {string} heading - 헤딩 텍스트 (예: "## Configuration")
 * @property {number} level - 헤딩 레벨 (1-6)
 * @property {string} content - 섹션 내용 (헤딩 포함)
 * @property {number} position - 원본 문서에서의 위치 (인덱스)
 * @property {number} tokens - 추정 토큰 수
 */

/**
 * SectionExtractor 클래스
 * 마크다운 문서를 섹션으로 분할하고 쿼리 관련성에 따라 추출
 */
class SectionExtractor {
  /**
   * @param {Object} options - 옵션
   * @param {number} options.headingBonus - 헤딩 매칭 보너스 (기본: 2.0)
   * @param {number} options.codeBlockBonus - 코드 블록 매칭 보너스 (기본: 1.5)
   * @param {number} options.minRelevanceScore - 최소 관련성 점수 (기본: 0.01)
   */
  constructor(options = {}) {
    this.headingBonus = options.headingBonus ?? 2.0;
    this.codeBlockBonus = options.codeBlockBonus ?? 1.5;
    this.minRelevanceScore = options.minRelevanceScore ?? 0.01;
  }

  /**
   * 마크다운 문서를 헤딩 기준으로 섹션 분할
   * @param {string} content - 마크다운 문서 내용
   * @returns {Section[]} 섹션 배열
   */
  splitByHeadings(content) {
    if (!content || typeof content !== 'string') {
      return [];
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length === 0) {
      return [];
    }

    // 헤딩 패턴: 줄 시작에서 #으로 시작 (1-6개)
    const headingPattern = /^(#{1,6})\s+(.+)$/gm;
    const headings = [];
    let match;

    // 모든 헤딩 위치 찾기
    while ((match = headingPattern.exec(trimmedContent)) !== null) {
      headings.push({
        fullMatch: match[0],
        level: match[1].length,
        title: match[2].trim(),
        index: match.index
      });
    }

    // 헤딩이 없는 경우: 전체를 하나의 섹션으로
    if (headings.length === 0) {
      const tokens = estimateTokens(trimmedContent);
      return [{
        heading: '',
        level: 0,
        content: trimmedContent,
        position: 0,
        tokens
      }];
    }

    const sections = [];

    // 첫 헤딩 전 내용이 있으면 포함 (서문)
    if (headings[0].index > 0) {
      const preContent = trimmedContent.slice(0, headings[0].index).trim();
      if (preContent.length > 0) {
        sections.push({
          heading: '',
          level: 0,
          content: preContent,
          position: 0,
          tokens: estimateTokens(preContent)
        });
      }
    }

    // 각 헤딩부터 다음 헤딩 전까지를 섹션으로
    for (let i = 0; i < headings.length; i++) {
      const startIndex = headings[i].index;
      const endIndex = i + 1 < headings.length
        ? headings[i + 1].index
        : trimmedContent.length;

      const sectionContent = trimmedContent.slice(startIndex, endIndex).trim();

      sections.push({
        heading: headings[i].fullMatch,
        level: headings[i].level,
        content: sectionContent,
        position: sections.length,
        tokens: estimateTokens(sectionContent)
      });
    }

    return sections;
  }

  /**
   * 섹션의 쿼리 관련성 점수 계산
   * @param {Section} section - 섹션
   * @param {string} query - 검색 쿼리
   * @returns {number} 관련성 점수 (0-1+ 범위, 보너스로 1 초과 가능)
   */
  calculateRelevance(section, query) {
    if (!section || !query) {
      return 0;
    }

    // 쿼리 토큰화 (공백 분리, 소문자 변환, 빈 토큰 제거)
    const queryTokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter(token => token.length > 0);

    if (queryTokens.length === 0) {
      return 0;
    }

    const contentLower = section.content.toLowerCase();
    const headingLower = (section.heading || '').toLowerCase();

    // 1. 기본 키워드 밀도 계산
    const words = contentLower.split(/\s+/).filter(w => w.length > 0);
    const totalWords = words.length || 1;

    let matchCount = 0;
    for (const token of queryTokens) {
      // 단어 경계를 고려한 매칭
      const regex = new RegExp(`\\b${this._escapeRegex(token)}\\b`, 'gi');
      const matches = contentLower.match(regex);
      if (matches) {
        matchCount += matches.length;
      }
    }

    let score = matchCount / totalWords;

    // 2. 헤딩 매칭 보너스
    for (const token of queryTokens) {
      if (headingLower.includes(token)) {
        score += this.headingBonus / queryTokens.length;
      }
    }

    // 3. 코드 블록 매칭 보너스
    const codeBlockPattern = /```[\s\S]*?```|`[^`]+`/g;
    const codeBlocks = section.content.match(codeBlockPattern) || [];
    for (const codeBlock of codeBlocks) {
      const codeLower = codeBlock.toLowerCase();
      for (const token of queryTokens) {
        if (codeLower.includes(token)) {
          score += this.codeBlockBonus / (queryTokens.length * Math.max(codeBlocks.length, 1));
        }
      }
    }

    return score;
  }

  /**
   * 쿼리와 관련된 섹션 추출 (토큰 예산 내)
   * @param {string} content - 마크다운 문서 내용
   * @param {string} query - 검색 쿼리
   * @param {number} maxTokens - 최대 토큰 수 (기본: 2000)
   * @returns {Section[]} 관련 섹션 배열 (원본 순서 유지)
   */
  extractRelevantSections(content, query, maxTokens = 2000) {
    if (!content || typeof content !== 'string') {
      return [];
    }

    if (!query || typeof query !== 'string') {
      // 쿼리 없으면 토큰 예산 내 앞부분 반환
      return this._extractWithinBudget(content, maxTokens);
    }

    const sections = this.splitByHeadings(content);
    if (sections.length === 0) {
      return [];
    }

    // 전체 문서가 예산 내면 전체 반환
    const totalTokens = sections.reduce((sum, s) => sum + s.tokens, 0);
    if (totalTokens <= maxTokens) {
      return sections;
    }

    // 각 섹션에 관련성 점수 부여
    const scoredSections = sections.map(section => ({
      ...section,
      relevance: this.calculateRelevance(section, query)
    }));

    // 점수순 정렬 (내림차순)
    const sortedByScore = [...scoredSections].sort((a, b) => b.relevance - a.relevance);

    // 토큰 예산 내 섹션 선택
    const selectedSections = [];
    let usedTokens = 0;

    for (const section of sortedByScore) {
      // 최소 관련성 점수 미만이면 스킵
      if (section.relevance < this.minRelevanceScore) {
        continue;
      }

      if (usedTokens + section.tokens <= maxTokens) {
        selectedSections.push(section);
        usedTokens += section.tokens;
      } else if (selectedSections.length === 0) {
        // 첫 번째 섹션도 예산 초과: 잘라서 포함
        const truncatedContent = truncateToTokenLimit(section.content, maxTokens);
        selectedSections.push({
          ...section,
          content: truncatedContent,
          tokens: estimateTokens(truncatedContent),
          truncated: true
        });
        break;
      }
    }

    // 원본 순서로 재정렬
    selectedSections.sort((a, b) => a.position - b.position);

    return selectedSections;
  }

  /**
   * 토큰 예산 내 문서 앞부분 추출 (쿼리 없을 때)
   * @private
   */
  _extractWithinBudget(content, maxTokens) {
    const sections = this.splitByHeadings(content);
    if (sections.length === 0) {
      return [];
    }

    const totalTokens = sections.reduce((sum, s) => sum + s.tokens, 0);
    if (totalTokens <= maxTokens) {
      return sections;
    }

    // 앞에서부터 예산 내 섹션 선택
    const selected = [];
    let usedTokens = 0;

    for (const section of sections) {
      if (usedTokens + section.tokens <= maxTokens) {
        selected.push(section);
        usedTokens += section.tokens;
      } else if (selected.length === 0) {
        // 첫 섹션도 초과: 잘라서 포함
        const truncatedContent = truncateToTokenLimit(section.content, maxTokens);
        selected.push({
          ...section,
          content: truncatedContent,
          tokens: estimateTokens(truncatedContent),
          truncated: true
        });
        break;
      } else {
        break;
      }
    }

    return selected;
  }

  /**
   * 정규식 특수문자 이스케이프
   * @private
   */
  _escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 문서 목차(TOC) 생성
   * @param {string} content - 마크다운 문서 내용
   * @returns {Object[]} 목차 항목 배열
   */
  extractTOC(content) {
    const sections = this.splitByHeadings(content);

    return sections
      .filter(s => s.level > 0) // 헤딩 없는 섹션 제외
      .map(s => ({
        level: s.level,
        title: s.heading.replace(/^#+\s+/, ''), // # 기호 제거
        tokens: s.tokens
      }));
  }
}

module.exports = { SectionExtractor };
