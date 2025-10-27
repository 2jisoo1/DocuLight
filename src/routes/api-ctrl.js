const fs = require('fs').promises;
const path = require('path');
const ignore = require('ignore');
const AdmZip = require('adm-zip');
const { validatePath, isWithinRoot } = require('../utils/path-validator');
const lockManager = require('../utils/lock-manager');

/**
 * 공통 API 로직 - MCP와 REST API 모두 사용
 */

/**
 * 디렉토리 트리 조회
 */
async function getTreeData(config, logger, userPath = '/') {
  const absolutePath = validatePath(config.docsRoot, userPath);

  // Check if path exists and is a directory
  const stats = await fs.stat(absolutePath);
  if (!stats.isDirectory()) {
    const error = new Error('NOT_FOUND: Path is not a directory');
    error.code = 'NOT_FOUND';
    throw error;
  }

  // Create ignore filter
  const ig = ignore().add(config.excludes);

  // Read directory contents
  const entries = await fs.readdir(absolutePath, { withFileTypes: true });

  const dirs = [];
  const files = [];

  for (const entry of entries) {
    // Skip hidden files
    if (entry.name.startsWith('.')) {
      continue;
    }

    // Get relative path for exclude check
    const relativePath = path.relative(
      config.docsRoot,
      path.join(absolutePath, entry.name)
    );

    // Check if excluded
    if (ig.ignores(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      dirs.push({ name: entry.name });
    } else if (entry.isFile()) {
      const filePath = path.join(absolutePath, entry.name);
      const fileStats = await fs.stat(filePath);
      files.push({
        name: entry.name,
        size: fileStats.size
      });
    }
  }

  // Sort alphabetically
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  logger.info('Tree retrieved', {
    path: userPath,
    dirs: dirs.length,
    files: files.length
  });

  return {
    path: userPath,
    dirs,
    files,
    excludesApplied: true
  };
}

/**
 * 파일 내용 읽기
 */
async function getRawContent(config, logger, userPath) {
  if (!userPath) {
    const error = new Error('PATH_TRAVERSAL: Path parameter is required');
    error.code = 'PATH_TRAVERSAL';
    throw error;
  }

  // Validate path
  const absolutePath = validatePath(config.docsRoot, userPath);

  // Check if file exists
  const stats = await fs.stat(absolutePath);
  if (!stats.isFile()) {
    const error = new Error('NOT_FOUND: Path is not a file');
    error.code = 'NOT_FOUND';
    throw error;
  }

  // Check if file is markdown
  const ext = path.extname(absolutePath).toLowerCase();
  if (ext !== '.md') {
    const error = new Error('UNSUPPORTED_TYPE: Only .md files are supported');
    error.code = 'UNSUPPORTED_TYPE';
    throw error;
  }

  // Read file content
  const content = await fs.readFile(absolutePath, 'utf-8');

  logger.info('Raw file accessed', {
    path: userPath,
    size: content.length
  });

  return content;
}

/**
 * ZIP 파일 추출
 */
async function extractZipFile(zipBuffer, targetDir, config, logger) {
  const results = {
    extracted: [],
    skipped: [],
    errors: []
  };

  const zip = new AdmZip(zipBuffer);
  const zipEntries = zip.getEntries();

  logger.info('ZIP extraction started', {
    targetDir,
    totalEntries: zipEntries.length
  });

  for (const entry of zipEntries) {
    const entryName = entry.entryName;

    // Skip directory entries
    if (entry.isDirectory) {
      continue;
    }

    // Security check: prevent path traversal
    if (entryName.includes('..') || path.isAbsolute(entryName)) {
      logger.warn('ZIP entry blocked: path traversal attempt', {
        entryName,
        reason: 'Contains .. or absolute path'
      });
      results.skipped.push({
        name: entryName,
        reason: 'Path traversal attempt'
      });
      continue;
    }

    // Construct target path
    const extractPath = path.join(targetDir, entryName);

    // Double-check that resolved path is within target directory
    if (!isWithinRoot(targetDir, extractPath)) {
      logger.warn('ZIP entry blocked: outside target directory', {
        entryName,
        extractPath
      });
      results.skipped.push({
        name: entryName,
        reason: 'Outside target directory'
      });
      continue;
    }

    try {
      // Ensure parent directory exists
      const parentDir = path.dirname(extractPath);
      await fs.mkdir(parentDir, { recursive: true });

      // Extract file
      const fileContent = entry.getData();
      await fs.writeFile(extractPath, fileContent);

      results.extracted.push({
        name: entryName,
        size: entry.header.size
      });

      logger.debug('ZIP entry extracted', {
        entryName,
        extractPath,
        size: entry.header.size
      });
    } catch (error) {
      logger.error('ZIP entry extraction failed', {
        entryName,
        error: error.message
      });
      results.errors.push({
        name: entryName,
        error: error.message
      });
    }
  }

  logger.info('ZIP extraction completed', {
    targetDir,
    extracted: results.extracted.length,
    skipped: results.skipped.length,
    errors: results.errors.length
  });

  return results;
}

/**
 * 파일 업로드
 */
async function uploadFileData(config, logger, userPath, fileBuffer, filename) {
  // Validate path
  const targetDir = validatePath(config.docsRoot, userPath || '/');

  // Ensure target directory exists
  await fs.mkdir(targetDir, { recursive: true });

  // Determine file path
  const filePath = path.join(targetDir, filename);

  // Acquire lock for this directory
  return await lockManager.acquire(targetDir, async () => {
    // Handle ZIP files
    if (path.extname(filename).toLowerCase() === '.zip') {
      const extractResults = await extractZipFile(
        fileBuffer,
        targetDir,
        config,
        logger
      );

      return {
        success: true,
        type: 'zip',
        filename,
        size: fileBuffer.length,
        path: userPath,
        extraction: {
          extracted: extractResults.extracted.length,
          skipped: extractResults.skipped.length,
          errors: extractResults.errors.length,
          details: extractResults
        }
      };
    } else {
      // Save regular file (overwrite if exists)
      await fs.writeFile(filePath, fileBuffer);
      logger.info('File uploaded', {
        path: userPath,
        filename,
        size: fileBuffer.length
      });

      return {
        success: true,
        type: 'file',
        filename,
        size: fileBuffer.length,
        path: userPath
      };
    }
  });
}

/**
 * 파일/디렉토리 삭제
 */
async function deleteEntryData(config, logger, userPath) {
  if (!userPath) {
    const error = new Error('PATH_TRAVERSAL: Path parameter is required');
    error.code = 'PATH_TRAVERSAL';
    throw error;
  }

  // Validate path
  const absolutePath = validatePath(config.docsRoot, userPath);

  // Check if path exists
  try {
    await fs.access(absolutePath);
  } catch {
    const error = new Error('NOT_FOUND: Path does not exist');
    error.code = 'NOT_FOUND';
    throw error;
  }

  // Acquire lock and delete
  await lockManager.acquire(absolutePath, async () => {
    const maxRetries = 2;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Recursive delete with force option
        await fs.rm(absolutePath, { recursive: true, force: true });

        logger.info('Entry deleted', {
          path: userPath,
          attempt: attempt + 1
        });

        return;
      } catch (error) {
        lastError = error;

        // If file is busy, retry
        if (error.code === 'EBUSY' && attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        throw error;
      }
    }

    // If we get here, all retries failed
    if (lastError) {
      const error = new Error('FILE_BUSY: File is in use and cannot be deleted');
      error.code = 'FILE_BUSY';
      throw error;
    }
  });

  return {
    success: true,
    path: userPath,
    message: 'Entry deleted successfully'
  };
}

module.exports = {
  getTreeData,
  getRawContent,
  uploadFileData,
  deleteEntryData,
  getFullTreeData,
  getConfig,
  searchDocuments
};

/**
 * 전체 재귀 트리 조회 (데이터 전용)
 * @param {Object} config 애플리케이션 설정
 * @param {Object} logger 로거
 * @param {string} startPath 시작 경로 (기본 '/')
 * @param {Object} options 옵션 { maxDepth?: number }
 * @returns {Promise<Object>} 재귀 트리 + 통계
 */
async function getFullTreeData(config, logger, startPath = '/', options = {}) {
  const { maxDepth } = options;

  // 시작 경로 검증 및 절대 경로 변환
  const absoluteStart = validatePath(config.docsRoot, startPath);
  const stats = await fs.stat(absoluteStart);
  if (!stats.isDirectory()) {
    const error = new Error('NOT_FOUND: Start path is not a directory');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const ig = ignore().add(config.excludes);

  // 내부 재귀 함수
  async function buildRecursive(rootPath, currentAbsolute, currentRelative, depth) {
    // 깊이 제한 체크
    if (typeof maxDepth === 'number' && depth > maxDepth) {
      return { dirs: [], files: [] };
    }

    const entries = await fs.readdir(currentAbsolute, { withFileTypes: true });
    const dirs = [];
    const files = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // 숨김 파일 제외

      const entryAbsolute = path.join(currentAbsolute, entry.name);
      const relativePath = path.relative(config.docsRoot, entryAbsolute);

      if (ig.ignores(relativePath)) continue; // 제외 규칙 적용

      if (entry.isDirectory()) {
        const subTree = await buildRecursive(rootPath, entryAbsolute, '/' + relativePath.replace(/\\/g, '/'), depth + 1);
        dirs.push({
          name: entry.name,
          path: '/' + relativePath.replace(/\\/g, '/'),
          type: 'directory',
          ...subTree
        });
      } else if (entry.isFile()) {
        const fileStats = await fs.stat(entryAbsolute);
        files.push({
          name: entry.name,
          path: '/' + relativePath.replace(/\\/g, '/'),
          type: 'file',
          size: fileStats.size
        });
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return { dirs, files };
  }

  // 통계 계산 헬퍼
  function countFiles(tree) {
    let count = tree.files.length;
    for (const d of tree.dirs) count += countFiles(d);
    return count;
  }
  function countDirs(tree) {
    let count = tree.dirs.length;
    for (const d of tree.dirs) count += countDirs(d);
    return count;
  }

  const rootTree = await buildRecursive(config.docsRoot, absoluteStart, startPath, 0);
  const totalFiles = countFiles(rootTree);
  const totalDirs = countDirs(rootTree);

  logger.info('Full tree data retrieved', {
    startPath,
    totalFiles,
    totalDirs,
    maxDepth: typeof maxDepth === 'number' ? maxDepth : 'unlimited'
  });

  return {
    root: rootTree,
    docsRoot: config.docsRoot,
    startPath,
    excludesApplied: true,
    options: { maxDepth },
    stats: { totalFiles, totalDirs }
  };
}

/**
 * 현재 런타임 설정 조회 및 민감값 마스킹
 * @param {Object} config 애플리케이션 설정
 * @param {Object} logger 로거
 * @param {string} section 섹션 필터 (ui, security, ssl, all) - 기본값: all
 * @returns {Promise<Object>} 마스킹된 설정 객체
 */
async function getConfig(config, logger, section = 'all') {
  try {
    // section 검증
    const validSections = ['ui', 'security', 'ssl', 'all'];
    if (section && !validSections.includes(section)) {
      const error = new Error(`INVALID_SECTION: Section must be one of ${validSections.join(', ')}`);
      error.code = 'INVALID_SECTION';
      throw error;
    }

    // 깊은 복사로 원본 config 보호
    let result = JSON.parse(JSON.stringify(config));

    // 민감값 마스킹 함수
    function maskSensitiveValues(obj, path = '') {
      if (typeof obj !== 'object' || obj === null) return;

      const sensitivePatterns = [
        'apiKey', 'password', 'passwd', 'key', 'secret', 'token',
        'credentials', 'auth', 'privateKey', 'privateKeyPath', 'pass'
      ];

      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();

        // 민감한 필드 확인
        if (sensitivePatterns.some(pattern => lowerKey.includes(pattern.toLowerCase()))) {
          if (typeof value === 'string' && value.length > 0) {
            obj[key] = '***';
          } else if (typeof value === 'object' && value !== null) {
            obj[key] = { ...value };
            for (const subKey in obj[key]) {
              obj[key][subKey] = '***';
            }
          }
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // 재귀적으로 처리
          maskSensitiveValues(value, `${path}.${key}`);
        }
      }
    }

    // 전체 config에 마스킹 적용
    maskSensitiveValues(result);

    // section 필터링
    if (section !== 'all') {
      if (result[section] !== undefined) {
        result = { [section]: result[section] };
      } else {
        result = {};
      }
    }

    logger.info('Config retrieved', {
      section,
      keys: Object.keys(result).length
    });

    return result;
  } catch (error) {
    logger.error('Config retrieval failed', {
      section,
      error: error.message
    });
    throw error;
  }
}

/**
 * 문서 검색 (실시간 파일 스캔)
 * @param {Object} config 애플리케이션 설정
 * @param {Object} logger 로거
 * @param {string} query 검색 쿼리
 * @param {Object} options 옵션 { limit?: number, path?: string }
 * @returns {Promise<Object>} 검색 결과
 */
async function searchDocuments(config, logger, query, options = {}) {
  try {
    const startTime = Date.now();
    const { limit = 10, path: searchPath = '/' } = options;

    // 입력 검증
    if (!query || typeof query !== 'string') {
      const error = new Error('INVALID_QUERY: Query must be a non-empty string');
      error.code = 'INVALID_QUERY';
      throw error;
    }

    if (query.length < 2) {
      const error = new Error('QUERY_TOO_SHORT: Query must be at least 2 characters');
      error.code = 'QUERY_TOO_SHORT';
      throw error;
    }

    // limit 검증 및 제한
    let finalLimit = Math.min(Math.max(parseInt(limit) || 10, 1), 100);

    // 경로 검증
    let absoluteSearchPath;
    try {
      absoluteSearchPath = validatePath(config.docsRoot, searchPath);
    } catch (error) {
      const pathError = new Error(`PATH_ERROR: ${error.message}`);
      pathError.code = 'PATH_TRAVERSAL';
      throw pathError;
    }

    // 검색 경로가 디렉토리인지 확인
    let stats;
    try {
      stats = await fs.stat(absoluteSearchPath);
    } catch (error) {
      const notFoundError = new Error(`PATH_NOT_FOUND: ${searchPath}`);
      notFoundError.code = 'NOT_FOUND';
      throw notFoundError;
    }

    if (!stats.isDirectory()) {
      const error = new Error('PATH_NOT_DIR: Search path must be a directory');
      error.code = 'INVALID_PATH';
      throw error;
    }

    // ignore 필터 생성
    const ig = ignore().add(config.excludes);

    // 검색 결과 저장소
    const results = [];
    let filesScanned = 0;
    const maxFileSize = 1024 * 1024; // 1MB

    // 쿼리를 소문자로 변환 (대소문자 무시 검색)
    const lowerQuery = query.toLowerCase();

    // 재귀적 파일 검색
    async function searchRecursive(currentPath) {
      // 검색 시간 제한 (5초)
      if (Date.now() - startTime > 5000) {
        const error = new Error('SEARCH_TIMEOUT: Search operation took too long');
        error.code = 'TIMEOUT';
        throw error;
      }

      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          // 숨김 파일 제외
          if (entry.name.startsWith('.')) continue;

          const entryPath = path.join(currentPath, entry.name);
          const relativePath = path.relative(config.docsRoot, entryPath);

          // 제외 규칙 적용
          if (ig.ignores(relativePath)) continue;

          if (entry.isDirectory()) {
            // 재귀
            await searchRecursive(entryPath);
          } else if (entry.isFile()) {
            filesScanned++;

            // 파일 크기 확인
            const fileStats = await fs.stat(entryPath);
            if (fileStats.size > maxFileSize) {
              continue; // 1MB 이상 파일은 스킵
            }

            // 파일 읽기
            try {
              const content = await fs.readFile(entryPath, 'utf-8');
              const lines = content.split('\n');
              const fileMatches = [];

              // 각 라인 검색
              for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum];
                if (line.toLowerCase().includes(lowerQuery)) {
                  // 컨텍스트 추출 (±2줄)
                  const contextStart = Math.max(0, lineNum - 2);
                  const contextEnd = Math.min(lines.length - 1, lineNum + 2);
                  const context = lines.slice(contextStart, contextEnd + 1).join('\n');

                  fileMatches.push({
                    line: lineNum + 1,
                    content: line.trim(),
                    context: context
                  });

                  // 파일당 최대 50개 매치 제한
                  if (fileMatches.length >= 50) break;
                }
              }

              // 매치가 있으면 결과에 추가
              if (fileMatches.length > 0) {
                results.push({
                  path: '/' + relativePath.replace(/\\/g, '/'),
                  matches: fileMatches
                });
              }

              // 전체 결과가 limit에 도달하면 종료
              if (results.length >= finalLimit) break;
            } catch (readError) {
              // 파일 읽기 오류는 로그하고 계속
              logger.warn('Failed to read file during search', {
                path: entryPath,
                error: readError.message
              });
            }
          }
        }
      } catch (dirError) {
        // 디렉토리 읽기 오류는 로그하고 계속
        logger.warn('Failed to read directory during search', {
          path: currentPath,
          error: dirError.message
        });
      }
    }

    // 검색 실행
    await searchRecursive(absoluteSearchPath);

    // 결과 제한
    const limitedResults = results.slice(0, finalLimit);

    const duration = Date.now() - startTime;
    logger.info('Document search completed', {
      query,
      path: searchPath,
      results: limitedResults.length,
      filesScanned,
      duration: `${duration}ms`
    });

    return {
      query,
      path: searchPath,
      total: limitedResults.length,
      filesScanned,
      duration: `${duration}ms`,
      results: limitedResults
    };
  } catch (error) {
    logger.error('Document search failed', {
      query,
      error: error.message,
      code: error.code
    });
    throw error;
  }
}
