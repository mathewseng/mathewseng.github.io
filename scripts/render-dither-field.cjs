// Bake @pennadenoiz's shader once at authoring time; visitors never run WebGL.
// Usage: node scripts/render-dither-field.cjs (requires Playwright/Chromium).
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require('playwright');
const root = resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  try {
    for (const [name, width, height, deviceScaleFactor] of [
      ['dither-field', 1440, 1000, 1], ['dither-field-mobile', 375, 812, 2],
    ]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor });
      await page.setContent('<style>html,body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>');
      await page.addScriptTag({ type: 'module', content: `${readFileSync(resolve(root, 'scripts/art/dither-shader.mjs'), 'utf8')}
        window.field = createShader(document.querySelector('canvas'), {
          autoplay: false, background: { dark: '#08090d' },
        });` });
      const data = await page.evaluate(() => {
        window.field.render(0);
        const image = document.querySelector('canvas').toDataURL('image/webp', 0.95);
        window.field.destroy();
        return image;
      });
      if (!data.startsWith('data:image/webp;base64,')) throw new Error('WebP encoding failed');
      const bytes = Buffer.from(data.split(',')[1], 'base64');
      writeFileSync(resolve(root, `shared/${name}.webp`), bytes);
      console.log(`${name}.webp: ${bytes.length} bytes`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
