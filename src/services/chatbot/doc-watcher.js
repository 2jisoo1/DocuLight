/**
 * DocWatcher - Markdown 문서 파일 변경 감시
 * @module services/chatbot/doc-watcher
 *
 * EventEmitter 기반 파일 변경 감지
 * Events:
 * - 'add': 파일 추가 시 (filePath)
 * - 'change': 파일 변경 시 (filePath)
 * - 'remove': 파일 삭제 시 (filePath)
 * - 'error': 에러 발생 시 (error)
 * - 'ready': 초기 스캔 완료 시
 */

const { EventEmitter } = require('events');
const path = require('path');

// chokidar는 optionalDependency
let chokidar;
try {
  chokidar = require('chokidar');
} catch (e) {
  chokidar = null;
}

/**
 * Markdown 문서 파일 변경 감시
 * @extends EventEmitter
 */
class DocWatcher extends EventEmitter {
  /**
   * @param {string} docsRoot - 문서 루트 디렉토리
   * @param {Object} options - 옵션
   * @param {number} options.debounceMs - 디바운스 시간 (기본: 1000ms)
   * @param {string[]} options.excludePatterns - 제외 패턴
   * @param {Object} options.logger - 로거 인스턴스
   */
  constructor(docsRoot, options = {}) {
    super();
    this.docsRoot = docsRoot;
    this.debounceMs = options.debounceMs || 1000;
    this.excludePatterns = options.excludePatterns || [];
    this.logger = options.logger;
    this.pendingChanges = new Map();
    this.watcher = null;
    this.isRunning = false;
  }

  /**
   * chokidar 사용 가능 여부 확인
   * @returns {boolean}
   */
  static isAvailable() {
    return chokidar !== null;
  }

  /**
   * 파일 감시 시작
   * @returns {boolean} 시작 성공 여부
   */
  start() {
    if (!chokidar) {
      this.logger?.warn('DocWatcher: chokidar not available. File watching disabled.');
      return false;
    }

    if (this.isRunning) {
      this.logger?.warn('DocWatcher already running');
      return true;
    }

    // Windows 경로 호환성을 위해 forward slash 사용
    const pattern = path.join(this.docsRoot, '**/*.md').replace(/\\/g, '/');

    // 제외 패턴 변환
    const ignored = this.excludePatterns.map(p => {
      if (p.startsWith('**/')) return p;
      return `**/${p}`;
    });

    this.watcher = chokidar.watch(pattern, {
      persistent: true,
      ignoreInitial: true,  // 시작 시 기존 파일 이벤트 무시 (loadExistingDocuments에서 처리)
      ignored: ignored,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
      // Windows 호환성
      usePolling: process.platform === 'win32',
      interval: 300,
    });

    this.watcher
      .on('add', (filePath) => this._debouncedEmit('add', filePath))
      .on('change', (filePath) => this._debouncedEmit('change', filePath))
      .on('unlink', (filePath) => {
        // 삭제는 즉시 처리 (디바운스 불필요)
        this._clearPending(filePath);
        this.emit('remove', filePath);
        this.logger?.debug(`File removed: ${filePath}`);
      })
      .on('ready', () => {
        this.isRunning = true;
        this.emit('ready');
        this.logger?.info(`DocWatcher ready: watching ${pattern}`);
      })
      .on('error', (error) => {
        this.logger?.error('DocWatcher error:', error);
        this.emit('error', error);
      });

    this.logger?.info(`DocWatcher started: ${pattern}`);
    return true;
  }

  /**
   * 디바운스된 이벤트 발생
   * @private
   */
  _debouncedEmit(event, filePath) {
    this._clearPending(filePath);

    const timeout = setTimeout(() => {
      this.pendingChanges.delete(filePath);
      this.emit(event, filePath);
      this.logger?.debug(`File ${event}: ${filePath}`);
    }, this.debounceMs);

    this.pendingChanges.set(filePath, timeout);
  }

  /**
   * 대기 중인 이벤트 취소
   * @private
   */
  _clearPending(filePath) {
    if (this.pendingChanges.has(filePath)) {
      clearTimeout(this.pendingChanges.get(filePath));
      this.pendingChanges.delete(filePath);
    }
  }

  /**
   * 파일 감시 중지
   */
  async close() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    // 대기 중인 모든 타임아웃 취소
    for (const timeout of this.pendingChanges.values()) {
      clearTimeout(timeout);
    }
    this.pendingChanges.clear();
    this.isRunning = false;

    this.logger?.info('DocWatcher closed');
  }

  /**
   * 실행 상태 확인
   * @returns {boolean}
   */
  isActive() {
    return this.isRunning;
  }
}

module.exports = { DocWatcher };
