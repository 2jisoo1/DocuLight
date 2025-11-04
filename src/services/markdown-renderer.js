const { marked } = require('marked');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const hljs = require('highlight.js');

/**
 * Markdown Renderer Service
 * Server-side rendering with marked + DOMPurify + highlight.js
 *
 * @class MarkdownRenderer
 */
class MarkdownRenderer {
  /**
   * Create a MarkdownRenderer instance
   * @param {Object} logger - Logger instance
   */
  constructor(logger) {
    this.logger = logger;

    // Initialize DOMPurify with jsdom window
    const window = new JSDOM('').window;
    this.DOMPurify = createDOMPurify(window);

    // Configure marked renderer
    this.renderer = new marked.Renderer();
    this._configureRenderer();
  }

  /**
   * Configure custom marked renderer
   * @private
   */
  _configureRenderer() {
    // Custom heading renderer with ID generation
    this.renderer.heading = ({ text, depth, raw }) => {
      // Generate ID from heading text (slug format)
      // Keep alphanumeric, spaces, hyphens, and Korean characters (가-힣)
      const id = raw
        .toLowerCase()
        .replace(/[^\w\s\-가-힣]/gu, '')  // Keep Korean characters
        .replace(/\s+/g, '-')              // Replace spaces with hyphens
        .replace(/-+/g, '-')               // Replace multiple hyphens with single hyphen
        .replace(/^-+|-+$/g, '')           // Remove leading/trailing hyphens
        .trim();

      return `<h${depth} id="${id}">${text}</h${depth}>\n`;
    };

    // Custom image renderer with lazy loading
    this.renderer.image = ({ href, title, text }) => {
      const titleAttr = title ? ` title="${title}"` : '';
      const altAttr = text ? ` alt="${text}"` : '';
      return `<img src="${href}"${altAttr}${titleAttr} loading="lazy">`;
    };

    // Custom code renderer with highlight.js
    this.renderer.code = ({ text, lang, escaped }) => {
      // If language specified, use highlight.js
      if (lang && hljs.getLanguage(lang)) {
        try {
          const highlighted = hljs.highlight(text, { language: lang }).value;
          return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>\n`;
        } catch (error) {
          this.logger.warn('Failed to highlight code', { lang, error: error.message });
        }
      }

      // Fall back to plain code block
      const escapedText = escaped ? text : this._escapeHtml(text);
      const langClass = lang ? ` class="language-${lang}"` : '';
      return `<pre><code${langClass}>${escapedText}</code></pre>\n`;
    };
  }

  /**
   * Escape HTML special characters
   * @private
   */
  _escapeHtml(text) {
    const htmlEscapes = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };

    return text.replace(/[&<>"']/g, char => htmlEscapes[char]);
  }

  /**
   * Preprocess Wiki Links [[path]] → [name](url)
   * @param {string} markdown - Raw markdown content
   * @returns {string} Markdown with Wiki links converted to standard links
   * @private
   */
  _preprocessWikiLinks(markdown) {
    // Wiki link pattern: [[path]]
    const wikiLinkPattern = /\[\[([^\]]+)\]\]/g;

    return markdown.replace(wikiLinkPattern, (match, fullPath) => {
      // 1. Normalize path: trim + remove .md extension
      let cleanPath = fullPath.trim().replace(/\.md$/, '');

      // 2. Extract filename (for display)
      const parts = cleanPath.split('/').filter(p => p);
      const displayName = parts[parts.length - 1] || cleanPath;

      // 3. Generate Clean URL (/doc prefix)
      const url = `/doc${cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath}`;

      // 4. Convert to standard markdown link format
      return `[${displayName}](${url})`;
    });
  }

  /**
   * Render markdown to HTML
   * @param {string} markdown - Raw markdown content
   * @returns {Promise<{html: string, toc: Array}>} Rendered HTML and TOC
   */
  async render(markdown) {
    try {
      // Preprocess Wiki links before markdown parsing
      const preprocessed = this._preprocessWikiLinks(markdown);

      // Configure marked options
      marked.setOptions({
        breaks: true,              // GFM line breaks
        gfm: true,                 // GitHub Flavored Markdown
        renderer: this.renderer
      });

      // Parse markdown (with preprocessed Wiki links)
      const rawHtml = marked.parse(preprocessed);

      // Sanitize HTML with DOMPurify
      // Allow Highlight.js classes, heading IDs, and image attributes
      const cleanHtml = this.DOMPurify.sanitize(rawHtml, {
        ADD_ATTR: [
          'class',
          'data-language',
          'data-highlighted',
          'id',
          'loading',
          'title',
          'alt',
          'src',
          'width',
          'height'
        ],
        ADD_TAGS: ['span']
      });

      // Extract TOC (Phase 3 will implement this)
      const toc = this.extractTOC(cleanHtml);

      return {
        html: cleanHtml,
        toc: toc
      };
    } catch (error) {
      this.logger.error('Markdown rendering failed', {
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Extract Table of Contents from rendered HTML
   * @param {string} html - Rendered HTML
   * @returns {Array} TOC entries [{id, level, text}, ...]
   */
  extractTOC(html) {
    try {
      // Parse HTML with jsdom
      const window = new JSDOM(html).window;
      const document = window.document;

      // Find all heading elements (h1-h6)
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const tocData = [];

      headings.forEach(heading => {
        // Skip headings without IDs
        if (!heading.id) return;

        // Extract level from tag name (h1 -> 1, h2 -> 2, etc.)
        const level = parseInt(heading.tagName.substring(1));

        // Extract text content (strip any HTML tags)
        const text = heading.textContent.trim();

        tocData.push({
          id: heading.id,
          level: level,
          text: text
        });
      });

      return tocData;
    } catch (error) {
      this.logger.error('TOC extraction failed', {
        error: error.message,
        stack: error.stack
      });

      // Return empty array on error (graceful degradation)
      return [];
    }
  }
}

module.exports = MarkdownRenderer;
