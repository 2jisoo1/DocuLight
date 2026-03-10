/**
 * Email Service (Phase 7)
 * Nodemailer-based email sending for signup verification and notifications
 */
const nodemailer = require('nodemailer');

let transporter = null;
let fromAddress = null;

function initialize(emailConfig) {
  if (!emailConfig || !emailConfig.host) {
    transporter = null;
    return;
  }

  transporter = nodemailer.createTransport({
    host: emailConfig.host,
    port: emailConfig.port || 587,
    secure: emailConfig.secure || false,
    auth: emailConfig.auth ? {
      user: emailConfig.auth.user,
      pass: emailConfig.auth.pass
    } : undefined
  });

  fromAddress = emailConfig.from || `noreply@${emailConfig.host}`;
}

function isConfigured() {
  return transporter !== null;
}

async function verify() {
  if (!transporter) return false;
  try {
    await transporter.verify();
    return true;
  } catch {
    return false;
  }
}

async function sendMail(to, subject, html) {
  if (!transporter) {
    console.warn('[EmailService] Email not configured, skipping send to:', to);
    return false;
  }

  try {
    await transporter.sendMail({ from: fromAddress, to, subject, html });
    return true;
  } catch (err) {
    // Retry once
    try {
      await transporter.sendMail({ from: fromAddress, to, subject, html });
      return true;
    } catch (retryErr) {
      console.error('[EmailService] Send failed after retry:', retryErr.message);
      return false;
    }
  }
}

async function sendVerificationEmail(email, token, baseUrl) {
  const link = `${baseUrl}/api/auth/verify/${token}`;
  const html = `
    <h2>DocLight 가입 이메일 인증</h2>
    <p>아래 링크를 클릭하여 이메일을 인증해주세요:</p>
    <p><a href="${link}">${link}</a></p>
    <p>이 링크는 24시간 동안 유효합니다.</p>
  `;
  return sendMail(email, '[DocLight] 이메일 인증', html);
}

async function sendApprovalEmail(email, loginUrl) {
  const html = `
    <h2>DocLight 가입이 승인되었습니다</h2>
    <p>관리자가 가입 요청을 승인했습니다. 아래 링크에서 로그인하세요:</p>
    <p><a href="${loginUrl}">${loginUrl}</a></p>
  `;
  return sendMail(email, '[DocLight] 가입 승인 완료', html);
}

async function sendRejectionEmail(email) {
  const html = `
    <h2>DocLight 가입 요청이 거절되었습니다</h2>
    <p>관리자가 가입 요청을 거절했습니다. 자세한 사항은 관리자에게 문의하세요.</p>
  `;
  return sendMail(email, '[DocLight] 가입 요청 거절', html);
}

module.exports = { initialize, isConfigured, verify, sendVerificationEmail, sendApprovalEmail, sendRejectionEmail };
