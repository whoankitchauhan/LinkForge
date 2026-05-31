'use strict';

const { body, query } = require('express-validator');

const passwordRules = body('password')
  .isLength({ min: 8, max: 128 })
  .withMessage('Password must be 8–128 characters')
  .matches(/[A-Z]/)
  .withMessage('Password must contain at least one uppercase letter')
  .matches(/[a-z]/)
  .withMessage('Password must contain at least one lowercase letter')
  .matches(/\d/)
  .withMessage('Password must contain at least one number');

const registerValidators = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail()
    .isLength({ max: 255 }),
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be 3–30 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username may only contain letters, numbers, underscores, and hyphens'),
  passwordRules,
];

const loginValidators = [
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

const forgotPasswordValidators = [
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
];

const resetPasswordValidators = [
  body('token').notEmpty().withMessage('Reset token is required'),
  passwordRules,
];

const changePasswordValidators = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  passwordRules.withMessage ? passwordRules : body('newPassword').isLength({ min: 8 }),
];

module.exports = {
  registerValidators,
  loginValidators,
  forgotPasswordValidators,
  resetPasswordValidators,
  changePasswordValidators,
};
