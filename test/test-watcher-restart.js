// Test the config watcher and restart flow by modifying config.json5
const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');
const app = require('../src/app');

const configPath = path.join(process.cwd(), 'config.json5');
const backupPath = path.join(process.cwd(), 'config.json5.test.bak');

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
      // After first start, change config to trigger watcher restart
      setTimeout(() => {
        try {
          const raw = fs.readFileSync(configPath, 'utf8');
          const cfg = JSON5.parse(raw);
          cfg.ui = cfg.ui || {};
          cfg.ui.title = (cfg.ui.title || 'DocLight') + ' [test-change]';
          fs.writeFileSync(configPath, JSON5.stringify(cfg, null, 2), 'utf8');
          console.log('Wrote modified config to trigger restart');
        } catch (e) {
          console.error('Failed to write modified config', e && e.message);
        }
      }, 500);
    }

    if (starts >= 2) {
      console.log('Detected restart via watcher');
      // Restore original config
      try {
        fs.copyFileSync(backupPath, configPath);
      } catch (e) {
        console.error('Failed to restore original config', e && e.message);
      }

      // Stop the app and exit success
      const stopRes = await app.stop();
      console.log('Stop result after watcher test:', stopRes);
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
    console.error('Watcher test timed out');
    try { fs.copyFileSync(backupPath, configPath); } catch (e) {}
    await app.stop();
    process.exit(5);
  }, 30000);
}

main();
