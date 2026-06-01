'use strict';

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');

// ensure output dir
fs.mkdirSync(OUT_DIR, { recursive: true });

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`✅  Saved: docs/screenshots/${name}.png`);
  return file;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,              // set true for silent; false so you can see it
    args: ['--no-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // ── 1. Landing Page ────────────────────────────────────────────────────────
  console.log('📸  Landing page...');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  await shot(page, '01-landing');

  // scroll to features
  await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'smooth' }));
  await sleep(800);
  await shot(page, '02-features');

  // ── 2. URL Shortener Widget — fill & submit ────────────────────────────────
  console.log('📸  URL shortener widget...');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(500);

  await page.focus('#url-input');
  await page.type('#url-input', 'https://github.com/whoankitchauhan/LinkForge', { delay: 30 });
  await sleep(300);
  await shot(page, '03-shorten-input');

  // click Shorten
  await page.click('#btn-shorten');
  await sleep(2000);
  await shot(page, '04-shorten-result');

  // ── 3. Auth Page — Sign In ─────────────────────────────────────────────────
  console.log('📸  Auth page...');
  await page.click('#btn-login');
  await sleep(700);
  await shot(page, '05-auth-login');

  // fill form
  await page.type('#login-email', 'demo@linkforge.io', { delay: 40 });
  await page.type('#login-password', 'Demo@12345', { delay: 40 });
  await sleep(300);
  await shot(page, '06-auth-login-filled');

  // ── 4. Register Page ──────────────────────────────────────────────────────
  console.log('📸  Register page...');
  await page.click('#link-to-register');
  await sleep(600);
  await shot(page, '07-auth-register');

  // ── 5. Health & API JSON ───────────────────────────────────────────────────
  console.log('📸  Health endpoint...');
  await page.goto(`${BASE_URL}/health`, { waitUntil: 'networkidle2' });
  await sleep(800);
  await shot(page, '08-health-endpoint');

  // ── 6. Back to landing for closing shot ───────────────────────────────────
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
  await sleep(800);

  await browser.close();

  console.log('\n🎉  All screenshots saved to docs/screenshots/');
})().catch((err) => {
  console.error('Screenshot script error:', err.message);
  process.exit(1);
});
