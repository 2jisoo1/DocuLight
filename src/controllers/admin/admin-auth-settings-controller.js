/**
 * Admin Auth Settings Controller (Phase 5)
 * Authentication settings management - superuser only
 */

async function getSettings(req, res) {
  const { authSettingsStore } = req.app.locals.stores;
  const settings = authSettingsStore.get();
  res.json({ success: true, settings });
}

async function updateSettings(req, res) {
  const { authSettingsStore } = req.app.locals.stores;
  const { requireReadLogin, sessionTimeout, allowSignup, allowedEmailDomains } = req.body;

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

  try {
    const settings = await authSettingsStore.update(updates);
    res.json({ success: true, settings });
  } catch (err) {
    res.status(400).json({
      error: { code: 'INVALID_SETTING_VALUE', message: err.message }
    });
  }
}

module.exports = { getSettings, updateSettings };
