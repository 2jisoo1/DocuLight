/**
 * Summarize Document Service - 문서 구조적 요약
 * @module services/mcp/summarize-document-service
 *
 * 문서의 목차(TOC), 핵심 내용, 통계 정보를 추출하여 반환합니다.
 * 전체 문서를 읽지 않고도 구조를 파악할 수 있습니다.
 */

const fs = require('fs').promises;
const path = require('path');
const { validatePath } = require('../../utils/path-validator');
const { SectionExtractor } = require('./section-extractor');
const { estimateTokens } = require('../chatbot/token-estimator');

/**
 * 문서 요약 결과 타입
 * @typedef {Object} DocumentSummary
 * @property {string} path - 문서 경로
 * @property {string} title - 문서 제목
 * @property {TOCItem[]} toc - 목차
 * @property {string[]} keyPoints - 핵심 내용
 * @property {Statistics} stats - 통계 정보
 */

/**
 * 목차 항목 타입
 * @typedef {Object} TOCItem
 * @property {number} level - 헤딩 레벨 (1-6)
 * @property {string} text - 헤딩 텍스트
 * @property {string} anchor - 앵커 ID
 */

/**
 * 통계 정보 타입
 * @typedef {Object} Statistics
 * @property {number} wordCount - 단어 수
 * @property {number} charCount - 문자 수
 * @property {number} sectionCount - 섹션 수
 * @property {number} codeBlockCount - 코드 블록 수
 * @property {number} estimatedTokens - 추정 토큰 수
 */

/**
 * SummarizeDocumentService 클래스
 * 문서의 구조적 요약을 생성
 */
class SummarizeDocumentService {
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
   * 문서 요약 생성
   * @param {string} docPath - 문서 경로 (상대 경로)
   * @returns {Promise<DocumentSummary>} 문서 요약
   */
  async summarizeDocument(docPath) {
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

    // 요약 생성
    const title = this.extractTitle(content);
    const toc = this.extractTOC(content);
    const keyPoints = this.extractKeyPoints(content);
    const statistics = this.getStatistics(content);

    this.logger?.info('Document summarized', {
      path: docPath,
      title,
      sections: toc.length,
      keyPoints: keyPoints.length,
      tokens: statistics.estimatedTokens
    });

    return {
      path: docPath,
      title,
      toc,
      keyPoints,
      stats: statistics
    };
  }

  /**
   * 문서 제목 추출 (첫 H1 헤딩)
   * @param {string} content - 문서 내용
   * @returns {string} 제목
   */
  extractTitle(content) {
    const match = content.match(/^#\s+(.+?)(?:\s*#*)?$/m);
    return match ? match[1].trim() : '(Untitled)';
  }

  /**
   * 목차 추출
   * @param {string} content - 문서 내용
   * @returns {TOCItem[]} 목차 배열
   */
  extractTOC(content) {
    const headingPattern = /^(#{1,6})\s+(.+?)(?:\s*#*)?$/gm;
    const toc = [];
    let match;

    while ((match = headingPattern.exec(content)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      const anchor = this.generateAnchor(text);

      toc.push({ level, text, anchor });
    }

    return toc;
  }

  /**
   * 앵커 ID 생성
   * @param {string} text - 헤딩 텍스트
   * @returns {string} 앵커 ID
   */
  generateAnchor(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s가-힣-]/g, '') // 알파벳, 숫자, 공백, 한글, 하이픈만 유지
      .replace(/\s+/g, '-')          // 공백을 하이픈으로
      .replace(/-+/g, '-')           // 연속 하이픈 제거
      .replace(/^-|-$/g, '');        // 앞뒤 하이픈 제거
  }

  /**
   * 핵심 내용 추출
   * @param {string} content - 문서 내용
   * @returns {string[]} 핵심 내용 배열
   */
  extractKeyPoints(content) {
    const keyPoints = [];
    const lines = content.split('\n');

    // 1. 첫 번째 헤딩 아래 첫 단락 (문서 소개)
    const firstParagraph = this.extractFirstParagraph(content);
    if (firstParagraph) {
      keyPoints.push(firstParagraph);
    }

    // 2. 주요 헤딩(H2) 다음의 첫 문장
    const sections = this.extractor.splitByHeadings(content);
    for (const section of sections) {
      if (section.level === 2) {
        const firstSentence = this.extractFirstSentence(section.content);
        if (firstSentence && !keyPoints.includes(firstSentence)) {
          keyPoints.push(firstSentence);
        }
      }
    }

    // 3. 중요 키워드 (굵은 글씨 정의)
    const boldDefinitions = this.extractBoldDefinitions(content);
    for (const def of boldDefinitions.slice(0, 3)) { // 최대 3개
      if (!keyPoints.some(kp => kp.includes(def))) {
        keyPoints.push(def);
      }
    }

    // 최대 8개로 제한
    return keyPoints.slice(0, 8);
  }

  /**
   * 첫 번째 단락 추출
   * @private
   */
  extractFirstParagraph(content) {
    // 첫 헤딩 이후 첫 단락
    const match = content.match(/^#[^#].*?\n+(.+?)(?:\n\n|\n#|$)/s);
    if (match) {
      const paragraph = match[1].trim();
      // 리스트나 코드 블록이 아닌 경우만
      if (!paragraph.startsWith('-') && !paragraph.startsWith('`')) {
        return this.truncateSentence(paragraph, 200);
      }
    }
    return null;
  }

  /**
   * 첫 문장 추출
   * @private
   */
  extractFirstSentence(content) {
    // 헤딩 제거
    const withoutHeading = content.replace(/^#+\s+.+?\n/, '').trim();

    // 첫 문장 찾기
    const sentences = withoutHeading.split(/[.!?。]\s+/);
    if (sentences.length > 0 && sentences[0].length > 0) {
      const sentence = sentences[0].trim();
      // 리스트나 코드가 아닌 경우만
      if (!sentence.startsWith('-') && !sentence.startsWith('`') && !sentence.startsWith('|')) {
        return this.truncateSentence(sentence, 150);
      }
    }
    return null;
  }

  /**
   * 굵은 글씨 정의 추출
   * @private
   */
  extractBoldDefinitions(content) {
    const definitions = [];
    // **key**: value 형태 또는 **key** - value 형태
    const pattern = /\*\*([^*]+)\*\*(?::\s*|\s*[-–—]\s*)([^*\n]+)/g;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const key = match[1].trim();
      const value = match[2].trim().slice(0, 100);
      definitions.push(`${key}: ${value}`);
    }

    return definitions;
  }

  /**
   * 문장 자르기
   * @private
   */
  truncateSentence(text, maxLength) {
    if (text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength - 3) + '...';
  }

  /**
   * 통계 정보 생성
   * @param {string} content - 문서 내용
   * @returns {Statistics} 통계 정보
   */
  getStatistics(content) {
    // 단어 수 (공백으로 분리)
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    // 문자 수
    const charCount = content.length;

    // 섹션 수 (헤딩 수)
    const sectionCount = (content.match(/^#+\s+.+$/gm) || []).length;

    // 코드 블록 수
    const codeBlockCount = (content.match(/```[\s\S]*?```/g) || []).length;

    // 인라인 코드도 카운트
    const inlineCodeCount = (content.match(/`[^`]+`/g) || []).length;

    // 추정 토큰 수
    const estimatedTokens = estimateTokens(content);

    return {
      wordCount,
      charCount,
      sectionCount,
      codeBlockCount: codeBlockCount + Math.floor(inlineCodeCount / 5), // 인라인 코드 5개당 1블록으로 근사
      estimatedTokens
    };
  }

  /**
   * 요약 결과를 마크다운 포맷으로 변환
   * @param {DocumentSummary} summary - 문서 요약
   * @returns {string} 마크다운 포맷 문자열
   */
  formatAsMarkdown(summary) {
    const lines = [];

    lines.push(`# Document Summary: ${summary.path}`);
    lines.push('');

    // 제목
    lines.push('## Title');
    lines.push(summary.title);
    lines.push('');

    // 목차
    lines.push('## Table of Contents');
    if (summary.toc.length === 0) {
      lines.push('*(No headings found)*');
    } else {
      const numbering = {};
      for (const item of summary.toc) {
        // 넘버링 계산
        numbering[item.level] = (numbering[item.level] || 0) + 1;
        // 하위 레벨 초기화
        for (let l = item.level + 1; l <= 6; l++) {
          numbering[l] = 0;
        }

        // 들여쓰기
        const indent = '  '.repeat(Math.max(0, item.level - 1));
        const num = this.buildNumbering(numbering, item.level);
        lines.push(`${indent}${num}. ${item.text}`);
      }
    }
    lines.push('');

    // 핵심 내용
    lines.push('## Key Points');
    if (summary.keyPoints.length === 0) {
      lines.push('*(No key points extracted)*');
    } else {
      for (const point of summary.keyPoints) {
        lines.push(`- ${point}`);
      }
    }
    lines.push('');

    // 통계
    lines.push('## Statistics');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Words | ${summary.stats.wordCount.toLocaleString()} |`);
    lines.push(`| Characters | ${summary.stats.charCount.toLocaleString()} |`);
    lines.push(`| Sections | ${summary.stats.sectionCount} |`);
    lines.push(`| Code blocks | ${summary.stats.codeBlockCount} |`);
    lines.push(`| Estimated tokens | ${summary.stats.estimatedTokens.toLocaleString()} |`);

    return lines.join('\n');
  }

  /**
   * 넘버링 문자열 생성
   * @private
   */
  buildNumbering(numbering, level) {
    const parts = [];
    for (let l = 1; l <= level; l++) {
      parts.push(numbering[l] || 0);
    }
    return parts.join('.');
  }
}

module.exports = { SummarizeDocumentService };
