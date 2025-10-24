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
  getFullTreeData
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
