const path = require('path');
const { v4: uuidv4 } = require('uuid');
const BaseJsonStore = require('./base-json-store');

const DEFAULT_GROUPS = [
  {
    name: 'Superuser',
    permissions: ['superuser', 'write', 'read'],
    isSystem: true
  },
  {
    name: 'Editor',
    permissions: ['write', 'read'],
    isSystem: true
  },
  {
    name: 'Viewer',
    permissions: ['read'],
    isSystem: true
  }
];

class GroupStore {
  constructor(dataDir) {
    this.store = new BaseJsonStore(
      path.join(dataDir, 'groups.json'),
      { version: 1, updatedAt: null, groups: [] }
    );
    this.groups = [];
    this._userStore = null; // Set externally to avoid circular dependency
  }

  setUserStore(userStore) {
    this._userStore = userStore;
  }

  async initialize() {
    const data = this.store.load();
    this.groups = data.groups || [];

    // Create default groups if file didn't exist
    if (this.groups.length === 0) {
      const now = new Date().toISOString();
      for (const def of DEFAULT_GROUPS) {
        this.groups.push({
          id: uuidv4(),
          name: def.name,
          permissions: [...def.permissions],
          isSystem: def.isSystem,
          createdAt: now,
          updatedAt: now
        });
      }
      await this.store.save({ version: 1, groups: this.groups });
    }
  }

  findAll() {
    return this.groups.map(g => ({ ...g }));
  }

  findById(id) {
    const group = this.groups.find(g => g.id === id);
    return group ? { ...group } : null;
  }

  findByName(name) {
    const group = this.groups.find(g => g.name.toLowerCase() === name.toLowerCase());
    return group ? { ...group } : null;
  }

  getSuperuserGroupId() {
    const su = this.groups.find(g => g.permissions.includes('superuser'));
    return su ? su.id : null;
  }

  async create(groupData) {
    // Duplicate name check
    if (this.findByName(groupData.name)) {
      const error = new Error('GROUP_NAME_DUPLICATE');
      error.code = 'GROUP_NAME_DUPLICATE';
      throw error;
    }

    const now = new Date().toISOString();
    const group = {
      id: uuidv4(),
      name: groupData.name,
      permissions: groupData.permissions || ['read'],
      isSystem: false,
      createdAt: now,
      updatedAt: now
    };

    this.groups.push(group);
    await this.store.save({ version: 1, groups: this.groups });
    return { ...group };
  }

  async update(id, updates) {
    const idx = this.groups.findIndex(g => g.id === id);
    if (idx === -1) {
      const error = new Error('GROUP_NOT_FOUND');
      error.code = 'GROUP_NOT_FOUND';
      throw error;
    }

    const group = this.groups[idx];

    // System group: permissions cannot be changed
    if (group.isSystem && updates.permissions) {
      const error = new Error('SYSTEM_GROUP_IMMUTABLE');
      error.code = 'SYSTEM_GROUP_IMMUTABLE';
      throw error;
    }

    // Name duplicate check (if name is being changed)
    if (updates.name && updates.name.toLowerCase() !== group.name.toLowerCase()) {
      if (this.findByName(updates.name)) {
        const error = new Error('GROUP_NAME_DUPLICATE');
        error.code = 'GROUP_NAME_DUPLICATE';
        throw error;
      }
    }

    if (updates.name !== undefined) group.name = updates.name;
    if (updates.permissions !== undefined && !group.isSystem) group.permissions = updates.permissions;
    group.updatedAt = new Date().toISOString();

    await this.store.save({ version: 1, groups: this.groups });
    return { ...group };
  }

  async delete(id) {
    const idx = this.groups.findIndex(g => g.id === id);
    if (idx === -1) {
      const error = new Error('GROUP_NOT_FOUND');
      error.code = 'GROUP_NOT_FOUND';
      throw error;
    }

    const group = this.groups[idx];

    if (group.isSystem) {
      const error = new Error('SYSTEM_GROUP_CANNOT_DELETE');
      error.code = 'SYSTEM_GROUP_CANNOT_DELETE';
      throw error;
    }

    // Check member count
    if (this._userStore) {
      const memberCount = this._userStore.getMemberCount(id);
      if (memberCount > 0) {
        const error = new Error('GROUP_HAS_MEMBERS');
        error.code = 'GROUP_HAS_MEMBERS';
        throw error;
      }
    }

    this.groups.splice(idx, 1);
    await this.store.save({ version: 1, groups: this.groups });
  }

  getMemberCount(groupId) {
    if (!this._userStore) return 0;
    return this._userStore.getMemberCount(groupId);
  }
}

module.exports = GroupStore;
