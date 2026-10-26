// Real distributable, DedicatedWorker GPU readbacks, and artwork-only video.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-results/tear-scene');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('dist/theme/manifest.json')), payload = read('dist/theme/payload.js'), remove = read('dist/theme/remove.js');
const normal = manifest.config.layeredScene.scenes.night, variant = manifest.config.layeredScene.scenes['night-tears'];
const spec = JSON.parse(read('theme/design/night-motion-spec.json'));
const results = [], evidence = {}, errors = [];
const fixture = '<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><title>西西动态泪光 · 素材验证</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}main{position:relative;width:100%;height:100%;isolation:isolate}.thread-scroll-container{height:100%;overflow:auto}</style></head><body><main class="main-surface" data-app-shell-main-surface="default"><div class="thread-scroll-container"></div></main></body></html>';
async function check(name, task) { try { await task(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const launch = { headless: true }; if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) launch.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH; else launch.channel = 'msedge';
  const browser = await chromium.launch(launch), server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(fixture); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const page = await browser.newPage({ viewport: { width: spec.width, height: spec.height }, reducedMotion: 'no-preference' });
  page.on('pageerror', error => errors.push(error.message));
  async function select(scene) {
    await page.evaluate(scene => __SUNLIT_GALLERY__.selectScene(scene), scene);
    await page.waitForFunction(scene => { const state = __SUNLIT_LAYERED_SCENE__.getState(); return state.scene === scene && (state.ready || state.error); }, scene, { timeout: 25000 });
    const state = await page.evaluate(() => __SUNLIT_LAYERED_SCENE__.getState());
    assert.equal(state.error, null, JSON.stringify(state)); assert.equal(state.renderThread, 'worker'); assert.equal(state.ready, true); assert.equal(state.maxFps, 120); assert.equal(page.workers().length, 1); return state;
  }
  try {
    await check('tear variant preserves original geometry and has its own enabled, bounded configuration', async () => {
      assert.ok(variant?.tearEffects?.enabled); assert.equal(variant.canonicalArtworkScene, 'night'); assert.ok(!normal.tearEffects?.enabled);
      for (const key of ['sourceAsset', 'baseAsset', 'blinkAsset', 'width', 'height', 'layers', 'eyes', 'lightMasks']) assert.deepEqual(variant[key], normal[key], key);
      assert.equal(variant.tearEffects.streams.length, 2); const [x, y, width, height] = variant.tearEffects.bounds;
      assert.ok(x >= 525 && y >= 245 && x + width <= 612 && y + height <= 310, 'Tears must stay within Xixi eye/cheek area');
      evidence.configuration = { bounds: variant.tearEffects.bounds, streams: variant.tearEffects.streams, sourceAsset: manifest.assets[variant.sourceAsset] };
    });
    await page.goto('http://127.0.0.1:' + server.address().port); await page.evaluate(payload => (0, eval)(payload), payload); await select('night');
    // Isolate tears from lighting and blinks; the variant tear effect is independent.
    // Identical authored geometry times then cancel exactly in GPU subtraction.
    await page.evaluate(() => { const settings = __SIGRIKA_DENIA_FUSION__.getSettings(); settings.common.livingScene = false; settings.common.sceneEffects = false; __SIGRIKA_DENIA_FUSION__.setSettings(settings); });
    await select('night');
    const times = [0, 1.4, 2.6, 3.9, 5.0];
    await page.evaluate(async times => { self.normalTearReferences = []; for (const time of times) normalTearReferences.push(await __SUNLIT_LAYERED_SCENE__.capturePixels(time)); }, times);
    evidence.original = await page.evaluate(() => __SUNLIT_LAYERED_SCENE__.getStateAsync());
    await select('night-tears');
    await check('same-time GPU subtraction changes only Xixi tear support; original, Yaya and fixed anchors remain exact', async () => {
      const data = await page.evaluate(async ({ times, bounds, fixed }) => {
        const records = [], contact = document.createElement('canvas'); contact.width = 110 * 4 * 2; contact.height = 78 * 4 * times.length;
        const contactContext = contact.getContext('2d'); contactContext.imageSmoothingEnabled = false;
        for (let sample = 0; sample < times.length; sample++) {
          const reference = normalTearReferences[sample], actual = await __SUNLIT_LAYERED_SCENE__.capturePixels(times[sample]);
          const [left, top, width, height] = bounds; let changed = 0, outside = 0, yaya = 0, maxDifference = 0, minY = Infinity, maxY = -Infinity, hash = 2166136261;
          const fixedChanges = fixed.map(region => ({ id: region.id, changed: 0 }));
          for (let y = 0; y < actual.height; y++) for (let x = 0; x < actual.width; x++) {
            const i = ((actual.height - 1 - y) * actual.width + x) * 4, difference = Math.max(...[0, 1, 2, 3].map(k => Math.abs(reference.data[i + k] - actual.data[i + k])));
            maxDifference = Math.max(maxDifference, difference); if (!difference) continue;
            hash = Math.imul(hash ^ x ^ (y << 12) ^ difference, 16777619); changed++; minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            if (x < left - 2 || x >= left + width + 2 || y < top - 2 || y >= top + height + 2) outside++;
            if (x >= 730 && x <= 925 && y >= 95 && y <= 330) yaya++;
            fixed.forEach((region, index) => { const [left, top, width, height] = region.bounds; if (x >= left && x < left + width && y >= top && y < top + height) fixedChanges[index].changed++; });
          }
          for (const [column, capture] of [reference, actual].entries()) {
            const crop = document.createElement('canvas'); crop.width = 110; crop.height = 78; const ctx = crop.getContext('2d'), image = ctx.createImageData(110, 78);
            for (let y = 0; y < 78; y++) for (let x = 0; x < 110; x++) { const source = ((capture.height - 1 - (230 + y)) * capture.width + 510 + x) * 4; image.data.set(capture.data.subarray(source, source + 4), (y * 110 + x) * 4); }
            ctx.putImageData(image, 0, 0); contactContext.drawImage(crop, column * 440, sample * 312, 440, 312);
          }
          const diagnostics = await __SUNLIT_LAYERED_SCENE__.getStateAsync();
          records.push({ time: times[sample], changed, outside, yaya, fixedChanges, maxDifference, minY: changed ? minY : null, maxY: changed ? maxY : null, hash: hash >>> 0, frameId: actual.frameId, captureSequence: actual.captureSequence, tearEnabled: diagnostics.tearEnabled, tearAmounts: diagnostics.tearAmounts });
        }
        return { records, contact: contact.toDataURL('image/png') };
      }, { times, bounds: variant.tearEffects.bounds, fixed: spec.fixedVerificationRegions });
      fs.writeFileSync(path.join(output, 'tear-eye-contact-4x.png'), Buffer.from(data.contact.split(',')[1], 'base64'));
      evidence.sameTimePixels = data.records; evidence.contact = { file: 'tear-eye-contact-4x.png', magnification: 4, columns: ['original night', 'night-tears'], rowsSeconds: times, cropSourcePixels: [510, 230, 110, 78] };
      assert.equal(evidence.original.tearEnabled, false); assert.equal(data.records[0].changed, 0, 't0 must reconstruct original artwork exactly');
      for (const record of data.records) { assert.equal(record.tearEnabled, true); assert.equal(record.outside, 0, JSON.stringify(record)); assert.equal(record.yaya, 0); for (const fixed of record.fixedChanges) assert.equal(fixed.changed, 0, fixed.id); }
      const active = data.records.slice(1); assert.ok(active.filter(record => record.changed > 20).length >= 3, JSON.stringify(active)); assert.ok(new Set(active.map(record => record.hash)).size >= 3, 'Actual tear pixels must evolve along the authored timeline'); assert.ok(active.some(record => record.maxY >= 278), 'A rendered tear must visibly travel down the cheek');
    });
    await check('normal/tear switching and removal dispose the actual worker and settle pending captures', async () => {
      for (const scene of ['night', 'night-tears', 'night', 'night-tears']) { await select(scene); const state = await page.evaluate(() => __SUNLIT_LAYERED_SCENE__.getStateAsync()); assert.equal(state.tearEnabled, scene === 'night-tears'); }
      const settled = await page.evaluate(async () => { const pending = __SUNLIT_LAYERED_SCENE__.capturePixels(2.8).then(() => 'resolved', () => 'cancelled'); __SUNLIT_GALLERY__.selectScene('sunset'); return Promise.race([pending, new Promise(resolve => setTimeout(() => resolve('timeout'), 1500))]); });
      assert.notEqual(settled, 'timeout'); await page.waitForTimeout(120); assert.equal(page.workers().length, 0); assert.equal(await page.locator('.sunlit-layered-scene').count(), 0); await select('night-tears');
    });
    await check('eight-second natural Worker canvas preview decodes nonempty animated artwork at actual native cadence', async () => {
      await page.setViewportSize({ width: 960, height: 640 }); await select('night-tears');
      const recording = await page.evaluate(async () => {
        const settings = __SIGRIKA_DENIA_FUSION__.getSettings(); settings.common.livingScene = true; settings.common.sceneEffects = true; __SIGRIKA_DENIA_FUSION__.setSettings(settings);
        __SUNLIT_LAYERED_SCENE__.freezeTime(null); const before = await __SUNLIT_LAYERED_SCENE__.getStateAsync(), canvas = document.querySelector('.sunlit-layered-scene'), stream = canvas.captureStream(120), chunks = [];
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 3500000 }), stopped = new Promise(resolve => recorder.onstop = resolve); recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        const started = performance.now(); recorder.start(); await new Promise(resolve => setTimeout(resolve, 8000)); recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop());
        const after = await __SUNLIT_LAYERED_SCENE__.getStateAsync(), bytes = new Uint8Array(await new Blob(chunks).arrayBuffer()); let binary = ''; for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
        return { base64: btoa(binary), elapsedMs: performance.now() - started, width: canvas.width, height: canvas.height, configuredTargetFps: after.maxFps, observedRafHz: after.cadence.observedRafHz, actualWorkerFps: (after.cadence.renderedFrames - before.cadence.renderedFrames) * 1000 / (after.workerTimestamp - before.workerTimestamp), renderThread: after.renderThread };
      });
      fs.writeFileSync(path.join(output, 'night-tears.webm'), Buffer.from(recording.base64, 'base64'));
      const decoded = await page.evaluate(async base64 => {
        const video = document.createElement('video'); video.muted = true; video.src = 'data:video/webm;base64,' + base64;
        const wait = (event, action) => new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('decode timeout: ' + event)), 5000); video.addEventListener(event, () => { clearTimeout(timeout); resolve(); }, { once: true }); video.addEventListener('error', () => reject(new Error('Video decode failed')), { once: true }); action(); });
        await wait('loadeddata', () => video.load()); const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = Math.round(320 * video.videoHeight / video.videoWidth); const ctx = canvas.getContext('2d'), samples = [];
        for (const time of [.1, 3.6, 7.5]) { await wait('seeked', () => video.currentTime = time); ctx.drawImage(video, 0, 0, canvas.width, canvas.height); const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data; let nonblack = 0, hash = 2166136261; const colors = new Set(); for (let i = 0; i < data.length; i += 4) { if (Math.max(data[i], data[i + 1], data[i + 2]) > 8) nonblack++; colors.add((data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | data[i + 2] >> 3); hash = Math.imul(hash ^ data[i] ^ data[i + 1] << 8 ^ data[i + 2] << 16, 16777619); } samples.push({ time: video.currentTime, nonblackFraction: nonblack / (data.length / 4), colors: colors.size, hash: hash >>> 0 }); }
        return { width: video.videoWidth, height: video.videoHeight, samples };
      }, recording.base64);
      const { base64, ...metadata } = recording; evidence.preview = { ...metadata, decoded, file: 'night-tears.webm', backend: 'actual transferred Worker canvas.captureStream, natural time, no per-frame RPC', interpretation: '120 is a ceiling; actual GPU FPS follows native RAF, about60 on this display' };
      assert.equal(metadata.renderThread, 'worker'); assert.equal(metadata.configuredTargetFps, 120); assert.ok(metadata.elapsedMs >= 7900 && metadata.elapsedMs < 9000); assert.ok(metadata.actualWorkerFps >= Math.max(55, Math.min(metadata.observedRafHz, 120) * .92)); assert.equal(decoded.width, metadata.width); assert.equal(decoded.height, metadata.height); for (const sample of decoded.samples) { assert.ok(sample.nonblackFraction > .6); assert.ok(sample.colors > 128); } assert.ok(new Set(decoded.samples.map(sample => sample.hash)).size >= 2);
    });
    await page.evaluate(remove => (0, eval)(remove), remove); await page.waitForTimeout(100); assert.equal(page.workers().length, 0);
    await check('no uncaught browser errors', async () => assert.deepEqual(errors, []));
  } finally {
    await browser.close(); await new Promise(resolve => server.close(resolve));
    const report = { at: new Date().toISOString(), version: manifest.version, fingerprint: manifest.fingerprint, results, evidence, errors, passed: results.filter(result => result.passed).length, total: results.length }; fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); if (results.some(result => !result.passed)) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
