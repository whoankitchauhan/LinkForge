'use strict';

const analyticsService = require('./service');

async function getUrlAnalytics(req, res, next) {
  try {
    const { period } = req.query;
    const data = await analyticsService.getUrlAnalytics(req.params.urlId, req.user.id, period);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getUrlClicks(req, res, next) {
  try {
    const { page, limit } = req.query;
    const data = await analyticsService.getUrlClicks(req.params.urlId, req.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getDashboard(req, res, next) {
  try {
    const { period } = req.query;
    const data = await analyticsService.getDashboard(req.user.id, period);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { getUrlAnalytics, getUrlClicks, getDashboard };
