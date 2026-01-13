/**
 * VectorStoreManager - 벡터 스토어 관리
 * @module services/chatbot/vector-store
 *
 * 인메모리 또는 HNSWLib 영속성 벡터 스토어 기반 문서 벡터화 및 검색
 */

const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const crypto = require('crypto');
const { VectorStorage } = require("./vector-storage");

/**
 * 간단한 인메모리 벡터 스토어 구현
 * cosine similarity 기반 검색
 */
class SimpleMemoryVectorStore {
  constructor(embeddings) {
    this.embeddings = embeddings;
    this.vectors = [];      // [{vector: number[], document: Document}]
  }

  /**
   * 문서 추가
   * @param {Document[]} documents - 추가할 문서 배열
   */
  async addDocuments(documents) {
    const texts = documents.map(doc => doc.pageContent);
    const vectors = await this.embeddings.embedDocuments(texts);

    for (let i = 0; i < documents.length; i++) {
      this.vectors.push({
        vector: vectors[i],
        document: documents[i]
      });
    }
  }

  /**
   * 유사도 검색
   * @param {string} query - 검색 쿼리
   * @param {number} k - 반환할 문서 수
   * @returns {Promise<Document[]>}
   */
  async similaritySearch(query, k = 4) {
    const queryVector = await this.embeddings.embedQuery(query);

    // 코사인 유사도 계산 및 정렬
    const scored = this.vectors.map(item => ({
      document: item.document,
      score: this._cosineSimilarity(queryVector, item.vector)
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, k).map(item => item.document);
  }

  /**
   * Retriever로 변환
   * @param {number} k - 검색할 문서 수
   * @returns {Object}
   */
  asRetriever(k = 4) {
    const store = this;
    return {
      async invoke(query) {
        return store.similaritySearch(query, k);
      },
      async getRelevantDocuments(query) {
        return store.similaritySearch(query, k);
      }
    };
  }

  /**
   * 코사인 유사도 계산
   * @private
   */
  _cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 저장된 문서 수
   */
  get size() {
    return this.vectors.length;
  }
}

/**
 * 벡터 스토어 관리자
 */
class VectorStoreManager {
  /**
   * @param {Embeddings} embeddings - Embedding 인스턴스
   * @param {Object} config - RAG 설정
   * @param {number} config.chunkSize - 청크 크기 (기본: 1000)
   * @param {number} config.chunkOverlap - 청크 오버랩 (기본: 200)
   * @param {number} config.retrievalCount - 검색 문서 수 (기본: 20)
   * @param {Object} config.persistence - 영속성 설정 (optional)
   * @param {Object} options - 옵션
   * @param {Object} options.logger - 로거
   * @param {Object} options.embeddingConfig - 임베딩 설정 (persistence 사용 시 필수)
   * @param {string} options.docsRoot - 문서 루트 경로 (선택적)
   */
  constructor(embeddings, config = {}, options = {}) {
    this.embeddings = embeddings;
    this.config = {
      chunkSize: config.chunkSize || 1000,
      chunkOverlap: config.chunkOverlap || 200,
      retrievalCount: config.retrievalCount || 20,
      ...config
    };
    this.logger = options.logger;
    this.embeddingConfig = options.embeddingConfig;
    this.docsRoot = options.docsRoot;

    // 영속성 모드 사용 여부
    this.usePersistence = !!(config.persistence && config.persistence.dataDir);

    // VectorStorage (영속성 모드일 때만)
    this.vectorStorage = null;

    // 인메모리 모드용
    this.vectorStore = null;
    this.documentHashes = new Map();
    this.documentChunkIds = new Map(); // filePath -> chunkIds[]
    this.lastUpdated = null;
    this.isInitialized = false;

    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
      separators: [
        "\n## ",      // H2 헤딩
        "\n### ",     // H3 헤딩
        "\n#### ",    // H4 헤딩
        "\n\n",       // 빈 줄
        "\n",         // 줄바꿈
        " ",          // 공백
        ""            // 문자
      ]
    });
  }

  /**
   * 벡터 스토어 초기화
   */
  async initialize() {
    if (this.isInitialized) {
      this.logger?.warn('VectorStoreManager already initialized');
      return;
    }

    if (this.usePersistence) {
      // 영속성 모드: VectorStorage 사용
      if (!this.embeddingConfig) {
        throw new Error('embeddingConfig is required for persistence mode');
      }

      this.vectorStorage = new VectorStorage(
        this.config,
        this.embeddings,
        this.embeddingConfig,
        this.logger,
        this.docsRoot
      );

      await this.vectorStorage.initialize();
      this.logger?.info('VectorStoreManager initialized (persistence mode)');
    } else {
      // 인메모리 모드: SimpleMemoryVectorStore 사용
      this.vectorStore = new SimpleMemoryVectorStore(this.embeddings);
      this.logger?.info('VectorStoreManager initialized (in-memory mode)');
    }

    this.isInitialized = true;
  }

  /**
   * 문서 추가/업데이트
   * @param {string} filePath - 파일 경로
   * @param {string} content - 문서 내용
   * @param {Object} metadata - 메타데이터
   * @returns {Promise<{added: boolean, chunks: number}>}
   */
  async addDocument(filePath, content, metadata = {}) {
    if (!this.isInitialized) {
      throw new Error('VectorStoreManager not initialized. Call initialize() first.');
    }

    if (this.usePersistence) {
      // 영속성 모드: VectorStorage 사용
      const fs = require('fs').promises;
      const path = require('path');

      // 파일 stats 가져오기 (metadata에서 가져오거나 새로 생성)
      let fileStats;
      if (metadata.source) {
        try {
          fileStats = await fs.stat(metadata.source);
        } catch {
          // 파일이 없으면 더미 stats 생성
          fileStats = { size: content.length, mtimeMs: Date.now() };
        }
      } else {
        fileStats = { size: content.length, mtimeMs: Date.now() };
      }

      // 변경 여부 확인
      if (!this.vectorStorage.isDocumentChanged(filePath, fileStats, content)) {
        this.logger?.debug(`Skipping unchanged document: ${filePath}`);
        return { added: false, chunks: 0 };
      }

      const chunks = await this.vectorStorage.addDocument(
        filePath,
        content,
        fileStats,
        metadata
      );

      this.lastUpdated = new Date();
      return { added: true, chunks };
    }

    // 인메모리 모드: 기존 로직
    const hash = this._computeHash(content);

    // 변경 없으면 스킵
    if (this.documentHashes.get(filePath) === hash) {
      this.logger?.debug(`Skipping unchanged document: ${filePath}`);
      return { added: false, chunks: 0 };
    }

    // 기존 문서 정보 제거 (실제 벡터는 재구축 시 제외)
    if (this.documentHashes.has(filePath)) {
      this._removeDocumentTracking(filePath);
    }

    // 청킹
    const chunks = await this.splitter.createDocuments(
      [content],
      [{
        ...metadata,
        filePath,
        indexedAt: new Date().toISOString()
      }]
    );

    if (chunks.length === 0) {
      this.logger?.warn(`No chunks created for: ${filePath}`);
      return { added: false, chunks: 0 };
    }

    // 각 청크에 고유 ID 부여
    const chunkIds = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkId = `${filePath}#${i}`;
      chunks[i].metadata.chunkId = chunkId;
      chunks[i].metadata.chunkIndex = i;
      chunks[i].metadata.totalChunks = chunks.length;
      chunkIds.push(chunkId);
    }

    // 벡터 스토어에 추가
    await this.vectorStore.addDocuments(chunks);

    // 상태 업데이트
    this.documentHashes.set(filePath, hash);
    this.documentChunkIds.set(filePath, chunkIds);
    this.lastUpdated = new Date();

    this.logger?.info(`Added document: ${filePath} (${chunks.length} chunks)`);

    return { added: true, chunks: chunks.length };
  }

  /**
   * 문서 제거 (트래킹만 - MemoryVectorStore는 직접 삭제 미지원)
   * @param {string} filePath - 파일 경로
   */
  async removeDocument(filePath) {
    if (this.usePersistence) {
      await this.vectorStorage.markDocumentDeleted(filePath);
      this.logger?.info(`Removed document: ${filePath}`);
      return;
    }

    this._removeDocumentTracking(filePath);
    this.logger?.info(`Removed document tracking: ${filePath}`);
  }

  /**
   * 문서 트래킹 정보 제거
   * @private
   */
  _removeDocumentTracking(filePath) {
    this.documentHashes.delete(filePath);
    this.documentChunkIds.delete(filePath);
  }

  /**
   * 벡터 스토어 재구축 (삭제된 문서 실제 제거)
   * @param {Function} getDocumentContent - filePath => {content, metadata}
   */
  async rebuild(getDocumentContent) {
    this.logger?.info('Rebuilding vector store...');

    const oldHashes = new Map(this.documentHashes);

    // 새 벡터 스토어 생성
    this.vectorStore = new SimpleMemoryVectorStore(this.embeddings);
    this.documentHashes.clear();
    this.documentChunkIds.clear();

    // 기존 문서 재추가
    for (const [filePath, _hash] of oldHashes) {
      try {
        const { content, metadata } = await getDocumentContent(filePath);
        await this.addDocument(filePath, content, metadata);
      } catch (error) {
        this.logger?.error(`Failed to rebuild document ${filePath}:`, error);
      }
    }

    this.logger?.info(`Vector store rebuilt: ${this.documentHashes.size} documents`);
  }

  /**
   * Retriever 반환
   * @param {number} k - 검색할 문서 수
   * @param {number} minSimilarityScore - 최소 유사도 점수 (0-1)
   * @returns {VectorStoreRetriever}
   */
  getRetriever(k, minSimilarityScore = 0) {
    if (!this.isInitialized) {
      throw new Error('VectorStoreManager not initialized');
    }

    const retrievalCount = k || this.config.retrievalCount;

    if (this.usePersistence) {
      return this.vectorStorage.getRetriever(retrievalCount, minSimilarityScore);
    }

    return this.vectorStore.asRetriever(retrievalCount);
  }

  /**
   * 유사 문서 검색
   * @param {string} query - 검색 쿼리
   * @param {number} k - 검색할 문서 수
   * @returns {Promise<Document[]>}
   */
  async similaritySearch(query, k) {
    if (!this.isInitialized) {
      throw new Error('VectorStoreManager not initialized');
    }

    const count = k || this.config.retrievalCount;
    return this.vectorStore.similaritySearch(query, count);
  }

  /**
   * 통계 반환
   * @returns {{totalDocs: number, totalChunks: number, lastUpdated: Date|null, isInitialized: boolean}}
   */
  getStats() {
    if (this.usePersistence) {
      const stats = this.vectorStorage.getStats();
      return {
        totalDocs: stats.totalDocuments,
        totalChunks: stats.totalChunks,
        deletedDocuments: stats.deletedDocuments,
        deletedChunks: stats.deletedChunks,
        needsCompaction: stats.needsCompaction,
        lastUpdated: this.lastUpdated,
        isInitialized: this.isInitialized,
        persistenceMode: true,
        indexDir: stats.indexDir
      };
    }

    let totalChunks = 0;
    for (const chunks of this.documentChunkIds.values()) {
      totalChunks += chunks.length;
    }

    return {
      totalDocs: this.documentHashes.size,
      totalChunks,
      lastUpdated: this.lastUpdated,
      isInitialized: this.isInitialized,
      persistenceMode: false
    };
  }

  /**
   * 특정 문서가 인덱싱되어 있는지 확인
   * @param {string} filePath - 파일 경로
   * @returns {boolean}
   */
  hasDocument(filePath) {
    if (this.usePersistence) {
      return this.vectorStorage.hasDocument(filePath);
    }
    return this.documentHashes.has(filePath);
  }

  /**
   * 해시 계산
   * @private
   */
  _computeHash(content) {
    return crypto
      .createHash('sha256')
      .update(content)
      .digest('base64')
      .slice(0, 32);
  }

  /**
   * 서비스 종료
   */
  async shutdown() {
    if (this.usePersistence && this.vectorStorage) {
      await this.vectorStorage.shutdown();
    }
    this.isInitialized = false;
    this.logger?.info('VectorStoreManager shutdown complete');
  }
}

module.exports = { VectorStoreManager };
