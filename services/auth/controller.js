'use strict';

const { validationResult } = require('express-validator');
const authService = require('./service');
const { AppError } = require('../../shared/middleware/errorHandler');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validate(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorList = errors.array();
    const message = errorList.map((e) => e.msg).join(', ');
    const err = new AppError(message || 'Validation failed', 422);
    err.errors = errorList;
    throw err;
  }
}

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
};

// ─── Controllers ──────────────────────────────────────────────────────────────

async function register(req, res, next) {
  try {
    validate(req);
    const { email, username, password } = req.body;
    const user = await authService.register({ email, username, password });
    res.status(201).json({
      success: true,
      message: 'Registration successful. You can now log in.',
      data: { user },
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    validate(req);
    const { email, password } = req.body;
    const { accessToken, refreshToken, user } = await authService.login({ email, password });

    // Set HttpOnly cookies
    res.cookie('accessToken', accessToken, {
      ...COOKIE_OPTS,
      maxAge: 15 * 60 * 1000, // 15 minutes
    });
    res.cookie('refreshToken', refreshToken, {
      ...COOKIE_OPTS,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: { user, accessToken, refreshToken },
    });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!token) return next(new AppError('Refresh token required', 401));

    const { accessToken, refreshToken } = await authService.refreshTokens(token);

    res.cookie('accessToken', accessToken, {
      ...COOKIE_OPTS,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refreshToken', refreshToken, {
      ...COOKIE_OPTS,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, data: { accessToken, refreshToken } });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    if (req.user) {
      await authService.logout(req.user.id);
    }
    res.clearCookie('accessToken', COOKIE_OPTS);
    res.clearCookie('refreshToken', COOKIE_OPTS);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    validate(req);
    await authService.forgotPassword(req.body.email);
    res.json({
      success: true,
      message: 'If an account exists with that email, a reset link has been sent.',
    });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    validate(req);
    const { token, password } = req.body;
    await authService.resetPassword(token, password);
    res.json({ success: true, message: 'Password reset successful. Please log in.' });
  } catch (err) {
    next(err);
  }
}

async function getProfile(req, res, next) {
  try {
    const profile = await authService.getProfile(req.user.id);
    res.json({ success: true, data: { user: profile } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register, login, refresh,
  logout, forgotPassword, resetPassword, getProfile,
};
