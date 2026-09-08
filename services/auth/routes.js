'use strict';

const express = require('express');
const router = express.Router();

const ctrl = require('./controller');
const { authenticate, optionalAuthenticate } = require('../../shared/middleware/auth');
const { authLimiter } = require('../../shared/middleware/rateLimit');
const {
  registerValidators,
  loginValidators,
  forgotPasswordValidators,
  resetPasswordValidators,
} = require('./validators');

// POST /api/auth/register
router.post('/register', registerValidators, ctrl.register);

// POST /api/auth/login
router.post('/login', authLimiter, loginValidators, ctrl.login);

// POST /api/auth/refresh
router.post('/refresh', ctrl.refresh);

// POST /api/auth/logout
router.post('/logout', optionalAuthenticate, ctrl.logout);

// POST /api/auth/forgot-password
router.post('/forgot-password', authLimiter, forgotPasswordValidators, ctrl.forgotPassword);

// POST /api/auth/reset-password
router.post('/reset-password', resetPasswordValidators, ctrl.resetPassword);

// GET  /api/auth/me
router.get('/me', authenticate, ctrl.getProfile);

module.exports = router;
