Tests
=====

This folder contains simple Node-based tests to validate the start/stop APIs, config watcher restart flow, and MCP tools functionality.

## Test Files

- `test-start-stop.js`: starts the server via `app.start()` then stops it.
- `test-watcher-restart.js`: starts the server, modifies `config.json5` (app root) to trigger watcher-based restart, expects the server to restart and then restores the original config.
- `test-mcp-tools.js`: tests the MCP tools implementation (DocuLight_get_config, DocuLight_search).

## Running Tests

```bash
# Basic start/stop test
node test/test-start-stop.js

# Config watcher restart test
node test/test-watcher-restart.js

# MCP tools integration test
node test/test-mcp-tools.js

# Run all tests
node test/test-start-stop.js && node test/test-watcher-restart.js && node test/test-mcp-tools.js
```

## MCP Tools Test Coverage

The MCP tools test validates:
- ✅ Tool registration (`tools/list` endpoint)
- ✅ `DocuLight_get_config` functionality
  - Config retrieval
  - Sensitive value masking (apiKey, ssl.key, etc.)
  - Section filtering
- ✅ `DocuLight_search` functionality
  - Document search with query
  - Result formatting
  - Statistics reporting
- ✅ Error handling
  - Query validation (minimum length)
  - Proper error responses

## Notes

- These are simple integration scripts (not a full test framework). They will modify `config.json5` — the watcher test backs up and restores the file.
- Run in a safe development environment.
- Tests automatically start and stop the server as needed.
