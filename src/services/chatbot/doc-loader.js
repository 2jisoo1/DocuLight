/**
 * DocLoader - Markdown 문서 로드 및 Frontmatter 파싱
 * @module services/chatbot/doc-loader
 *
 * Frontmatter 형식:
 * ---
 * name: 문서 이름
 * description: 문서 설명
 * ---
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * YAML Frontmatter 정규식
 * ---로 시작하고 ---로 끝나는 블록
 */
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Frontmatter 파싱
 * @param {string} content - 파일 내용
 * @returns {{frontmatter: Object, body: string}}
 */
function parseFrontmatter(content) {
  const match = content.match(FRONTMATTER_REGEX);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterStr = match[1];
  const body = content.slice(match[0].length);

  // 간단한 YAML 파싱 (key: value 형식)
  const frontmatter = {};
  const lines = frontmatterStr.split(/\r?\n/);

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();

      // 따옴표 제거
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // 숫자 변환
      if (/^\d+$/.test(value)) {
        value = parseInt(value, 10);
      } else if (/^\d+\.\d+$/.test(value)) {
        value = parseFloat(value);
      } else if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      }

      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

/**
 * Markdown 파일 로드 및 Frontmatter 파싱
 * @param {string} filePath - 파일 경로
 * @returns {Promise<{pageContent: string, metadata: Object}>}
 */
async function loadMarkdownWithFrontmatter(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);

  const metadata = {
    filePath,
    source: path.basename(filePath),
    ...frontmatter,
  };

  return {
    pageContent: body,
    metadata,
  };
}

/**
 * 디렉토리 내 모든 Markdown 파일 목록 조회
 * @param {string} dirPath - 디렉토리 경로
 * @param {string[]} excludePatterns - 제외 패턴
 * @returns {Promise<string[]>} 파일 경로 목록
 */
async function findMarkdownFiles(dirPath, excludePatterns = []) {
  const results = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(dirPath, fullPath);

      // 제외 패턴 확인 (간단한 구현)
      const shouldExclude = excludePatterns.some(pattern => {
        if (pattern.includes('*')) {
          // 간단한 glob 패턴 매칭
          const regex = new RegExp(
            '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
          );
          return regex.test(relativePath) || regex.test(entry.name);
        }
        return relativePath.includes(pattern) || entry.name === pattern;
      });

      if (shouldExclude) continue;

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  }

  await walk(dirPath);
  return results;
}

module.exports = {
  parseFrontmatter,
  loadMarkdownWithFrontmatter,
  findMarkdownFiles
};
