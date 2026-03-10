const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const BaseJsonStore = require('./base-json-store');

const BCRYPT_COST = 12;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;

class UserStore {
  constructor(dataDir) {
    this.store = new BaseJsonStore(
      path.join(dataDir, 'users.json'),
      { version: 1, updatedAt: null, users: [] }
    );
    this.users = [];
    this.emailIndex = new Map();     // Map<email, userId>
    this.userKeyIndex = new Map();   // Map<sha256(userKey), userId>
    this.idIndex = new Map();        // Map<userId, userObject>
    this._groupStore = null;
  }

  setGroupStore(groupStore) {
    this._groupStore = groupStore;
  }

  _rebuildIndexes() {
    this.emailIndex.clear();
    this.userKeyIndex.clear();
    this.idIndex.clear();
    for (const user of this.users) {
      this.emailIndex.set(user.email.toLowerCase(), user.id);
      if (user.userKeyHash) {
        this.userKeyIndex.set(user.userKeyHash, user.id);
      }
      this.idIndex.set(user.id, user);
    }
  }

  async initialize() {
    const data = this.store.load();
    this.users = data.users || [];
    this._rebuildIndexes();
  }

  getUserCount() {
    return this.users.length;
  }

  findByEmail(email) {
    const userId = this.emailIndex.get(email.toLowerCase());
    if (!userId) return null;
    const user = this.idIndex.get(userId);
    return user ? { ...user } : null;
  }

  findByUserKeyHash(hash) {
    const userId = this.userKeyIndex.get(hash);
    if (!userId) return null;
    const user = this.idIndex.get(userId);
    return user ? { ...user } : null;
  }

  findById(id) {
    const user = this.idIndex.get(id);
    return user ? { ...user } : null;
  }

  /** Get user with passwordHash for internal use (bcrypt compare) */
  _getWithHash(id) {
    return this.idIndex.get(id) || null;
  }

  findAll() {
    return this.users.map(u => {
      const { passwordHash, userKeyHash, userKey, ...safe } = u;
      return safe;
    });
  }

  /**
   * Create a new user.
   * @param {Object} userData - { email, password, groupId }
   * @returns {Object} { user, userKey } - userKey is the raw key (only returned on creation)
   */
  async create(userData) {
    const email = userData.email.toLowerCase().trim();

    // Email duplicate check
    if (this.emailIndex.has(email)) {
      const error = new Error('EMAIL_DUPLICATE');
      error.code = 'EMAIL_DUPLICATE';
      throw error;
    }

    const passwordHash = await bcrypt.hash(userData.password, BCRYPT_COST);
    const userKey = crypto.randomBytes(32).toString('hex');
    const userKeyHash = crypto.createHash('sha256').update(userKey).digest('hex');

    const now = new Date().toISOString();
    const user = {
      id: uuidv4(),
      email,
      passwordHash,
      groupId: userData.groupId,
      userKey,
      userKeyHash,
      status: 'active',
      lastLoginAt: null,
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt: now,
      updatedAt: now
    };

    this.users.push(user);
    this.emailIndex.set(email, user.id);
    this.userKeyIndex.set(userKeyHash, user.id);
    this.idIndex.set(user.id, user);

    await this.store.save({ version: 1, users: this.users });

    // Clear password from memory
    userData.password = '';

    const { passwordHash: _ph, userKeyHash: _ukh, userKey: _uk, ...safeUser } = user;
    return { user: safeUser, userKey };
  }

  async update(id, updates) {
    const user = this.idIndex.get(id);
    if (!user) {
      const error = new Error('USER_NOT_FOUND');
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    // Email change
    if (updates.email && updates.email.toLowerCase() !== user.email) {
      const newEmail = updates.email.toLowerCase().trim();
      if (this.emailIndex.has(newEmail)) {
        const error = new Error('EMAIL_DUPLICATE');
        error.code = 'EMAIL_DUPLICATE';
        throw error;
      }
      this.emailIndex.delete(user.email);
      user.email = newEmail;
      this.emailIndex.set(newEmail, user.id);
    }

    if (updates.groupId !== undefined) user.groupId = updates.groupId;
    if (updates.status !== undefined) user.status = updates.status;
    user.updatedAt = new Date().toISOString();

    await this.store.save({ version: 1, users: this.users });
    const { passwordHash, userKeyHash, userKey, ...safe } = user;
    return safe;
  }

  async delete(id) {
    const idx = this.users.findIndex(u => u.id === id);
    if (idx === -1) {
      const error = new Error('USER_NOT_FOUND');
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    const user = this.users[idx];

    // Prevent deleting last superuser
    if (this._groupStore) {
      const group = this._groupStore.findById(user.groupId);
      if (group && group.permissions.includes('superuser')) {
        const suCount = this.getSuperuserCount();
        if (suCount <= 1) {
          const error = new Error('LAST_SUPERUSER');
          error.code = 'LAST_SUPERUSER';
          throw error;
        }
      }
    }

    this.emailIndex.delete(user.email);
    if (user.userKeyHash) {
      this.userKeyIndex.delete(user.userKeyHash);
    }
    this.idIndex.delete(user.id);
    this.users.splice(idx, 1);

    await this.store.save({ version: 1, users: this.users });
  }

  /** Add a user with pre-hashed password (for signup approval) */
  async _addPreHashed(user) {
    if (this.emailIndex.has(user.email.toLowerCase())) {
      const error = new Error('EMAIL_DUPLICATE');
      error.code = 'EMAIL_DUPLICATE';
      throw error;
    }
    this.users.push(user);
    this.emailIndex.set(user.email.toLowerCase(), user.id);
    if (user.userKeyHash) {
      this.userKeyIndex.set(user.userKeyHash, user.id);
    }
    this.idIndex.set(user.id, user);
    await this.store.save({ version: 1, users: this.users });
  }

  async updatePassword(id, newPassword) {
    const user = this.idIndex.get(id);
    if (!user) {
      const error = new Error('USER_NOT_FOUND');
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    user.updatedAt = new Date().toISOString();
    await this.store.save({ version: 1, users: this.users });
  }

  async regenerateUserKey(id) {
    const user = this.idIndex.get(id);
    if (!user) {
      const error = new Error('USER_NOT_FOUND');
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    // Remove old index entry
    if (user.userKeyHash) {
      this.userKeyIndex.delete(user.userKeyHash);
    }

    const userKey = crypto.randomBytes(32).toString('hex');
    const userKeyHash = crypto.createHash('sha256').update(userKey).digest('hex');

    user.userKey = userKey;
    user.userKeyHash = userKeyHash;
    user.updatedAt = new Date().toISOString();

    this.userKeyIndex.set(userKeyHash, user.id);
    await this.store.save({ version: 1, users: this.users });

    return { userKey };
  }

  async incrementFailedLogin(id) {
    const user = this.idIndex.get(id);
    if (!user) return;

    user.failedLoginCount = (user.failedLoginCount || 0) + 1;
    if (user.failedLoginCount >= MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
    }
    await this.store.save({ version: 1, users: this.users });
  }

  async resetFailedLogin(id) {
    const user = this.idIndex.get(id);
    if (!user) return;

    user.failedLoginCount = 0;
    user.lockedUntil = null;
    await this.store.save({ version: 1, users: this.users });
  }

  async updateLastLogin(id) {
    const user = this.idIndex.get(id);
    if (!user) return;

    user.lastLoginAt = new Date().toISOString();
    await this.store.save({ version: 1, users: this.users });
  }

  getSuperuserCount() {
    if (!this._groupStore) return 0;
    let count = 0;
    for (const user of this.users) {
      if (user.status !== 'active') continue;
      const group = this._groupStore.findById(user.groupId);
      if (group && group.permissions.includes('superuser')) {
        count++;
      }
    }
    return count;
  }

  getMemberCount(groupId) {
    return this.users.filter(u => u.groupId === groupId).length;
  }
}

module.exports = UserStore;
