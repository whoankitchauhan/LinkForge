'use strict';

const jwt = require('jsonwebtoken');
const { AppError } = require('./errorHandler');
const { prisma } = require('../prisma');

/**
 * Verifies JWT access token from Authorization header or cookie.
 * Attaches req.user on success.
 */
async function authenticate(req, res, next) {
  try {
    const token =
      req.cookies?.accessToken ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : null);

    if (!token) throw new AppError('Authentication required', 401);

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, username: true, role: true },
    });

    if (!user) throw new AppError('User not found', 401);

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return next(new AppError('Access token expired', 401));
    if (err.name === 'JsonWebTokenError') return next(new AppError('Invalid access token', 401));
    next(err);
  }
}

/**
 * Optional — attaches req.user if token present, continues without error if not.
 */
async function optionalAuthenticate(req, res, next) {
  try {
    const token =
      req.cookies?.accessToken ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : null);

    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, username: true, role: true },
    });

    req.user = user || null;
    next();
  } catch {
    req.user = null;
    next();
  }
}

/**
 * Role-based access control. Usage: authorize('ADMIN')
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError('Authentication required', 401));
    if (!roles.includes(req.user.role)) return next(new AppError('Insufficient permissions', 403));
    next();
  };
}

module.exports = { authenticate, optionalAuthenticate, authorize };
