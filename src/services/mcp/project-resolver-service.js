/**
 * ProjectResolverService - 자연어 프로젝트명을 문서 경로로 매핑
 * Context7의 resolve-library-id에 해당하는 기능
 * @module services/mcp/project-resolver-service
 */

const fs = require('fs').promises;
const path = require('path');
const ignore = require('ignore');
const { parseFrontmatter } = require('../frontmatter-service');

class ProjectResolverService {
  /**
   * @param {Object} config - 애플리케이션 설정
   * @param {Object} logger - 로거
   */
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.index = [];
    this.built = false;
  }

  /**
   * 프로젝트 인덱스 구축 (서버 시작 시 호출)
   */
  async buildIndex() {
    const startTime = Date.now();
    this.index = [];

    const ig = ignore().add(this.config.excludes || []);

    await this._scanDirectory(this.config.docsRoot, '', ig);

    this.built = true;
    const duration = Date.now() - startTime;
    this.logger?.info('Project index built', {
      projects: this.index.length,
      duration: `${duration}ms`
    });
  }

  /**
   * 디렉토리 재귀 스캔하여 프로젝트 엔트리 수집
   */
  async _scanDirectory(basePath, relativePath, ig) {
    const fullPath = relativePath ? path.join(basePath, relativePath) : basePath;

    let entries;
    try {
      entries = await fs.readdir(fullPath, { withFileTypes: true });
    } catch (e) {
      return;
    }

    const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));
    const files = entries.filter(e => e.isFile() && e.name.endsWith('.md'));

    // 이 디렉토리에 .md 파일이 있으면 프로젝트로 등록
    if (files.length > 0) {
      const normalizedPath = relativePath.replace(/\\/g, '/');
      if (normalizedPath && !ig.ignores(normalizedPath)) {
        const entry = await this._buildEntry(fullPath, normalizedPath, files);
        if (entry) {
          this.index.push(entry);
        }
      }
    }

    // 하위 디렉토리 재귀
    for (const dir of dirs) {
      const childRelative = relativePath ? path.join(relativePath, dir.name) : dir.name;
      const normalizedChild = childRelative.replace(/\\/g, '/');
      if (!ig.ignores(normalizedChild)) {
        await this._scanDirectory(basePath, childRelative, ig);
      }
    }
  }

  /**
   * 프로젝트 엔트리 구축
   */
  async _buildEntry(dirPath, relativePath, files) {
    const dirName = path.basename(dirPath);
    let title = null;
    let description = null;
    let aliases = [];
    let versions = [];

    // 첫 번째 .md 파일에서 메타데이터 추출
    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      try {
        const content = await fs.readFile(filePath, 'utf-8');

        // frontmatter에서 aliases 추출
        const fm = parseFrontmatter(content);
        if (fm) {
          if (fm.aliases) {
            const aliasStr = typeof fm.aliases === 'string' ? fm.aliases : '';
            aliases = aliasStr.split(',').map(a => a.trim()).filter(a => a);
          }
          if (fm.description && !description) {
            description = fm.description;
          }
          if (fm.version) {
            versions.push(fm.version);
          }
        }

        // 첫 번째 H1 헤딩을 제목으로
        if (!title) {
          const match = content.match(/^#\s+(.+?)(?:\s*#*)?$/m);
          if (match) {
            title = match[1].trim();
          }
        }
      } catch (e) {
        // 파일 읽기 실패 시 무시
      }
    }

    // 버전 디렉토리 감지
    try {
      const subEntries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const sub of subEntries) {
        if (sub.isDirectory() && /^v?\d+(\.\d+)*$/.test(sub.name)) {
          versions.push({
            version: sub.name.replace(/^v/, ''),
            path: `${relativePath}/${sub.name}`
          });
        }
      }
    } catch (e) {
      // ignore
    }

    return {
      path: relativePath,
      dirName,
      title: title || dirName,
      description: description || null,
      aliases,
      docCount: files.length,
      versions: versions.filter(v => typeof v === 'object')
    };
  }

  /**
   * 프로젝트 검색 (퍼지 매칭)
   * @param {string} query - 검색 쿼리
   * @param {Object} options - 옵션
   * @param {number} options.limit - 최대 결과 수 (기본: 5)
   * @param {string} options.version - 특정 버전 (선택)
   * @returns {Array} 매칭 결과
   */
  resolve(query, options = {}) {
    const { limit = 5, version = null } = options;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      const error = new Error('INVALID_QUERY: Query must be a non-empty string');
      error.code = 'INVALID_QUERY';
      throw error;
    }

    if (!this.built) {
      const error = new Error('INDEX_NOT_BUILT: Project index has not been built yet');
      error.code = 'INDEX_NOT_BUILT';
      throw error;
    }

    // 버전을 쿼리에서 분리
    const parsed = this._parseVersionFromQuery(query);
    const searchName = parsed.name.toLowerCase().trim();
    const searchVersion = version || parsed.version;

    const results = [];

    for (const entry of this.index) {
      const score = this._calculateScore(searchName, entry);
      if (score > 0) {
        const result = {
          path: entry.path,
          name: entry.dirName,
          title: entry.title,
          description: entry.description,
          score,
          docCount: entry.docCount,
          versions: entry.versions
        };

        // 버전 필터링
        if (searchVersion && entry.versions.length > 0) {
          const matched = entry.versions.find(v => v.version === searchVersion);
          if (matched) {
            result.path = matched.path;
            result.matchedVersion = searchVersion;
          }
        }

        if (entry.versions.length > 0) {
          result.latestVersion = entry.versions[entry.versions.length - 1].version;
        }

        results.push(result);
      }
    }

    // score 내림차순 정렬
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  /**
   * 쿼리에서 버전 패턴 분리
   */
  _parseVersionFromQuery(query) {
    const versionMatch = query.match(/\s+v?(\d+(?:\.\d+)*)$/i);
    if (versionMatch) {
      return {
        name: query.substring(0, versionMatch.index),
        version: versionMatch[1]
      };
    }
    return { name: query, version: null };
  }

  /**
   * 매칭 점수 계산
   */
  _calculateScore(query, entry) {
    const dirLower = entry.dirName.toLowerCase();
    const titleLower = (entry.title || '').toLowerCase();

    // 1순위: 디렉토리명 정확 일치 (1.0)
    if (dirLower === query) return 1.0;

    // 2순위: aliases 정확 일치 (0.95)
    for (const alias of entry.aliases) {
      if (alias.toLowerCase() === query) return 0.95;
    }

    // 3순위: 제목 정확 일치 (0.90)
    if (titleLower === query) return 0.90;

    // 4순위: 디렉토리명 포함 (0.80)
    if (dirLower.includes(query)) return 0.80;

    // 5순위: 쿼리가 디렉토리명에 포함 (0.75)
    if (query.includes(dirLower) && dirLower.length >= 2) return 0.75;

    // 6순위: aliases 부분 일치 (0.70)
    for (const alias of entry.aliases) {
      if (alias.toLowerCase().includes(query) || query.includes(alias.toLowerCase())) return 0.70;
    }

    // 7순위: 제목 포함 (0.65)
    if (titleLower.includes(query)) return 0.65;

    // 8순위: 편집 거리 (0.50)
    const dist = this._levenshtein(query, dirLower);
    const maxLen = Math.max(query.length, dirLower.length);
    const threshold = maxLen <= 5 ? 2 : 3;
    if (dist <= threshold) return 0.50 * (1 - dist / maxLen);

    // aliases에 대한 편집 거리
    for (const alias of entry.aliases) {
      const aliasDist = this._levenshtein(query, alias.toLowerCase());
      const aliasMaxLen = Math.max(query.length, alias.length);
      if (aliasDist <= threshold) return 0.45 * (1 - aliasDist / aliasMaxLen);
    }

    return 0;
  }

  /**
   * Levenshtein 편집 거리 계산
   */
  _levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }

    return dp[m][n];
  }

  /**
   * 결과를 마크다운으로 포맷
   */
  formatAsMarkdown(query, results) {
    const lines = [];
    lines.push(`# Project Resolution for "${query}"`);
    lines.push('');

    if (results.length === 0) {
      lines.push('*No matching projects found.*');
      lines.push('');
      lines.push('**Tips:**');
      lines.push('- Try a shorter or simpler name');
      lines.push('- Use list_documents to browse available directories');
    } else {
      lines.push(`**Found ${results.length} match(es):**`);
      lines.push('');

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        lines.push(`## ${i + 1}. ${r.title} (score: ${r.score.toFixed(2)})`);
        lines.push('');
        lines.push(`- **Path**: \`${r.path}\``);
        lines.push(`- **Directory**: ${r.name}`);
        if (r.description) {
          lines.push(`- **Description**: ${r.description}`);
        }
        lines.push(`- **Documents**: ${r.docCount}`);

        if (r.matchedVersion) {
          lines.push(`- **Matched Version**: ${r.matchedVersion}`);
        }
        if (r.versions && r.versions.length > 0) {
          const vList = r.versions.map(v => v.version).join(', ');
          lines.push(`- **Versions**: ${vList}`);
          if (r.latestVersion) {
            lines.push(`- **Latest**: ${r.latestVersion}`);
          }
        }
        lines.push('');
      }

      lines.push('**Next steps:**');
      lines.push(`- Use \`query_document\` with path \`${results[0].path}/...\` to search within this project`);
      lines.push(`- Use \`query_code_examples\` with path \`${results[0].path}\` for code snippets`);
      lines.push(`- Use \`DocuLight_smart_search\` with path \`${results[0].path}\` for natural language search`);
    }

    return lines.join('\n');
  }
}

module.exports = { ProjectResolverService };
