/* Explicit live smoke test for our own startup preference only; restores its original value. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const port = Number(process.argv.find(v => v.startsWith('--port='))?.slice(7));
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Pass verified local Codex port as --port=N');
(async () => {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let page, original;
  const settings = path.join(process.env.LOCALAPPDATA, 'SunlitTidesCodex/data/settings.json');
  try {
    page = browser.contexts().flatMap(c => c.pages()).find(p => p.url() === 'app://-/index.html');
    assert.ok(page, 'Main Codex page must exist');
    const state = await page.evaluate(() => ({id:window.__TESSALUME_RUNTIME__?.themeId, bridge:window.__sunlitTidesStartup}));
    assert.equal(state.id, 'sunlit-tides.codex');
    assert.equal(state.bridge?.available, true);
    original = state.bridge.enabled;
    for (const enabled of [!original, original]) {
      await page.evaluate(value => window.dispatchEvent(new CustomEvent('sunlit-tides:startup-change', {detail:{enabled:value}})), enabled);
      await page.waitForFunction(value => window.__sunlitTidesStartup?.enabled === value, enabled, {timeout:10000});
      assert.equal(JSON.parse(fs.readFileSync(settings, 'utf8')).startupEnabled, enabled);
      assert.equal(await page.evaluate(() => localStorage.getItem('sunlit-tides.startup.enabled')), String(enabled));
    }
    console.log(JSON.stringify({ok:true, version:'1.1.0', roundTrip:true, persisted:true, restored:original}));
  } finally {
    try {
      if (page && typeof original === 'boolean') {
        await page.evaluate(value => window.dispatchEvent(new CustomEvent('sunlit-tides:startup-change', {detail:{enabled:value}})), original);
        await page.waitForFunction(value => window.__sunlitTidesStartup?.enabled === value, original, {timeout:10000});
      }
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
