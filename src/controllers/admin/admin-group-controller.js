/**
 * Admin Group Controller (Phase 4)
 * CRUD operations for user groups - superuser only
 */

const activityLogger = require('../../utils/activity-logger');
const VALID_PERMISSIONS = ['superuser', 'write', 'read'];

async function listGroups(req, res) {
  const { groupStore } = req.app.locals.stores;
  const groups = groupStore.findAll();
  res.json({ success: true, groups });
}

async function createGroup(req, res) {
  const { groupStore } = req.app.locals.stores;
  const { name, permissions } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({
      error: { code: 'INVALID_NAME', message: 'Group name is required' }
    });
  }

  if (!Array.isArray(permissions) || permissions.length === 0) {
    return res.status(400).json({
      error: { code: 'INVALID_PERMISSIONS', message: 'At least one permission is required' }
    });
  }

  const invalidPerms = permissions.filter(p => !VALID_PERMISSIONS.includes(p));
  if (invalidPerms.length > 0) {
    return res.status(400).json({
      error: { code: 'INVALID_PERMISSIONS', message: `Invalid permissions: ${invalidPerms.join(', ')}` }
    });
  }

  try {
    const group = await groupStore.create({ name: name.trim(), permissions });
    activityLogger.admin('GROUP_CREATE', { name: group.name, by: req.adminSession?.email || req.adminSession?.name || 'system' });
    res.status(201).json({ success: true, group });
  } catch (err) {
    if (err.code === 'GROUP_NAME_DUPLICATE') {
      return res.status(409).json({ error: { code: err.code, message: err.message } });
    }
    throw err;
  }
}

async function updateGroup(req, res) {
  const { groupStore } = req.app.locals.stores;
  const { id } = req.params;
  const { name, permissions } = req.body;

  const existing = groupStore.findById(id);
  if (!existing) {
    return res.status(404).json({
      error: { code: 'GROUP_NOT_FOUND', message: 'Group not found' }
    });
  }

  if (permissions) {
    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        error: { code: 'INVALID_PERMISSIONS', message: 'Permissions must be an array' }
      });
    }
    const invalidPerms = permissions.filter(p => !VALID_PERMISSIONS.includes(p));
    if (invalidPerms.length > 0) {
      return res.status(400).json({
        error: { code: 'INVALID_PERMISSIONS', message: `Invalid permissions: ${invalidPerms.join(', ')}` }
      });
    }
  }

  try {
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (permissions !== undefined) updates.permissions = permissions;

    const group = await groupStore.update(id, updates);
    activityLogger.admin('GROUP_UPDATE', { name: group.name, changes: Object.keys(updates), by: req.adminSession?.email || req.adminSession?.name || 'system' });
    res.json({ success: true, group });
  } catch (err) {
    if (err.code === 'SYSTEM_GROUP_IMMUTABLE') {
      return res.status(403).json({ error: { code: err.code, message: err.message } });
    }
    if (err.code === 'GROUP_NAME_DUPLICATE') {
      return res.status(409).json({ error: { code: err.code, message: err.message } });
    }
    throw err;
  }
}

async function deleteGroup(req, res) {
  const { groupStore } = req.app.locals.stores;
  const { id } = req.params;

  const existing = groupStore.findById(id);
  if (!existing) {
    return res.status(404).json({
      error: { code: 'GROUP_NOT_FOUND', message: 'Group not found' }
    });
  }

  try {
    await groupStore.delete(id);
    activityLogger.admin('GROUP_DELETE', { name: existing.name, by: req.adminSession?.email || req.adminSession?.name || 'system' });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'SYSTEM_GROUP_CANNOT_DELETE') {
      return res.status(403).json({ error: { code: err.code, message: err.message } });
    }
    if (err.code === 'GROUP_HAS_MEMBERS') {
      return res.status(409).json({ error: { code: err.code, message: err.message } });
    }
    throw err;
  }
}

module.exports = { listGroups, createGroup, updateGroup, deleteGroup };
