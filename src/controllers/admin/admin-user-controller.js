/**
 * Admin User Controller (Phase 4)
 * CRUD operations for users - superuser only
 */

const sessionService = require('../../services/session-service');
const activityLogger = require('../../utils/activity-logger');

async function listUsers(req, res) {
  const { userStore, groupStore } = req.app.locals.stores;
  const users = userStore.findAll();

  // Enrich with group name
  const enriched = users.map(u => {
    const group = groupStore.findById(u.groupId);
    return { ...u, groupName: group ? group.name : 'Unknown' };
  });

  res.json({ success: true, users: enriched });
}

async function createUser(req, res) {
  const { userStore, groupStore } = req.app.locals.stores;
  const { email, password, groupId } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      error: { code: 'INVALID_EMAIL', message: 'Valid email is required' }
    });
  }

  if (!password || password.length < 8) {
    return res.status(400).json({
      error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters' }
    });
  }

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

  try {
    const result = await userStore.create({ email, password, groupId });
    activityLogger.admin('USER_CREATE', { email, group: group.name, by: req.adminSession?.email || req.adminSession?.name || 'system' });
    res.status(201).json({ success: true, user: result.user, userKey: result.userKey });
  } catch (err) {
    if (err.code === 'EMAIL_DUPLICATE') {
      return res.status(409).json({ error: { code: err.code, message: 'Email already registered' } });
    }
    throw err;
  }
}

async function updateUser(req, res) {
  const { userStore, groupStore } = req.app.locals.stores;
  const { id } = req.params;
  const { groupId, status } = req.body;

  const existing = userStore.findById(id);
  if (!existing) {
    return res.status(404).json({
      error: { code: 'USER_NOT_FOUND', message: 'User not found' }
    });
  }

  // Validate group exists
  if (groupId) {
    const group = groupStore.findById(groupId);
    if (!group) {
      return res.status(400).json({
        error: { code: 'GROUP_NOT_FOUND', message: 'Group not found' }
      });
    }
  }

  // Last superuser protection: prevent demotion or disable
  const currentGroup = groupStore.findById(existing.groupId);
  const isSuperuser = currentGroup && currentGroup.permissions.includes('superuser');

  if (isSuperuser && userStore.getSuperuserCount() <= 1) {
    // Demoting to non-superuser group?
    if (groupId && groupId !== existing.groupId) {
      const newGroup = groupStore.findById(groupId);
      if (!newGroup || !newGroup.permissions.includes('superuser')) {
        return res.status(403).json({
          error: { code: 'LAST_SUPERUSER_PROTECTED', message: 'Cannot demote the last superuser' }
        });
      }
    }
    // Disabling?
    if (status === 'disabled') {
      return res.status(403).json({
        error: { code: 'LAST_SUPERUSER_PROTECTED', message: 'Cannot disable the last superuser' }
      });
    }
  }

  const updates = {};
  if (groupId !== undefined) updates.groupId = groupId;
  if (status !== undefined) updates.status = status;

  const user = await userStore.update(id, updates);
  activityLogger.admin('USER_UPDATE', { email: existing.email, changes: Object.keys(updates), by: req.adminSession?.email || req.adminSession?.name || 'system' });

  // If disabled, invalidate all sessions
  if (status === 'disabled') {
    sessionService.invalidateByUserId(id);
  }

  res.json({ success: true, user });
}

async function deleteUser(req, res) {
  const { userStore } = req.app.locals.stores;
  const { id } = req.params;

  // Cannot delete self
  if (req.adminSession && req.adminSession.userId === id) {
    return res.status(403).json({
      error: { code: 'CANNOT_DELETE_SELF', message: 'Cannot delete your own account' }
    });
  }

  const existing = userStore.findById(id);
  if (!existing) {
    return res.status(404).json({
      error: { code: 'USER_NOT_FOUND', message: 'User not found' }
    });
  }

  try {
    await userStore.delete(id);
    sessionService.invalidateByUserId(id);
    activityLogger.admin('USER_DELETE', { email: existing.email, by: req.adminSession?.email || req.adminSession?.name || 'system' });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'LAST_SUPERUSER') {
      return res.status(403).json({
        error: { code: 'LAST_SUPERUSER_PROTECTED', message: 'Cannot delete the last superuser' }
      });
    }
    throw err;
  }
}

async function resetPassword(req, res) {
  const { userStore } = req.app.locals.stores;
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({
      error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters' }
    });
  }

  const existing = userStore.findById(id);
  if (!existing) {
    return res.status(404).json({
      error: { code: 'USER_NOT_FOUND', message: 'User not found' }
    });
  }

  await userStore.updatePassword(id, newPassword);
  await userStore.resetFailedLogin(id);
  res.json({ success: true });
}

async function unlockUser(req, res) {
  const { userStore } = req.app.locals.stores;
  const { id } = req.params;

  const existing = userStore.findById(id);
  if (!existing) {
    return res.status(404).json({
      error: { code: 'USER_NOT_FOUND', message: 'User not found' }
    });
  }

  await userStore.resetFailedLogin(id);
  res.json({ success: true });
}

module.exports = { listUsers, createUser, updateUser, deleteUser, resetPassword, unlockUser };
