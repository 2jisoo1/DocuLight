/**
 * Frontmatter 파싱 서비스
 *
 * 지원 형식:
 * ----
 * name: 문서 이름
 * description: 설명
 * ----
 *
 * 규칙:
 * - 구분자: 4개 이상의 하이픈
 * - 시작/종료 구분자 개수 달라도 됨
 * - 파일 시작 부분에만 존재 (BOM 허용)
 */

const fs = require('fs').promises;

/**
 * 정규식 설명:
 * ^(?:\ufeff)?     - 파일 시작 (BOM 선택적 허용)
 * -{4,}            - 4개 이상의 하이픈 (시작 구분자)
 * \r?\n            - 줄바꿈 (CRLF 또는 LF)
 * ([\s\S]*?)       - frontmatter 내용 (non-greedy 캡처)
 * \r?\n            - 줄바꿈
 * -{4,}            - 4개 이상의 하이픈 (종료 구분자, 시작과 개수 달라도 됨)
 * (?:\r?\n|$)      - 줄바꿈 또는 파일 끝 (frontmatter 후 내용 없어도 됨)
 */
const FRONTMATTER_REGEX = /^(?:\ufeff)?-{4,}\r?\n([\s\S]*?)\r?\n-{4,}(?:\r?\n|$)/;

/**
 * Parse frontmatter from markdown content
 * @param {string} content - Markdown file content
 * @returns {{ name?: string, description?: string, content: string }}
 */
function parseFrontmatter(content) {
  if (!content || typeof content !== 'string') {
    return { content: content || '' };
  }

  const match = content.match(FRONTMATTER_REGEX);

  if (!match) {
    return { content };
  }

  const frontmatterBlock = match[1];
  const metadata = {};

  // Parse key: value pairs
  const lines = frontmatterBlock.split(/\r?\n/);
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();

      if ((key === 'name' || key === 'description') && value) {
        metadata[key] = value;
      }
    }
  }

  // Remove frontmatter from content
  const remainingContent = content.slice(match[0].length);

  return {
    ...metadata,
    content: remainingContent
  };
}

/**
 * Parse frontmatter from first 1KB of file (performance optimization)
 * @param {string} filePath - Absolute path to file
 * @returns {Promise<{ name?: string, description?: string }>}
 */
async function parseFrontmatterFromFile(filePath) {
  try {
    // Read only first 1KB for performance
    const fd = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(1024);
      const { bytesRead } = await fd.read(buffer, 0, 1024, 0);
      const content = buffer.slice(0, bytesRead).toString('utf-8');
      const result = parseFrontmatter(content);
      return {
        name: result.name || null,
        description: result.description || null
      };
    } finally {
      await fd.close();
    }
  } catch (error) {
    return { name: null, description: null };
  }
}

module.exports = { parseFrontmatter, parseFrontmatterFromFile };
