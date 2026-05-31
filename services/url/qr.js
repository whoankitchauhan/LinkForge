'use strict';

const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../../shared/logger');

const QR_DIR = path.join(process.cwd(), process.env.QR_OUTPUT_DIR || 'public/qr');

// ─── Ensure QR directory exists ───────────────────────────────────────────────
async function ensureQrDir() {
  try {
    await fs.mkdir(QR_DIR, { recursive: true });
  } catch (err) {
    logger.error('Failed to create QR directory', { error: err.message });
  }
}

ensureQrDir();

// ─── QR Generation ───────────────────────────────────────────────────────────

/**
 * Generates a QR code PNG for the given URL and saves it to disk.
 * Returns the public-accessible URL path.
 *
 * @param {string} shortCode  - The short code (used as filename)
 * @param {string} targetUrl  - The URL encoded in the QR code
 * @returns {Promise<string>} - Public path, e.g. "/qr/xA92Ks.png"
 */
async function generateQrCode(shortCode, targetUrl) {
  const filename = `${shortCode}.png`;
  const filePath = path.join(QR_DIR, filename);
  const publicPath = `/qr/${filename}`;

  await QRCode.toFile(filePath, targetUrl, {
    type: 'png',
    width: 300,
    margin: 2,
    color: {
      dark: '#0f0f0f',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
  });

  logger.debug('QR code generated', { shortCode, path: publicPath });
  return publicPath;
}

/**
 * Generates QR code as a Base64 data URI (for inline use or API response).
 */
async function generateQrDataUri(targetUrl) {
  return QRCode.toDataURL(targetUrl, {
    type: 'image/png',
    width: 300,
    margin: 2,
    color: { dark: '#0f0f0f', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });
}

/**
 * Deletes the QR code file for a given short code.
 */
async function deleteQrCode(shortCode) {
  const filePath = path.join(QR_DIR, `${shortCode}.png`);
  try {
    await fs.unlink(filePath);
    logger.debug('QR code deleted', { shortCode });
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn('Failed to delete QR code', { shortCode, error: err.message });
    }
  }
}

module.exports = { generateQrCode, generateQrDataUri, deleteQrCode };
