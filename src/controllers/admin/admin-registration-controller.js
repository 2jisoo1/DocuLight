/**
 * Admin Registration Controller (Phase 7)
 * Manage signup requests - superuser only
 */
const emailService = require('../../services/email-service');
const activityLogger = require('../../utils/activity-logger');

async function listPending(req, res) {
  const { registrationStore } = req.app.locals.stores;
  const registrations = registrationStore.findPendingApproval();
  res.json({ success: true, registrations });
}

async function approve(req, res) {
  const { registrationStore, userStore, groupStore } = req.app.locals.stores;
  const { id } = req.params;
  const { groupId } = req.body;

  if (!groupId) {
    return res.status(400).json({
      error: { code: 'MISSING_GROUP', message: 'groupId is required' }
    });
  }

  const group = groupStore.findById(groupId);
  if (!group) {
    return res.status(400).json({
      error: { code: 'GROUP_NOT_FOUND', message: 'Group not found' }
    });
  }

  // Find registration
  const reg = registrationStore.registrations.find(r => r.id === id);
  if (!reg) {
    return res.status(404).json({
      error: { code: 'REGISTRATION_NOT_FOUND', message: 'Registration not found' }
    });
  }

  if (reg.status !== 'pending_approval') {
    return res.status(400).json({
      error: { code: 'INVALID_STATUS', message: 'Registration is not pending approval' }
    });
  }

  // Create user account (password already hashed during signup)
  const user = {
    id: require('uuid').v4(),
    email: reg.email,
    passwordHash: reg.passwordHash,
    groupId,
    userKeyHash: null,
    status: 'active',
    lastLoginAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Generate user-key
  const crypto = require('crypto');
  const userKey = crypto.randomBytes(32).toString('hex');
  user.userKeyHash = crypto.createHash('sha256').update(userKey).digest('hex');

  // Add to user store directly (bypass create to use pre-hashed password)
  await userStore._addPreHashed(user);

  // Update registration
  await registrationStore.updateStatus(id, 'approved', {
    reviewedBy: req.adminSession.userId,
    reviewedAt: new Date().toISOString(),
    assignedGroupId: groupId
  });

  // Send approval email
  const config = req.app.locals.config;
  const proto = config.ssl && config.ssl.enabled ? 'https' : 'http';
  const loginUrl = `${proto}://${req.headers.host || 'localhost'}/login`;
  await emailService.sendApprovalEmail(reg.email, loginUrl);

  activityLogger.auth('SIGNUP_APPROVED', { email: reg.email, by: req.adminSession?.email || req.adminSession?.name || 'system' });

  const { passwordHash, userKeyHash, ...safeUser } = user;
  res.json({ success: true, user: safeUser, userKey });
}

async function reject(req, res) {
  const { registrationStore } = req.app.locals.stores;
  const { id } = req.params;

  const reg = registrationStore.registrations.find(r => r.id === id);
  if (!reg) {
    return res.status(404).json({
      error: { code: 'REGISTRATION_NOT_FOUND', message: 'Registration not found' }
    });
  }

  if (reg.status !== 'pending_approval') {
    return res.status(400).json({
      error: { code: 'INVALID_STATUS', message: 'Registration is not pending approval' }
    });
  }

  await registrationStore.updateStatus(id, 'rejected', {
    reviewedBy: req.adminSession.userId,
    reviewedAt: new Date().toISOString()
  });

  activityLogger.auth('SIGNUP_REJECTED', { email: reg.email, by: req.adminSession?.email || req.adminSession?.name || 'system' });

  await emailService.sendRejectionEmail(reg.email);

  res.json({ success: true });
}

module.exports = { listPending, approve, reject };
