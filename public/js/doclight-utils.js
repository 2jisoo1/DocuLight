/**
 * DocLight Shared Utilities
 * app.js와 admin.js에서 공유하는 마크다운 렌더링 유틸리티
 *
 * IIFE 패턴으로 캡슐화하여 전역 네임스페이스 오염 방지
 */
const DocLightUtils = (() => {
  'use strict';

  // ============================================================
  // 1. Wiki 링크 전처리
  // ============================================================
  /**
   * Wiki 링크 ([[path]]) 를 표준 마크다운 링크로 변환
   * @param {string} markdown - 원본 마크다운 콘텐츠
   * @returns {string} 변환된 마크다운
   */
  function preprocessWikiLinks(markdown) {
    const wikiLinkPattern = /\[\[([^\]]+)\]\]/g;
    return markdown.replace(wikiLinkPattern, (match, fullPath) => {
      let cleanPath = fullPath.trim().replace(/\.md$/, '');
      const parts = cleanPath.split('/').filter(p => p);
      const displayName = parts[parts.length - 1] || cleanPath;
      const url = `/doc${cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath}`;
      return `[${displayName}](${url})`;
    });
  }

  // ============================================================
  // 2. Marked 렌더러 설정
  // ============================================================
  /**
   * 커스텀 Marked 렌더러 생성
   * - Heading: ID 자동 생성 (한글 지원)
   * - Image: lazy loading 적용
   * @returns {marked.Renderer} 설정된 렌더러
   */
  function createMarkedRenderer() {
    const renderer = new marked.Renderer();

    // Heading with ID generation (한글 지원)
    renderer.heading = function(text, level, raw) {
      const id = raw
        .toLowerCase()
        .replace(/[^\w\s\-가-힣]/gu, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      return `<h${level} id="${id}">${text}</h${level}>\n`;
    };

    // Image with lazy loading
    renderer.image = function(href, title, text) {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<img src="${href}" alt="${text}"${titleAttr} loading="lazy">`;
    };

    return renderer;
  }

  // ============================================================
  // 3. HTML 정제 (DOMPurify)
  // ============================================================
  /**
   * HTML을 DOMPurify로 정제 (XSS 방지)
   * @param {string} html - 원본 HTML
   * @returns {string} 정제된 HTML
   */
  function sanitizeHtml(html) {
    if (typeof DOMPurify === 'undefined') return html;
    return DOMPurify.sanitize(html, {
      ADD_ATTR: ['class', 'data-language', 'data-highlighted', 'id',
                 'loading', 'title', 'alt', 'src', 'width', 'height'],
      ADD_TAGS: ['span']
    });
  }

  // ============================================================
  // 4. 코드 하이라이팅
  // ============================================================
  /**
   * 코드 블록에 syntax highlighting 적용
   * @param {HTMLElement} container - 컨테이너 요소
   */
  function highlightCode(container) {
    if (typeof hljs === 'undefined') return;
    container.querySelectorAll('pre code:not(.hljs)').forEach(block => {
      if (!block.classList.contains('language-mermaid')) {
        hljs.highlightElement(block);
      }
    });
  }

  // ============================================================
  // 5. Mermaid 다이어그램 렌더링
  // ============================================================
  /**
   * Mermaid 다이어그램 렌더링
   * @param {HTMLElement} container - 컨테이너 요소
   */
  async function renderMermaidDiagrams(container) {
    if (typeof mermaid === 'undefined') return;

    const blocks = container.querySelectorAll('code.language-mermaid');
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const code = block.textContent;
      const id = `mermaid-${i}-${Date.now()}`;
      const wrapper = document.createElement('div');
      wrapper.id = id;
      wrapper.className = 'mermaid';
      wrapper.textContent = code;
      wrapper.setAttribute('data-original-code', code);

      block.parentElement.replaceWith(wrapper);

      try {
        await mermaid.run({ nodes: [wrapper] });
      } catch (error) {
        console.error(`Mermaid rendering failed for diagram ${i}:`, error);
        wrapper.innerHTML = `
          <div class="mermaid-error" style="border: 1px solid #ffcccc; background: #fff5f5; padding: 10px; margin: 10px 0; border-radius: 4px;">
            <strong style="color: #cc0000;">⚠️ Diagram rendering failed</strong>
            <details style="margin-top: 8px;">
              <summary style="cursor: pointer; color: #666;">View code</summary>
              <pre style="background: #f5f5f5; padding: 10px; margin-top: 8px; border-radius: 4px; overflow-x: auto;"><code class="language-mermaid">${escapeHtml(code)}</code></pre>
            </details>
          </div>`;
      }
    }
  }

  // ============================================================
  // 6. TOC 생성
  // ============================================================
  /**
   * 문서에서 TOC 데이터 추출
   * @param {HTMLElement} container - 마크다운 컨테이너 요소
   * @returns {Array<{id: string, level: number, text: string}>} TOC 데이터
   */
  function generateTOC(container) {
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const tocData = [];

    headings.forEach(heading => {
      if (heading.classList.contains('document-title')) return;
      if (!heading.id) return;

      tocData.push({
        id: heading.id,
        level: parseInt(heading.tagName.substring(1)),
        text: heading.textContent.replace('🔗', '').trim()
      });
    });

    return tocData;
  }

  // ============================================================
  // 7. TOC 렌더링
  // ============================================================
  /**
   * TOC 데이터를 DOM에 렌더링
   * @param {Array} tocData - TOC 데이터 배열
   * @param {HTMLElement} tocTreeElement - TOC 트리 컨테이너
   * @param {Function} [onItemClick] - 항목 클릭 콜백
   */
  function renderTOC(tocData, tocTreeElement, onItemClick) {
    if (!tocTreeElement) return;

    tocTreeElement.innerHTML = '';

    if (tocData.length === 0) {
      tocTreeElement.innerHTML = '<p class="toc-empty">No headings found</p>';
      return;
    }

    tocData.forEach(item => {
      const tocItem = document.createElement('div');
      tocItem.className = 'toc-item';
      tocItem.dataset.level = item.level;
      tocItem.dataset.headingId = item.id;
      tocItem.textContent = item.text;
      tocItem.title = item.text;

      tocItem.addEventListener('click', () => {
        const target = document.getElementById(item.id);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (onItemClick) onItemClick(item);
      });

      tocTreeElement.appendChild(tocItem);
    });
  }

  // ============================================================
  // 8. 코드 블록 복사 버튼
  // ============================================================
  /**
   * 코드 블록에 복사 버튼 추가
   * @param {HTMLElement} container - 컨테이너 요소
   */
  function addCopyButtons(container) {
    container.querySelectorAll('pre code').forEach(code => {
      const pre = code.parentElement;
      if (pre.querySelector('.copy-btn')) return;

      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(code.textContent);
          btn.textContent = 'Copied!';
          setTimeout(() => btn.textContent = 'Copy', 2000);
        } catch (e) {
          btn.textContent = 'Failed';
          setTimeout(() => btn.textContent = 'Copy', 2000);
        }
      });

      pre.style.position = 'relative';
      pre.appendChild(btn);
    });
  }

  // ============================================================
  // 9. 제목 앵커 링크
  // ============================================================
  /**
   * 제목에 앵커 링크 추가
   * @param {HTMLElement} container - 컨테이너 요소
   */
  function addHeadingAnchors(container) {
    container.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
      if (!heading.id) return;
      if (heading.querySelector('.heading-anchor')) return;

      const anchor = document.createElement('a');
      anchor.className = 'heading-anchor';
      anchor.href = `#${heading.id}`;
      anchor.textContent = '🔗';
      anchor.title = 'Copy link';
      anchor.addEventListener('click', (e) => {
        e.preventDefault();
        const url = window.location.origin + window.location.pathname + '#' + heading.id;
        navigator.clipboard.writeText(url);
      });

      heading.appendChild(anchor);
    });
  }

  // ============================================================
  // 10. 통합 마크다운 렌더링
  // ============================================================
  /**
   * 마크다운 콘텐츠를 렌더링 (통합 함수)
   * @param {string} content - 마크다운 콘텐츠
   * @param {HTMLElement} container - 렌더링할 컨테이너
   * @param {Object} [options] - 옵션
   * @param {boolean} [options.enableWikiLinks=true] - Wiki 링크 처리 여부
   * @param {boolean} [options.enableTOC=true] - TOC 생성 여부
   * @param {boolean} [options.enableCopyButtons=true] - 복사 버튼 추가 여부
   * @param {boolean} [options.enableHeadingAnchors=true] - 제목 앵커 추가 여부
   * @param {HTMLElement} [options.tocTreeElement] - TOC 렌더링할 요소
   * @param {Function} [options.onTOCItemClick] - TOC 항목 클릭 콜백
   * @returns {Promise<{tocData: Array}>} 렌더링 결과
   */
  async function renderMarkdown(content, container, options = {}) {
    const {
      enableWikiLinks = true,
      enableTOC = true,
      enableCopyButtons = true,
      enableHeadingAnchors = true,
      tocTreeElement = null,
      onTOCItemClick = null
    } = options;

    // 1. Wiki 링크 전처리
    let processed = content;
    if (enableWikiLinks) {
      processed = preprocessWikiLinks(processed);
    }

    // 2. Marked 설정
    const renderer = createMarkedRenderer();
    marked.setOptions({
      breaks: true,
      gfm: true,
      renderer: renderer
    });

    // 3. 파싱
    const rawHtml = marked.parse(processed);

    // 4. HTML 정제
    const cleanHtml = sanitizeHtml(rawHtml);

    // 5. DOM에 삽입
    const wrapper = document.createElement('div');
    wrapper.className = 'markdown-content';
    wrapper.innerHTML = cleanHtml;
    container.innerHTML = '';
    container.appendChild(wrapper);

    // 6. 코드 하이라이팅
    highlightCode(wrapper);

    // 7. Mermaid
    await renderMermaidDiagrams(wrapper);

    // 8. 복사 버튼
    if (enableCopyButtons) {
      addCopyButtons(wrapper);
    }

    // 9. 제목 앵커
    if (enableHeadingAnchors) {
      addHeadingAnchors(wrapper);
    }

    // 10. TOC 생성
    let tocData = [];
    if (enableTOC) {
      tocData = generateTOC(wrapper);
      if (tocTreeElement) {
        renderTOC(tocData, tocTreeElement, onTOCItemClick);
      }
    }

    return { tocData, wrapper };
  }

  // ============================================================
  // 유틸리티
  // ============================================================
  /**
   * HTML 특수문자 이스케이프
   * @param {string} text - 원본 텍스트
   * @returns {string} 이스케이프된 텍스트
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================================
  // Public API
  // ============================================================
  return {
    // 개별 함수 (세밀한 제어 필요 시)
    preprocessWikiLinks,
    createMarkedRenderer,
    sanitizeHtml,
    highlightCode,
    renderMermaidDiagrams,
    generateTOC,
    renderTOC,
    addCopyButtons,
    addHeadingAnchors,
    escapeHtml,

    // 통합 함수 (간편 사용)
    renderMarkdown
  };
})();
