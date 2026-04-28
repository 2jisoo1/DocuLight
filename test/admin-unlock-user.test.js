const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const UserStore = require('../src/stores/user-store');

function makeTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doclight-user-store-'));
  return dir;
}

async function createLockedUser(dataDir) {
  const store = new UserStore(dataDir);
  await store.initialize();
  const { user } = await store.create({
    email: 'locked@example.com',
    password: 'password123',
    groupId: 'g-test'
  });
  const internal = store._getWithHash(user.id);
  internal.failedLoginCount = 5;
  internal.lockedUntil = new Date(Date.now() + 60_000).toISOString();
  await store.store.save({ version: 1, users: store.users });
  return { store, userId: user.id };
}

test('resetFailedLogin: 잠긴 사용자의 failedLoginCount/lockedUntil 리셋', async () => {
  const dir = makeTmpDir();
  const { store, userId } = await createLockedUser(dir);

  await store.resetFailedLogin(userId);

  const after = store.findById(userId);
  assert.strictEqual(after.failedLoginCount, 0, 'failedLoginCount must be 0');
  assert.strictEqual(after.lockedUntil, null, 'lockedUntil must be null');
});

test('resetFailedLogin: 영속화 검증 - 재로드 후에도 리셋 상태 유지', async () => {
  const dir = makeTmpDir();
  const { store, userId } = await createLockedUser(dir);

  await store.resetFailedLogin(userId);

  const reloaded = new UserStore(dir);
  await reloaded.initialize();
  const after = reloaded.findById(userId);
  assert.strictEqual(after.failedLoginCount, 0, 'persisted failedLoginCount must be 0');
  assert.strictEqual(after.lockedUntil, null, 'persisted lockedUntil must be null');
});

test('resetFailedLogin: 존재하지 않는 id는 USER_NOT_FOUND 에러를 throw', async () => {
  const dir = makeTmpDir();
  const store = new UserStore(dir);
  await store.initialize();

  await assert.rejects(
    () => store.resetFailedLogin('nonexistent-id'),
    (err) => err && err.code === 'USER_NOT_FOUND'
  );
});
