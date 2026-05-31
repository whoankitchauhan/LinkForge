'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { prisma } = require('../../shared/prisma');
const { AppError } = require('../../shared/middleware/errorHandler');
const { publish, EVENTS } = require('../../shared/rabbitmq');
const logger = require('../../shared/logger');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

// ─── Token Helpers ────────────────────────────────────────────────────────────

function generateAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { sub: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ─── Service Methods ──────────────────────────────────────────────────────────

async function register({ email, username, password }) {
  // Check uniqueness
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { email: true, username: true },
  });

  if (existing) {
    const field = existing.email === email ? 'email' : 'username';
    throw new AppError(`This ${field} is already taken`, 409);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const emailVerifyToken = generateSecureToken();

  const user = await prisma.user.create({
    data: { email, username, passwordHash, emailVerifyToken },
    select: { id: true, email: true, username: true, role: true },
  });

  // Publish event for notification worker
  await publish(EVENTS.USER_REGISTERED, {
    userId: user.id,
    email: user.email,
    username: user.username,
    verifyToken: emailVerifyToken,
  });

  logger.info('User registered', { userId: user.id, email: user.email });
  return user;
}

async function verifyEmail(token) {
  const user = await prisma.user.findFirst({
    where: { emailVerifyToken: token },
    select: { id: true, emailVerified: true },
  });

  if (!user) throw new AppError('Invalid or expired verification token', 400);
  if (user.emailVerified) throw new AppError('Email already verified', 400);

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerifyToken: null },
  });

  logger.info('Email verified', { userId: user.id });
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true, email: true, username: true, role: true,
      passwordHash: true, emailVerified: true,
    },
  });

  if (!user) throw new AppError('Invalid email or password', 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError('Invalid email or password', 401);

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Store hashed refresh token
  const refreshHash = await bcrypt.hash(refreshToken, 8);
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokenHash: refreshHash },
  });

  logger.info('User logged in', { userId: user.id });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, username: user.username, role: user.role },
  };
}

async function refreshTokens(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
    select: { id: true, email: true, username: true, role: true, refreshTokenHash: true },
  });

  if (!user || !user.refreshTokenHash) throw new AppError('Session not found', 401);

  const valid = await bcrypt.compare(token, user.refreshTokenHash);
  if (!valid) throw new AppError('Refresh token mismatch', 401);

  const accessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);
  const newHash = await bcrypt.hash(newRefreshToken, 8);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokenHash: newHash },
  });

  return { accessToken, refreshToken: newRefreshToken };
}

async function logout(userId) {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshTokenHash: null },
  });
  logger.info('User logged out', { userId });
}

async function forgotPassword(email) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  // Always respond with success (security: don't reveal email existence)
  if (!user) return;

  const token = generateSecureToken();
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: token, passwordResetExpires: expires },
  });

  await publish(EVENTS.USER_PASSWORD_RESET, { email, token, userId: user.id });
  logger.info('Password reset requested', { userId: user.id });
}

async function resetPassword(token, newPassword) {
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetExpires: { gt: new Date() },
    },
    select: { id: true },
  });

  if (!user) throw new AppError('Invalid or expired reset token', 400);

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
      refreshTokenHash: null, // Invalidate all sessions
    },
  });

  logger.info('Password reset completed', { userId: user.id });
}

async function getProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, username: true, role: true,
      emailVerified: true, createdAt: true,
      _count: { select: { urls: true } },
    },
  });
  if (!user) throw new AppError('User not found', 404);
  return user;
}

module.exports = {
  register, verifyEmail, login, refreshTokens,
  logout, forgotPassword, resetPassword, getProfile,
};
