'use strict';

/**
 * Agent Tool Registry (FR-2, TASK-P1-002)
 * @module services/agent-tools/registry
 *
 * 16종 read-only 도구 레지스트리.
 * internal name(mcp.xxx) ↔ wire name(mcp_xxx) 매핑 + ZodSchema + handler.
 * 부팅 1회 frozen — 런타임 변경 불가.
 */

const { z } = require('zod');

const WIRE_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

// C/U/D 접두어 정규식 — prefix anchor로 post_filter/post_process false positive 회피 (FR-3)
const CUD_PREFIX_RE = /^(create|update|delete|remove|upload|write|edit|patch)_/i;

/**
 * @param {string} internal - 내부 도구 이름 (e.g. "mcp.list_documents")
 * @returns {string} wire 이름 (e.g. "mcp_list_documents")
 */
function makeWire(internal) {
  return internal.replace(/\./g, '_');
}

/**
 * @typedef {Object} ToolDef
 * @property {string} internal - 내부 이름 ("mcp.xxx")
 * @property {string} wire - Anthropic 호환 wire 이름 ("mcp_xxx")
 * @property {import('zod').ZodObject} schema - 입력 Zod 스키마
 * @property {string} description - "When to use / When NOT / Example" 3섹션
 * @property {function(object, object): Promise<object>} handler
 */

/**
 * 16종 read-only 도구 레지스트리를 구축하고 frozen 객체로 반환.
 *
 * @param {object} opts
 * @param {object|null} opts.mcpClient - MCP 클라이언트 (callTool(name, args) → result)
 * @param {object|null} opts.logger - winston 로거
 * @returns {Record<string, ToolDef>} internal → ToolDef 매핑 (frozen)
 */
function buildToolRegistry({ mcpClient = null, logger = null } = {}) {
  const tools = [
    {
      internal: 'mcp.list_full_tree',
      schema: z.object({
        path: z.string().default('/').describe('시작 디렉토리 경로 (기본: /)'),
        maxDepth: z.number().int().optional().describe('최대 탐색 깊이. 생략 시 전체'),
        useDisplayName: z.boolean().default(false).describe('frontmatter 제목 표시 여부')
      }),
      description: [
        'When to use / 사용 시점: 전체 문서 트리를 재귀적으로 파악해야 할 때.',
        'When NOT / 비사용 시점: 단일 디렉토리 목록만 필요하면 list_documents를 사용. 대형 컬렉션에서 토큰 낭비 위험.',
        'Example / 예시: list_full_tree({ path: "/guide", maxDepth: 2 }) → 최대 2단계 트리 반환'
      ].join('\n'),
      handler: async (args, ctx) => {
        if (mcpClient) return mcpClient.callTool('list_full_tree', args);
        return { entries: [], stub: true };
      }
    },
    {
      internal: 'mcp.list_documents',
      schema: z.object({
        path: z.string().default('/').describe('디렉토리 경로'),
        useDisplayName: z.boolean().default(false).describe('frontmatter 제목 표시 여부')
      }),
      description: [
        'When to use / 사용 시점: 특정 디렉토리의 파일 목록(비재귀)을 확인할 때.',
        'When NOT / 비사용 시점: 재귀 트리가 필요하면 list_full_tree를 사용.',
        'Example / 예시: list_documents({ path: "/guide" }) → /guide 디렉토리 항목 목록'
      ].join('\n'),
      handler: async (args, ctx) => {
        if (mcpClient) return mcpClient.callTool('list_documents', args);
        return { entries: [], stub: true };
      }
    },
    {
      internal: 'mcp.search_documents',
      schema: z.object({
        query: z.string().describe('검색 키워드 (최소 2자)'),
        limit: z.number().int().default(10).describe('최대 결과 수 (1-100)'),
        path: z.string().default('/').describe('검색 범위 디렉토리'),
        mode: z.enum(['titles_only', 'snippets', 'full_context']).default('snippets').describe('결과 상세 수준')
      }),
      description: [
        'When to use / 사용 시점: 키워드로 여러 문서를 검색할 때.',
        'When NOT / 비사용 시점: 의미 기반 검색은 smart_search를 사용. 특정 문서 내 검색은 query_document를 사용.',
        'Example / 예시: search_documents({ query: "인증", mode: "snippets" })'
      ].join('\n'),
      handler: async (args, ctx) => {
        if (mcpClient) return mcpClient.callTool('search_documents', args);
        return { results: [], stub: true };
      }
    },
    {
      internal: 'mcp.query_document',
      schema: z.object({
        path: z.string().describe('문서 경로 (예: guide/setup.md)'),
        query: z.string().describe('문서에서 찾을 정보'),
        maxTokens: z.number().int().default(2000).describe('반환 최대 토큰')
      }),
      description: [
        'When to use / 사용 시점: 특정 문서 내에서 관련 섹션을 토큰 효율적으로 추출할 때.',
        'When NOT / 비사용 시점: 전체 내용이 필요하면 read_section을 사용. 여러 문서 검색은 smart_search를 사용.',
        'Example / 예시: query_document({ path: "guide/setup.md", query: "환경변수 설정" })'
      ].join('\n'),
      handler: async (args, ctx) => {
        if (mcpClient) return mcpClient.callTool('query_document', args);
        return { content: '', stub: true };
      }
    },
    {
      internal: 'mcp.summarize_document',
      schema: z.object({
        path: z.string().describe('문서 경로')
      }),
      description: [
        'When to use / 사용 시점: 문서 구조(TOC, 주요 포인트, 통계)를 파악하거나 전체 내용 없이 개요가 필요할 때.',
        'When NOT / 비사용 시점: 전체 내용이 필요하면 read_section을 사용.',
        'Example / 예시: summarize_document({ path: "guide/setup.md" })'
      ].join('\n'),
      handler: async (args, ctx) => {
        if (mcpClient) return mcpClient.callTool('summarize_document', args);
        return { summary: '', stub: true };
      }
    },
    {
      internal: 'mcp.smart_search',
      schema: z.object({
        query: z.string().describe('검색 쿼리 (자연어 또는 키워드)'),
        path: z.string().default('/').describe('검색 범위 디렉토리'),
        mode: z.enum(['auto', 'semantic', 'keyword']).default('auto').describe('검색 모드'),
        maxTokens: z.number().int().default(2000).describe('반환 최대 토큰'),
        limit: z.number().int().default(5).describe('최대 문서 수')
      }),
      description: [
        'When to use / 사용 시점: 여러 문서에서 의미 기반으로 정보를 찾을 때. 벡터 검색 가능 시 자동 활용.',
        'When NOT / 비사용 시점: 특정 문서 내 검색은 query_document를 사용.',
        'Example / 예시: smart_search({ query: "API 인증 방법", mode: "auto" })'
      ].join('\n'),
      handler: async (args, ctx) => {
        if (mcpClient) return mcpClient.callTool('smart_search', args);
        return { results: [], stub: true };
      }
    },
    {
      internal: 'mcp.resolve_project',
      schema: z.object({
        name: z.string().describe('프로젝트/라이브러리 이름 (자연어, 예: "json5", "옵션위버")'),
        version: z.string().optional().describe('특정 버전 (생략 시 전체 버전)'),
        limit: z.number().int().default(5).describe('최대 결과 수')
      }),
      description: [
        'When to use / 사용 시점: 프로젝트명은 알지만 정확한 경로를 모를 때. query_document, smart_search 전 먼저 호출.',
        'When NOT / 비사용 시점: 경로를 이미 알고 있다면 바로 query_document를 사용.',
        'Example / 예시: resolve_project({ name: "AnnotaQL" }) → 관련 문서 경로 목록'
      ].join('\n'),
      handler: async (args, ctx) => {
        if (mcpClient) return mcpClient.callTool('resolve_project', args);
        return { projects: [], stub: true };
      }
    },
    {
      internal: 'mcp.extract_code_block',
      schema: z.object({
        query: z.string().describe('필요한 코드 예시 설명'),
        path: z.string().default('/').describe('검색 범위'),
        language: z.string().optional().describe('언어 필터 (예: javascript, python)'),
        maxTokens: z.number().int().default(3000).describe('반환 최대 토큰'),
        limit: z.number().int().default(10).describe('최대 코드 블록 수')
      }),
      description: [
        'When to use / 사용 시점: 특정 기능의 코드 예시만 추출할 때. 전체 문서 대비 토큰 효율적.',
        'When NOT / 비사용 시점: 설명 문서가 필요하면 query_document를 사용.',
        'Example / 예시: extract_code_block({ query: "JWT 생성", language: "javascript" })'
      ].join('\n'),
      handler: async (args, ctx) => {
        if (mcpClient) return mcpClient.callTool('extract_code_block', args);
        return { codeBlocks: [], stub: true };
      }
    },
    {
      internal: 'mcp.extract_section',
      schema: z.object({
        path: z.string().describe('문서 경로'),
        query: z.string().describe('섹션 관련 질의'),
        maxTokens: z.number().int().default(2000).describe('반환 최대 토큰')
      }),
      description: [
        'When to use / 사용 시점: 특정 문서에서 쿼리와 관련된 섹션만 추출할 때.',
        'When NOT / 비사용 시점: 특정 헤딩을 정확히 알면 read_section이 더 정확함.',
        'Example / 예시: extract_section({ path: "guide/setup.md", query: "설치 방법" })'
      ].join('\n'),
      handler: async (args, ctx) => {
        if (mcpClient) return mcpClient.callTool('extract_section', args);
        return { sections: [], stub: true };
      }
    },
    {
      internal: 'mcp.list_recent',
      schema: z.object({
        limit: z.number().int().default(10).describe('반환할 최근 문서 수'),
        path: z.string().default('/').describe('검색 범위 디렉토리')
      }),
      description: [
        'When to use / 사용 시점: 최근 수정된 문서 목록이 필요할 때.',
        'When NOT / 비사용 시점: 전체 목록이 필요하면 list_full_tree를 사용.',
        'Example / 예시: list_recent({ limit: 5 }) → 최근 수정 문서 5개'
      ].join('\n'),
      handler: async (args, ctx) => {
        if (mcpClient) return mcpClient.callTool('list_recent', args);
        return { entries: [], stub: true };
      }
    },
    {
      internal: 'mcp.get_metadata',
      schema: z.object({
        path: z.string().describe('문서 경로')
      }),
      description: [
        'When to use / 사용 시점: 문서의 frontmatter 메타데이터(제목, 날짜, 태그 등)만 확인할 때.',
        'When NOT / 비사용 시점: 내용이 필요하면 query_document를 사용.',
        'Example / 예시: get_metadata({ path: "guide/setup.md" }) → { title, date, tags, ... }'
      ].join('\n'),
      handler: async (args, ctx) => {
        if (mcpClient) return mcpClient.callTool('get_metadata', args);
        return { metadata: {}, stub: true };
      }
    },
    {
      internal: 'mcp.read_section',
      schema: z.object({
        path: z.string().describe('문서 경로'),
        heading: z.string().describe('섹션 헤딩 텍스트 (정확히 일치)')
      }),
      description: [
        'When to use / 사용 시점: 헤딩 이름을 정확히 알고 그 섹션 전체를 읽어야 할 때.',
        'When NOT / 비사용 시점: 헤딩을 모르면 extract_section을 사용.',
        'Example / 예시: read_section({ path: "guide/setup.md", heading: "## 설치" })'
      ].join('\n'),
      handler: async (args, ctx) => {
        if (mcpClient) return mcpClient.callTool('read_section', args);
        return { content: '', stub: true };
      }
    },
    {
      internal: 'mcp.get_doc_tree',
      schema: z.object({
        path: z.string().describe('문서 경로'),
        maxDepth: z.number().int().default(3).describe('최대 헤딩 깊이 (기본: 3)')
      }),
      description: [
        'When to use / 사용 시점: 단일 문서의 헤딩 계층 구조(목차 트리)를 파악할 때.',
        'When NOT / 비사용 시점: 전체 요약이 필요하면 summarize_document를 사용.',
        'Example / 예시: get_doc_tree({ path: "api/reference.md" }) → 헤딩 트리 반환'
      ].join('\n'),
      handler: async (args, ctx) => {
        if (mcpClient) return mcpClient.callTool('get_doc_tree', args);
        return { tree: [], stub: true };
      }
    },
    {
      internal: 'mcp.get_breadcrumb',
      schema: z.object({
        path: z.string().describe('문서 경로')
      }),
      description: [
        'When to use / 사용 시점: 문서의 디렉토리 계층(경로 breadcrumb)을 확인할 때.',
        'When NOT / 비사용 시점: 전체 트리가 필요하면 list_full_tree를 사용.',
        'Example / 예시: get_breadcrumb({ path: "guide/advanced/setup.md" }) → ["guide", "advanced", "setup.md"]'
      ].join('\n'),
      handler: async (args, ctx) => {
        if (mcpClient) return mcpClient.callTool('get_breadcrumb', args);
        return { breadcrumb: [], stub: true };
      }
    },
    {
      internal: 'mcp.list_categories',
      schema: z.object({
        path: z.string().default('/').describe('검색 범위 디렉토리')
      }),
      description: [
        'When to use / 사용 시점: frontmatter category 필드 기반으로 카테고리 목록을 볼 때.',
        'When NOT / 비사용 시점: 태그 목록이 필요하면 list_tags를 사용.',
        'Example / 예시: list_categories({ path: "/" }) → [{ category: "guide", count: 5 }, ...]'
      ].join('\n'),
      handler: async (args, ctx) => {
        if (mcpClient) return mcpClient.callTool('list_categories', args);
        return { categories: [], stub: true };
      }
    },
    {
      internal: 'mcp.list_tags',
      schema: z.object({
        path: z.string().default('/').describe('검색 범위 디렉토리')
      }),
      description: [
        'When to use / 사용 시점: frontmatter tags 필드 기반으로 태그 목록을 볼 때.',
        'When NOT / 비사용 시점: 카테고리가 필요하면 list_categories를 사용.',
        'Example / 예시: list_tags({ path: "/" }) → [{ tag: "api", count: 3 }, ...]'
      ].join('\n'),
      handler: async (args, ctx) => {
        if (mcpClient) return mcpClient.callTool('list_tags', args);
        return { tags: [], stub: true };
      }
    }
  ].map(tool => ({
    ...tool,
    wire: makeWire(tool.internal)
  }));

  const registry = tools.reduce((acc, tool) => {
    acc[tool.internal] = tool;
    return acc;
  }, {});

  const result = validateToolRegistry(registry, logger);
  if (!result.valid) {
    const warn = logger ? logger.warn.bind(logger) : console.warn;
    warn('Tool registry validation failed', { errors: result.errors });
  }

  // Deep freeze: 각 ToolDef 객체도 동결하여 런타임 변조 방지
  for (const tool of Object.values(registry)) {
    Object.freeze(tool);
  }
  return Object.freeze(registry);
}

/**
 * 레지스트리 유효성 검사 (부팅 dry-run).
 *
 * @param {Record<string, ToolDef>} registry
 * @param {object|null} logger
 * @returns {{ valid: boolean, errors: string[], count: number }}
 */
function validateToolRegistry(registry, logger) {
  const tools = Object.values(registry);
  const errors = [];

  for (const tool of tools) {
    if (!WIRE_REGEX.test(tool.wire)) {
      errors.push(`${tool.internal}: invalid wire name "${tool.wire}"`);
    }
    if (!tool.schema || typeof tool.schema.parse !== 'function') {
      errors.push(`${tool.internal}: missing or invalid Zod schema`);
    }
    if (typeof tool.handler !== 'function') {
      errors.push(`${tool.internal}: missing handler`);
    }
  }

  const wireNames = tools.map(t => t.wire);
  const uniqueWires = new Set(wireNames);
  if (uniqueWires.size !== wireNames.length) {
    errors.push('Duplicate wire names detected');
  }

  return { valid: errors.length === 0, errors, count: tools.length };
}

/**
 * 도구 이름이 read-only인지 판별 (FR-3, TASK-P1-003).
 * C/U/D 접두어(create_ / update_ / delete_ / remove_ / upload_ / write_ / edit_ / patch_)로
 * 시작하면 false. 그 외(post_filter, mcp_list_documents 등)는 true.
 *
 * @param {string} name - 도구 internal 이름 또는 wire 이름
 * @returns {boolean} true이면 read-only (호출 허용)
 */
function isReadOnlyTool(name) {
  if (typeof name !== 'string' || name.length === 0) return false;
  return !CUD_PREFIX_RE.test(name);
}

module.exports = { buildToolRegistry, validateToolRegistry, makeWire, isReadOnlyTool };
