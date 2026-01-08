// Test watcher restart when port changes in config.json5
const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');
const app = require('../src/app');

const configPath = path.join(process.cwd(), 'config.json5');
const backupPath = path.join(process.cwd(), 'config.json5.port.test.bak');

async function main() {
  if (!fs.existsSync(configPath)) {
    console.error('No config.json5 found in project root; cannot run test');
    process.exit(2);
  }

  // Backup original
  fs.copyFileSync(configPath, backupPath);

  let starts = 0;
  let timer = null;

  app.on('server:started', async () => {
    starts += 1;
    console.log('server:started #', starts);

    if (starts === 1) {
      // After first start, change port to trigger watcher restart
      setTimeout(() => {
        try {
          const raw = fs.readFileSync(configPath, 'utf8');
          const cfg = JSON5.parse(raw);
          cfg.port = 4001;
          fs.writeFileSync(configPath, JSON5.stringify(cfg, null, 2), 'utf8');
          console.log('Wrote modified config to change port to', cfg.port);
        } catch (e) {
          console.error('Failed to write modified config', e && e.message);
        }
      }, 500);
    }

    if (starts >= 2) {
      console.log('Detected restart via watcher');
      // Check that app is listening on new port by reading app.locals.config
      try {
        const cfg = app.locals.config || {};
        console.log('App current port from app.locals.config:', cfg.port);
      } catch (e) {
        console.error('Failed to read app.locals.config', e && e.message);
      }

      // Restore original config
      try {
        fs.copyFileSync(backupPath, configPath);
        console.log('Restored original config');
      } catch (e) {
        console.error('Failed to restore original config', e && e.message);
      }

      // Stop the app and exit success
      const stopRes = await app.stop();
      console.log('Stop result after watcher port change test:', stopRes);
      clearTimeout(timer);
      process.exit(stopRes.success ? 0 : 3);
    }
  });

  // Start the server
  const res = await app.start();
  if (!res.success) {
    console.error('Initial start failed:', res.error);
    // restore and exit
    try { fs.copyFileSync(backupPath, configPath); } catch (e) {}
    process.exit(4);
  }

  // Fallback timeout
  timer = setTimeout(async () => {
    console.error('Watcher port change test timed out');
    try { fs.copyFileSync(backupPath, configPath); } catch (e) {}
    await app.stop();
    process.exit(5);
  }, 30000);
}

main();
