// Real distributable + real DedicatedWorker + actual GPU calls. Artwork-only DOM.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const fixedOwnershipSource = require('./scene-region-ownership.cjs').toString();
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-results/worker-scene');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('dist/theme/manifest.json')), spec = JSON.parse(read('theme/design/night-motion-spec.json'));
const payload = read('dist/theme/payload.js'), remove = read('dist/theme/remove.js');
const sourceAssetPath = manifest.assets[spec.sourceAsset], sourceImage = fs.readFileSync(path.join(root, 'theme', sourceAssetPath)), sourceMime = ({ '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[path.extname(sourceAssetPath).toLowerCase()];
const fixture = '<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><title>Worker 素材验证</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}main{position:relative;width:100%;height:100%;isolation:isolate}.thread-scroll-container{height:100%;overflow:auto}</style></head><body><main class="main-surface" data-app-shell-main-surface="default"><div class="thread-scroll-container"></div></main></body></html>';
const results = [], evidence = {}, errors = [];
const previewName = 'actual-worker direct canvas videos match available RAF at natural speed under a 120fps ceiling';
const previewsOnly = process.argv.includes('--previews-only'), captureOnly = process.argv.includes('--capture-only'), recordPreviews = previewsOnly || process.argv.includes('--record-previews');
const previewScene = process.argv.find(value => value.startsWith('--scene='))?.slice(8);
if (previewScene) assert.ok(previewsOnly && ['orchard', 'night'].includes(previewScene));
let previousReport = (previewsOnly || captureOnly) && fs.existsSync(path.join(output, 'report.json')) ? JSON.parse(fs.readFileSync(path.join(output, 'report.json'), 'utf8')) : null;
if (previousReport?.fingerprint !== manifest.fingerprint) previousReport = null;
if (previewScene) previousReport = null;
const previousReportTime = previousReport ? fs.statSync(path.join(output, 'report.json')).mtime.toISOString() : null;
async function check(name, task) { if (previewsOnly && name !== previewName || captureOnly && !/worker capture ACK|no uncaught/.test(name)) return; try { await task(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
// Count encoded video frames/timestamps from the actual WebM, rather than
// trusting captureStream's requested rate or a renderer's frame counter.
function inspectWebm(bytes) {
  let scaleNs = 1000000; const timestamps = [];
  function vint(offset, id = false) {
    let length = 1, marker = 128; while (length <= 8 && !(bytes[offset] & marker)) { marker >>= 1; length++; }
    assert.ok(length <= 8 && offset + length <= bytes.length, 'Invalid WebM VINT');
    let value = id ? bytes[offset] : bytes[offset] & (marker - 1), unknown = !id && value === marker - 1;
    for (let i = 1; i < length; i++) { value = value * 256 + bytes[offset + i]; unknown &&= bytes[offset + i] === 255; }
    return { value: unknown ? Infinity : value, length };
  }
  function walk(start, end, clusterTime = 0) {
    let offset = start, time = clusterTime;
    while (offset < end) {
      const id = vint(offset, true); offset += id.length; const size = vint(offset); offset += size.length; const next = Math.min(end, offset + size.value); assert.ok(next >= offset && next <= bytes.length);
      if ([0x18538067, 0x1f43b675, 0x1549a966, 0xa0].includes(id.value)) walk(offset, next, id.value === 0x1f43b675 ? 0 : time);
      else if (id.value === 0x2ad7b1) scaleNs = bytes.readUIntBE(offset, next - offset);
      else if (id.value === 0xe7) time = bytes.readUIntBE(offset, next - offset);
      else if ([0xa3, 0xa1].includes(id.value)) { const track = vint(offset), relative = bytes.readInt16BE(offset + track.length), flags = bytes[offset + track.length + 2], frameCount = flags & 6 ? bytes[offset + track.length + 3] + 1 : 1; for (let frame = 0; frame < frameCount; frame++) timestamps.push((time + relative) * scaleNs / 1e9); }
      offset = next;
    }
  }
  walk(0, bytes.length); assert.ok(timestamps.length > 1, 'Recorded WebM has no moving video frame sequence'); const seconds = Math.max(...timestamps) - Math.min(...timestamps);
  return { encodedFrames: timestamps.length, timestampSpanSeconds: seconds, encodedFps: (timestamps.length - 1) / seconds, bytes: bytes.length };
}
async function decodePreview(page, base64) {
  return page.evaluate(async base64 => {
    const binary = atob(base64), bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'video/webm' })), video = document.createElement('video'); video.muted = true; video.preload = 'auto';
    const event = (name, action) => new Promise((resolve, reject) => { const cleanup = () => { clearTimeout(timer); video.removeEventListener(name, done); video.removeEventListener('error', failed); }, done = () => { cleanup(); resolve(); }, failed = () => { cleanup(); reject(new Error('Video decode failed: ' + video.error?.message)); }, timer = setTimeout(() => { cleanup(); reject(new Error('Timed out decoding video ' + name)); }, 5000); video.addEventListener(name, done); video.addEventListener('error', failed); action(); });
    try {
      await event('loadeddata', () => { video.src = url; video.load(); });
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = Math.round(320 * video.videoHeight / video.videoWidth); const ctx = canvas.getContext('2d'), samples = [];
      for (const time of [.1, 3.6, 6.8]) {
        await event('seeked', () => video.currentTime = time); ctx.drawImage(video, 0, 0, canvas.width, canvas.height); const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let nonBlack = 0, sum = 0, squared = 0, hash = 2166136261; const colors = new Set();
        for (let i = 0; i < pixels.length; i += 4) { const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], value = .21 * r + .72 * g + .07 * b; if (Math.max(r, g, b) > 8) nonBlack++; sum += value; squared += value * value; colors.add((r >> 3) << 10 | (g >> 3) << 5 | b >> 3); hash = Math.imul(hash ^ r ^ (g << 8) ^ (b << 16), 16777619); }
        const count = pixels.length / 4; samples.push({ time: video.currentTime, nonBlackFraction: nonBlack / count, luminanceStdDev: Math.sqrt(squared / count - (sum / count) ** 2), colors: colors.size, hash: hash >>> 0 });
      }
      return { width: video.videoWidth, height: video.videoHeight, samples };
    } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
  }, base64);
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const launch = { headless: true }; if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) launch.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH; else launch.channel = 'msedge';
  const browser = await chromium.launch(launch), server = http.createServer((req, res) => { if (req.url === '/source-night') { res.setHeader('Content-Type', sourceMime); res.end(sourceImage); } else { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(fixture); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const url = 'http://127.0.0.1:' + server.address().port;
  const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, reducedMotion: 'no-preference' });
  const page = await context.newPage(), workerHistory = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('worker', worker => { const record = { url: worker.url(), closed: false }; workerHistory.push(record); worker.on('close', () => record.closed = true); });
  const state = () => page.evaluate(() => __SUNLIT_LAYERED_SCENE__.getState());
  async function ready(scene = 'night') {
    await page.waitForFunction(scene => { const state = window.__SUNLIT_LAYERED_SCENE__?.getState(); return state && state.scene === scene && (state.ready || state.error); }, scene, { timeout: 25000 });
    const actual = await state(); assert.equal(actual.error, null, JSON.stringify(actual)); assert.equal(actual.ready, true); assert.equal(actual.renderThread, 'worker', JSON.stringify(actual));
    await page.waitForFunction(() => document.querySelectorAll('.sunlit-layered-scene').length === 1);
    assert.equal(page.workers().length, 1, 'Exactly one real DedicatedWorker must own the active canvas'); return actual;
  }
  async function effects(light, blink) {
    await page.evaluate(({ light, blink }) => { const settings = __SIGRIKA_DENIA_FUSION__.getSettings(); settings.common.sceneEffects = light; settings.common.livingScene = blink; __SIGRIKA_DENIA_FUSION__.setSettings(settings); }, { light, blink });
    await page.waitForTimeout(60);
  }
  async function installGpuProbe(worker) {
    return worker.evaluate(() => {
      if (self.__actualGpuProbe) return;
      self.__actualGpuProbe = { clears: 0, draws: 0, clearTimes: [], rafs: 0, rafTimes: [] };
      const nativeRaf = self.requestAnimationFrame.bind(self);
      self.requestAnimationFrame = callback => nativeRaf(timestamp => { self.__actualGpuProbe.rafs++; self.__actualGpuProbe.rafTimes.push(performance.now()); callback(timestamp); });
      const constructors = [self.WebGLRenderingContext, self.WebGL2RenderingContext].filter(Boolean);
      for (const Constructor of constructors) {
        const proto = Constructor.prototype, clear = proto.clear, drawArrays = proto.drawArrays;
        proto.clear = function (...args) { const probe = self.__actualGpuProbe; probe.clears++; probe.clearTimes.push(performance.now()); return clear.apply(this, args); };
        proto.drawArrays = function (...args) { self.__actualGpuProbe.draws++; return drawArrays.apply(this, args); };
      }
      if (!constructors.length) throw new Error('No real WebGL prototype in the dedicated worker');
    });
  }
  const gpuState = worker => worker.evaluate(() => ({ ...self.__actualGpuProbe, clearTimes: self.__actualGpuProbe.clearTimes.slice(), workerTime: performance.now() }));
  try {
    await page.goto(url);
    await page.evaluate(() => { window.fixtureHidden = false; Object.defineProperty(document, 'hidden', { configurable: true, get: () => fixtureHidden }); });
    await page.evaluate(payload => (0, eval)(payload), payload); await page.evaluate(() => __SUNLIT_GALLERY__.selectScene('night')); await ready();
    await check('default payload transfers its artwork canvas to a real DedicatedWorker', async () => {
      const actual = await ready();
      assert.equal(actual.maxFps, 120); assert.equal(actual.sourceWidth, spec.width); assert.equal(actual.sourceHeight, spec.height);
      const expectedIds = manifest.config.layeredScene.scenes.night.layers.map(layer => layer.id || layer.asset);
      assert.equal(actual.layers, expectedIds.length, 'Worker must receive every authored layer'); assert.deepEqual(actual.layerMotion.map(layer => layer.id), expectedIds, 'Worker cannot silently lose newly added parts');
      assert.equal(await page.evaluate(() => typeof __SUNLIT_LAYERED_SCENE__.capturePixels), 'function');
      const canvasTransferred = await page.evaluate(() => { try { document.querySelector('.sunlit-layered-scene').getContext('webgl2'); return false; } catch (error) { return error.name === 'InvalidStateError'; } });
      assert.equal(canvasTransferred, true, 'The visible artwork canvas must actually transfer ownership off the main thread'); evidence.initial = { ...actual, canvasTransferred, actualWorkerUrl: page.workers()[0].url() };
    });
    if (!(await state()).ready) throw new Error('Worker bootstrap failed; no dependent capture can run');
    await check('worker capture ACK comes from GPU readPixels; t0 and fixed anchors remain exact', async () => {
      await effects(false, false);
      const result = await page.evaluate(async ({ spec, fixedOwnershipSource }) => {
        const fixedOwnership = (0, eval)('(' + fixedOwnershipSource + ')')(spec);
        const first = await __SUNLIT_LAYERED_SCENE__.capturePixels(0), second = await __SUNLIT_LAYERED_SCENE__.capturePixels(.8);
        const image = new Image(); image.src = '/source-night'; await image.decode(); const source = document.createElement('canvas'); source.width = image.naturalWidth; source.height = image.naturalHeight; const ctx = source.getContext('2d'); ctx.drawImage(image, 0, 0); const original = ctx.getImageData(0, 0, source.width, source.height).data;
        let originalMaxDifference = 0, changed = 0; const fixed = spec.fixedVerificationRegions.map(region => ({ id: region.id, changed: 0, rawChanged: 0, authoredBraidChanged: 0 }));
        for (let y = 0; y < first.height; y++) for (let x = 0; x < first.width; x++) {
          const a = ((first.height - 1 - y) * first.width + x) * 4, b = (y * first.width + x) * 4;
          originalMaxDifference = Math.max(originalMaxDifference, ...[0, 1, 2, 3].map(k => Math.abs(first.data[a + k] - original[b + k])));
          if (Math.max(...[0, 1, 2, 3].map(k => Math.abs(first.data[a + k] - second.data[a + k]))) <= 2) continue;
          changed++; spec.fixedVerificationRegions.forEach((region, index) => { const [left, top, width, height] = region.bounds; if (x >= left && x < left + width && y >= top && y < top + height) { fixed[index].rawChanged++; if (fixedOwnership.contains(region.id, x, y)) fixed[index].authoredBraidChanged++; else fixed[index].changed++; } });
        }
        const meta = capture => ({ width: capture.width, height: capture.height, frameId: capture.frameId, workerTimestamp: capture.workerTimestamp, captureSequence: capture.captureSequence, time: capture.time });
        return { first: meta(first), second: meta(second), originalMaxDifference, changed, fixed, fixedOwnership: fixedOwnership.metadata, typedPixels: first.data instanceof Uint8Array, length: first.data.length };
      }, { spec, fixedOwnershipSource });
      evidence.captures = result; assert.equal(result.typedPixels, true); assert.equal(result.length, spec.width * spec.height * 4); assert.equal(result.first.width, spec.width); assert.equal(result.first.height, spec.height); assert.ok(result.originalMaxDifference <= 1, JSON.stringify(result));
      assert.ok(result.second.captureSequence > result.first.captureSequence); assert.ok(result.second.frameId > result.first.frameId); assert.ok(result.second.workerTimestamp >= result.first.workerTimestamp); assert.ok(result.changed >= spec.width * spec.height * .006); for (const region of result.fixed) assert.equal(region.changed, 0, region.id);
    });
    await check('actual GPU images advance at explicit 1/120-second timeline steps without claiming display 120Hz', async () => {
      await effects(false, false);
      const actual = await page.evaluate(async () => {
        const times = [.5, .5 + 1 / 120, .5 + 2 / 120], captures = [];
        for (const time of times) captures.push(await __SUNLIT_LAYERED_SCENE__.capturePixels(time));
        const changes = [];
        for (let frame = 1; frame < captures.length; frame++) { const previous = captures[frame - 1], current = captures[frame]; let changed = 0; for (let i = 0; i < current.data.length; i += 4) if (Math.max(...[0, 1, 2].map(k => Math.abs(current.data[i + k] - previous.data[i + k]))) > 2) changed++; changes.push({ changed, timeDelta: current.time - previous.time, frameId: current.frameId, previousFrameId: previous.frameId, captureSequence: current.captureSequence }); }
        return { times: captures.map(capture => capture.time), changes, interpretation: 'Real GPU readbacks at explicit 1/120-second authored times; this is not measured monitor FPS' };
      });
      evidence.timeline120 = actual; for (const change of actual.changes) { assert.ok(Math.abs(change.timeDelta - 1 / 120) < 1e-8); assert.ok(change.frameId > change.previousFrameId); assert.ok(change.changed > 20, '120Hz timeline was rounded to repeated lower-rate image states'); }
    });
    await check('worker blink changes only the active character eye masks', async () => {
      await effects(false, false); const open = await page.evaluate(async () => { const capture = await __SUNLIT_LAYERED_SCENE__.capturePixels(6.2); self.workerOpenEyes = capture; return capture.captureSequence; });
      await effects(false, true);
      const result = await page.evaluate(async spec => {
        const closed = await __SUNLIT_LAYERED_SCENE__.capturePixels(6.2), open = workerOpenEyes; let changed = 0, outsideEyes = 0; const eyes = spec.eyes.map(eye => ({ id: eye.id, group: eye.group, changed: 0 }));
        for (let y = 0; y < open.height; y++) for (let x = 0; x < open.width; x++) {
          const index = ((open.height - 1 - y) * open.width + x) * 4; if (Math.max(...[0, 1, 2, 3].map(k => Math.abs(open.data[index + k] - closed.data[index + k]))) <= 2) continue; changed++; let inside = false;
          spec.eyes.forEach((eye, i) => { const dx = x + .5 - eye.center[0] * spec.width, dy = y + .5 - eye.center[1] * spec.height, angle = eye.angle || 0, qx = Math.cos(angle) * dx + Math.sin(angle) * dy, qy = -Math.sin(angle) * dx + Math.cos(angle) * dy; if (Math.hypot(qx / (eye.radius[0] * spec.width + 2), qy / (eye.radius[1] * spec.height + 2)) <= 1.05) { inside = true; eyes[i].changed++; } }); if (!inside) outsideEyes++;
        }
        delete self.workerOpenEyes; return { changed, outsideEyes, eyes, captureSequence: closed.captureSequence };
      }, spec);
      evidence.blink = result; assert.ok(result.captureSequence > open); assert.ok(result.changed > 500); assert.equal(result.outsideEyes, 0); for (const eye of result.eyes) { if (eye.group === 0) assert.ok(eye.changed > 100); else assert.equal(eye.changed, 0); }
    });
    await check('default Worker and unsupported-transfer fallback produce identical full RGBA at authored times', async () => {
      const fallbackContext = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, reducedMotion: 'no-preference' }), fallback = await fallbackContext.newPage();
      evidence.backendEquivalence = [];
      const digest = (page, time) => page.evaluate(async time => { const capture = await __SUNLIT_LAYERED_SCENE__.capturePixels(time), digest = new Uint8Array(await crypto.subtle.digest('SHA-256', capture.data)); return { width: capture.width, height: capture.height, frameId: capture.frameId, time: capture.time, rgbaSha256: Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('') }; }, time);
      try {
        await fallback.addInitScript(() => Object.defineProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen', { configurable: true, value: undefined })); await fallback.goto(url); await fallback.evaluate(payload => (0, eval)(payload), payload);
        for (const scene of ['orchard', 'night', 'night-tears']) {
          const viewport = scene === 'orchard' ? { width: 1280, height: 1280 } : { width: spec.width, height: spec.height };
          await page.setViewportSize(viewport); await fallback.setViewportSize(viewport);
          await page.evaluate(scene => __SUNLIT_GALLERY__.selectScene(scene), scene); await ready(scene); await effects(false, false);
          await fallback.evaluate(scene => __SUNLIT_GALLERY__.selectScene(scene), scene); await fallback.waitForFunction(scene => { const state = __SUNLIT_LAYERED_SCENE__.getState(); return state.scene === scene && (state.ready || state.error); }, scene);
          const mainState = await fallback.evaluate(() => { const settings = __SIGRIKA_DENIA_FUSION__.getSettings(); settings.common.sceneEffects = false; settings.common.livingScene = false; __SIGRIKA_DENIA_FUSION__.setSettings(settings); return __SUNLIT_LAYERED_SCENE__.getState(); }); assert.equal(mainState.error, null); assert.equal(mainState.renderThread, 'main');
          for (const time of [0, .9, 3.9]) { const worker = await digest(page, time), main = await digest(fallback, time); evidence.backendEquivalence.push({ scene, time, worker, main, comparison: 'SHA-256 of every actual GPU RGBA byte; includes source alpha and filtered moving edges' }); assert.equal(worker.width, main.width); assert.equal(worker.height, main.height); assert.equal(worker.rgbaSha256, main.rgbaSha256, scene + ' at ' + time + ' has a real main/Worker RGBA difference'); }
        }
      } finally { await fallbackContext.close(); await page.setViewportSize({ width: spec.width, height: spec.height }); await page.evaluate(() => __SUNLIT_GALLERY__.selectScene('night')); await ready(); }
    });
    await check('actual worker GPU matches min(observed RAF,120) through repeated 250ms main-thread stalls', async () => {
      await effects(true, true); await page.evaluate(() => __SUNLIT_LAYERED_SCENE__.freezeTime(null)); await page.waitForTimeout(150);
      const worker = page.workers()[0]; await installGpuProbe(worker);
      const beforeCapture = await page.evaluate(async () => { const capture = await __SUNLIT_LAYERED_SCENE__.capturePixels(); let hash = 2166136261; for (let i = 0; i < capture.data.length; i += 97) hash = Math.imul(hash ^ capture.data[i], 16777619); return { hash: hash >>> 0, time: capture.time, frameId: capture.frameId }; });
      const before = await gpuState(worker);
      const mainThread = await page.evaluate(async () => { const started = performance.now(), stalls = []; for (let index = 0; index < 8; index++) { const start = performance.now(); while (performance.now() - start < 250) Math.sqrt(Math.random()); stalls.push(performance.now() - start); await new Promise(resolve => setTimeout(resolve, 50)); } return { elapsedMs: performance.now() - started, stalls }; });
      const after = await gpuState(worker), seconds = (after.workerTime - before.workerTime) / 1000, clears = after.clears - before.clears, draws = after.draws - before.draws, timestamps = after.clearTimes.slice(before.clearTimes.length), intervals = timestamps.slice(1).map((time, index) => time - timestamps[index]);
      const afterCapture = await page.evaluate(async () => { const capture = await __SUNLIT_LAYERED_SCENE__.capturePixels(); let hash = 2166136261; for (let i = 0; i < capture.data.length; i += 97) hash = Math.imul(hash ^ capture.data[i], 16777619); return { hash: hash >>> 0, time: capture.time, frameId: capture.frameId, state: capture.state }; });
      const observedRafHz = (after.rafs - before.rafs) / seconds, availableTargetFps = Math.min(observedRafHz, 120);
      const expectedPassesPerFrame = manifest.config.layeredScene.scenes.night.layers.length + 1;
      const actual = { mainThread, configuredTargetFps: 120, observedRafHz, availableTargetFps, workerSeconds: seconds, actualGpuFrames: clears, actualDrawArrays: draws, expectedPassesPerFrame, actualGpuFps: clears / seconds, maxGpuFrameIntervalMs: Math.max(...intervals), beforeCapture, afterCapture, instrument: 'real DedicatedWorker native RAF callbacks and WebGL clear/drawArrays prototypes; independent of renderer counters' };
      evidence.mainThreadStalls = actual; assert.equal(mainThread.stalls.length, 8); assert.ok(mainThread.stalls.every(ms => ms >= 249)); assert.ok(observedRafHz >= 55, 'The available native RAF stream itself is stalled on this verified 60Hz-or-faster environment'); assert.ok(actual.actualGpuFps >= Math.max(55, availableTargetFps * .92) && actual.actualGpuFps <= availableTargetFps * 1.08, JSON.stringify(actual)); assert.ok(draws >= clears * expectedPassesPerFrame, 'Every actual frame clear must be followed by its base and all authored layer draws'); assert.ok(actual.maxGpuFrameIntervalMs < Math.max(50, 3000 / availableTargetFps), 'Worker inherited a main-thread-size render stall'); assert.notEqual(afterCapture.hash, beforeCapture.hash, 'Natural-time GPU pixels must advance while main was blocked'); assert.ok(afterCapture.frameId > beforeCapture.frameId); assert.ok(afterCapture.time - beforeCapture.time >= 1.8);
    });
    await check('input/wheel/scroll pause genuine worker GPU calls and resume', async () => {
      const worker = page.workers()[0]; await installGpuProbe(worker);
      for (const event of ['input', 'wheel', 'scroll']) {
        await page.evaluate(event => document.dispatchEvent(new Event(event, { bubbles: true })), event); await page.waitForTimeout(30);
        const stopped = await gpuState(worker); await page.waitForTimeout(100); const still = await gpuState(worker); assert.equal(still.clears, stopped.clears, event + ' failed to pause actual GPU frames');
        await page.waitForTimeout(190); assert.ok((await gpuState(worker)).clears > still.clears, event + ' did not resume worker drawing');
      }
    });
    await check('ordinary pointer hover does not pause the worker', async () => {
      const worker = page.workers()[0], before = await gpuState(worker);
      for (let index = 0; index < 8; index++) { await page.evaluate(index => document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 0, clientX: 40 + index * 20, clientY: 50 })), index); await page.waitForTimeout(25); }
      const after = await gpuState(worker); assert.ok(after.clears - before.clears >= 10); assert.equal((await state()).paused, false);
    });
    await check('hidden/reduced-motion/focus/disabled terminate worker rendering and restore CSS', async () => {
      const guards = [
        { set: () => page.evaluate(() => { fixtureHidden = true; document.dispatchEvent(new Event('visibilitychange')); }), reset: () => page.evaluate(() => { fixtureHidden = false; document.dispatchEvent(new Event('visibilitychange')); }) },
        { set: () => page.emulateMedia({ reducedMotion: 'reduce' }), reset: () => page.emulateMedia({ reducedMotion: 'no-preference' }) },
        { set: () => page.evaluate(() => { const settings = __SIGRIKA_DENIA_FUSION__.getSettings(); settings.common.focusMode = true; __SIGRIKA_DENIA_FUSION__.setSettings(settings); }), reset: () => page.evaluate(() => { const settings = __SIGRIKA_DENIA_FUSION__.getSettings(); settings.common.focusMode = false; __SIGRIKA_DENIA_FUSION__.setSettings(settings); }) },
        { set: () => page.evaluate(() => { const settings = __SIGRIKA_DENIA_FUSION__.getSettings(); settings.common.layeredScene = false; __SIGRIKA_DENIA_FUSION__.setSettings(settings); }), reset: () => page.evaluate(() => { const settings = __SIGRIKA_DENIA_FUSION__.getSettings(); settings.common.layeredScene = true; __SIGRIKA_DENIA_FUSION__.setSettings(settings); }) }
      ];
      for (const guard of guards) { await guard.set(); await page.waitForTimeout(100); assert.equal(page.workers().length, 0); assert.equal(await page.locator('.sunlit-layered-scene').count(), 0); assert.equal(await page.locator('main').evaluate(node => getComputedStyle(node, '::before').visibility), 'visible'); await guard.reset(); await ready(); }
    });
    await check('rapid gallery switching closes stale workers and settles pending capture promises', async () => {
      const pending = await page.evaluate(async () => { const capture = __SUNLIT_LAYERED_SCENE__.capturePixels(5.3).then(() => 'resolved', () => 'cancelled'); __SUNLIT_GALLERY__.selectScene('orchard'); return await Promise.race([capture, new Promise(resolve => setTimeout(() => resolve('timeout'), 1500))]); });
      assert.notEqual(pending, 'timeout', 'Replacing the worker must settle in-flight capture requests');
      await page.evaluate(async () => { for (let index = 0; index < 15; index++) { __SUNLIT_GALLERY__.selectScene(['orchard', 'night', 'sunset'][index % 3]); await new Promise(resolve => setTimeout(resolve, 3)); } __SUNLIT_GALLERY__.selectScene('night'); });
      await ready(); await page.waitForTimeout(100); assert.equal(page.workers().length, 1); assert.ok(workerHistory.filter(worker => worker.closed).length >= 5);
      await page.evaluate(() => __SUNLIT_GALLERY__.selectScene('sunset')); await page.waitForTimeout(120); assert.equal(page.workers().length, 0); assert.equal((await state()).loopScheduled, false); assert.equal(await page.locator('.sunlit-layered-scene').count(), 0);
      await page.evaluate(() => __SUNLIT_GALLERY__.selectScene('night')); await ready(); evidence.workerLifecycle = { workersCreated: workerHistory.length, workersClosed: workerHistory.filter(worker => worker.closed).length, pendingCapture: pending };
    });
    if (recordPreviews) await check(previewName, async () => {
      evidence.previews = {};
      for (const scene of previewScene ? [previewScene] : ['orchard', 'night']) {
        await page.setViewportSize({ width: 960, height: scene === 'orchard' ? 960 : 640 });
        await page.evaluate(scene => __SUNLIT_GALLERY__.selectScene(scene), scene); await ready(scene); await effects(true, true);
        const recording = await page.evaluate(async () => {
          __SUNLIT_LAYERED_SCENE__.freezeTime(null); const before = await __SUNLIT_LAYERED_SCENE__.getStateAsync(), canvas = document.querySelector('.sunlit-layered-scene'), stream = canvas.captureStream(120), chunks = [];
          const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 3500000 }), finished = new Promise(resolve => recorder.onstop = resolve);
          recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); }; const began = performance.now(); recorder.start(); await new Promise(resolve => setTimeout(resolve, 7200)); recorder.stop(); await finished;
          const elapsedMs = performance.now() - began, after = await __SUNLIT_LAYERED_SCENE__.getStateAsync(), requestedFps = stream.getVideoTracks()[0].getSettings().frameRate; stream.getTracks().forEach(track => track.stop());
          const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer()); let binary = ''; for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
          return { base64: btoa(binary), elapsedMs, requestedFps, configuredTargetFps: before.maxFps, codec: 'vp8', videoBitsPerSecond: 3500000, before: { renderThread: before.renderThread, width: before.width, height: before.height, workerTimestamp: before.workerTimestamp, renderedFrames: before.cadence.renderedFrames }, after: { renderThread: after.renderThread, workerTimestamp: after.workerTimestamp, renderedFrames: after.cadence.renderedFrames, observedRafHz: after.cadence.observedRafHz }, backend: 'actual-transferred-worker-canvas.captureStream; natural clock; no per-frame RPC' };
        });
        const bytes = Buffer.from(recording.base64, 'base64'), encoded = inspectWebm(bytes), { base64, ...metadata } = recording;
        fs.writeFileSync(path.join(output, scene + '-motion.webm'), bytes); const decoded = await decodePreview(page, recording.base64); evidence.previews[scene] = { ...metadata, ...encoded, decoded };
        assert.equal(decoded.width, metadata.before.width); assert.equal(decoded.height, metadata.before.height); for (const sample of decoded.samples) { assert.ok(sample.nonBlackFraction > .6, 'Actual decoded preview is blank'); assert.ok(sample.luminanceStdDev > 15); assert.ok(sample.colors > 128); } assert.ok(new Set(decoded.samples.map(sample => sample.hash)).size >= 2, 'Decoded video pixels must actually animate');
        assert.equal(metadata.before.renderThread, 'worker'); assert.equal(metadata.after.renderThread, 'worker'); assert.equal(metadata.requestedFps, 120); assert.equal(metadata.configuredTargetFps, 120);
        const available = Math.min(metadata.after.observedRafHz, 120), minimum = Math.max(55, available * .92);
        assert.ok(encoded.timestampSpanSeconds >= 7 && encoded.timestampSpanSeconds <= 7.6, 'Preview must retain natural 7.2-second timing'); assert.ok(encoded.encodedFps >= minimum && encoded.encodedFps <= available * 1.08, 'Actual encoded WebM cadence missed available RAF: ' + JSON.stringify({ ...encoded, available, minimum }));
        const workerFps = (metadata.after.renderedFrames - metadata.before.renderedFrames) / ((metadata.after.workerTimestamp - metadata.before.workerTimestamp) / 1000); assert.ok(workerFps >= minimum, 'Actual worker slowed while recording: ' + workerFps);
      }
    });
    await check('remover terminates its actual worker and settles an in-flight capture', async () => {
      const settled = await page.evaluate(async remove => { const pending = __SUNLIT_LAYERED_SCENE__.capturePixels(4.9).then(() => 'resolved', () => 'cancelled'); await (0, eval)(remove); return await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve('timeout'), 1500))]); }, remove);
      assert.notEqual(settled, 'timeout'); await page.waitForTimeout(100); assert.equal(page.workers().length, 0); assert.equal(await page.locator('.sunlit-layered-scene').count(), 0); assert.equal(await page.evaluate(() => !!window.__SUNLIT_LAYERED_SCENE__), false);
    });
    await check('without canvas transfer support the distributable loads its main-thread fallback', async () => {
      const fallback = await context.newPage(); try { await fallback.addInitScript(() => Object.defineProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen', { configurable: true, value: undefined })); await fallback.goto(url); await fallback.evaluate(payload => (0, eval)(payload), payload); await fallback.waitForFunction(() => __SUNLIT_LAYERED_SCENE__.getState().ready || __SUNLIT_LAYERED_SCENE__.getState().error); const state = await fallback.evaluate(() => __SUNLIT_LAYERED_SCENE__.getState()); assert.equal(state.ready, true, JSON.stringify(state)); assert.equal(state.renderThread, 'main'); assert.equal(fallback.workers().length, 0); await fallback.evaluate(remove => (0, eval)(remove), remove); } finally { await fallback.close(); }
    });
    await check('no uncaught browser errors', async () => assert.deepEqual(errors, []));
  } finally {
    await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
    const combinedResults = previousReport ? [...previousReport.results.filter(item => !results.some(next => next.name === item.name)), ...results] : results, combinedEvidence = { ...previousReport?.evidence, ...evidence };
    const history = previousReport?.validationHistory || (previousReport ? [{ at: previousReportTime, scope: 'Prior core Worker suite; retained evidence from the identical fingerprint' }] : []);
    const report = { version: manifest.version, fingerprint: manifest.fingerprint, validationHistory: [...history, { at: new Date().toISOString(), scope: captureOnly ? 'Only GPU source/fixed-region capture and browser errors rerun after correcting the source-reviewed braid/glove test ROI; all other same-fingerprint core and video evidence retained' : previewsOnly ? 'Only direct Worker preview encoding/decoding regenerated; core cases not rerun' : 'Core Worker suite and requested preview cases' }], results: combinedResults, evidence: combinedEvidence, errors: [...(previousReport?.errors || []), ...errors], passed: combinedResults.filter(result => result.passed).length, total: combinedResults.length }; fs.writeFileSync(path.join(output, previewScene ? previewScene + '-preview-followup.json' : 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); if (combinedResults.some(result => !result.passed)) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
