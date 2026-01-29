/**
 * Smart Search Service - 하이브리드 검색 (시맨틱/키워드)
 * @module services/mcp/smart-search-service
 *
 * 임베딩 설정 여부에 따라 시맨틱 검색 또는 키워드 검색을 자동 선택합니다.
 * 검색 결과에 SectionExtractor를 적용하여 토큰 효율성을 극대화합니다.
 */

const fs = require('fs').promises;
const path = require('path');
const { validatePath } = require('../../utils/path-validator');
const { SectionExtractor } = require('./section-extractor');
const { searchDocuments } = require('../search-service');
const { estimateTokens } = require('../chatbot/token-estimator');

/**
 * 검색 결과 타입
 * @typedef {Object} SmartSearchResult
 * @property {string} query - 검색 쿼리
 * @property {string} mode - 사용된 검색 모드 (semantic/keyword)
 * @property {string} path - 검색 범위 경로
 * @property {DocumentResult[]} documents - 문서별 결과
 * @property {number} totalDocuments - 검색된 총 문서 수
 * @property {number} tokensUsed - 사용된 토큰 수
 * @property {number} tokenBudget - 토큰 예산
 */

/**
 * 문서 결과 타입
 * @typedef {Object} DocumentResult
 * @property {string} path - 문서 경로
 * @property {number} score - 관련성 점수
 * @property {Section[]} sections - 관련 섹션
 */

/**
 * SmartSearchService 클래스
 * 하이브리드 검색 서비스
 */
class SmartSearchService {
  /**
   * @param {Object} config - 애플리케이션 설정
   * @param {Object} logger - 로거
   */
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.extractor = new SectionExtractor();
    this.vectorStoreManager = null;
    this.initialized = false;
  }

  /**
   * 서비스 초기화 (app.locals에서 VectorStore 참조 획득)
   * @param {Object} appLocals - Express app.locals
   */
  initialize(appLocals) {
    if (appLocals && appLocals.vectorStoreManager) {
      this.vectorStoreManager = appLocals.vectorStoreManager;
      this.logger?.info('SmartSearchService: VectorStore connected');
    }
    this.initialized = true;
  }

  /**
   * 임베딩 설정 확인
   * @returns {boolean} 임베딩 설정 여부
   */
  hasEmbeddingConfig() {
    return !!(
      this.config.chatbot &&
      this.config.chatbot.embedding &&
      this.config.chatbot.embedding.type
    );
  }

  /**
   * 현재 사용 가능한 검색 모드 반환
   * @returns {'semantic'|'keyword'} 사용 가능한 모드
   */
  getAvailableMode() {
    if (this.hasEmbeddingConfig() && this.vectorStoreManager) {
      return 'semantic';
    }
    return 'keyword';
  }

  /**
   * 스마트 검색 수행
   * @param {string} query - 검색 쿼리
   * @param {Object} options - 옵션
   * @param {string} options.path - 검색 범위 (기본: /)
   * @param {'auto'|'semantic'|'keyword'} options.mode - 검색 모드 (기본: auto)
   * @param {number} options.maxTokens - 최대 토큰 (기본: 2000)
   * @param {number} options.limit - 최대 문서 수 (기본: 5)
   * @returns {Promise<SmartSearchResult>} 검색 결과
   */
  async smartSearch(query, options = {}) {
    const {
      path: searchPath = '/',
      mode = 'auto',
      maxTokens = 2000,
      limit = 5
    } = options;

    // 입력 검증
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      const error = new Error('INVALID_QUERY: Query must be a non-empty string');
      error.code = 'INVALID_QUERY';
      throw error;
    }

    // 실제 검색 모드 결정
    let actualMode = mode;
    if (mode === 'auto') {
      actualMode = this.getAvailableMode();
    } else if (mode === 'semantic' && !this.hasEmbeddingConfig()) {
      const error = new Error('SEMANTIC_SEARCH_UNAVAILABLE: Embedding configuration is required for semantic search');
      error.code = 'SEMANTIC_SEARCH_UNAVAILABLE';
      throw error;
    } else if (mode === 'semantic' && !this.vectorStoreManager) {
      const error = new Error('SEMANTIC_SEARCH_NOT_INITIALIZED: VectorStore is not initialized');
      error.code = 'SEMANTIC_SEARCH_NOT_INITIALIZED';
      throw error;
    }

    let rawResults;
    try {
      if (actualMode === 'semantic') {
        rawResults = await this.performSemanticSearch(query, limit);
      } else {
        rawResults = await this.performKeywordSearch(query, searchPath, limit);
      }
    } catch (error) {
      // 시맨틱 검색 실패 시 키워드로 폴백
      if (actualMode === 'semantic' && mode === 'auto') {
        this.logger?.warn('Semantic search failed, falling back to keyword search', {
          error: error.message
        });
        actualMode = 'keyword';
        rawResults = await this.performKeywordSearch(query, searchPath, limit);
      } else {
        throw error;
      }
    }

    // 결과 처리 및 토큰 예산 적용
    const documentResults = await this.processResults(rawResults, query, maxTokens);

    // 토큰 사용량 계산
    const tokensUsed = documentResults.reduce((sum, doc) => {
      return sum + doc.sections.reduce((s, sec) => s + sec.tokens, 0);
    }, 0);

    this.logger?.info('Smart search completed', {
      query,
      mode: actualMode,
      path: searchPath,
      documentsFound: documentResults.length,
      tokensUsed,
      maxTokens
    });

    return {
      query,
      mode: actualMode,
      path: searchPath,
      documents: documentResults,
      totalDocuments: documentResults.length,
      tokensUsed,
      tokenBudget: maxTokens,
      embeddingModel: actualMode === 'semantic' ? this.config.chatbot?.embedding?.model : null
    };
  }

  /**
   * 시맨틱 검색 수행
   * @param {string} query - 검색 쿼리
   * @param {number} limit - 최대 결과 수
   * @returns {Promise<Object[]>} 검색 결과
   */
  async performSemanticSearch(query, limit) {
    if (!this.vectorStoreManager) {
      throw new Error('VectorStore not available');
    }

    const docs = await this.vectorStoreManager.similaritySearch(query, limit);

    // LangChain Document 형태를 통일된 형태로 변환
    return docs.map((doc, index) => ({
      path: doc.metadata?.filePath || doc.metadata?.source || `unknown-${index}`,
      content: doc.pageContent,
      score: doc.score || (1 - index * 0.1), // 점수가 없으면 순서 기반 추정
      source: 'semantic'
    }));
  }

  /**
   * 키워드 검색 수행
   * @param {string} query - 검색 쿼리
   * @param {string} searchPath - 검색 범위
   * @param {number} limit - 최대 결과 수
   * @returns {Promise<Object[]>} 검색 결과
   */
  async performKeywordSearch(query, searchPath, limit) {
    const searchResult = await searchDocuments(
      this.config,
      this.logger,
      query,
      {
        limit,
        path: searchPath,
        highlight: false,
        includeContext: false,
        maxMatchesPerFile: 10
      }
    );

    // search-service 결과를 통일된 형태로 변환
    const results = [];

    for (const fileResult of searchResult.results) {
      // 파일 내용 읽기
      const absolutePath = validatePath(this.config.docsRoot, fileResult.path);
      let content = '';
      try {
        content = await fs.readFile(absolutePath, 'utf-8');
      } catch (e) {
        this.logger?.warn(`Failed to read file: ${fileResult.path}`);
        continue;
      }

      // 매치 수 기반 점수 (정규화)
      const score = Math.min(1, fileResult.matches.length / 5);

      results.push({
        path: fileResult.path,
        content,
        score,
        source: 'keyword'
      });
    }

    return results;
  }

  /**
   * 검색 결과 처리 (섹션 추출 및 토큰 예산 적용)
   * @param {Object[]} rawResults - 원시 검색 결과
   * @param {string} query - 검색 쿼리
   * @param {number} maxTokens - 토큰 예산
   * @returns {Promise<DocumentResult[]>} 처리된 결과
   */
  async processResults(rawResults, query, maxTokens) {
    const documentResults = [];
    let remainingTokens = maxTokens;

    // 점수순 정렬
    rawResults.sort((a, b) => b.score - a.score);

    for (const result of rawResults) {
      if (remainingTokens <= 0) break;

      // 각 문서당 최대 토큰 할당 (균등 분배 + 점수 가중)
      const docMaxTokens = Math.min(
        Math.ceil(maxTokens / Math.max(rawResults.length, 1) * (0.5 + result.score * 0.5)),
        remainingTokens
      );

      // 관련 섹션 추출
      const sections = this.extractor.extractRelevantSections(
        result.content,
        query,
        docMaxTokens
      );

      if (sections.length > 0) {
        const docTokens = sections.reduce((sum, s) => sum + s.tokens, 0);

        documentResults.push({
          path: result.path,
          score: result.score,
          sections
        });

        remainingTokens -= docTokens;
      }
    }

    return documentResults;
  }

  /**
   * 검색 결과를 마크다운 포맷으로 변환
   * @param {SmartSearchResult} result - 검색 결과
   * @returns {string} 마크다운 포맷 문자열
   */
  formatAsMarkdown(result) {
    const lines = [];

    lines.push(`# Search Results for "${result.query}"`);
    lines.push('');

    // 메타 정보
    const modeInfo = result.mode === 'semantic' && result.embeddingModel
      ? `${result.mode} (embedding: ${result.embeddingModel})`
      : result.mode;

    lines.push(`**Mode**: ${modeInfo}`);
    lines.push(`**Documents**: ${result.totalDocuments} matches`);
    lines.push(`**Path**: ${result.path}`);
    lines.push('');

    if (result.documents.length === 0) {
      lines.push('*No matching documents found.*');
    } else {
      for (let i = 0; i < result.documents.length; i++) {
        const doc = result.documents[i];
        lines.push('---');
        lines.push('');
        lines.push(`## ${i + 1}. ${doc.path} (score: ${doc.score.toFixed(2)})`);
        lines.push('');

        for (const section of doc.sections) {
          if (section.heading) {
            lines.push(section.heading);
          } else {
            lines.push('*(Introduction)*');
          }
          lines.push('');

          // 헤딩을 제외한 내용
          const content = section.heading
            ? section.content.replace(section.heading, '').trim()
            : section.content;

          lines.push(content);
          lines.push('');

          if (section.truncated) {
            lines.push('*[Content truncated due to token limit]*');
            lines.push('');
          }
        }
      }
    }

    lines.push('---');
    lines.push('');
    lines.push(`**Tokens used**: ${result.tokensUsed.toLocaleString()} / ${result.tokenBudget.toLocaleString()}`);

    return lines.join('\n');
  }
}

module.exports = { SmartSearchService };
