/**
 * Admin Auth Settings Controller (Phase 5)
 * Authentication settings management - superuser only
 */
const activityLogger = require('../../utils/activity-logger');

async function getSettings(req, res) {
  const { authSettingsStore } = req.app.locals.stores;
  const settings = authSettingsStore.get();
  res.json({ success: true, settings });
}

async function updateSettings(req, res) {
  const { authSettingsStore } = req.app.locals.stores;
  const { requireReadLogin, sessionTimeout, allowSignup, allowedEmailDomains, signupMode, selfSignup } = req.body;

  const updates = {};

  if (requireReadLogin !== undefined) {
    updates.requireReadLogin = !!requireReadLogin;
  }

  if (sessionTimeout !== undefined) {
    const timeout = Number(sessionTimeout);
    if (isNaN(timeout) || timeout < 60000) {
      return res.status(400).json({
        error: { code: 'INVALID_SETTING_VALUE', message: 'sessionTimeout must be at least 60000ms (1 minute)' }
      });
    }
    updates.sessionTimeout = timeout;
  }

  if (allowSignup !== undefined) {
    updates.allowSignup = !!allowSignup;
  }

  if (allowedEmailDomains !== undefined) {
    if (!Array.isArray(allowedEmailDomains)) {
      return res.status(400).json({
        error: { code: 'INVALID_SETTING_VALUE', message: 'allowedEmailDomains must be an array' }
      });
    }
    // Filter out empty strings
    updates.allowedEmailDomains = allowedEmailDomains
      .map(d => String(d).trim().toLowerCase())
      .filter(d => d.length > 0);
  }

  if (signupMode !== undefined) {
    if (!['approval', 'self'].includes(signupMode)) {
      return res.status(400).json({
        error: { code: 'INVALID_SETTING_VALUE', message: 'signupMode must be "approval" or "self"' }
      });
    }
    updates.signupMode = signupMode;
  }

  if (selfSignup !== undefined) {
    if (typeof selfSignup !== 'object' || selfSignup === null) {
      return res.status(400).json({
        error: { code: 'INVALID_SETTING_VALUE', message: 'selfSignup must be an object' }
      });
    }
    updates.selfSignup = selfSignup;
  }

  try {
    const settings = await authSettingsStore.update(updates);
    activityLogger.admin('SETTINGS_UPDATE', { section: 'auth', changes: Object.keys(updates), by: req.adminSession?.email || req.adminSession?.name || 'system' });
    res.json({ success: true, settings });
  } catch (err) {
    res.status(400).json({
      error: { code: 'INVALID_SETTING_VALUE', message: err.message }
    });
  }
}

module.exports = { getSettings, updateSettings };
