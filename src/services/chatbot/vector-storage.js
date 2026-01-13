/**
 * VectorStorage - HNSWLib 기반 벡터 스토리지 영속성 관리
 * @module services/chatbot/vector-storage
 *
 * HNSWLib를 사용한 벡터 인덱스 파일 영속성 저장소
 * 서버 재시작 시에도 벡터 데이터 유지
 */

const { HNSWLib } = require("@langchain/community/vectorstores/hnswlib");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const AsyncLock = require("async-lock");
const crypto = require("crypto");
const fs = require("fs").promises;
const path = require("path");

/**
 * VectorStorage 에러 클래스
 */
class VectorStorageError extends Error {
  constructor(message, code, recoverable = false) {
    super(message);
    this.name = "VectorStorageError";
    this.code = code;
    this.recoverable = recoverable;
  }
}

// 에러 코드
const ErrorCodes = {
  DIRECTORY_CREATE_FAILED: "VS_DIR_001",
  METADATA_PARSE_FAILED: "VS_META_001",
  METADATA_SAVE_FAILED: "VS_META_002",
  INDEX_LOAD_FAILED: "VS_IDX_001",
  INDEX_SAVE_FAILED: "VS_IDX_002",
  INDEX_CORRUPTED: "VS_IDX_003",
  EMBEDDING_API_FAILED: "VS_EMB_001",
  EMBEDDING_MODEL_CHANGED: "VS_EMB_002",
  LOCK_TIMEOUT: "VS_LOCK_001",
};

/**
 * HNSWLib 기반 벡터 스토리지 관리 클래스
 */
class VectorStorage {
  /**
   * @param {Object} config - RAG 설정 (chatbot.rag)
   * @param {Object} embeddings - LangChain Embeddings 인스턴스
   * @param {Object} embeddingConfig - 임베딩 설정
   * @param {Object} logger - 로거 인스턴스
   * @param {string} docsRoot - 문서 루트 경로 (선택적)
   */
  constructor(config, embeddings, embeddingConfig, logger, docsRoot = null) {
    this.config = config;
    this.embeddings = embeddings;
    this.embeddingConfig = embeddingConfig;
    this.logger = logger;
    this.docsRoot = docsRoot;

    // 경로 설정
    const persistence = config.persistence || {};
    this.dataDir = path.resolve(persistence.dataDir || "./data/vector");
    this.indexDir = path.join(this.dataDir, "index");
    this.metadataPath = path.join(this.dataDir, "metadata.json");
    this.backupPath = path.join(this.dataDir, "metadata.json.bak");

    // 설정값
    this.autoCompact = persistence.autoCompact !== false;
    this.compactThreshold = persistence.compactThreshold || 0.3;
    this.batchSize = persistence.batchSize || 50;

    // 상태
    this.vectorStore = null;
    this.metadata = null;
    this.isInitialized = false;

    // 동시성 제어
    this.lock = new AsyncLock({ timeout: 30000 });

    // 락 키 정의
    this.LOCK_KEYS = {
      READ: "read",
      WRITE: "write",
      PERSIST: "persist",
      REBUILD: "rebuild",
    };

    // 텍스트 분할기
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: config.chunkSize || 1000,
      chunkOverlap: config.chunkOverlap || 200,
      separators: ["\n## ", "\n### ", "\n#### ", "\n\n", "\n", " ", ""],
    });
  }

  /**
   * 초기화 - 디렉토리 생성, 메타데이터/인덱스 로드
   * @returns {Promise<void>}
   */
  async initialize() {
    return this.lock.acquire(this.LOCK_KEYS.REBUILD, async () => {
      this.logger?.info("[VectorStorage] Initializing...");

      // 1. 디렉토리 생성
      await this._ensureDirectories();

      // 2. 메타데이터 로드 시도
      const metadataLoaded = await this._loadMetadata();

      if (!metadataLoaded) {
        // 신규 설치: 빈 메타데이터 생성
        this.logger?.info("[VectorStorage] No metadata found, creating new");
        this._initEmptyMetadata();
        this.isInitialized = true;
        return;
      }

      // 3. 임베딩 모델 변경 확인
      if (this._isEmbeddingModelChanged()) {
        this.logger?.warn(
          "[VectorStorage] Embedding model changed, rebuilding index"
        );
        await this._deleteIndex();
        this._initEmptyMetadata();
        this.isInitialized = true;
        return;
      }

      // 4. 인덱스 로드 시도
      const indexLoaded = await this._loadIndex();

      if (!indexLoaded) {
        this.logger?.warn("[VectorStorage] Failed to load index, rebuilding");
        this._initEmptyMetadata();
        this.isInitialized = true;
        return;
      }

      // 5. 인덱스-메타데이터 일관성 검증
      if (!this._validateConsistency()) {
        this.logger?.warn("[VectorStorage] Inconsistency detected, rebuilding");
        await this._deleteIndex();
        this._initEmptyMetadata();
        this.isInitialized = true;
        return;
      }

      this.isInitialized = true;
      this.logger?.info(
        `[VectorStorage] Initialized with ${this.metadata.stats.totalChunks} chunks`
      );
    });
  }

  /**
   * 디렉토리 존재 확인 및 생성
   * @private
   */
  async _ensureDirectories() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(this.indexDir, { recursive: true });
      this.logger?.debug(`[VectorStorage] Directories ensured: ${this.dataDir}`);
    } catch (error) {
      this.logger?.error("[VectorStorage] Failed to create directories:", error);
      throw new VectorStorageError(
        `Cannot create data directory: ${error.message}`,
        ErrorCodes.DIRECTORY_CREATE_FAILED,
        false
      );
    }
  }

  /**
   * 빈 메타데이터 초기화
   * @private
   */
  _initEmptyMetadata() {
    this.metadata = {
      version: 1,
      schemaVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      embedding: {
        type: this.embeddingConfig.type,
        model: this.embeddingConfig.model,
        deploymentName: this.embeddingConfig.deploymentName,
        endpoint: this.embeddingConfig.endpoint,
        dimension: this.embeddingConfig.dimension || null,
      },
      documents: {},
      stats: {
        totalDocuments: 0,
        totalChunks: 0,
        deletedDocuments: 0,
        deletedChunks: 0,
      },
    };
    this.vectorStore = null;
  }

  /**
   * 메타데이터 로드
   * @private
   * @returns {Promise<boolean>} 로드 성공 여부
   */
  async _loadMetadata() {
    try {
      const content = await fs.readFile(this.metadataPath, "utf-8");
      this.metadata = JSON.parse(content);
      this.logger?.debug("[VectorStorage] Metadata loaded");
      return true;
    } catch (error) {
      if (error.code === "ENOENT") {
        return false;
      }
      this.logger?.warn(
        "[VectorStorage] Failed to parse metadata, trying backup"
      );

      // 백업에서 복구 시도
      try {
        const backup = await fs.readFile(this.backupPath, "utf-8");
        this.metadata = JSON.parse(backup);
        this.logger?.info("[VectorStorage] Restored from backup");
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * 메타데이터 원자적 저장
   * @private
   * @returns {Promise<void>}
   */
  async _saveMetadata() {
    return this.lock.acquire(this.LOCK_KEYS.PERSIST, async () => {
      this.metadata.lastUpdatedAt = new Date().toISOString();
      const content = JSON.stringify(this.metadata, null, 2);
      const tempPath = this.metadataPath + ".tmp";

      try {
        // 1. 현재 파일 백업
        try {
          await fs.copyFile(this.metadataPath, this.backupPath);
        } catch {
          // 첫 저장 시 원본 없음 - 무시
        }

        // 2. 임시 파일에 쓰기
        await fs.writeFile(tempPath, content, "utf-8");

        // 3. 원자적 이동 (rename)
        await fs.rename(tempPath, this.metadataPath);

        this.logger?.debug("[VectorStorage] Metadata saved atomically");
      } catch (error) {
        // 임시 파일 정리
        try {
          await fs.unlink(tempPath);
        } catch {}
        throw new VectorStorageError(
          `Failed to save metadata: ${error.message}`,
          ErrorCodes.METADATA_SAVE_FAILED,
          true
        );
      }
    });
  }

  /**
   * HNSWLib 인덱스 로드
   * @private
   * @returns {Promise<boolean>} 로드 성공 여부
   */
  async _loadIndex() {
    try {
      const indexPath = path.join(this.indexDir, "hnswlib.index");
      await fs.access(indexPath);

      this.vectorStore = await HNSWLib.load(this.indexDir, this.embeddings);
      this.logger?.debug("[VectorStorage] Index loaded successfully");
      return true;
    } catch (error) {
      this.logger?.debug(`[VectorStorage] Index load failed: ${error.message}`);
      return false;
    }
  }

  /**
   * HNSWLib 인덱스 저장
   * @private
   * @returns {Promise<void>}
   */
  async _saveIndex() {
    if (!this.vectorStore) return;

    return this.lock.acquire(this.LOCK_KEYS.PERSIST, async () => {
      try {
        await this.vectorStore.save(this.indexDir);
        this.logger?.debug("[VectorStorage] Index saved");
      } catch (error) {
        this.logger?.error("[VectorStorage] Failed to save index:", error);
        throw new VectorStorageError(
          `Failed to save index: ${error.message}`,
          ErrorCodes.INDEX_SAVE_FAILED,
          true
        );
      }
    });
  }

  /**
   * 인덱스 삭제
   * @private
   */
  async _deleteIndex() {
    try {
      await fs.rm(this.indexDir, { recursive: true, force: true });
      await fs.mkdir(this.indexDir, { recursive: true });
      this.vectorStore = null;
      this.logger?.info("[VectorStorage] Index deleted");
    } catch (error) {
      this.logger?.error("[VectorStorage] Failed to delete index:", error);
    }
  }

  /**
   * 임베딩 모델 변경 여부 확인
   * @private
   * @returns {boolean}
   */
  _isEmbeddingModelChanged() {
    const stored = this.metadata?.embedding;
    const current = this.embeddingConfig;

    if (!stored) return true;

    return (
      stored.type !== current.type ||
      stored.model !== current.model ||
      stored.deploymentName !== current.deploymentName
    );
  }

  /**
   * 인덱스-메타데이터 일관성 검증
   * @private
   * @returns {boolean}
   */
  _validateConsistency() {
    if (!this.vectorStore || !this.metadata) return false;

    // HNSWLib docstore로 크기 확인
    const docstoreSize = this.vectorStore.docstore?._docs?.size || 0;
    const expectedSize = this.metadata.stats.totalChunks;

    // 인덱스가 비어있고 메타데이터도 비어있으면 일관성 있음
    if (docstoreSize === 0 && expectedSize === 0) {
      return true;
    }

    // 10% 오차 허용 (compaction 대기 상태일 수 있음)
    if (Math.abs(docstoreSize - expectedSize) > expectedSize * 0.1) {
      this.logger?.warn(
        `[VectorStorage] Inconsistency: docstore=${docstoreSize}, expected=${expectedSize}`
      );
      return false;
    }

    return true;
  }

  /**
   * 콘텐츠 해시 계산
   * @param {string} content - 문서 내용
   * @returns {string} SHA256 해시 (base64)
   */
  computeHash(content) {
    return crypto.createHash("sha256").update(content).digest("base64");
  }

  /**
   * 문서 변경 여부 확인
   * @param {string} docPath - 문서 경로 (상대)
   * @param {Object} stats - 파일 stats
   * @param {string} content - 파일 내용
   * @returns {boolean}
   */
  isDocumentChanged(docPath, stats, content) {
    const stored = this.metadata?.documents?.[docPath];
    if (!stored) return true; // 새 문서

    // 빠른 체크: 크기와 수정 시간
    if (stored.size !== stats.size) return true;
    if (stored.mtime !== stats.mtimeMs) return true;

    // 정밀 체크: 해시 비교
    const currentHash = this.computeHash(content);
    return stored.hash !== currentHash;
  }

  /**
   * 문서가 메타데이터에 있는지 확인
   * @param {string} docPath - 문서 경로 (상대)
   * @returns {boolean}
   */
  hasDocument(docPath) {
    return !!this.metadata?.documents?.[docPath];
  }

  /**
   * 문서 추가/업데이트
   * @param {string} docPath - 문서 경로 (상대)
   * @param {string} content - 문서 내용
   * @param {Object} fileStats - 파일 stats
   * @param {Object} additionalMeta - 추가 메타데이터
   * @returns {Promise<number>} 생성된 청크 수
   */
  async addDocument(docPath, content, fileStats, additionalMeta = {}) {
    return this.lock.acquire(this.LOCK_KEYS.WRITE, async () => {
      const existing = this.metadata.documents[docPath];
      const version = existing ? existing.version + 1 : 1;

      this.logger?.info(
        `[VectorStorage] Adding document: ${docPath} (v${version})`
      );

      // 청킹
      const chunks = await this.splitter.createDocuments(
        [content],
        [
          {
            source: docPath,
            version,
            ...additionalMeta,
          },
        ]
      );

      if (chunks.length === 0) {
        this.logger?.warn(`[VectorStorage] No chunks created for: ${docPath}`);
        return 0;
      }

      // 벡터 스토어에 추가
      if (!this.vectorStore) {
        this.vectorStore = await HNSWLib.fromDocuments(chunks, this.embeddings);
      } else {
        await this.vectorStore.addDocuments(chunks);
      }

      // 기존 문서 청크 수 기록 (삭제된 것으로 처리)
      if (existing) {
        this.metadata.stats.deletedChunks += existing.chunkCount;
      }

      // 메타데이터 업데이트
      this.metadata.documents[docPath] = {
        hash: this.computeHash(content),
        size: fileStats.size,
        mtime: fileStats.mtimeMs,
        chunkCount: chunks.length,
        version,
        indexedAt: new Date().toISOString(),
      };

      // 통계 업데이트
      if (!existing) {
        this.metadata.stats.totalDocuments++;
      }
      this.metadata.stats.totalChunks += chunks.length;

      // 저장
      await this._saveMetadata();
      await this._saveIndex();

      return chunks.length;
    });
  }

  /**
   * 배치 문서 추가 (API 호출 최소화)
   * @param {Array<{path: string, content: string, stats: Object}>} documents
   * @returns {Promise<number>} 총 생성된 청크 수
   */
  async addDocumentsBatch(documents) {
    return this.lock.acquire(this.LOCK_KEYS.WRITE, async () => {
      this.logger?.info(
        `[VectorStorage] Batch adding ${documents.length} documents`
      );

      let totalChunks = 0;
      const allChunks = [];

      // 모든 문서 청킹
      for (const doc of documents) {
        const existing = this.metadata.documents[doc.path];
        const version = existing ? existing.version + 1 : 1;

        const chunks = await this.splitter.createDocuments(
          [doc.content],
          [{ source: doc.path, version }]
        );

        if (chunks.length > 0) {
          allChunks.push(...chunks);

          // 메타데이터 업데이트
          if (existing) {
            this.metadata.stats.deletedChunks += existing.chunkCount;
          } else {
            this.metadata.stats.totalDocuments++;
          }

          this.metadata.documents[doc.path] = {
            hash: this.computeHash(doc.content),
            size: doc.stats.size,
            mtime: doc.stats.mtimeMs,
            chunkCount: chunks.length,
            version,
            indexedAt: new Date().toISOString(),
          };

          this.metadata.stats.totalChunks += chunks.length;
          totalChunks += chunks.length;
        }
      }

      // 배치 단위로 임베딩 및 저장
      if (allChunks.length > 0) {
        for (let i = 0; i < allChunks.length; i += this.batchSize) {
          const batch = allChunks.slice(i, i + this.batchSize);

          if (!this.vectorStore) {
            this.vectorStore = await HNSWLib.fromDocuments(
              batch,
              this.embeddings
            );
          } else {
            await this.vectorStore.addDocuments(batch);
          }

          this.logger?.debug(
            `[VectorStorage] Processed batch ${i + 1}-${Math.min(
              i + this.batchSize,
              allChunks.length
            )}`
          );
        }
      }

      // 한 번에 저장
      await this._saveMetadata();
      if (this.vectorStore) {
        await this._saveIndex();
      }

      return totalChunks;
    });
  }

  /**
   * 문서 소프트 삭제 (메타데이터만 제거)
   * @param {string} docPath - 문서 경로
   */
  async markDocumentDeleted(docPath) {
    const doc = this.metadata.documents[docPath];
    if (!doc) return;

    this.metadata.stats.deletedDocuments++;
    this.metadata.stats.deletedChunks += doc.chunkCount;
    this.metadata.stats.totalDocuments--;

    delete this.metadata.documents[docPath];

    await this._saveMetadata();

    this.logger?.info(`[VectorStorage] Document marked deleted: ${docPath}`);
  }

  /**
   * Compaction 필요 여부 확인
   * @returns {boolean}
   */
  needsCompaction() {
    if (!this.autoCompact) return false;
    if (this.metadata.stats.totalChunks === 0) return false;

    const ratio =
      this.metadata.stats.deletedChunks /
      (this.metadata.stats.totalChunks + this.metadata.stats.deletedChunks);

    return ratio > this.compactThreshold;
  }

  /**
   * Compaction 수행 (전체 재구축)
   * @param {Function} getContent - 문서 내용 가져오기 함수 (path) => Promise<{content, stats}>
   * @returns {Promise<void>}
   */
  async compact(getContent) {
    return this.lock.acquire(this.LOCK_KEYS.REBUILD, async () => {
      this.logger?.info("[VectorStorage] Starting compaction...");

      // 현재 유효한 문서 목록
      const validDocs = Object.keys(this.metadata.documents);

      // 인덱스 삭제
      await this._deleteIndex();

      // 통계 초기화
      const oldStats = { ...this.metadata.stats };
      this.metadata.stats.totalChunks = 0;
      this.metadata.stats.deletedChunks = 0;
      this.metadata.stats.deletedDocuments = 0;

      // 배치로 재인덱싱
      const documents = [];
      for (const docPath of validDocs) {
        try {
          const { content, stats } = await getContent(docPath);
          documents.push({ path: docPath, content, stats });
        } catch (error) {
          this.logger?.warn(
            `[VectorStorage] Skipping ${docPath}: ${error.message}`
          );
          delete this.metadata.documents[docPath];
          this.metadata.stats.totalDocuments--;
        }
      }

      // 문서 버전 리셋 후 재인덱싱
      for (const doc of documents) {
        // 버전 리셋을 위해 임시로 삭제
        delete this.metadata.documents[doc.path];
        this.metadata.stats.totalDocuments--;
      }

      if (documents.length > 0) {
        // addDocumentsBatch에서 버전을 1부터 시작하도록
        await this.addDocumentsBatch(documents);
      }

      this.logger?.info(
        `[VectorStorage] Compaction complete: ${documents.length} documents (freed ${oldStats.deletedChunks} chunks)`
      );
    });
  }

  /**
   * FilteredRetriever 반환
   * @param {number} k - 반환할 문서 수
   * @param {number} minSimilarityScore - 최소 유사도 점수 (0-1)
   * @returns {FilteredRetriever}
   */
  getRetriever(k = 4, minSimilarityScore = 0) {
    const FilteredRetriever = require("./filtered-retriever");
    return new FilteredRetriever(
      this.vectorStore,
      this.metadata,
      k,
      this.logger,
      this.docsRoot,
      minSimilarityScore
    );
  }

  /**
   * 통계 반환
   * @returns {Object}
   */
  getStats() {
    return {
      totalDocuments: this.metadata?.stats?.totalDocuments || 0,
      totalChunks: this.metadata?.stats?.totalChunks || 0,
      deletedDocuments: this.metadata?.stats?.deletedDocuments || 0,
      deletedChunks: this.metadata?.stats?.deletedChunks || 0,
      needsCompaction: this.needsCompaction(),
      indexDir: this.indexDir,
      isInitialized: this.isInitialized,
    };
  }

  /**
   * 모든 등록된 문서 경로 반환
   * @returns {string[]}
   */
  getDocumentPaths() {
    return Object.keys(this.metadata?.documents || {});
  }

  /**
   * 서비스 종료
   */
  async shutdown() {
    this.logger?.info("[VectorStorage] Shutting down...");

    // 메타데이터 저장
    if (this.metadata) {
      await this._saveMetadata();
    }

    // 인덱스 저장
    if (this.vectorStore) {
      await this._saveIndex();
    }

    this.isInitialized = false;
    this.logger?.info("[VectorStorage] Shutdown complete");
  }
}

module.exports = { VectorStorage, VectorStorageError, ErrorCodes };
