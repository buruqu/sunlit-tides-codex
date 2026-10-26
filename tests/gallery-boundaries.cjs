const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const launch = { headless: true };
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) launch.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  else launch.channel = 'msedge';
  const browser = await chromium.launch(launch);
  try {
    const page = await browser.newPage();
    await page.setContent('<html data-theme="light"><head></head><body><button id="one">One</button><button id="two">Two</button></body></html>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../theme/design/fixed-scenes.js'), 'utf8') });
    await page.evaluate(() => {
      window.gallery = mountSunlitGallery({ window, document, addCleanup() {} });
      gallery.open(document.getElementById('one')); gallery.close(); gallery.open(document.getElementById('two'));
    });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => { gallery.close(); return document.activeElement.id; }), 'two');
    const mode = await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark'; gallery.resetCurrent();
      return gallery.getState();
    });
    assert.equal(mode.mode, 'dark'); assert.equal(mode.scene, 'night');
    assert.deepEqual(mode.selected, { light: 'orchard', dark: 'night' });
    await page.evaluate(() => gallery.dispose());
    assert.equal(await page.locator('[data-sgk-gallery],[data-sgk-gallery-style]').count(), 0);
    console.log(JSON.stringify({ passed: true, cases: ['rapid-close-reopen-focus', 'same-tick-mode-reset', 'cleanup'] }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
