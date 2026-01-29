/**
 * Query Document Service - 문서 내 쿼리 기반 섹션 추출
 * @module services/mcp/query-document-service
 *
 * 단일 문서 내에서 쿼리와 관련된 섹션만 추출하여 반환합니다.
 * SectionExtractor를 활용하여 토큰 예산 내 관련 정보를 제공합니다.
 */

const fs = require('fs').promises;
const path = require('path');
const { validatePath } = require('../../utils/path-validator');
const { SectionExtractor } = require('./section-extractor');
const { estimateTokens } = require('../chatbot/token-estimator');

/**
 * 쿼리 결과 타입
 * @typedef {Object} QueryResult
 * @property {string} path - 문서 경로
 * @property {string} query - 검색 쿼리
 * @property {Section[]} sections - 관련 섹션 배열
 * @property {number} totalSections - 전체 섹션 수
 * @property {number} selectedSections - 선택된 섹션 수
 * @property {number} tokensUsed - 사용된 토큰 수
 * @property {number} tokenBudget - 토큰 예산
 */

/**
 * QueryDocumentService 클래스
 * 문서 내 쿼리 기반 섹션 추출 서비스
 */
class QueryDocumentService {
  /**
   * @param {Object} config - 애플리케이션 설정
   * @param {string} config.docsRoot - 문서 루트 경로
   * @param {Object} logger - 로거
   */
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.extractor = new SectionExtractor();
  }

  /**
   * 문서 내에서 쿼리와 관련된 섹션 추출
   * @param {string} docPath - 문서 경로 (상대 경로)
   * @param {string} query - 검색 쿼리
   * @param {Object} options - 옵션
   * @param {number} options.maxTokens - 최대 토큰 수 (기본: 2000)
   * @returns {Promise<QueryResult>} 쿼리 결과
   */
  async queryDocument(docPath, query, options = {}) {
    const { maxTokens = 2000 } = options;

    // 입력 검증
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      const error = new Error('INVALID_QUERY: Query must be a non-empty string');
      error.code = 'INVALID_QUERY';
      throw error;
    }

    // 경로 검증
    let absolutePath;
    try {
      absolutePath = validatePath(this.config.docsRoot, docPath);
    } catch (error) {
      const pathError = new Error(`PATH_TRAVERSAL: ${error.message}`);
      pathError.code = 'PATH_TRAVERSAL';
      throw pathError;
    }

    // 파일 존재 확인
    let stats;
    try {
      stats = await fs.stat(absolutePath);
    } catch (error) {
      const notFoundError = new Error(`DOCUMENT_NOT_FOUND: ${docPath}`);
      notFoundError.code = 'DOCUMENT_NOT_FOUND';
      throw notFoundError;
    }

    // 파일인지 확인
    if (!stats.isFile()) {
      const invalidError = new Error(`INVALID_PATH: ${docPath} is not a file`);
      invalidError.code = 'INVALID_PATH';
      throw invalidError;
    }

    // 마크다운 파일인지 확인
    if (!docPath.toLowerCase().endsWith('.md')) {
      const formatError = new Error(`INVALID_FORMAT: Only .md files are supported`);
      formatError.code = 'INVALID_FORMAT';
      throw formatError;
    }

    // 파일 읽기
    const content = await fs.readFile(absolutePath, 'utf-8');

    // 전체 섹션 수 파악
    const allSections = this.extractor.splitByHeadings(content);
    const totalSections = allSections.length;

    // 관련 섹션 추출
    const relevantSections = this.extractor.extractRelevantSections(content, query, maxTokens);

    // 토큰 사용량 계산
    const tokensUsed = relevantSections.reduce((sum, s) => sum + s.tokens, 0);

    this.logger?.info('Query document completed', {
      path: docPath,
      query,
      totalSections,
      selectedSections: relevantSections.length,
      tokensUsed,
      maxTokens
    });

    return {
      path: docPath,
      query,
      sections: relevantSections,
      totalSections,
      selectedSections: relevantSections.length,
      tokensUsed,
      tokenBudget: maxTokens
    };
  }

  /**
   * 쿼리 결과를 마크다운 포맷으로 변환
   * @param {QueryResult} result - 쿼리 결과
   * @returns {string} 마크다운 포맷 문자열
   */
  formatAsMarkdown(result) {
    const lines = [];

    lines.push(`# Query Results for "${result.query}"`);
    lines.push('');
    lines.push(`**Document**: ${result.path}`);
    lines.push(`**Query**: ${result.query}`);
    lines.push(`**Sections**: ${result.selectedSections} of ${result.totalSections} (selected based on relevance)`);
    lines.push('');

    if (result.sections.length === 0) {
      lines.push('*No relevant sections found for this query.*');
    } else {
      for (const section of result.sections) {
        lines.push('---');
        lines.push('');

        // 헤딩이 있으면 관련성 점수와 함께 표시
        if (section.heading) {
          const scoreText = section.relevance !== undefined
            ? ` (score: ${section.relevance.toFixed(2)})`
            : '';
          lines.push(`${section.heading}${scoreText}`);
        } else {
          lines.push('## (Introduction)');
        }

        lines.push('');

        // 헤딩을 제외한 내용만 추가 (헤딩이 있는 경우)
        if (section.heading) {
          const contentWithoutHeading = section.content
            .replace(section.heading, '')
            .trim();
          lines.push(contentWithoutHeading);
        } else {
          lines.push(section.content);
        }

        lines.push('');

        if (section.truncated) {
          lines.push('*[Content truncated due to token limit]*');
          lines.push('');
        }
      }
    }

    lines.push('---');
    lines.push('');
    lines.push(`**Tokens used**: ${result.tokensUsed} / ${result.tokenBudget}`);

    return lines.join('\n');
  }
}

module.exports = { QueryDocumentService };
