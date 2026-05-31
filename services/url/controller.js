'use strict';

const { validationResult } = require('express-validator');
const urlService = require('./service');
const { AppError } = require('../../shared/middleware/errorHandler');

function validate(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new AppError('Validation failed', 422);
    err.errors = errors.array();
    throw err;
  }
}

async function createUrl(req, res, next) {
  try {
    validate(req);
    const url = await urlService.createUrl(req.body, req.user?.id);
    res.status(201).json({ success: true, data: { url } });
  } catch (err) {
    next(err);
  }
}

async function listUrls(req, res, next) {
  try {
    const { page, limit, status, sort, order } = req.query;
    const result = await urlService.listUrls(req.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      status,
      sort: sort || 'createdAt',
      order: order || 'desc',
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getUrl(req, res, next) {
  try {
    const url = await urlService.getUrlById(req.params.id, req.user?.id);
    res.json({ success: true, data: { url } });
  } catch (err) {
    next(err);
  }
}

async function updateUrl(req, res, next) {
  try {
    validate(req);
    const url = await urlService.updateUrl(req.params.id, req.user.id, req.body);
    res.json({ success: true, data: { url } });
  } catch (err) {
    next(err);
  }
}

async function deleteUrl(req, res, next) {
  try {
    await urlService.deleteUrl(req.params.id, req.user.id);
    res.json({ success: true, message: 'URL deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function searchUrls(req, res, next) {
  try {
    validate(req);
    const result = await urlService.searchUrls(req.user.id, req.query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function generateQr(req, res, next) {
  try {
    const qrCodeUrl = await urlService.generateQrForUrl(req.params.id, req.user.id);
    res.json({ success: true, data: { qrCodeUrl } });
  } catch (err) {
    next(err);
  }
}

module.exports = { createUrl, listUrls, getUrl, updateUrl, deleteUrl, searchUrls, generateQr };
