/* Read-only installed-theme check: no chat content, screenshots, clicks or preferences. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist/theme/manifest.json'), 'utf8'));
const port = Number(process.argv.find(value => value.startsWith('--port='))?.slice(7));
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, 'Pass verified loopback port');
(async () => {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  try {
    const pages = browser.contexts().flatMap(context => context.pages()).filter(page => page.url() === 'app://-/index.html');
    assert.ok(pages.length > 0, 'No main page');
    const evidence = [];
    for (const page of pages) {
      const actual = await page.evaluate(() => {
        const gallery = window.__SUNLIT_GALLERY__?.getState();
        const palette = document.querySelector('[data-fusion-ui="palette"]');
        const entry = [...(palette?.shadowRoot?.querySelectorAll('button') || [])].find(node => node.textContent === '选择背景');
        return {
          version: window.__TESSALUME_RUNTIME__?.context.config.designVersion,
          fingerprint: window.__TESSALUME_RUNTIME__?.fingerprint,
          hostVersion: window.__SUNLIT_TIDES_HOST_MARKER__?.version,
          gallery: gallery ? { count: gallery.count, selected: gallery.selected, defaults: gallery.defaults, mode: gallery.mode, scene: gallery.scene, open: gallery.open } : null,
          entryExists: !!entry, entryOpensDialog: entry?.getAttribute('aria-haspopup') === 'dialog',
          roots: document.querySelectorAll('#tessalume-theme-root').length,
          palettes: document.querySelectorAll('[data-fusion-ui="palette"]').length,
          strips: document.querySelectorAll('.sgk-gallery-strip').length
        };
      });
      assert.equal(actual.version, manifest.version); assert.equal(actual.hostVersion, manifest.version);
      assert.equal(actual.fingerprint, manifest.fingerprint); assert.equal(actual.gallery?.count, manifest.config.gallery.scenes.length);
      assert.deepEqual(actual.gallery.defaults, manifest.config.gallery.defaults);
      assert.equal(actual.entryExists, true); assert.equal(actual.entryOpensDialog, true);
      assert.equal(actual.roots, 1); assert.equal(actual.palettes, 1); assert.equal(actual.strips, 0);
      evidence.push(actual);
    }
    const result = { at: new Date().toISOString(), passed: true, evidence };
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    fs.writeFileSync(path.join(root, 'test-results/gallery-live.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
