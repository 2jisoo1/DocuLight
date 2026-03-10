const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');
const lockManager = require('../utils/lock-manager');

class AuthSettingsStore {
  constructor() {
    this.config = null;
  }

  /**
   * Initialize store from config.auth block.
   * @param {Object} config - Application config (must have config.auth)
   */
  async initialize(config) {
    this.config = config;
  }

  get() {
    const auth = this.config && this.config.auth;
    if (!auth) {
      return {
        requireReadLogin: false,
        sessionTimeout: 3600000,
        allowSignup: true,
        allowedEmailDomains: []
      };
    }
    return {
      requireReadLogin: !!auth.requireReadLogin,
      sessionTimeout: auth.sessionTimeout,
      allowSignup: auth.allowSignup !== false,
      allowedEmailDomains: auth.allowedEmailDomains || []
    };
  }

  /**
   * Update auth settings by modifying config.json5 directly.
   * Hot-reload will pick up the change and restart.
   * @param {Object} updates - Fields to update
   * @returns {Object} Updated settings
   */
  async update(updates) {
    // Apply updates to in-memory config first
    const auth = this.config.auth;
    if (updates.requireReadLogin !== undefined) {
      auth.requireReadLogin = !!updates.requireReadLogin;
    }
    if (updates.sessionTimeout !== undefined) {
      auth.sessionTimeout = Math.max(60000, updates.sessionTimeout);
    }
    if (updates.allowSignup !== undefined) {
      auth.allowSignup = !!updates.allowSignup;
    }
    if (updates.allowedEmailDomains !== undefined) {
      auth.allowedEmailDomains = updates.allowedEmailDomains;
    }

    // Write to config.json5
    await this._writeToConfig(auth);

    return this.get();
  }

  /**
   * Read config.json5, update auth block, write back.
   * @param {Object} authValues - New auth block values
   */
  async _writeToConfig(authValues) {
    const configPath = path.join(process.cwd(), 'config.json5');

    await lockManager.acquire('config:auth-settings', async () => {
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON5.parse(content);

      parsed.auth = {
        requireReadLogin: authValues.requireReadLogin,
        sessionTimeout: authValues.sessionTimeout,
        allowSignup: authValues.allowSignup,
        allowedEmailDomains: authValues.allowedEmailDomains
      };

      const tmpPath = configPath + '.auth.tmp';
      fs.writeFileSync(tmpPath, JSON5.stringify(parsed, null, 2), 'utf-8');
      fs.renameSync(tmpPath, configPath);
    });
  }
}

module.exports = AuthSettingsStore;
