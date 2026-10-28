// Reuse the real board illustration from the website for the iOS icon.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { launchQuietBrowser } = require('../../scripts/quiet-browser.cjs');
(async () => {
  const browser = await launchQuietBrowser(chromium);
  try {
    const page = await browser.newPage({viewport: {width: 1024, height: 1024}, deviceScaleFactor: 1});
    const svg = fs.readFileSync(path.resolve(__dirname, '../../home-backgammon.svg'), 'utf8');
    await page.setContent(`<style>body{margin:0;width:1024px;height:1024px;background:#0a1017;display:grid;place-items:center}svg{width:1400px;height:auto;transform:rotate(-12deg);flex-shrink:0}</style>${svg}`);
    await page.screenshot({path: path.resolve(__dirname, '../PocketSite/Assets.xcassets/AppIcon.appiconset/app-icon.png')});
  } finally { await browser.close(); }
})();
