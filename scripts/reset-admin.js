#!/usr/bin/env node
/**
 * CLI Password Reset Tool for DocLight Superusers
 * Usage: node scripts/reset-admin.js --email admin@example.com --password newPass123!
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const JSON5 = require('json5');

const BCRYPT_COST = 12;

function printUsage() {
  console.log('Usage: node scripts/reset-admin.js --email <email> --password <new-password>');
  console.log('');
  console.log('Options:');
  console.log('  --email     Superuser email address (required)');
  console.log('  --password  New password, min 8 chars (required)');
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--email' && argv[i + 1]) {
      args.email = argv[++i];
    } else if (argv[i] === '--password' && argv[i + 1]) {
      args.password = argv[++i];
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.email || !args.password) {
    printUsage();
  }

  if (args.password.length < 8) {
    console.error('Error: 패스워드는 최소 8자 이상이어야 합니다.');
    process.exit(1);
  }

  // Load config to find dataDir
  const configPath = path.join(process.cwd(), 'config.json5');
  if (!fs.existsSync(configPath)) {
    console.error('Error: config.json5 파일을 찾을 수 없습니다.');
    process.exit(1);
  }

  let config;
  try {
    config = JSON5.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (e) {
    console.error('Error: config.json5 파싱 실패:', e.message);
    process.exit(1);
  }

  const dataDir = config.dataDir ? path.resolve(config.dataDir) : path.resolve('./data');

  // Load users
  const usersPath = path.join(dataDir, 'users.json');
  if (!fs.existsSync(usersPath)) {
    console.error('Error: Setup이 완료되지 않았습니다. (users.json 없음)');
    process.exit(1);
  }

  let usersData;
  try {
    usersData = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));
  } catch (e) {
    console.error('Error: users.json 파싱 실패:', e.message);
    process.exit(1);
  }

  // Find user by email
  const user = usersData.users.find(u => u.email === args.email);
  if (!user) {
    console.error(`Error: 사용자를 찾을 수 없습니다: ${args.email}`);
    process.exit(1);
  }

  // Load groups to check superuser status
  const groupsPath = path.join(dataDir, 'groups.json');
  if (!fs.existsSync(groupsPath)) {
    console.error('Error: groups.json 파일을 찾을 수 없습니다.');
    process.exit(1);
  }

  let groupsData;
  try {
    groupsData = JSON.parse(fs.readFileSync(groupsPath, 'utf-8'));
  } catch (e) {
    console.error('Error: groups.json 파싱 실패:', e.message);
    process.exit(1);
  }

  const group = groupsData.groups.find(g => g.id === user.groupId);
  if (!group || !group.permissions.includes('superuser')) {
    console.error('Error: 이 도구는 슈퍼유저만 리셋할 수 있습니다.');
    process.exit(1);
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(args.password, BCRYPT_COST);

  // Update user
  user.passwordHash = passwordHash;
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  user.updatedAt = new Date().toISOString();

  usersData.updatedAt = new Date().toISOString();

  // Atomic write: write to .tmp then rename
  const tmpPath = usersPath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(usersData, null, 2), 'utf-8');
    // Backup existing file
    if (fs.existsSync(usersPath)) {
      fs.copyFileSync(usersPath, usersPath + '.bak');
    }
    fs.renameSync(tmpPath, usersPath);
  } catch (e) {
    console.error('Error: 파일 저장 실패:', e.message);
    // Clean up tmp file
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    process.exit(1);
  }

  console.log(`✅ 패스워드가 성공적으로 변경되었습니다: ${args.email}`);
  console.log('   실패 카운터 리셋 및 잠금 해제 완료.');
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
