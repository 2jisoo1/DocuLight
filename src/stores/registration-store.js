const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const BaseJsonStore = require('./base-json-store');

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

class RegistrationStore {
  constructor(dataDir) {
    this.store = new BaseJsonStore(
      path.join(dataDir, 'pending-registrations.json'),
      { version: 1, updatedAt: null, registrations: [] }
    );
    this.registrations = [];
  }

  async initialize() {
    const data = this.store.load();
    this.registrations = data.registrations || [];
  }

  async create(registrationData) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date();

    const registration = {
      id: uuidv4(),
      email: registrationData.email.toLowerCase().trim(),
      passwordHash: registrationData.passwordHash,
      message: registrationData.message || '',
      verificationToken: tokenHash,
      verifiedAt: null,
      status: 'pending_verification',
      reviewedBy: null,
      reviewedAt: null,
      assignedGroupId: null,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + TOKEN_EXPIRY_MS).toISOString()
    };

    this.registrations.push(registration);
    await this.store.save({ version: 1, registrations: this.registrations });

    return { registration, token }; // Return raw token for email
  }

  findByToken(tokenHash) {
    return this.registrations.find(r => r.verificationToken === tokenHash) || null;
  }

  findByEmail(email) {
    const normalizedEmail = email.toLowerCase().trim();
    return this.registrations.filter(r =>
      r.email === normalizedEmail &&
      (r.status === 'pending_verification' || r.status === 'pending_approval')
    );
  }

  findPendingApproval() {
    return this.registrations
      .filter(r => r.status === 'pending_approval')
      .map(r => ({
        id: r.id,
        email: r.email,
        message: r.message,
        createdAt: r.createdAt,
        verifiedAt: r.verifiedAt
      }));
  }

  async updateStatus(id, status, additionalData = {}) {
    const reg = this.registrations.find(r => r.id === id);
    if (!reg) {
      const error = new Error('REGISTRATION_NOT_FOUND');
      error.code = 'REGISTRATION_NOT_FOUND';
      throw error;
    }

    reg.status = status;
    Object.assign(reg, additionalData);

    await this.store.save({ version: 1, registrations: this.registrations });
    return reg;
  }

  /**
   * Clean up expired/old registrations.
   * - pending_verification + token expired + 7 days → delete
   * - approved/rejected + 30 days → delete
   * - expired + 7 days → delete
   */
  async cleanup() {
    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

    const before = this.registrations.length;

    this.registrations = this.registrations.filter(r => {
      const createdAt = new Date(r.createdAt).getTime();
      const expiresAt = new Date(r.expiresAt).getTime();

      if (r.status === 'pending_verification' && expiresAt < now && (now - expiresAt) > SEVEN_DAYS) {
        return false;
      }
      if ((r.status === 'approved' || r.status === 'rejected') && (now - createdAt) > THIRTY_DAYS) {
        return false;
      }
      if (r.status === 'expired' && (now - createdAt) > SEVEN_DAYS) {
        return false;
      }
      return true;
    });

    if (this.registrations.length < before) {
      await this.store.save({ version: 1, registrations: this.registrations });
    }

    return before - this.registrations.length;
  }
}

module.exports = RegistrationStore;
