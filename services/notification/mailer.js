'use strict';

const nodemailer = require('nodemailer');
const logger = require('../../shared/logger');

// ─── Transport ────────────────────────────────────────────────────────────────
let transporter;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

const FROM = `"${process.env.EMAIL_FROM_NAME || 'LinkForge'}" <${process.env.EMAIL_FROM || 'noreply@linkforge.io'}>`;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ─── Email Templates ──────────────────────────────────────────────────────────

function baseHtml(title, content) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f1a; color: #e2e8f0; margin: 0; padding: 20px; }
    .card { max-width: 560px; margin: 0 auto; background: #1a1a2e; border-radius: 16px; padding: 40px; border: 1px solid rgba(99,179,237,0.15); }
    .logo { font-size: 28px; font-weight: 800; background: linear-gradient(135deg, #63b3ed, #9f7aea); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 30px; }
    h2 { color: #e2e8f0; font-size: 22px; margin-bottom: 16px; }
    p { color: #a0aec0; line-height: 1.7; margin-bottom: 16px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #4299e1, #805ad5); color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px; margin: 20px 0; }
    .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.07); color: #718096; font-size: 13px; }
    code { background: rgba(99,179,237,0.1); color: #63b3ed; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⚡ LinkForge</div>
    ${content}
    <div class="footer">© ${new Date().getFullYear()} LinkForge Enterprise. All rights reserved.</div>
  </div>
</body>
</html>`;
}

// ─── Send Helpers ─────────────────────────────────────────────────────────────

async function sendMail({ to, subject, html, text }) {
  if (!process.env.SMTP_USER) {
    logger.info('[EMAIL — DEV MODE] Would send email', { to, subject, text: text?.slice(0, 200) });
    return;
  }

  try {
    const info = await getTransporter().sendMail({ from: FROM, to, subject, html, text });
    logger.info('Email sent', { to, subject, messageId: info.messageId });
  } catch (err) {
    logger.error('Email send failed', { to, subject, error: err.message });
    throw err;
  }
}

async function sendVerificationEmail(to, { username, token }) {
  const link = `${APP_URL}/api/auth/verify-email?token=${token}`;
  await sendMail({
    to,
    subject: '✉️ Verify your LinkForge account',
    html: baseHtml(
      'Verify your email',
      `
      <h2>Welcome to LinkForge, ${username}! 👋</h2>
      <p>Thanks for registering. Click the button below to verify your email address and activate your account.</p>
      <a href="${link}" class="btn">Verify Email Address</a>
      <p>Or copy this link: <code>${link}</code></p>
      <p>This link expires in <strong>24 hours</strong>.</p>
      `
    ),
    text: `Welcome ${username}! Verify your email: ${link}`,
  });
}

async function sendPasswordResetEmail(to, { token }) {
  const link = `${APP_URL}/reset-password?token=${token}`;
  await sendMail({
    to,
    subject: '🔐 Reset your LinkForge password',
    html: baseHtml(
      'Password Reset',
      `
      <h2>Password Reset Request</h2>
      <p>We received a request to reset your password. Click the button below to create a new password.</p>
      <a href="${link}" class="btn">Reset Password</a>
      <p>Or copy this link: <code>${link}</code></p>
      <p>This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.</p>
      `
    ),
    text: `Reset your password: ${link}`,
  });
}

async function sendLinkExpirationEmail(to, { shortCode, originalUrl }) {
  await sendMail({
    to,
    subject: '⚠️ Your LinkForge link has expired',
    html: baseHtml(
      'Link Expired',
      `
      <h2>Your link has expired</h2>
      <p>The short link <code>${APP_URL}/${shortCode}</code> pointing to <code>${originalUrl}</code> has expired.</p>
      <p>Log in to your dashboard to recreate or update the expiry date.</p>
      <a href="${APP_URL}/dashboard" class="btn">Go to Dashboard</a>
      `
    ),
    text: `Your link ${APP_URL}/${shortCode} has expired.`,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendLinkExpirationEmail };
