# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**DocLight** is a lightweight Markdown document viewer and management system built with Node.js + Express + EJS. It provides a web-based interface for browsing, viewing, and managing Markdown files with an Obsidian-style file tree and GitHub-style rendering.

### Key Capabilities
- File tree navigation (Obsidian-like sidebar)
- Markdown rendering (GitHub-flavored, with Mermaid diagram support)
- API-based file operations (upload, delete, download)
- Configuration-driven settings (JSON5 format with validation)
- Security: Path validation, API key authentication, XSS protection via DOMPurify
- Client-side state persistence (IndexedDB for tree expansion and last opened file)

## Development Commands

### Running the Application

```bash
# Development mode with auto-restart (nodemon)
npm run dev

# Production mode
npm start
```

The server runs on port 3000 by default (configurable via `config.json5`). Access the application at `http://localhost:3000`.

### Setup Configuration

Before first run:

```bash
# Copy example config
cp config.example.json5 config.json5

# Edit config.json5 with:
# - docsRoot: absolute path to document directory
# - apiKey: secure random string for API authentication
# - port, maxUploadMB, excludes, etc.
```

Application startup will fail if `config.json5` is missing or contains invalid settings (validation rules: src/utils/config-loader.js:31-40).

### Running Tests

```bash
# Manual tests (currently no automated test suite)
npm run test:startstop    # Server startup/shutdown test
npm run test:watcher      # File watcher restart test

# Browser tests (Playwright)
npm run test:folder-ui    # UI/UX testing for Step 9 features
```

Test reports are stored as markdown files in the root directory (TEST*.md).

## Architecture

### Server-Side Structure (src/)

**Entry Point: src/app.js**
- Loads configuration via `config-loader.js`
- Initializes Winston logger with daily file rotation
- Sets up Express app with EJS views
- Mounts API routes at `/api`
- Provides graceful shutdown on SIGTERM/SIGINT
- **Note**: Step 9 will add `/doc/*.md` route for file downloads and update routing order

**Request Flow**:
1. Request → `request-logger.js` middleware (Winston logging)
2. Route matching in `routes/api.js`
3. Public routes (GET /tree, /raw) → controllers directly
4. Protected routes (POST /upload, DELETE /entry, GET /download/*) → auth.js middleware → controllers
5. Controller logic with path validation and file operations
6. Response or error → `error-handler.js` middleware

**Controllers (src/controllers/)**:
- `tree-controller.js`: Directory tree generation with exclude pattern filtering
- `raw-controller.js`: Markdown file content retrieval
- `upload-controller.js`: Multer-based file upload with size limits
- `delete-controller.js`: File/directory deletion with async-lock for safety
- `download-controller.js`: Single file and directory (ZIP) downloads

**Key Utilities (src/utils/)**:
- `config-loader.js`: JSON5 config parsing with validation and defaults
- `logger.js`: Winston logger factory with daily file rotation
- `path-validator.js`: Security validation to prevent directory traversal
- `lock-manager.js`: AsyncLock wrapper for concurrent operation safety
- `backup-utils.js` & `config-watcher.js`: Config hot-reload support (Step 8)

**Middleware (src/middleware/)**:
- `auth.js`: API key validation via X-API-Key header
- `error-handler.js`: Centralized error handling with status code mapping
- `request-logger.js`: HTTP request/response logging

### Client-Side Structure (public/js/app.js)

**Main Components**:
- IndexedDB integration for tree state and last opened file persistence
- File tree rendering with expand/collapse persistence
- Markdown rendering with DOMPurify sanitization
- Mermaid.js diagram support
- Exponential backoff retry logic with error handling
- State management (ErrorHandler, TreeManager, FileViewer patterns)

**State Persistence**:
- IndexedDB `treeState` store: tree expansion state per path
- IndexedDB `lastOpened` store: auto-load last viewed file on revisit

**Step 9 Enhancements** (in progress):
- Clean URLs: Remove .md extension from display URLs
- Folder UI: Separate toggle (tree expand/collapse) from folder listing
- Document navigation: Previous/next links based on DFS ordering
- Wiki links: Support `[[/path/to/doc]]` syntax
- Image rendering: Validate and handle relative/absolute image paths

### Security Model

**Path Validation** (src/utils/path-validator.js):
- All file paths validated against `docsRoot` to prevent directory traversal
- Uses `path.resolve()` with containment check

**API Authentication**:
- Read operations (GET /tree, /raw): Public access
- Write operations (POST /upload, DELETE /entry, GET /download/*): Require X-API-Key header matching `config.apiKey`

**XSS Protection**:
- Client-side HTML sanitization via DOMPurify before Markdown rendering

**File Filtering**:
- Exclude patterns in config.json5 use `ignore` library (gitignore-compatible)
- Applied during tree generation to hide sensitive files

## Configuration System

`config.json5` (JSON5 format with comments) is loaded at startup.

**Required Fields**:
- `docsRoot`: Must be an existing directory (absolute path recommended)
- `apiKey`: Must be changed from default

**Optional Fields (with defaults)**:
- `maxUploadMB`: 10 (validated range: 1-1000)
- `port`: 3000
- `excludes`: [] (array of gitignore-style patterns)
- `logDir`: "./logs" (created if missing)
- `logLevel`: "info" (error|warn|info|debug)
- `ui.title`: "DocLight" (sidebar title)
- `ui.icon`: "/images/icon.png" (icon path)
- `hotReload`: Configuration hot-reload settings (Step 8 feature)
  - `enabled`: Enable file watcher for config changes
  - `allowPortSslAutoRestart`: Auto-restart server on port/SSL changes

See `config.example.json5` for complete documentation and all available options.

## API Endpoints

### Public (No Authentication Required)
- `GET /api/tree?path=<path>` — Directory tree structure
- `GET /api/raw?path=<file>` — Raw Markdown file content
- `GET /healthz` — Health check endpoint

### Protected (X-API-Key Header Required)
- `POST /api/upload?path=<dir>` — File upload (multipart/form-data, field: "file")
- `DELETE /api/entry?path=<path>` — Delete file or directory
- `GET /api/download/file?path=<file>` — Download single file
- `GET /api/download/dir?path=<dir>` — Download directory as ZIP

### Web Routes
- `GET /doc/* (without .md)` — Render Markdown document (Step 9)
- `GET /doc/*.md` — Download original Markdown file (Step 9)
- `GET /` — Main application interface

## Key Dependencies

- **express**: Web server framework
- **ejs**: Server-side templating
- **multer**: File upload handling
- **winston**: Logging with daily file rotation
- **winston-daily-rotate-file**: Daily log rotation
- **ignore**: Gitignore-style pattern matching for file exclusion
- **archiver**: ZIP creation for directory downloads
- **async-lock**: Concurrency control for file operations
- **json5**: JSON5 config file parsing with comments support
- **marked**: Markdown parsing and rendering
- **dompurify**: Client-side HTML sanitization
- **mermaid**: Diagram rendering support
- **puppeteer**: Headless Chrome (future PDF export capability)
- **chokidar** (optional): File system watcher for config hot-reload (Step 8)
- **adm-zip**: ZIP file manipulation
- **nodemon** (dev): Auto-reload on file changes
- **playwright** (dev): Browser automation and E2E testing

## Development Workflow

1. **Server code changes** (src/*) → nodemon automatically restarts server
2. **Client code changes** (public/js/app.js, public/css/style.css) → Browser refresh required
3. **View changes** (src/views/index.ejs) → Browser refresh required
4. **Check logs** in `logs/` directory (daily rotation files)

### Step 9 Development Focus

When implementing Step 9 features (Clean URLs, folder UI, document navigation, wiki links, image validation):

1. **Client-side changes** are primary (public/js/app.js, public/css/style.css)
2. **Server routing changes** needed for `/doc/*.md` download route
3. **Test with Playwright** for UI/UX features
4. **Update API documentation** (docs/api/api.md) if endpoints change
5. **Maintain backward compatibility** where possible

## Testing Strategy

### Current Test Suite
- Manual test reports stored as TEST*.md files in root directory
- No automated unit test suite currently configured

### Test Commands
```bash
# Startup/shutdown test
npm run test:startstop

# File watcher restart test
npm run test:watcher

# UI/UX tests (Playwright-based, for Step 9)
npm run test:folder-ui
```

### API Endpoint Testing
```bash
# Public endpoint
curl "http://localhost:3000/api/tree?path=/"

# Protected endpoint
curl -H "X-API-Key: your-api-key" -X DELETE "http://localhost:3000/api/entry?path=/test.md"

# Web routes (Step 9)
curl "http://localhost:3000/doc/guide/setup"        # Render (no .md)
curl "http://localhost:3000/doc/guide/setup.md"     # Download
```

### When Adding New Features
1. Create test case files in `test/` directory
2. Use Playwright for browser automation tests
3. Create manual test checklist in TEST*.md
4. Verify with both cURL and browser

## Production Deployment

Recommended: Use PM2 for process management
```bash
npm install -g pm2
pm2 start src/app.js --name DocLight
pm2 save
pm2 startup
```

## Important Notes

### Code Patterns and Conventions

**Path Safety**: All file operations must use `path-validator.js` to prevent directory traversal attacks. Never construct file paths directly from user input.

**Concurrency Control**: Deletion operations use `lock-manager.js` to prevent race conditions. This is critical for file system safety.

**Error Handling**: Controllers must use `next(error)` to pass errors to centralized `error-handler.js` middleware. Never send error responses directly.

**Logging**: Use `req.app.locals.logger` in routes/controllers for consistent logging. This ensures logs are written to daily-rotated files with proper formatting.

**Configuration Changes**: Server restart is required for config changes (even in dev mode with nodemon). The file watcher does not auto-reload all config properties.

**Git Workflow**: NEVER commit or push changes without explicit user instruction. Always wait for user to say "커밋" or "commit" before creating commits. Always wait for user to say "푸시" or "push" before pushing to remote.

**Process Management**: NEVER use `taskkill /F /IM node.exe` to kill Node.js processes. This command kills ALL Node.js processes including Claude Code itself, which will terminate the current session. Instead, use `start.bat` and `stop.bat` scripts in the project root for server management, or use PM2 commands (`pm2 stop doclight`, `pm2 restart doclight`).

### Step 8 Features (Already Implemented)
- Config hot-reload with file watcher (optional `chokidar`)
- Backup and rollback functionality
- Runtime configuration updates without full restart
- See `src/utils/config-watcher.js` and `src/utils/backup-utils.js`

### Testing Guidelines (from .github/instructions/)
- Test code belongs in `test/` directory
- Use Jest or Mocha for unit tests; Playwright for browser tests
- Tests must be independent and not rely on external systems
- Use mocks/stubs when needed
- Run tests in WSL environment if developing on Windows

## Current Development: Step 9 (UI/UX Improvements)

The project is currently in **Step 9: UI/UX Improvements — Clean URLs and Docusaurus-style Navigation**.

### Features Being Implemented

1. **Clean URLs** (P0)
   - Remove .md extension from rendered URLs (e.g., `/doc/guide/setup` instead of `/doc/guide/setup.md`)
   - .md URLs trigger file downloads instead of rendering
   - Backward compatible: existing .md URLs still work

2. **Folder UI Improvements** (P0)
   - Separate toggle icon (▶/▼) from folder name
   - Clicking toggle: expand/collapse tree
   - Clicking folder name: show folder contents as dynamic list view
   - Docusaurus-style presentation

3. **Document Navigation** (P1)
   - Previous/next links at bottom of documents
   - Based on DFS (depth-first search) ordering
   - Respects file structure

4. **Wiki Link Support** (P1)
   - Render `[[/path/to/doc]]` as clickable links
   - Supports relative and absolute paths
   - Clean URL output

5. **Image Rendering Validation** (P2)
   - Verify image paths (absolute, relative, external URLs)
   - Handle lazy loading
   - Test with Playwright

### Key Files to Modify

**Server:**
- `src/app.js` — Add `/doc/*.md` route for downloads

**Client:**
- `public/js/app.js` — Clean URLs, folder UI, navigation, wiki links, image handling
- `public/css/style.css` — Styling for new UI elements

**Documentation:**
- `docs/api/api.md` — Update with new download endpoint
- `docs/api/api-curl-example.md` — Add examples

**Tests:**
- `test/test-folder-ui.spec.js` — Playwright tests (new file)
- Test documents in `test-source/` (new files)

### Implementation Plan
See `docs/plan/plan.step9.md` for detailed implementation plan with phases, time estimates, and success criteria.

## File Organization

### Directory Structure
```
DocLight/
├── src/                      # Server code
│   ├── app.js               # Express app entry point
│   ├── controllers/         # Request handlers
│   ├── middleware/          # Express middleware
│   ├── routes/              # API routes
│   ├── utils/               # Utilities (config, logger, validators, etc.)
│   └── views/               # EJS templates
├── public/                  # Client files (static)
│   ├── js/                  # Client JavaScript
│   │   └── app.js          # Main client application
│   ├── css/                 # Stylesheets
│   └── images/              # Static images
├── test/                    # Test files
│   ├── test-*.js           # Node.js tests
│   └── *.spec.js           # Playwright tests
├── test-source/            # Test documents (Markdown)
├── docs/                    # Documentation
│   ├── plan/               # Step-by-step implementation plans
│   ├── api/                # API documentation
│   └── guide/              # User guides
├── logs/                    # Application logs (created at runtime)
├── config.example.json5     # Example configuration
└── package.json             # Dependencies
```

### Important Directories

**`docs/plan/`** — Implementation plans for each step (plan.step1.md through plan.step9.md)
- Each file contains detailed requirements, architecture, timeline, and success criteria
- Useful for understanding what's been done and what's coming next

**`test/`** — All test files
- `test-*.js`: Node.js/Express tests
- `*.spec.js`: Playwright browser tests

**`src/utils/`** — Reusable utilities
- Keep utilities focused and testable
- Use for cross-cutting concerns (logging, validation, config management)

## Common Development Patterns

### Adding a New API Endpoint

1. Create controller in `src/controllers/new-controller.js`
2. Add route in `src/routes/api.js`
3. Add authentication if needed (via `auth.js` middleware)
4. Use `path-validator.js` for path validation
5. Use `req.app.locals.logger` for logging
6. Use `next(error)` for error handling
7. Document in `docs/api/api.md`
8. Add tests in `test/`

### Modifying Client-Side Functionality

1. Edit `public/js/app.js` (main state management and functions)
2. Update `public/css/style.css` (styling)
3. Consider IndexedDB usage (see TreeManager for pattern)
4. Add Playwright tests if UI-focused
5. Verify in browser before committing

### Working with Configuration

1. Add new config option to `config.example.json5`
2. Update validation in `src/utils/config-loader.js`
3. Reference via `req.app.locals.config` in routes/controllers
4. Document defaults and validation rules in CLAUDE.md

## References and Documentation

- **Main README**: Check if exists for user-facing documentation
- **Plan Files**: `docs/plan/plan.step*.md` for step-by-step context
- **API Docs**: `docs/api/api.md` for endpoint documentation
- **Config Example**: `config.example.json5` for all available options
- **.github/instructions/**: `instructions.md` contains coding guidelines
