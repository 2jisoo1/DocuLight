const bcrypt = require('bcrypt');
const crypto = require('crypto');
const sessionService = require('../services/session-service');
const emailService = require('../services/email-service');
const activityLogger = require('../utils/activity-logger');

/**
 * POST /api/auth/setup — Create initial superuser
 */
async function setup(req, res) {
  const { userStore, groupStore, authSettingsStore } = req.app.locals.stores;

  // Already set up?
  if (userStore.getUserCount() > 0) {
    return res.status(403).json({
      error: { code: 'SETUP_ALREADY_COMPLETE', message: 'Setup has already been completed' }
    });
  }

  const { email, password, passwordConfirm } = req.body;

  // Validate email
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      error: { code: 'INVALID_EMAIL', message: '유효한 이메일 주소를 입력하세요' }
    });
  }

  // Validate password
  if (!password || password.length < 8) {
    return res.status(400).json({
      error: { code: 'WEAK_PASSWORD', message: '패스워드는 최소 8자 이상이어야 합니다' }
    });
  }

  if (password !== passwordConfirm) {
    return res.status(400).json({
      error: { code: 'PASSWORD_MISMATCH', message: '패스워드가 일치하지 않습니다' }
    });
  }

  try {
    // Ensure groups are initialized
    await groupStore.initialize();

    const superuserGroupId = groupStore.getSuperuserGroupId();
    if (!superuserGroupId) {
      return res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create default groups' }
      });
    }

    // Create superuser
    const result = await userStore.create({ email, password, groupId: superuserGroupId });

    // Initialize auth settings
    const config = req.app.locals.config;
    await authSettingsStore.initialize(config);

    // Update setup guard flag
    const { resetSetupFlag } = require('../middleware/setup-guard');
    // The setup guard will detect getUserCount() > 0 on next request

    res.status(201).json({ success: true, userKey: result.userKey });
  } catch (err) {
    if (err.code === 'EMAIL_DUPLICATE') {
      return res.status(409).json({
        error: { code: 'EMAIL_DUPLICATE', message: '이미 등록된 이메일입니다' }
      });
    }
    const logger = req.app.locals.logger || console;
    logger.error('Setup error', { error: err.message });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Setup failed' }
    });
  }
}

/**
 * POST /api/auth/login — Email/password login
 */
async function login(req, res) {
  const { userStore, groupStore, authSettingsStore } = req.app.locals.stores;
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: { code: 'MISSING_FIELDS', message: 'Email and password are required' }
    });
  }

  const user = userStore.findByEmail(email);

  // User not found — still run bcrypt to prevent timing attacks
  if (!user) {
    await bcrypt.hash('dummy', 12);
    activityLogger.authWarn('LOGIN_FAILED', { email, ip: req.ip, reason: 'USER_NOT_FOUND' });
    return res.status(401).json({
      error: { code: 'INVALID_CREDENTIALS', message: '이메일 또는 패스워드가 올바르지 않습니다' }
    });
  }

  // Check account status
  if (user.status === 'disabled') {
    return res.status(401).json({
      error: { code: 'ACCOUNT_DISABLED', message: '비활성화된 계정입니다' }
    });
  }

  // Check lock
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    // Run bcrypt anyway for timing consistency
    await bcrypt.compare(password, user.passwordHash);
    return res.status(429).json({
      error: { code: 'TOO_MANY_ATTEMPTS', message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요' }
    });
  }

  // Verify password
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await userStore.incrementFailedLogin(user.id);
    activityLogger.authWarn('LOGIN_FAILED', { email, ip: req.ip, reason: 'INVALID_PASSWORD' });
    return res.status(401).json({
      error: { code: 'INVALID_CREDENTIALS', message: '이메일 또는 패스워드가 올바르지 않습니다' }
    });
  }

  // Success — reset failed login, update last login
  await userStore.resetFailedLogin(user.id);
  await userStore.updateLastLogin(user.id);

  // Get group permissions
  const group = groupStore.findById(user.groupId);
  const permissions = group ? group.permissions : ['read'];

  // Create session
  const authSettings = authSettingsStore.get();
  const session = sessionService.createSessionForUser(user, permissions, authSettings);

  // Set cookie
  const config = req.app.locals.config;
  res.cookie('doclight_admin_session', session.token, {
    httpOnly: true,
    sameSite: 'Strict',
    secure: !!(config.ssl && config.ssl.enabled),
    path: '/',
    maxAge: authSettings.sessionTimeout
  });

  // Clear password from memory
  req.body.password = '';

  activityLogger.auth('LOGIN', { email: user.email, ip: req.ip });

  res.json({
    success: true,
    session: {
      name: user.email,
      permissions,
      expiresAt: session.expiresAt
    }
  });
}

/**
 * POST /api/auth/logout
 */
function logout(req, res) {
  const token = extractToken(req);
  if (token) {
    const session = sessionService.getSession(token);
    if (session) {
      activityLogger.auth('LOGOUT', { email: session.email || session.name, ip: req.ip });
    }
    sessionService.invalidateSession(token);
  }

  res.clearCookie('doclight_admin_session', { path: '/' });
  res.json({ success: true });
}

/**
 * GET /api/auth/session — Get current session info
 */
function getSession(req, res) {
  const token = extractToken(req);
  const session = token ? sessionService.validateSession(token) : null;

  if (!session) {
    return res.status(401).json({
      error: { code: 'NOT_AUTHENTICATED', message: 'Not authenticated' }
    });
  }

  res.json({
    success: true,
    session: {
      userId: session.userId,
      email: session.email,
      permissions: session.permissions,
      expiresAt: session.expiresAt
    }
  });
}

/**
 * POST /api/auth/session/refresh — Extend session timeout
 */
function refreshSession(req, res) {
  const token = extractToken(req);
  const session = token ? sessionService.validateSession(token) : null;

  if (!session) {
    return res.status(401).json({
      error: { code: 'NOT_AUTHENTICATED', message: 'Not authenticated' }
    });
  }

  const { authSettingsStore } = req.app.locals.stores;
  const authSettings = authSettingsStore.get();
  const refreshed = sessionService.refreshSession(token, authSettings);

  if (!refreshed) {
    return res.status(401).json({
      error: { code: 'SESSION_EXPIRED', message: 'Session expired' }
    });
  }

  res.json({
    success: true,
    session: {
      expiresAt: refreshed.expiresAt
    }
  });
}

/**
 * GET /api/auth/me — My profile info
 */
function getMe(req, res) {
  const token = extractToken(req);
  const session = token ? sessionService.validateSession(token) : null;

  if (!session || !session.userId) {
    return res.status(401).json({
      error: { code: 'NOT_AUTHENTICATED', message: 'Not authenticated' }
    });
  }

  const { userStore, groupStore } = req.app.locals.stores;
  const user = userStore.findById(session.userId);
  if (!user) {
    return res.status(404).json({
      error: { code: 'USER_NOT_FOUND', message: 'User not found' }
    });
  }

  const group = groupStore.findById(user.groupId);

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      groupName: group ? group.name : 'Unknown',
      permissions: group ? group.permissions : ['read'],
      userKey: user.userKey || null,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt
    }
  });
}

/**
 * PUT /api/auth/me/password — Change own password
 */
async function changePassword(req, res) {
  const token = extractToken(req);
  const session = token ? sessionService.validateSession(token) : null;

  if (!session || !session.userId) {
    return res.status(401).json({
      error: { code: 'NOT_AUTHENTICATED', message: 'Not authenticated' }
    });
  }

  const { currentPassword, newPassword, newPasswordConfirm } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      error: { code: 'MISSING_FIELDS', message: 'currentPassword and newPassword are required' }
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters' }
    });
  }

  if (newPassword !== newPasswordConfirm) {
    return res.status(400).json({
      error: { code: 'PASSWORD_MISMATCH', message: 'New passwords do not match' }
    });
  }

  const { userStore } = req.app.locals.stores;
  // Need the full user with passwordHash for comparison
  const user = userStore.findById(session.userId);
  if (!user) {
    return res.status(404).json({
      error: { code: 'USER_NOT_FOUND', message: 'User not found' }
    });
  }

  // findById returns a copy without passwordHash, get the real one
  const realUser = userStore._getWithHash(session.userId);
  const valid = await bcrypt.compare(currentPassword, realUser.passwordHash);
  if (!valid) {
    return res.status(401).json({
      error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' }
    });
  }

  await userStore.updatePassword(session.userId, newPassword);
  req.body.currentPassword = '';
  req.body.newPassword = '';
  req.body.newPasswordConfirm = '';
  res.json({ success: true });
}

/**
 * POST /api/auth/me/regenerate-key — Regenerate user-key
 */
async function regenerateKey(req, res) {
  const token = extractToken(req);
  const session = token ? sessionService.validateSession(token) : null;

  if (!session || !session.userId) {
    return res.status(401).json({
      error: { code: 'NOT_AUTHENTICATED', message: 'Not authenticated' }
    });
  }

  const { userStore } = req.app.locals.stores;
  const result = await userStore.regenerateUserKey(session.userId);
  res.json({ success: true, userKey: result.userKey });
}

function extractToken(req) {
  // From cookie
  if (req.cookies && req.cookies.doclight_admin_session) {
    return req.cookies.doclight_admin_session;
  }
  // From Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

/**
 * POST /api/auth/signup — Request signup
 */
async function signup(req, res) {
  const { userStore, authSettingsStore, registrationStore } = req.app.locals.stores;
  const settings = authSettingsStore.get();

  if (!settings.allowSignup) {
    return res.status(403).json({
      error: { code: 'SIGNUP_DISABLED', message: 'Signup is not allowed' }
    });
  }

  const { email, password, passwordConfirm, message } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      error: { code: 'INVALID_EMAIL', message: 'Valid email is required' }
    });
  }

  // Domain restriction
  if (settings.allowedEmailDomains && settings.allowedEmailDomains.length > 0) {
    const domain = email.split('@')[1].toLowerCase();
    if (!settings.allowedEmailDomains.includes(domain)) {
      return res.status(400).json({
        error: { code: 'EMAIL_DOMAIN_NOT_ALLOWED', message: 'Email domain is not allowed' }
      });
    }
  }

  if (!password || password.length < 8) {
    return res.status(400).json({
      error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters' }
    });
  }

  if (password !== passwordConfirm) {
    return res.status(400).json({
      error: { code: 'PASSWORD_MISMATCH', message: 'Passwords do not match' }
    });
  }

  // Check existing user
  if (userStore.findByEmail(email)) {
    return res.status(409).json({
      error: { code: 'EMAIL_ALREADY_REGISTERED', message: 'Email is already registered' }
    });
  }

  // ── 직접 가입 흐름 (signupMode === "self") ──
  const signupMode = settings.signupMode || 'approval';
  if (signupMode === 'self') {
    const { groupStore } = req.app.locals.stores;
    const defaultGroupName = settings.selfSignup?.defaultGroupName || 'Viewer';
    let group = groupStore.findByName(defaultGroupName);
    if (!group) {
      group = groupStore.findByName('Viewer');
      if (!group) {
        return res.status(500).json({
          error: { code: 'GROUP_NOT_FOUND', message: 'Default group not found' }
        });
      }
    }

    const result = await userStore.create({ email, password, groupId: group.id });
    req.body.password = '';
    req.body.passwordConfirm = '';

    const session = sessionService.createSessionForUser(
      result.user, group.permissions, settings
    );

    const config = req.app.locals.config;
    res.cookie('doclight_admin_session', session.token, {
      httpOnly: true,
      sameSite: 'Strict',
      secure: !!(config.ssl && config.ssl.enabled),
      path: '/',
      maxAge: settings.sessionTimeout
    });

    activityLogger.auth('SIGNUP_SELF', {
      email: email,
      ip: req.ip,
      group: group.name
    });

    return res.json({
      success: true,
      mode: 'self',
      session: {
        permissions: session.permissions,
        expiresAt: session.expiresAt
      }
    });
  }

  // ── 승인 기반 흐름 (기존 코드 유지) ──

  // Check pending registrations
  const pending = registrationStore.findByEmail(email);
  if (pending.length > 0) {
    return res.status(409).json({
      error: { code: 'EMAIL_ALREADY_PENDING', message: 'A signup request for this email is already pending' }
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  req.body.password = '';
  req.body.passwordConfirm = '';
  const result = await registrationStore.create({ email, passwordHash, message: message || '' });

  activityLogger.auth('SIGNUP_REQUEST', { email, ip: req.ip });

  // Check SMTP availability
  const smtpAvailable = emailService.isConfigured() && await emailService.verify();

  if (smtpAvailable) {
    // Send verification email
    const config = req.app.locals.config;
    const basePath = (config && config.basePath) || '';
    const proto = config.ssl && config.ssl.enabled ? 'https' : 'http';
    const baseUrl = `${proto}://${req.headers.host}${basePath}`;
    await emailService.sendVerificationEmail(email, result.token, baseUrl);

    res.status(201).json({ success: true, emailSent: true, message: '인증 이메일이 발송되었습니다. 이메일의 링크를 클릭해주세요.' });
  } else {
    // No SMTP — skip verification, go straight to pending_approval
    await registrationStore.updateStatus(result.registration.id, 'pending_approval', {
      verifiedAt: new Date().toISOString()
    });

    res.status(201).json({ success: true, emailSent: false, message: '가입 요청이 완료되었습니다. 관리자 승인을 기다려주세요.' });
  }
}

/**
 * GET /api/auth/verify/:token — Verify email
 */
async function verifyEmail(req, res) {
  const { registrationStore } = req.app.locals.stores;
  const config = req.app.locals.config;
  const basePath = (config && config.basePath) || '';
  const token = req.params.token;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const reg = registrationStore.findByToken(tokenHash);

  if (!reg) {
    return res.redirect(basePath + '/signup?error=INVALID_TOKEN');
  }

  if (reg.status !== 'pending_verification') {
    return res.redirect(basePath + '/signup?error=ALREADY_VERIFIED');
  }

  // Check expiry
  if (new Date(reg.expiresAt) < new Date()) {
    await registrationStore.updateStatus(reg.id, 'expired');
    return res.redirect(basePath + '/signup?error=TOKEN_EXPIRED');
  }

  await registrationStore.updateStatus(reg.id, 'pending_approval', {
    verifiedAt: new Date().toISOString()
  });

  res.redirect(basePath + '/signup?verified=true');
}

module.exports = { setup, login, logout, getSession, refreshSession, getMe, changePassword, regenerateKey, signup, verifyEmail };
