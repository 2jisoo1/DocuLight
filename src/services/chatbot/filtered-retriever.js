/**
 * FilteredRetriever - 삭제된/오래된 버전 문서를 필터링하는 Retriever
 * @module services/chatbot/filtered-retriever
 *
 * HNSWLib의 개별 삭제 미지원 문제를 해결하기 위한 버전 기반 필터링
 */

/**
 * 삭제된/오래된 버전 문서를 필터링하는 Retriever
 */
class FilteredRetriever {
  /**
   * @param {Object} vectorStore - HNSWLib VectorStore 인스턴스
   * @param {Object} metadata - VectorStorage 메타데이터
   * @param {number} k - 반환할 최대 문서 수
   * @param {Object} logger - 로거 인스턴스
   * @param {string} docsRoot - 문서 루트 경로 (선택적)
   * @param {number} minSimilarityScore - 최소 유사도 점수 (0-1, 기본: 0)
   */
  constructor(vectorStore, metadata, k = 4, logger = null, docsRoot = null, minSimilarityScore = 0) {
    this.vectorStore = vectorStore;
    this.metadata = metadata;
    this.k = k;
    this.logger = logger;
    this.docsRoot = docsRoot;
    this.minSimilarityScore = minSimilarityScore;

    // 삭제 비율에 따른 오버샘플링 계수 계산
    this._updateOverSampleFactor();
  }

  /**
   * 오버샘플링 계수 업데이트
   * @private
   */
  _updateOverSampleFactor() {
    const stats = this.metadata?.stats || {};
    const total = stats.totalChunks + stats.deletedChunks;

    if (total === 0) {
      this.overSampleFactor = 1;
      return;
    }

    // 삭제 비율만큼 추가 검색
    const deletedRatio = stats.deletedChunks / total;
    this.overSampleFactor = 1 + deletedRatio + 0.2; // 20% 버퍼

    // 최대 3배로 제한
    this.overSampleFactor = Math.min(this.overSampleFactor, 3);
  }

  /**
   * 문서가 유효한지 확인
   * @private
   * @param {Object} doc - 검색된 문서
   * @returns {boolean}
   */
  _isValidDocument(doc) {
    const source = doc.metadata?.source;
    const version = doc.metadata?.version;

    if (!source) return false;

    // 가능한 경로 변환 목록 생성
    const pathCandidates = this._generatePathCandidates(source);

    // 메타데이터에서 문서 찾기
    let storedDoc = null;
    for (const candidate of pathCandidates) {
      if (this.metadata.documents?.[candidate]) {
        storedDoc = this.metadata.documents[candidate];
        break;
      }
    }

    if (!storedDoc) return false;

    // 최신 버전만 유효
    if (version !== storedDoc.version) return false;

    return true;
  }

  /**
   * source 경로에서 가능한 모든 경로 변환 목록 생성
   * @private
   * @param {string} source - 원본 경로
   * @returns {string[]}
   */
  _generatePathCandidates(source) {
    const path = require("path");
    const candidates = new Set();

    // 원본 경로
    candidates.add(source);

    // Path separator 정규화 버전들
    candidates.add(source.replace(/\//g, "\\"));
    candidates.add(source.replace(/\\/g, "/"));

    // docsRoot가 있으면 상대 경로로 변환 시도
    if (this.docsRoot) {
      const normalizedDocsRoot = this.docsRoot.replace(/\\/g, "/");
      const normalizedSource = source.replace(/\\/g, "/");

      // docsRoot prefix 제거
      if (normalizedSource.startsWith(normalizedDocsRoot)) {
        let relativePath = normalizedSource.slice(normalizedDocsRoot.length);
        // 앞쪽 슬래시 제거
        relativePath = relativePath.replace(/^[/\\]+/, "");

        candidates.add(relativePath);
        candidates.add(relativePath.replace(/\//g, "\\"));
      }

      // path.relative 사용
      try {
        const relativePath = path.relative(this.docsRoot, source);
        candidates.add(relativePath);
        candidates.add(relativePath.replace(/\\/g, "/"));
        candidates.add(relativePath.replace(/\//g, "\\"));
      } catch {
        // 무시
      }
    }

    return [...candidates];
  }

  /**
   * LangChain Retriever 인터페이스: invoke
   * @param {string} query - 검색 쿼리
   * @returns {Promise<Array>} 관련 문서 배열
   */
  async invoke(query) {
    return this.getRelevantDocuments(query);
  }

  /**
   * 관련 문서 검색 (레거시 인터페이스)
   * @param {string} query - 검색 쿼리
   * @returns {Promise<Array>} 관련 문서 배열
   */
  async getRelevantDocuments(query) {
    if (!this.vectorStore) {
      this.logger?.warn("[FilteredRetriever] VectorStore not initialized");
      return [];
    }

    // 오버샘플링 계수 업데이트
    this._updateOverSampleFactor();

    // 오버샘플링으로 더 많이 검색
    const searchK = Math.ceil(this.k * this.overSampleFactor);

    this.logger?.info(
      `[FilteredRetriever] Searching with k=${searchK} (target=${this.k}), minScore=${this.minSimilarityScore}`
    );

    try {
      // 유사도 점수와 함께 검색 (minSimilarityScore가 설정된 경우)
      if (this.minSimilarityScore > 0) {
        const resultsWithScore = await this.vectorStore.similaritySearchWithScore(query, searchK);

        this.logger?.info(
          `[FilteredRetriever] Raw search returned ${resultsWithScore.length} docs with scores`
        );

        // 디버그: 처음 3개 결과의 점수 출력
        if (resultsWithScore.length > 0) {
          resultsWithScore.slice(0, 3).forEach(([doc, score], i) => {
            // HNSWLib은 거리(distance)를 반환하므로 유사도로 변환: similarity = 1 - distance
            const similarity = 1 - score;
            this.logger?.info(
              `[FilteredRetriever] Doc ${i}: score=${similarity.toFixed(3)}, source=${doc.metadata?.source}`
            );
          });
        }

        // 유사도 필터링 + 버전 필터링
        const validResults = resultsWithScore
          .filter(([doc, score]) => {
            const similarity = 1 - score;  // 거리 → 유사도 변환
            return similarity >= this.minSimilarityScore && this._isValidDocument(doc);
          })
          .map(([doc]) => doc);

        this.logger?.info(
          `[FilteredRetriever] After filtering (minScore=${this.minSimilarityScore}): ${validResults.length} valid docs`
        );

        return validResults.slice(0, this.k);
      }

      // minSimilarityScore가 0인 경우 기존 방식
      const results = await this.vectorStore.similaritySearch(query, searchK);

      this.logger?.info(
        `[FilteredRetriever] Raw search returned ${results.length} docs`
      );

      // 디버그: 처음 3개 결과의 메타데이터 출력
      if (results.length > 0) {
        results.slice(0, 3).forEach((doc, i) => {
          this.logger?.info(
            `[FilteredRetriever] Doc ${i}: source=${doc.metadata?.source}, version=${doc.metadata?.version}`
          );
        });
      }

      // 유효한 문서만 필터링
      const validResults = results.filter((doc) => this._isValidDocument(doc));

      this.logger?.info(
        `[FilteredRetriever] After filtering: ${validResults.length} valid docs`
      );

      // 최대 k개 반환
      return validResults.slice(0, this.k);
    } catch (error) {
      this.logger?.error("[FilteredRetriever] Search failed:", error);
      return [];
    }
  }

  /**
   * 유사도 점수와 함께 검색
   * @param {string} query - 검색 쿼리
   * @returns {Promise<Array<{document: Object, score: number}>>}
   */
  async similaritySearchWithScore(query) {
    if (!this.vectorStore) return [];

    // 오버샘플링 계수 업데이트
    this._updateOverSampleFactor();

    const searchK = Math.ceil(this.k * this.overSampleFactor);

    try {
      const results = await this.vectorStore.similaritySearchWithScore(
        query,
        searchK
      );

      return results
        .filter(([doc]) => this._isValidDocument(doc))
        .slice(0, this.k)
        .map(([document, score]) => ({ document, score }));
    } catch (error) {
      this.logger?.error(
        "[FilteredRetriever] Search with score failed:",
        error
      );
      return [];
    }
  }

  /**
   * 반환할 문서 수 변경
   * @param {number} k - 새 문서 수
   * @returns {FilteredRetriever} this
   */
  withK(k) {
    this.k = k;
    return this;
  }
}

module.exports = FilteredRetriever;
