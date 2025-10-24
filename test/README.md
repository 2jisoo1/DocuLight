Tests
=====

This folder contains simple Node-based tests to validate the start/stop APIs and the config watcher restart flow.

- `test-start-stop.js`: starts the server via `app.start()` then stops it.
- `test-watcher-restart.js`: starts the server, modifies `config.json5` (app root) to trigger watcher-based restart, expects the server to restart and then restores the original config.

Run tests with:

```
node test/test-start-stop.js
node test/test-watcher-restart.js
```

Notes:
- These are simple integration scripts (not a full test framework). They will modify `config.json5` — the watcher test backs up and restores the file.
- Run in a safe development environment.
