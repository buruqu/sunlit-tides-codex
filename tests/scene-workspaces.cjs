// Integration regression for real keepalive chats: DOM nodes stay connected.
// Only the actual distributable decides/announces visible-main ownership.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-results/scene-workspaces');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('dist/theme/manifest.json')), payload = read('dist/theme/payload.js'), remove = read('dist/theme/remove.js');
const results = [], evidence = {}, errors = [];
const fixture = '<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><title>Keepalive 主面板 · 素材验证</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}.workspace{position:absolute;inset:0}#workspace-2{left:230px;top:37px}main{position:relative;width:100%;height:100%;isolation:isolate}.thread-scroll-container{height:100%;overflow:auto}</style></head><body>' + [0, 1, 2].map(index => '<div class="workspace" id="workspace-' + index + '" style="display:' + (index === 1 ? 'block' : 'none') + '"><main class="main-surface" id="main-' + index + '" data-app-shell-main-surface="default" data-tessalume-surface="main"><div class="thread-scroll-container"></div></main></div>').join('') + '</body></html>';
async function check(name, task) { try { await task(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
async function main() {
  fs.mkdirSync(output, { recursive: true }); const launch = { headless: true };
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) launch.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH; else launch.channel = 'msedge';
  const browser = await chromium.launch(launch), server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(fixture); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const url = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const scene of ['orchard', 'night', 'night-tears']) await check(scene + ': canvas follows visible retained mains, including all-hidden recovery, with actual GPU pixels', async () => {
      const context = await browser.newContext({ viewport: scene === 'orchard' ? { width: 1280, height: 1280 } : { width: 1295, height: 863 }, reducedMotion: 'no-preference' }), page = await context.newPage(), history = [];
      page.on('pageerror', error => errors.push(error.message)); page.on('worker', worker => { const entry = { worker, closed: false }; history.push(entry); worker.on('close', () => entry.closed = true); });
      evidence[scene] = { ownership: [], pixels: [] };
      const owner = async index => {
        await page.waitForFunction(({ index, scene }) => {
          const state = window.__SUNLIT_LAYERED_SCENE__?.getState(), canvases = document.querySelectorAll('.sunlit-layered-scene'), canvas = canvases[0], main = document.getElementById('main-' + index);
          if (canvases.length !== 1 || canvas?.closest('main') !== main || !state?.ready || state.scene !== scene || !state.workerReady) return false;
          const box = main.getBoundingClientRect(); if (box.width < 3 || box.height < 3) return false;
          for (let node = canvas; node; node = node.parentElement) { const css = getComputedStyle(node); if (node.hidden || node !== canvas && node.getAttribute('aria-hidden') === 'true' || node.inert || css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) === 0) return false; }
          return true;
        }, { index, scene }, { timeout: 25000 });
        await page.waitForTimeout(80);
        const actual = await page.evaluate(async () => {
          const canvas = document.querySelector('.sunlit-layered-scene'), main = canvas.closest('main'), box = main.getBoundingClientRect(), canvasBox = canvas.getBoundingClientRect(), state = await __SUNLIT_LAYERED_SCENE__.getStateAsync();
          const css = getComputedStyle(main, '::before'), imageWidth = parseFloat(css.backgroundSize), imageHeight = imageWidth * state.sourceHeight / state.sourceWidth, position = css.backgroundPosition.split(/\s+/), offset = (value, space) => value.endsWith('%') ? parseFloat(value) / 100 * space : parseFloat(value);
          return { owner: main.id, mainRect: { width: box.width, height: box.height }, canvasRect: { width: canvasBox.width, height: canvasBox.height }, mainCount: document.querySelectorAll('main').length, allOriginalMainsConnected: [0, 1, 2].every(index => document.getElementById('main-' + index).isConnected), state: { scene: state.scene, ready: state.ready, renderThread: state.renderThread, workerReady: state.workerReady, width: state.width, height: state.height, error: state.error }, framing: { size: css.backgroundSize, position: css.backgroundPosition, imageWidth, expectedImageWidth: Math.max(box.width, box.height * 1272 / 847), cover: state.cover, expectedCover: [box.width / imageWidth, box.height / imageHeight, -offset(position[0], box.width - imageWidth) / imageWidth, -offset(position[1], box.height - imageHeight) / imageHeight] }, announcedOwners: workspaceOwnershipChanges.slice() };
        });
        evidence[scene].ownership.push(actual); assert.equal(actual.owner, 'main-' + index); assert.equal(actual.mainCount, 3); assert.equal(actual.allOriginalMainsConnected, true); assert.equal(actual.state.error, null); assert.equal(actual.state.renderThread, 'worker'); assert.equal(page.workers().length, 1); assert.ok(actual.canvasRect.width > 2 && actual.canvasRect.height > 2); assert.ok(Math.abs(actual.canvasRect.width - actual.mainRect.width) <= 1 && Math.abs(actual.canvasRect.height - actual.mainRect.height) <= 1); assert.ok(Math.abs(actual.state.width - actual.mainRect.width) <= 1 && Math.abs(actual.state.height - actual.mainRect.height) <= 1, 'Actual GPU dimensions must belong to the visible main at fixture DPR1');
        if (scene !== 'orchard') { assert.ok(Math.abs(actual.framing.imageWidth - actual.framing.expectedImageWidth) < .01, 'Gallery must frame the current visible main dimensions'); actual.framing.cover.forEach((value, i) => assert.ok(Math.abs(value - actual.framing.expectedCover[i]) < .00001, 'Current canvas framing must equal the current main CSS background: ' + JSON.stringify(actual))); }
      };
      const pixels = async () => {
        const actual = await page.evaluate(async scene => {
          const state = await __SUNLIT_LAYERED_SCENE__.getStateAsync(), times = scene === 'night-tears' ? [2.6, 3.9] : [0, .9], first = await __SUNLIT_LAYERED_SCENE__.capturePixels(times[0]), second = await __SUNLIT_LAYERED_SCENE__.capturePixels(times[1]); let changed = 0, cheekChanged = 0, nonblack = 0;
          for (let y = 0; y < second.height; y++) for (let x = 0; x < second.width; x++) { const i = ((second.height - 1 - y) * second.width + x) * 4; if (Math.max(second.data[i], second.data[i + 1], second.data[i + 2]) > 8) nonblack++; if (Math.max(...[0, 1, 2].map(k => Math.abs(first.data[i + k] - second.data[i + k]))) <= 2) continue; changed++; const sx = ((x + .5) / second.width * state.cover[0] + state.cover[2]) * state.sourceWidth, sy = ((y + .5) / second.height * state.cover[1] + state.cover[3]) * state.sourceHeight; if (sy >= 268 && sy < 301 && ((sx >= 532 && sx < 545) || (sx >= 584 && sx < 602))) cheekChanged++; }
          return { owner: document.querySelector('.sunlit-layered-scene').closest('main').id, width: second.width, height: second.height, changed, cheekChanged, nonblackFraction: nonblack / (second.width * second.height), tearEnabled: state.tearEnabled, times, frameIds: [first.frameId, second.frameId], captureSequences: [first.captureSequence, second.captureSequence] };
        }, scene);
        evidence[scene].pixels.push(actual); assert.ok(actual.nonblackFraction > .6, 'The actual visible main canvas is empty'); assert.ok(actual.changed > 100, 'Visible artwork must have actual GPU motion'); assert.ok(actual.frameIds[1] > actual.frameIds[0]); if (scene === 'night-tears') { assert.equal(actual.tearEnabled, true); assert.ok(actual.cheekChanged > 5, 'Tears must actually change the current visible main GPU pixels'); } else assert.equal(actual.tearEnabled, false);
      };
      const show = index => page.evaluate(index => { for (let i = 0; i < 3; i++) document.getElementById('workspace-' + i).style.display = i === index ? 'block' : 'none'; }, index);
      try {
        await page.goto(url); await page.evaluate(scene => { document.documentElement.dataset.theme = scene === 'orchard' ? 'light' : 'dark'; window.workspaceOwnershipChanges = []; window.addEventListener('sunlit-tides:main-surface-change', event => workspaceOwnershipChanges.push(event.detail?.main?.id || null)); }, scene);
        await page.evaluate(payload => (0, eval)(payload), payload); await page.evaluate(scene => __SUNLIT_GALLERY__.selectScene(scene), scene);
        await owner(1); await pixels(); const firstWorker = page.workers()[0];
        // No node is removed and no synthetic surface-change event is dispatched.
        await show(2); await owner(2); await pixels(); assert.notEqual(page.workers()[0], firstWorker); assert.equal(history.find(entry => entry.worker === firstWorker).closed, true); assert.notDeepEqual(evidence[scene].ownership[0].mainRect, evidence[scene].ownership[1].mainRect); if (scene !== 'orchard') assert.notDeepEqual(evidence[scene].ownership[0].framing.cover, evidence[scene].ownership[1].framing.cover, 'Night framing must change with the newly visible main size');
        const secondWorker = page.workers()[0]; await show(-1);
        await page.waitForFunction(() => document.querySelectorAll('.sunlit-layered-scene').length === 0 && !__SUNLIT_LAYERED_SCENE__.getState().ready && !__SUNLIT_LAYERED_SCENE__.getState().loopScheduled, null, { timeout: 5000 }); await page.waitForTimeout(80); assert.equal(page.workers().length, 0); assert.equal(history.find(entry => entry.worker === secondWorker).closed, true); assert.equal(await page.locator('main').count(), 3);
        evidence[scene].allHidden = await page.evaluate(() => ({ state: __SUNLIT_LAYERED_SCENE__.getState(), announcedOwners: workspaceOwnershipChanges.slice() }));
        await show(1); await owner(1); await pixels(); assert.equal(history.filter(entry => !entry.closed).length, 1);
        const announced = await page.evaluate(() => workspaceOwnershipChanges); assert.ok(announced.includes('main-1') && announced.includes('main-2') && announced.includes(null), 'Real layout ownership announcements must include the hidden interval and both visible surfaces');
        await page.evaluate(remove => (0, eval)(remove), remove); await page.waitForTimeout(80); assert.equal(page.workers().length, 0); assert.equal(await page.locator('.sunlit-layered-scene').count(), 0); evidence[scene].workers = { created: history.length, closed: history.filter(entry => entry.closed).length };
      } finally { await context.close(); }
    });
    await check('no uncaught browser errors', async () => assert.deepEqual(errors, []));
  } finally {
    await browser.close(); await new Promise(resolve => server.close(resolve)); const report = { at: new Date().toISOString(), version: manifest.version, fingerprint: manifest.fingerprint, results, evidence, errors, passed: results.filter(result => result.passed).length, total: results.length }; fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); if (results.some(result => !result.passed)) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
