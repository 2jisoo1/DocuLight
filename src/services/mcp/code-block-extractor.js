/**
 * CodeBlockExtractorService - 문서에서 코드 블록 추출
 * Context7의 코드 스니펫 우선 추출 기능에 해당
 * @module services/mcp/code-block-extractor
 */

const fs = require('fs').promises;
const path = require('path');
const ignore = require('ignore');
const { validatePath } = require('../../utils/path-validator');
const { estimateTokens, truncateToTokenLimit } = require('../chatbot/token-estimator');

class CodeBlockExtractorService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * 코드 블록 추출
   * @param {string} query - 검색 쿼리
   * @param {Object} options
   * @param {string} options.path - 검색 경로
   * @param {string|null} options.language - 언어 필터
   * @param {number} options.maxTokens - 토큰 예산
   * @param {number} options.limit - 최대 결과 수
   */
  async extract(query, options = {}) {
    const {
      path: searchPath = '/',
      language = null,
      maxTokens = 3000,
      limit = 10
    } = options;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      const error = new Error('INVALID_QUERY: Query must be a non-empty string');
      error.code = 'INVALID_QUERY';
      throw error;
    }

    const absolutePath = validatePath(this.config.docsRoot, searchPath);
    const stats = await fs.stat(absolutePath);

    let allBlocks = [];

    if (stats.isFile()) {
      allBlocks = await this._extractFromFile(absolutePath, searchPath);
    } else {
      allBlocks = await this._extractFromDirectory(absolutePath, searchPath);
    }

    // 언어 필터
    if (language) {
      const langLower = language.toLowerCase();
      allBlocks = allBlocks.filter(b => b.language && b.language.toLowerCase() === langLower);
    }

    // 쿼리 매칭 & 점수 계산
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 1);
    const scored = allBlocks.map(block => ({
      ...block,
      score: this._scoreBlock(block, queryTerms)
    })).filter(b => b.score > 0.25);

    // score 내림차순 정렬
    scored.sort((a, b) => b.score - a.score);

    // 토큰 예산 내에서 결과 선택
    const results = [];
    let remainingTokens = maxTokens;

    for (const block of scored) {
      if (results.length >= limit) break;
      if (remainingTokens <= 0) break;

      const blockTokens = estimateTokens(block.code + (block.context || ''));
      if (blockTokens <= remainingTokens) {
        results.push(block);
        remainingTokens -= blockTokens;
      } else if (remainingTokens > 50) {
        // 잘린 버전 추가
        const truncatedCode = truncateToTokenLimit(block.code, remainingTokens - 20);
        results.push({ ...block, code: truncatedCode, truncated: true });
        remainingTokens = 0;
      }
    }

    this.logger?.info('Code block extraction completed', {
      query,
      path: searchPath,
      language,
      totalBlocks: allBlocks.length,
      matchedBlocks: scored.length,
      returnedBlocks: results.length,
      tokensUsed: maxTokens - remainingTokens
    });

    return {
      query,
      path: searchPath,
      language,
      blocks: results,
      totalFound: scored.length,
      tokensUsed: maxTokens - remainingTokens,
      tokenBudget: maxTokens
    };
  }

  /**
   * 단일 파일에서 코드 블록 추출
   */
  async _extractFromFile(filePath, relativePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this._parseCodeBlocks(content, relativePath);
    } catch (e) {
      return [];
    }
  }

  /**
   * 디렉토리에서 재귀적으로 코드 블록 추출
   */
  async _extractFromDirectory(dirPath, relativePath) {
    const ig = ignore().add(this.config.excludes || []);
    const allBlocks = [];
    const maxFileSize = 1024 * 1024; // 1MB

    const scanDir = async (currentPath, currentRelative) => {
      let entries;
      try {
        entries = await fs.readdir(currentPath, { withFileTypes: true });
      } catch (e) {
        return;
      }

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;

        const fullPath = path.join(currentPath, entry.name);
        const relPath = currentRelative ? `${currentRelative}/${entry.name}` : entry.name;

        if (ig.ignores(relPath)) continue;

        if (entry.isDirectory()) {
          await scanDir(fullPath, relPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          try {
            const stat = await fs.stat(fullPath);
            if (stat.size > maxFileSize) continue;

            const content = await fs.readFile(fullPath, 'utf-8');
            const blocks = this._parseCodeBlocks(content, relPath);
            allBlocks.push(...blocks);
          } catch (e) {
            // skip
          }
        }
      }
    };

    await scanDir(dirPath, relativePath === '/' ? '' : relativePath);
    return allBlocks;
  }

  /**
   * 마크다운에서 fenced code block 파싱
   */
  _parseCodeBlocks(content, filePath) {
    const blocks = [];
    const lines = content.split('\n');
    let i = 0;

    // 헤딩 추적
    let currentHeading = null;

    while (i < lines.length) {
      const line = lines[i];

      // 헤딩 업데이트
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        currentHeading = headingMatch[2].trim();
        i++;
        continue;
      }

      // fenced code block 시작
      const fenceMatch = line.match(/^```(\w*)/);
      if (fenceMatch) {
        const language = fenceMatch[1] || null;
        const codeLines = [];
        i++;

        // 코드 블록 끝 찾기
        while (i < lines.length && !lines[i].match(/^```\s*$/)) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // ``` 닫는 줄 건너뛰기

        const code = codeLines.join('\n');
        if (code.trim().length === 0) continue;

        // 코드 블록 직전의 설명 텍스트 수집
        let context = '';
        if (currentHeading) {
          context = currentHeading;
        }

        blocks.push({
          filePath,
          language,
          code,
          context,
          lineNumber: i - codeLines.length - 1
        });

        continue;
      }

      i++;
    }

    return blocks;
  }

  /**
   * 코드 블록 관련성 점수 계산
   */
  _scoreBlock(block, queryTerms) {
    let score = 0;
    const codeLower = block.code.toLowerCase();
    const contextLower = (block.context || '').toLowerCase();

    for (const term of queryTerms) {
      // 코드 내 키워드 존재
      if (codeLower.includes(term)) score += 0.3;
      // context(헤딩) 내 키워드 존재
      if (contextLower.includes(term)) score += 0.4;
    }

    // 코드 길이 보너스 (적당한 길이 선호: 5~50줄)
    const lineCount = block.code.split('\n').length;
    if (lineCount >= 5 && lineCount <= 50) {
      score += 0.2;
    } else if (lineCount > 0) {
      score += 0.1;
    }

    return Math.min(score, 1.5);
  }

  /**
   * 결과 마크다운 포맷
   */
  formatAsMarkdown(query, result) {
    const lines = [];
    lines.push(`# Code Examples for "${query}"`);
    lines.push('');
    lines.push(`**Path**: ${result.path}`);
    if (result.language) {
      lines.push(`**Language filter**: ${result.language}`);
    }
    lines.push(`**Found**: ${result.totalFound} code blocks, returning ${result.blocks.length}`);
    lines.push('');

    if (result.blocks.length === 0) {
      lines.push('*No matching code examples found.*');
    } else {
      for (let i = 0; i < result.blocks.length; i++) {
        const block = result.blocks[i];
        lines.push(`## ${i + 1}. ${block.context || '(No heading)'} (score: ${block.score.toFixed(2)})`);
        lines.push('');
        lines.push(`**File**: \`${block.filePath}\` (line ${block.lineNumber})`);
        lines.push('');
        lines.push('```' + (block.language || ''));
        lines.push(block.code);
        lines.push('```');
        if (block.truncated) {
          lines.push('*[Code truncated due to token limit]*');
        }
        lines.push('');
      }
    }

    lines.push('---');
    lines.push(`**Tokens used**: ${result.tokensUsed.toLocaleString()} / ${result.tokenBudget.toLocaleString()}`);

    return lines.join('\n');
  }
}

module.exports = { CodeBlockExtractorService };
