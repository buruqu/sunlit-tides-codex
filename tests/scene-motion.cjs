// Actual authored scene assets and distributable payload, on an artwork-only fixture.
// Run after build:theme. No Codex connection or real conversation is used.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const fixedOwnershipSource = require('./scene-region-ownership.cjs').toString();
const { loadModel, motionPeaks } = require('./motion-production-model.cjs');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-results/scene-motion');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('theme/manifest.json'));
const builtManifest = JSON.parse(read('dist/theme/manifest.json')), builtScript = read('dist/theme/theme.js'), builtPayload = read('dist/theme/payload.js'), builtRemove = read('dist/theme/remove.js');
const source = read('theme/design/layered-scene.js'), css = read('theme/design/layered-scene.css');
const imageMime = file => ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' }[path.extname(file).toLowerCase()]);
const assets = Object.fromEntries(Object.entries(manifest.assets).map(([id, file]) => [id, 'data:' + imageMime(file) + ';base64,' + fs.readFileSync(path.join(root, 'theme', file)).toString('base64')]));
const results = [], evidence = {}, errors = [];
// Measured v1.2.2 authored free-point peaks. The new motion must materially
// increase actual source-space displacement, rather than merely affect light.
const motionBaseline = {
  orchard: { 'orchard-layer-xixi-braid-mid': 7.880346, 'orchard-layer-xixi-braid-low': 14.132184, 'orchard-layer-denia-hair-middle': 16.219319, 'orchard-layer-denia-hair-lower': 20.431686, 'orchard-layer-denia-hair-tip': 18.818040, 'orchard-layer-denia-skirt-hem': 17.957604 },
  night: { 'night-xixi-free-hair-end': 8.183372, 'night-yaya-free-upper-wisp': 10.582316, 'night-xixi-loose-cloak-hem': 8.756969, 'night-xixi-right-hanging-tassel': 7.185480, 'night-yaya-free-long-hair': 13.557178, 'night-yaya-loose-sleeve-hem': 12.627748 }
};
const flexKinds = ['hair', 'cloth', 'foliage'];
const idOf = layer => layer.id || layer.asset;
const requiredNaturalParts = {
  orchard: ['orchard-motion-xixi-small-braid-left', 'orchard-motion-xixi-small-braid-right', 'orchard-motion-yaya-spiral-left', 'orchard-motion-yaya-spiral-right', 'orchard-motion-xixi-ahoge', 'orchard-motion-yaya-bang-tip', 'orchard-motion-leaf-upper', 'orchard-motion-leaf-lower'],
  night: ['night-xixi-small-braid-left', 'night-xixi-small-braid-right', 'night-yaya-spiral-left', 'night-yaya-spiral-right', 'night-xixi-bang-tip', 'night-yaya-crown-wisp']
};
// Read-only source-art review selected these small regions away from hair,
// blink masks and tear tracks. Face/ornament motion cannot count as hair sway.
const protectedDetailCenters = {
  orchard: [['xixi-white-bow', 318, 617], ['xixi-face', 394, 437], ['yaya-face', 812, 380], ['left-red-fruit', 18, 538], ['upper-red-apple', 190, 171]],
  night: [['xixi-face', 565, 268], ['yaya-face', 843, 244], ['red-glove', 652, 302], ['xixi-left-white-bow', 493, 447], ['xixi-right-white-bow', 623, 449]]
};
const isNaturalPart = (scene, layer) => flexKinds.includes(layer.kind) && !motionBaseline[scene][idOf(layer)] && idOf(layer) !== 'night-xixi-braid-loop';
function motionLimits(scene, layer) {
  const previous = motionBaseline[scene][idOf(layer)];
  if(scene==='orchard' && /orchard-motion-(xixi-small-braid|yaya-spiral)/.test(idOf(layer)))return {minimum:2,maximum:8.6,changed:12,previous:null};
  if (previous) return { minimum: previous * 1.4, maximum: null, changed: 100, previous };
  if (idOf(layer) === 'night-xixi-braid-loop') return { minimum: 16, maximum: null, changed: 100, previous: null };
  return { minimum: 1.5, maximum: layer.kind === 'foliage' ? 5 : 6, changed: layer.kind === 'foliage' ? 24 : 12, previous: null };
}
const previewsOnly = process.argv.includes('--previews-only');
const motionOnly = process.argv.includes('--motion-only');
const verticesOnly = process.argv.includes('--vertices-only');
const onlyScene = process.argv.find(value => value.startsWith('--scene='))?.slice(8);
if (onlyScene) assert.ok(['orchard', 'night'].includes(onlyScene));
const previousReport = previewsOnly && fs.existsSync(path.join(output, 'report.json')) ? JSON.parse(fs.readFileSync(path.join(output, 'report.json'), 'utf8')) : null;
async function check(name, task) { if (previewsOnly && !name.includes('WebM previews')) return; if (verticesOnly && !/built candidate|actual authored assets|actual GPU vertex|no uncaught/.test(name)) return; if (motionOnly && /normal pointer|input\/wheel|hidden\/reduced|other gallery|rapid scene|WebGL unavailable|WebM previews|actual distributable/.test(name)) return; if (onlyScene && !name.startsWith(onlyScene + ':') && !name.startsWith('built candidate') && !name.startsWith('no uncaught')) return; try { await task(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
const fixture = '<!doctype html><html data-theme="light"><head><meta charset="utf-8"><title>晴光与泡影 · 素材运动验证</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}main{position:relative;width:100%;height:100%;isolation:isolate}main::before{content:"";position:absolute;inset:0;z-index:-2;background:#25354a;background-size:cover;background-position:50% 32%;opacity:1}.thread-scroll-container{height:100%;overflow:auto}</style></head><body><main class="main-surface" data-app-shell-main-surface="default"><div class="thread-scroll-container"></div></main><div id="fixture-root"></div></body></html>';
const sceneOptions = id => manifest.config.layeredScene.scenes?.[id] || (id === 'orchard' ? manifest.config.layeredScene : null);
// Search the actual bounded production response in CPU time; do not spend GPU
// frames searching a waveform or assume that period/4 is still its peak.
const peakPlans = Object.fromEntries(['orchard', 'night'].map(scene => [scene, motionPeaks(loadModel(source, sceneOptions(scene), scene))]));
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const launch = { headless: true };
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) launch.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH; else launch.channel = 'msedge';
  const browser = await chromium.launch(launch);
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fixture); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  try {
    await check('built candidate includes the exact tested scene configuration and renderer', async () => {
      assert.deepEqual(builtManifest.config, manifest.config);
      assert.ok(builtScript.includes(source.trim()), 'Build is stale relative to the renderer under test');
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1280 }, reducedMotion: 'no-preference' });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.addStyleTag({ content: css });
    await page.evaluate(({ source, config, assets }) => {
      const html = document.documentElement; html.classList.add('sgk-theme', 'tessalume-theme-active', 'tessalume-is-task');
      html.dataset.sgkScene = 'orchard'; html.dataset.fusionLayeredScene = 'true';
      document.querySelector('main').dataset.tessalumeSurface = 'main';
      window.fixtureHidden = false; Object.defineProperty(document, 'hidden', { configurable: true, get: () => fixtureHidden });
      window.layoutReads = window.styleReads = 0;
      const nativeRect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () { layoutReads++; return nativeRect.call(this); };
      const nativeStyle = window.getComputedStyle; window.getComputedStyle = (...args) => { styleReads++; return nativeStyle(...args); };
      // Optional, fixture-only capture of actual GPU vertex outputs. The native
      // program is unchanged apart from requesting its built-in position output.
      window.motionTf = { supported: false, reason: 'WebGL2 unavailable', enabled: false, draws: [] };
      if (window.WebGL2RenderingContext) {
        const proto = WebGL2RenderingContext.prototype, link = proto.linkProgram, draw = proto.drawArrays, programs = new WeakSet();
        proto.linkProgram = function (program) {
          this.transformFeedbackVaryings(program, ['gl_Position'], this.INTERLEAVED_ATTRIBS); link.call(this, program);
          if (this.getProgramParameter(program, this.LINK_STATUS)) { programs.add(program); motionTf.supported = true; motionTf.reason = null; }
          else { motionTf.reason = this.getProgramInfoLog(program); this.transformFeedbackVaryings(program, [], this.INTERLEAVED_ATTRIBS); link.call(this, program); }
        };
        proto.drawArrays = function (mode, first, count) {
          if (!motionTf.enabled || !programs.has(this.getParameter(this.CURRENT_PROGRAM))) return draw.call(this, mode, first, count);
          const tf = this.createTransformFeedback(), buffer = this.createBuffer(), previousTf = this.getParameter(this.TRANSFORM_FEEDBACK_BINDING), previousBuffer = this.getParameter(this.TRANSFORM_FEEDBACK_BUFFER_BINDING), output = new Float32Array(count * 4), input = new Float32Array(count * 2);
          try {
            this.bindTransformFeedback(this.TRANSFORM_FEEDBACK, tf); this.bindBuffer(this.TRANSFORM_FEEDBACK_BUFFER, buffer); this.bufferData(this.TRANSFORM_FEEDBACK_BUFFER, output.byteLength, this.STREAM_READ); this.bindBufferBase(this.TRANSFORM_FEEDBACK_BUFFER, 0, buffer);
            this.beginTransformFeedback(this.TRIANGLES); draw.call(this, mode, first, count); this.endTransformFeedback();
            this.getBufferSubData(this.TRANSFORM_FEEDBACK_BUFFER, 0, output); this.getBufferSubData(this.ARRAY_BUFFER, first * 8, input); motionTf.draws.push({ first, count, input, output });
          } finally { this.bindTransformFeedback(this.TRANSFORM_FEEDBACK, previousTf); this.bindBuffer(this.TRANSFORM_FEEDBACK_BUFFER, previousBuffer); this.deleteTransformFeedback(tf); this.deleteBuffer(buffer); }
        };
      }
      window.fixtureContext = { window, document, root: document.getElementById('fixture-root'), config, assets };
      (0, eval)(source + '\nwindow.remountMotionFixture=()=>mountSunlitLayeredScene(fixtureContext);'); remountMotionFixture();
      window.pixelsAt = time => {
        __SUNLIT_LAYERED_SCENE__.freezeTime(time);
        const canvas = document.querySelector('.sunlit-layered-scene'), state = __SUNLIT_LAYERED_SCENE__.getState(), gl = canvas.getContext(state.renderer), data = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
        return { data, width: canvas.width, height: canvas.height };
      };
      window.diffFrames = (a, b, rectangles = []) => {
        let changed = 0, maxDifference = 0, boundaryChanged = 0; const regions = rectangles.map(rect => ({ name: rect.name, changed: 0, total: 0 }));
        for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
          const index = ((a.height - 1 - y) * a.width + x) * 4;
          const difference = Math.max(...[0, 1, 2, 3].map(k => Math.abs(a.data[index + k] - b.data[index + k])));
          const differs = difference > 2; if (differs) changed++;
          maxDifference = Math.max(maxDifference, difference);
          if (differs && (x < 2 || x > a.width - 3 || y < 2 || y > a.height - 3)) boundaryChanged++;
          rectangles.forEach((rect, i) => { const [left, top, width, height] = rect.bounds; if (x >= left && x < left + width && y >= top && y < top + height) { regions[i].total++; if (differs) regions[i].changed++; } });
        }
        return { changed, fraction: changed / (a.width * a.height), maxDifference, boundaryChanged, regions };
      };
    }, { source, config: { ...manifest.config, layeredScene: { ...manifest.config.layeredScene, forceMainThread: true } }, assets });
    const state = () => page.evaluate(() => __SUNLIT_LAYERED_SCENE__.getState());
    async function ready() {
      await page.waitForFunction(() => __SUNLIT_LAYERED_SCENE__.getState().ready || __SUNLIT_LAYERED_SCENE__.getState().error, null, { timeout: 20000 });
      const actual = await state(); assert.equal(actual.error, null, JSON.stringify(actual)); assert.equal(actual.ready, true); return actual;
    }
    async function select(id) {
      const options = sceneOptions(id), width = options?.width || 1280, height = options?.height || 1280;
      await page.setViewportSize({ width, height });
      await page.evaluate(({ id, width }) => { const html = document.documentElement; html.dataset.sgkScene = id; html.dataset.theme = id === 'night' ? 'dark' : 'light'; html.style.setProperty('--sgk-scene-position', id === 'night' ? '55% 0%' : '50% 32%'); html.style.setProperty('--sgk-night-image-size', width + 'px auto'); html.style.setProperty('--sgk-night-image-position', '0px 0%'); }, { id, width });
      return ready();
    }
    async function fallback(reason, mutate, restore) {
      await mutate(); await page.waitForTimeout(50);
      const actual = await state(); assert.equal(actual.reason, reason, JSON.stringify(actual)); assert.equal(actual.ready, false); assert.equal(actual.loopScheduled, false);
      assert.equal(await page.locator('canvas.sunlit-layered-scene').count(), 0);
      assert.equal(await page.locator('main').evaluate(node => getComputedStyle(node, '::before').visibility), 'visible');
      await restore(); await ready();
    }
    if (!previewsOnly) for (const scene of onlyScene ? [onlyScene] : ['orchard', 'night']) {
      await check(scene + ': actual authored assets load and expose fixed source geometry', async () => {
        assert.ok(sceneOptions(scene), 'Missing scene configuration: ' + scene);
        const actual = await select(scene); assert.ok(actual.layers > 0); assert.equal(actual.discoveringMain, false);
        assert.equal(actual.maxFps, 120);
        assert.equal(actual.renderThread, 'main', 'Synchronous geometric/pixel fixture explicitly exercises the shared main-thread fallback');
        const expectedIds = sceneOptions(scene).layers.map(layer => layer.id || layer.asset);
        assert.equal(new Set(expectedIds).size, expectedIds.length, 'Authored layer ids must remain unambiguous');
        assert.equal(actual.layers, expectedIds.length, 'No authored motion/root layer may be silently dropped by a normalization limit');
        assert.deepEqual(actual.layerMotion.map(layer => layer.id), expectedIds, 'Actual motion diagnostics must cover every authored layer in order');
        for (const layer of sceneOptions(scene).layers.filter(layer => isNaturalPart(scene, layer))) assert.equal(actual.layerMeshes.find(mesh => mesh.id === idOf(layer))?.meshStep, layer.meshStep, idOf(layer) + ' must use the authored fine mesh in the actual renderer');
        if (scene === 'night') { const spec = JSON.parse(read('theme/design/night-motion-spec.json')); assert.ok(actual.boundaryUnderfill.maxDepthSourcePixels >= spec.maxDisplacementSourcePixels); assert.ok(actual.boundaryUnderfill.filledPixels > 0, 'Large motion needs real boundary underfill'); }
        evidence[scene] = { initial: actual };
        assert.equal(await page.locator('main').evaluate(node => getComputedStyle(node, '::before').visibility), 'hidden');
      });
      if (!(await state()).ready) continue;
      await check(scene + ': actual GPU vertex positions agree with the pure CPU model where transform feedback is available', async () => {
        const actual = await page.evaluate(options => {
          if (!motionTf.supported) return { supported: false, reason: motionTf.reason, method: 'Optional native WebGL2 built-in position capture unavailable; core pixel/mesh/uniform checks remain required' };
          const samples = [], expected = new Float64Array(4);
          for (const time of [.8, 13.7, 37.1]) {
            motionTf.draws = []; motionTf.enabled = true; try { pixelsAt(time); } finally { motionTf.enabled = false; }
            const state = __SUNLIT_LAYERED_SCENE__.getState(), passes = options.layers.length + 1; if (motionTf.draws.length < passes || motionTf.draws.length % passes) throw Error('Incomplete actual GPU draw capture: ' + motionTf.draws.length + ' draws / ' + passes + ' passes');
            // Explicit freeze draws and refreshes; capture the last complete
            // authored frame rather than assuming the API submits only once.
            const records = motionTf.draws.slice(-passes);
            for (let index = 0; index < options.layers.length; index++) {
              const layer = options.layers[index]; if (!['hair', 'cloth', 'foliage', 'body'].includes(layer.kind)) continue;
              const record = records[index + 1]; let maximumError = 0, compared = 0, worst = null;
              for (let vertex = 0; vertex < record.count; vertex += Math.max(1, Math.floor(record.count / 96))) {
                const x = record.input[vertex * 2], y = record.input[vertex * 2 + 1]; sunlitSceneVertexAt(layer, time, x, y, expected);
                const offset = vertex * 4, w = record.output[offset + 3], gx = ((record.output[offset] / w + 1) * .5 * state.cover[0] + state.cover[2]) * state.sourceWidth, gy = ((1 - record.output[offset + 1] / w) * .5 * state.cover[1] + state.cover[3]) * state.sourceHeight, error = Math.hypot(gx - expected[0], gy - expected[1]);
                if (!Number.isFinite(error)) throw Error('Invalid actual transform-feedback position'); compared++; if (error > maximumError) { maximumError = error; worst = { original: [x, y], gpu: [gx, gy], cpu: [expected[0], expected[1]] }; }
              }
              samples.push({ id: layer.id || layer.asset, time, comparedVertices: compared, maximumSourcePixelError: maximumError, worst });
            }
            motionTf.draws = [];
          }
          return { supported: true, method: 'Actual production shader gl_Position and actual Float32 attribute buffer, captured by native WebGL2 transform feedback; CPU predictions use the independent pure source-point API', samples, maximumSourcePixelError: Math.max(...samples.map(sample => sample.maximumSourcePixelError)) };
        }, sceneOptions(scene));
        evidence[scene].gpuCpuPositions = actual; if (actual.supported) assert.ok(actual.maximumSourcePixelError < .005, JSON.stringify(actual));
      });
      await check(scene + ': major motion remains visible and natural parts sway within their own budgets', async () => {
        await page.evaluate(() => { document.documentElement.dataset.fusionLivingScene = 'false'; document.documentElement.dataset.fusionSceneEffects = 'false'; }); await page.waitForTimeout(30);
        const metrics = await page.evaluate(({ options, plan }) => { const a = pixelsAt(0), layers = options.layers.filter(layer => ['hair', 'cloth', 'foliage'].includes(layer.kind)), regions = layers.map(layer => ({ name: layer.id || layer.asset, bounds: layer.bounds })), times = [.8, 1.7, 2.9, 4.1, 5.3, ...plan.map(record => record.maximum.time)]; return [...new Set(times)].map(time => ({ time, ...diffFrames(a, pixelsAt(time), regions), layerMotion: __SUNLIT_LAYERED_SCENE__.getState().layerMotion })); }, { options: sceneOptions(scene), plan: peakPlans[scene] });
        evidence[scene].peakSearch = peakPlans[scene];
        evidence[scene].motion = metrics;
        for (const metric of metrics) { assert.ok(metric.changed > 20, JSON.stringify(metric)); assert.ok(metric.fraction < .35, 'Motion affects too much of the scene: ' + JSON.stringify(metric)); }
        if (scene === 'night') assert.ok(metrics.some(metric => metric.fraction >= .006), 'Night motion must exceed 0.6% of source pixels with lighting and blink excluded; root locks intentionally stay fixed');
        evidence[scene].tipAcceptance = [];
        for (const layer of sceneOptions(scene).layers.filter(layer => flexKinds.includes(layer.kind))) { const id = idOf(layer), maximum = Math.max(...metrics.flatMap(metric => metric.layerMotion.filter(item => item.id === id).map(item => item.tipDisplacementSourcePixels))), limits = motionLimits(scene, layer); evidence[scene].tipAcceptance.push({ id, naturalPart: isNaturalPart(scene, layer), previousVersion: limits.previous ? '1.2.2' : null, previousPeakSourcePixels: limits.previous, actualPeakSourcePixels: maximum, requiredMinimumSourcePixels: limits.minimum, allowedMaximumSourcePixels: limits.maximum, ratioToPrevious: limits.previous ? maximum / limits.previous : null }); assert.ok(maximum >= limits.minimum, id + ' moves below its actual visible-displacement contract: ' + maximum + ' < ' + limits.minimum); if (limits.maximum !== null) assert.ok(maximum <= limits.maximum, id + ' exceeds its gentle-sway budget: ' + maximum); assert.ok(metrics.some(metric => metric.regions.find(region => region.name === id).changed > limits.changed), id + ' has insufficient actual pixel motion with light/blink excluded'); }
      });
      await check(scene + ': each new natural part changes real pixels with every other motion isolated', async () => {
        const natural = sceneOptions(scene).layers.filter(layer => isNaturalPart(scene, layer));
        assert.deepEqual(natural.map(idOf).sort(), [...requiredNaturalParts[scene]].sort(), 'Every requested small braid, spiral, bang/cowlick and leaf must be authored, not merely another copy of a large moving region');
        assert.equal(natural.filter(layer => layer.kind === 'hair').length, 6);
        assert.equal(natural.filter(layer => layer.kind === 'foliage').length, scene === 'orchard' ? 2 : 0);
        for (const layer of natural) {
          const id = idOf(layer), limits = motionLimits(scene, layer);
          assert.equal(layer.motionClass, 'detail', id + ' must declare its separate gentle-motion contract');
          assert.deepEqual(layer.tipBudget, [limits.minimum, limits.maximum], id + ' declared budget must match the independently tested source-pixel limits');
          assert.ok(Array.isArray(layer.motionTip) && layer.motionTip.length === 2, id + ' needs an authored visible free point rather than a bbox corner');
          assert.ok(layer.rootSegments?.length, id + ' needs an authored fixed attachment');
          assert.ok([2, 4, 8].includes(layer.meshStep), id + ' needs a fine enough actual mesh');
          assert.ok(layer.anchorLock >= Math.ceil(Math.SQRT2 * layer.meshStep + 2), id + ' fixed band must contain a mesh diagonal and the root ROI');
          if (scene === 'orchard') { assert.ok(layer.extractFromAsset && layer.cutFromAssets?.length && layer.underfillTargetAsset, id + ' needs explicit source extraction and static ownership removal'); }
        }
        const records = await page.evaluate(async ({ scene, parts, staticCenters }) => {
          document.documentElement.dataset.fusionLivingScene = 'false'; document.documentElement.dataset.fusionSceneEffects = 'false';
          const originalConfig = fixtureContext.config, records = [];
          const waitReady = () => new Promise((resolve, reject) => { const began = performance.now(); function poll() { const state = window.__SUNLIT_LAYERED_SCENE__?.getState(); if (state?.error) reject(new Error(state.error)); else if (state?.ready) resolve(); else if (performance.now() - began > 20000) reject(new Error('Isolated part load timeout')); else setTimeout(poll, 10); } poll(); });
          try {
            for (const part of parts) {
              const config = structuredClone(originalConfig), options = scene === 'orchard' ? config.layeredScene : config.layeredScene.scenes[scene];
              for (const layer of options.layers) if ((layer.id || layer.asset) !== part.id) {layer.rotation = 0;layer.breathRegions=[];}
              fixtureContext.config = config; remountMotionFixture(); await waitReady();
              const protectedRegions = (part.layer.rootSegments || []).flatMap((segment, index) => [...segment, [(segment[0][0] + segment[1][0]) / 2, (segment[0][1] + segment[1][1]) / 2]].map((point, sample) => ({ name: 'root:' + index + ':' + sample, bounds: [Math.round(point[0]) - 1, Math.round(point[1]) - 1, 3, 3] })));
              staticCenters.forEach(([name, x, y]) => protectedRegions.push({ name: 'fixed-art:' + name, bounds: [x - 1, y - 1, 3, 3] }));
              const eyes = options.eyes || [{ center: [806 / 1280, 315 / 1280] }, { center: [750 / 1280, 374 / 1280] }];
              eyes.forEach((eye, index) => protectedRegions.push({ name: 'fixed-eye:' + index, bounds: [Math.round(eye.center[0] * (options.width || 1280)) - 1, Math.round(eye.center[1] * (options.height || 1280)) - 1, 3, 3] }));
              const zero = pixelsAt(0), times = [0, part.peak.positive.time, part.peak.negative.time];
              const [x, y, width, height] = part.layer.bounds, left = Math.max(0, Math.floor(x) - 8), top = Math.max(0, Math.floor(y) - 8), cropWidth = Math.min(zero.width - left, Math.ceil(width) + 16), cropHeight = Math.min(zero.height - top, Math.ceil(height) + 16), sheet = document.createElement('canvas');
              sheet.width = Math.max(480, cropWidth * 6); sheet.height = cropHeight * 2 + 44; const ctx = sheet.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#171722'; ctx.fillRect(0, 0, sheet.width, sheet.height); ctx.font = '12px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(part.id + ' · isolated motion · light/blink OFF · source crop ×2', 8, 14);
              const phases = [];
              for (const [index, time] of times.entries()) {
                const current = pixelsAt(time), motion = __SUNLIT_LAYERED_SCENE__.getState().layerMotion.find(layer => layer.id === part.id), diff = diffFrames(zero, current, protectedRegions); phases.push({ time, ...diff, tipDisplacementSourcePixels: motion.tipDisplacementSourcePixels });
                const column = sheet.width / 3, canvas = document.querySelector('.sunlit-layered-scene'); ctx.drawImage(canvas, left, top, cropWidth, cropHeight, column * index + (column - cropWidth * 2) / 2, 44, cropWidth * 2, cropHeight * 2); ctx.fillText('t=' + time.toFixed(3) + 's', column * index + 8, 34);
              }
              records.push({ id: part.id, kind: part.layer.kind, motionTip: part.layer.motionTip, phases, crop: [left, top, cropWidth, cropHeight], magnification: 2, png: sheet.toDataURL('image/png').split(',')[1] });
            }
          } finally { fixtureContext.config = originalConfig; remountMotionFixture(); await waitReady(); }
          return records;
        }, { scene, parts: natural.map(layer => ({ id: idOf(layer), layer, peak: peakPlans[scene].find(record => record.id === idOf(layer)) })), staticCenters: protectedDetailCenters[scene] });
        const directory = path.join(output, 'natural-parts'); fs.mkdirSync(directory, { recursive: true });
        for (const record of records) { fs.writeFileSync(path.join(directory, record.id.replace(/[^a-z0-9_-]/gi, '_') + '.png'), Buffer.from(record.png, 'base64')); delete record.png; }
        evidence[scene].naturalParts = records;
        for (const record of records) { const layer = natural.find(layer => idOf(layer) === record.id), limits = motionLimits(scene, layer), active = record.phases.slice(1); assert.ok(active.some(phase => phase.changed > limits.changed), record.id + ' has no actual isolated visible pixels'); assert.ok(Math.max(...active.map(phase => phase.tipDisplacementSourcePixels)) >= limits.minimum); assert.ok(Math.max(...active.map(phase => phase.tipDisplacementSourcePixels)) <= limits.maximum); for (const phase of record.phases) for (const region of phase.regions) assert.equal(region.changed, 0, record.id + ' moved a pinned root or eye: ' + JSON.stringify(region)); }
      });
      await check(scene + ': full-size motion phase pairs exclude lighting and blinking', async () => {
        const phase = [...evidence[scene].motion].sort((a, b) => b.changed - a.changed)[0].time;
        const png = await page.evaluate(({ scene, phase }) => {
          const canvas = document.querySelector('.sunlit-layered-scene'), sheet = document.createElement('canvas'); sheet.width = canvas.width * 2; sheet.height = canvas.height + 28; const ctx = sheet.getContext('2d'); ctx.fillStyle = '#151523'; ctx.fillRect(0, 0, sheet.width, sheet.height);
          [0, phase].forEach((time, index) => { __SUNLIT_LAYERED_SCENE__.freezeTime(time); ctx.drawImage(canvas, index * canvas.width, 28); ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif'; ctx.fillText(scene + ' · t=' + time + 's · source 1:1 · light/blink OFF', index * canvas.width + 10, 20); }); return sheet.toDataURL('image/png').split(',')[1];
        }, { scene, phase });
        fs.writeFileSync(path.join(output, scene + '-motion-pair.png'), Buffer.from(png, 'base64'));
      });
      await check(scene + ': every authored root endpoint and midpoint stays pixel-fixed under large motion', async () => {
        const metrics = await page.evaluate(options => {
          const roots = options.layers.flatMap(layer => (layer.rootSegments || []).flatMap((segment, index) => [...segment, [(segment[0][0] + segment[1][0]) / 2, (segment[0][1] + segment[1][1]) / 2]].map((point, sample) => ({ name: (layer.id || layer.asset) + ':root' + index + ':' + sample, bounds: [Math.round(point[0]) - 1, Math.round(point[1]) - 1, 3, 3] }))));
          const eyes = options.eyes || [{ center: [806 / 1280, 315 / 1280] }, { center: [750 / 1280, 374 / 1280] }]; eyes.forEach((eye, index) => roots.push({ name: 'fixed-eye:' + index, bounds: [Math.round(eye.center[0] * (options.width || 1280)) - 1, Math.round(eye.center[1] * (options.height || 1280)) - 1, 3, 3] }));
          const zero = pixelsAt(0); return [.8, 1.7, 2.9, 4.1, 5.3, 13.7, 37.1, 113.41].map(time => ({ time, ...diffFrames(zero, pixelsAt(time), roots) }));
        }, sceneOptions(scene));
        evidence[scene].rootLocks = metrics; assert.ok(metrics[0].regions.length >= 12, 'Authored root verification regions must be present'); for (const metric of metrics) for (const region of metric.regions) assert.equal(region.changed, 0, JSON.stringify({ time: metric.time, ...region }));
      });
      await check(scene + ': independent blink toggle changes eyes only', async () => {
        const options = { ...sceneOptions(scene) };
        options.eyes ||= [{ center: [806 / 1280, 315 / 1280], radius: [35 / 1280, 23 / 1280], angle: -.55 }, { center: [750 / 1280, 374 / 1280], radius: [27 / 1280, 21 / 1280], angle: -.72 }];
        const metric = await page.evaluate(async options => {
          document.documentElement.dataset.fusionLivingScene = 'true'; await new Promise(resolve => setTimeout(resolve, 30));
          const samples = [], peaks = [];
          for (let index = 0; index < 161; index++) {
            const time = index / 20; __SUNLIT_LAYERED_SCENE__.freezeTime(time); const state = __SUNLIT_LAYERED_SCENE__.getState(), amounts = state.blinkAmounts || [], groups = new Set(state.eyeGroups || [0]);
            amounts.forEach((amount, group) => { if (groups.has(group) && (!peaks[group] || amount > peaks[group].amount)) peaks[group] = { group, time, amount, amounts }; }); if (amounts.some((amount, group) => groups.has(group) && amount > .05)) samples.push({ time, amounts });
          }
          const differences = [];
          for (const peak of peaks.filter(peak => peak.amount > .1)) {
            const closed = pixelsAt(peak.time), state = __SUNLIT_LAYERED_SCENE__.getState(); document.documentElement.dataset.fusionLivingScene = 'false'; await new Promise(resolve => setTimeout(resolve, 0)); const open = pixelsAt(peak.time); document.documentElement.dataset.fusionLivingScene = 'true'; await new Promise(resolve => setTimeout(resolve, 0));
            const diff = diffFrames(open, closed); let outsideEyes = 0; const eyeChanges = options.eyes.map((eye, index) => ({ id: eye.id || String(index), group: [1, 'yaya'].includes(eye.group) ? 1 : 0, changed: 0 }));
            const cover = state.cover || [1, 1, 0, 0], sw = state.sourceWidth || 1280, sh = state.sourceHeight || 1280;
            for (let y = 0; y < open.height; y++) for (let x = 0; x < open.width; x++) {
              const i = ((open.height - 1 - y) * open.width + x) * 4; if (Math.max(...[0, 1, 2, 3].map(k => Math.abs(open.data[i + k] - closed.data[i + k]))) <= 2) continue;
              const sx = ((x + .5) / open.width * cover[0] + cover[2]) * sw, sy = ((y + .5) / open.height * cover[1] + cover[3]) * sh;
              const inside = options.eyes.map(eye => { const dx = sx - eye.center[0] * sw, dy = sy - eye.center[1] * sh, angle = eye.angle || 0, qx = Math.cos(angle) * dx + Math.sin(angle) * dy, qy = -Math.sin(angle) * dx + Math.cos(angle) * dy; return Math.hypot(qx / (eye.radius[0] * sw + 2), qy / (eye.radius[1] * sh + 2)) <= 1.05; });
              inside.forEach((value, index) => { if (value) eyeChanges[index].changed++; }); if (!inside.some(Boolean)) outsideEyes++;
            }
            differences.push({ ...peak, ...diff, outsideEyes, eyeChanges });
          }
          return { peaks, samples, differences };
        }, options);
        assert.ok(metric.differences.length > 0, 'No blink schedule or authored blink was rendered');
        for (const diff of metric.differences) { assert.ok(diff.changed > 10, 'No authored eye change: ' + JSON.stringify(diff)); assert.equal(diff.outsideEyes, 0, 'Blink changes pixels beyond its eye masks'); assert.ok(diff.fraction < .025); for (const eye of diff.eyeChanges) { if (eye.group === diff.group) assert.ok(eye.changed > 2, 'An active eye never visibly blinks: ' + JSON.stringify(eye)); else assert.equal(eye.changed, 0, 'The other character blinks at this character\'s phase'); } }
        assert.ok(metric.samples.length < 35, 'Blink remains closed too long');
        if (scene === 'night') { assert.equal(metric.peaks.length, 2, 'Both character blink clocks required'); assert.ok(Math.abs(metric.peaks[0].time - metric.peaks[1].time) > 1); for (let group = 0; group < 2; group++) assert.equal(metric.peaks[group].amounts[1 - group], 0, 'Characters blink independently'); }
        evidence[scene].blink = metric;
      });
      if (scene === 'night') await check('night: bench/pillars/contact anchors remain pixel-fixed; motion stays inside authored support', async () => {
        const spec = JSON.parse(read('theme/design/night-motion-spec.json'));
        const peakBudgets = await page.evaluate(({ spec, plan }) => spec.layers.map(layer => {
          const record = plan.find(record => record.id === layer.id), phases = [record.positive.time, record.negative.time, record.maximum.time], peaks = phases.map(time => { __SUNLIT_LAYERED_SCENE__.freezeTime(time); return { time, ...__SUNLIT_LAYERED_SCENE__.getState().layerMotion.find(item => item.id === layer.id) }; });
          return { id: layer.id, peaks, maximumTipDisplacement: Math.max(...peaks.map(peak => peak.tipDisplacementSourcePixels)) };
        }), { spec, plan: peakPlans.night });
        evidence.night.peakBudgets = peakBudgets; for (const layer of peakBudgets) assert.ok(layer.maximumTipDisplacement <= spec.maxDisplacementSourcePixels + .05, layer.id + ' exceeds the source movement budget: ' + layer.maximumTipDisplacement);
        const metrics = await page.evaluate(async ({ spec, fixedOwnershipSource }) => {
          const fixedOwnership = (0, eval)('(' + fixedOwnershipSource + ')')(spec);
          document.documentElement.dataset.fusionLivingScene = 'false'; document.documentElement.dataset.fusionSceneEffects = 'true'; await new Promise(resolve => setTimeout(resolve, 20));
          // A very wide Canvas2D stroke can self-overlap and leave holes around
          // tight curves. Dilate raster ownership by an explicit Euclidean disk
          // instead; this retains the authored movement budget exactly.
          function dilated(paths, radius) {
            const mask = document.createElement('canvas'); mask.width = spec.width; mask.height = spec.height; const ctx = mask.getContext('2d'); ctx.fillStyle = 'white'; for (const path of paths) ctx.fill(new Path2D(path));
            const alpha = ctx.getImageData(0, 0, spec.width, spec.height).data, nearest = new Uint16Array(spec.width * spec.height), support = new Uint8Array(nearest.length), limit = Math.ceil(radius), radii = Array.from({ length: limit * 2 + 1 }, (_, index) => Math.sqrt(Math.max(0, radius * radius - (index - limit) ** 2)));
            for (let y = 0; y < spec.height; y++) { let distance = limit + 1; for (let x = 0; x < spec.width; x++) { const i = y * spec.width + x; distance = alpha[i * 4 + 3] ? 0 : Math.min(limit + 1, distance + 1); nearest[i] = distance; } distance = limit + 1; for (let x = spec.width - 1; x >= 0; x--) { const i = y * spec.width + x; distance = alpha[i * 4 + 3] ? 0 : Math.min(limit + 1, distance + 1); nearest[i] = Math.min(nearest[i], distance); } }
            for (let y = 0; y < spec.height; y++) for (let x = 0; x < spec.width; x++) for (let dy = Math.max(-limit, -y); dy <= Math.min(limit, spec.height - 1 - y); dy++) if (nearest[(y + dy) * spec.width + x] <= radii[dy + limit]) { support[y * spec.width + x] = 1; break; }
            return support;
          }
          const motionSupport = dilated(spec.layers.map(item => item.path), spec.maxDisplacementSourcePixels + 2), lightSupport = dilated(spec.lightMasks.map(item => item.path), 15), support = motionSupport.map((value, index) => value || lightSupport[index]), a = pixelsAt(0), metrics = [];
          for (const time of [.8, 1.7, 2.9, 5.3]) {
            const b = pixelsAt(time), diff = diffFrames(a, b, [...spec.fixedVerificationRegions.map(region => ({ name: region.id, bounds: region.bounds })), ...spec.layers.map(layer => ({ name: 'motion:' + layer.kind + ':' + layer.id, bounds: layer.bounds }))]); let outsideSupport = 0; const outsideExamples = [], fixedExamples = [];
            for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) { const i = ((a.height - 1 - y) * a.width + x) * 4; if (Math.max(...[0, 1, 2, 3].map(k => Math.abs(a.data[i + k] - b.data[i + k]))) > 2 && !support[y * a.width + x]) { outsideSupport++; if (outsideExamples.length < 12) outsideExamples.push({ x, y, original: Array.from(a.data.subarray(i, i + 4)), actual: Array.from(b.data.subarray(i, i + 4)) }); } }
            for (const region of spec.fixedVerificationRegions) { const record = diff.regions.find(item => item.name === region.id), [left, top, width, height] = region.bounds, examples = []; record.rawChanged = record.changed; record.authoredBraidChanged = 0; for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) { const i = ((a.height - 1 - y) * a.width + x) * 4; if (Math.max(...[0, 1, 2, 3].map(k => Math.abs(a.data[i + k] - b.data[i + k]))) > 2) { const movingBraidOwnership = fixedOwnership.contains(region.id, x, y); if (movingBraidOwnership) { record.authoredBraidChanged++; record.changed--; } if (examples.length < 12) examples.push({ x, y, movingBraidOwnership, original: Array.from(a.data.subarray(i, i + 4)), actual: Array.from(b.data.subarray(i, i + 4)) }); } } if (examples.length) fixedExamples.push({ id: region.id, examples }); }
            metrics.push({ time, ...diff, outsideSupport, outsideExamples, fixedExamples, fixedOwnership: fixedOwnership.metadata });
          } return metrics;
        }, { spec, fixedOwnershipSource });
        evidence.night.fixed = metrics;
        for (const metric of metrics) { assert.equal(metric.outsideSupport, 0, JSON.stringify(metric)); for (const region of metric.regions.filter(region => !region.name.startsWith('motion:'))) assert.equal(region.changed, 0, 'Fixed geometry moves: ' + JSON.stringify(region)); }
        for (const kind of ['hair', 'cloth']) assert.ok(metrics.some(metric => metric.regions.filter(region => region.name.startsWith('motion:' + kind + ':')).reduce((sum, region) => sum + region.changed, 0) > 20), kind + ' does not visibly change in its authored regions');
        for (const layer of spec.layers) { const minimum = isNaturalPart('night', layer) ? motionLimits('night', layer).changed : 50; assert.ok(metrics.some(metric => metric.regions.find(region => region.name === 'motion:' + layer.kind + ':' + layer.id).changed > minimum), layer.id + ' has insufficient actual pixel motion'); }
        evidence.night.fixed = metrics;
      });
      await check(scene + ': t0 exactly reconstructs original RGBA at source dimensions', async () => {
        const options = sceneOptions(scene);
        const metric = await page.evaluate(async options => {
          document.documentElement.dataset.fusionLivingScene = 'false'; document.documentElement.dataset.fusionSceneEffects = 'false'; await new Promise(resolve => setTimeout(resolve, 0));
          const image = new Image(); image.src = fixtureContext.assets[options.sourceAsset || options.underfillSourceAsset]; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); const original = ctx.getImageData(0, 0, canvas.width, canvas.height).data, actual = pixelsAt(0);
          let maxDifference = 0, outsideTolerance = 0; const examples = []; for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) { const a = ((canvas.height - 1 - y) * canvas.width + x) * 4, b = (y * canvas.width + x) * 4, difference = Math.max(...[0, 1, 2, 3].map(k => Math.abs(actual.data[a + k] - original[b + k]))); maxDifference = Math.max(maxDifference, difference); if (difference > 1) { outsideTolerance++; if (examples.length < 12) examples.push({ x, y, original: Array.from(original.subarray(b, b + 4)), actual: Array.from(actual.data.subarray(a, a + 4)) }); } }
          return { originalWidth: canvas.width, originalHeight: canvas.height, renderedWidth: actual.width, renderedHeight: actual.height, maxDifference, outsideTolerance, examples, cover: __SUNLIT_LAYERED_SCENE__.getState().cover };
        }, options);
        evidence[scene].t0Identity = metric; assert.equal(metric.originalWidth, options.width || 1280); assert.equal(metric.originalHeight, options.height || 1280); assert.equal(metric.renderedWidth, options.width || 1280); assert.equal(metric.renderedHeight, options.height || 1280); assert.equal(metric.outsideTolerance, 0, JSON.stringify(metric));
      });
      await check(scene + ': the existing scene-effects switch disables local light while motion continues', async () => {
        const metric = await page.evaluate(async () => {
          document.documentElement.dataset.fusionLivingScene = 'false';
          document.documentElement.dataset.fusionSceneEffects = 'true'; await new Promise(resolve => setTimeout(resolve, 20)); const on = pixelsAt(5.3);
          document.documentElement.dataset.fusionSceneEffects = 'false'; await new Promise(resolve => setTimeout(resolve, 20)); const off = pixelsAt(5.3), light = diffFrames(on, off), stillMoves = diffFrames(pixelsAt(0), pixelsAt(1.7));
          document.documentElement.dataset.fusionSceneEffects = 'true'; await new Promise(resolve => setTimeout(resolve, 20)); return { light, stillMoves };
        });
        assert.ok(metric.light.changed > 20, 'Scene-effects switch does not change semantic lighting'); assert.ok(metric.stillMoves.changed > 20, 'Disabling lighting also disabled hair/clothes'); evidence[scene].lightSwitch = metric;
      });
      await check(scene + ': targets 120fps while honestly matching the available RAF cadence', async () => {
        await page.evaluate(() => { __SUNLIT_LAYERED_SCENE__.freezeTime(null); window.loopBaseline = { frames: __SUNLIT_LAYERED_SCENE__.getState().frames, layout: layoutReads, style: styleReads, time: performance.now() }; });
        await page.waitForTimeout(2200);
        const loop = await page.evaluate(() => { const state = __SUNLIT_LAYERED_SCENE__.getState(), seconds = (performance.now() - loopBaseline.time) / 1000; return { frames: state.frames - loopBaseline.frames, measuredFps: (state.frames - loopBaseline.frames) / seconds, layout: layoutReads - loopBaseline.layout, style: styleReads - loopBaseline.style, seconds, cadence: state.cadence }; });
        evidence[scene].loop = loop; assert.ok(loop.cadence, 'Renderer must expose measured cadence diagnostics'); const available = Math.min(loop.cadence.observedRafHz, 120); assert.ok(available >= 55, 'RAF itself is unexpectedly stalled on this verified 60Hz-or-faster environment: ' + JSON.stringify(loop)); assert.ok(loop.measuredFps >= Math.max(55, available * .92) && loop.measuredFps <= available * 1.08, JSON.stringify(loop)); assert.equal(loop.layout, 0); assert.equal(loop.style, 0);
      });
      await check(scene + ': normal pointer hover keeps drawing', async () => {
        await page.evaluate(() => __SUNLIT_LAYERED_SCENE__.freezeTime(null)); const before = (await state()).frames;
        for (let index = 0; index < 8; index++) { await page.evaluate(index => document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 0, clientX: 50 + index * 30, clientY: 100 })), index); await page.waitForTimeout(25); }
        const after = await state(); assert.equal(after.paused, false); assert.equal(after.reason, 'running'); assert.ok(after.frames - before >= 8, JSON.stringify(after));
      });
      await check(scene + ': input/wheel/scroll pause frames and resume', async () => {
        for (const event of ['input', 'wheel', 'scroll']) {
          await page.evaluate(event => document.dispatchEvent(new Event(event, { bubbles: true })), event);
          const stopped = await state(); assert.equal(stopped.reason, 'interaction'); assert.equal(stopped.loopScheduled, false);
          await page.waitForTimeout(125); assert.equal((await state()).frames, stopped.frames);
          await page.waitForTimeout(180); assert.equal((await state()).paused, false); assert.ok((await state()).frames > stopped.frames);
        }
      });
      await check(scene + ': hidden/reduced/focus/disabled restore the original CSS artwork', async () => {
        await fallback('hidden', () => page.evaluate(() => { fixtureHidden = true; document.dispatchEvent(new Event('visibilitychange')); }), () => page.evaluate(() => { fixtureHidden = false; document.dispatchEvent(new Event('visibilitychange')); }));
        await fallback('reduced-motion', () => page.emulateMedia({ reducedMotion: 'reduce' }), () => page.emulateMedia({ reducedMotion: 'no-preference' }));
        await fallback('focus', () => page.evaluate(() => document.documentElement.dataset.fusionFocus = 'true'), () => page.evaluate(() => delete document.documentElement.dataset.fusionFocus));
        await fallback('inactive', () => page.evaluate(() => document.documentElement.dataset.fusionLayeredScene = 'false'), () => page.evaluate(() => document.documentElement.dataset.fusionLayeredScene = 'true'));
      });
      await check(scene + ': contact frames', async () => {
        await page.evaluate(() => document.documentElement.dataset.fusionLivingScene = 'true'); await page.waitForTimeout(20);
        const data = await page.evaluate(scene => {
          const sheet = document.createElement('canvas'); sheet.width = 1280; sheet.height = 896; const ctx = sheet.getContext('2d'); ctx.fillStyle = '#151523'; ctx.fillRect(0, 0, sheet.width, sheet.height);
          (scene === 'night' ? [0, 1.2, 4.9, 6.2] : [0, 1.2, 2.9, 4.44]).forEach((time, index) => { pixelsAt(time); const canvas = document.querySelector('.sunlit-layered-scene'), left = (index % 2) * 640, top = Math.floor(index / 2) * 448, scale = Math.min(640 / canvas.width, 424 / canvas.height), w = canvas.width * scale, h = canvas.height * scale; ctx.drawImage(canvas, left + (640 - w) / 2, top + 24 + (424 - h) / 2, w, h); ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.fillText(scene + ' · t=' + time + 's', left + 10, top + 17); }); return sheet.toDataURL('image/png').split(',')[1];
        }, scene);
        fs.writeFileSync(path.join(output, scene + '-contact.png'), Buffer.from(data, 'base64'));
      });
      if (scene === 'night') await check('night: full-source-resolution open/closed eye crop comparisons', async () => {
        const result = await page.evaluate(options => {
          const regions = [0, 1].map(group => {
            const eyes = options.eyes.filter(eye => eye.group === group), left = Math.floor(Math.min(...eyes.map(eye => (eye.center[0] - eye.radius[0]) * options.width))) - 15, top = Math.floor(Math.min(...eyes.map(eye => (eye.center[1] - eye.radius[1]) * options.height))) - 15, right = Math.ceil(Math.max(...eyes.map(eye => (eye.center[0] + eye.radius[0]) * options.width))) + 15, bottom = Math.ceil(Math.max(...eyes.map(eye => (eye.center[1] + eye.radius[1]) * options.height))) + 15;
            return { group, left, top, width: right - left, height: bottom - top, closedTime: group === 0 ? 6.2 : 4.9 };
          });
          const scale = 4, cellWidth = Math.max(...regions.map(region => region.width)) * scale, cellHeight = Math.max(...regions.map(region => region.height)) * scale + 28, sheet = document.createElement('canvas'); sheet.width = cellWidth * 2; sheet.height = cellHeight * 2;
          const ctx = sheet.getContext('2d'); ctx.fillStyle = '#151523'; ctx.fillRect(0, 0, sheet.width, sheet.height); ctx.imageSmoothingEnabled = false;
          for (const region of regions) for (let phase = 0; phase < 2; phase++) { const time = phase ? region.closedTime : 0; pixelsAt(time); const source = document.querySelector('.sunlit-layered-scene'); ctx.drawImage(source, region.left, region.top, region.width, region.height, phase * cellWidth, region.group * cellHeight + 28, region.width * scale, region.height * scale); ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.fillText((region.group ? 'Yaya' : 'Xixi') + (phase ? ' closed' : ' open') + ' · t=' + time + 's · source pixels ×4', phase * cellWidth + 8, region.group * cellHeight + 19); }
          return { png: sheet.toDataURL('image/png').split(',')[1], regions };
        }, sceneOptions('night'));
        fs.writeFileSync(path.join(output, 'night-eye-extremes.png'), Buffer.from(result.png, 'base64')); evidence.night.eyeCrops = result.regions;
      });
    }
    await check('other gallery scene leaves no canvas or background render loop', async () => {
      await page.evaluate(() => document.documentElement.dataset.sgkScene = 'sunset'); await page.waitForTimeout(40);
      const stopped = await state(); assert.equal(stopped.active, false); assert.equal(stopped.loopScheduled, false); assert.equal(await page.locator('.sunlit-layered-scene').count(), 0);
      await page.waitForTimeout(180); assert.equal((await state()).frames, stopped.frames);
    });
    await check('rapid scene switching cancels stale loads and keeps one final canvas', async () => {
      await page.evaluate(async () => { for (let index = 0; index < 24; index++) { document.documentElement.dataset.sgkScene = ['orchard', 'night', 'sunset'][index % 3]; await new Promise(resolve => setTimeout(resolve, index % 2)); } document.documentElement.dataset.sgkScene = 'night'; });
      await ready(); assert.equal(await page.locator('.sunlit-layered-scene').count(), 1); assert.equal((await state()).error, null);
      await page.evaluate(() => __SUNLIT_LAYERED_SCENE__.dispose()); assert.equal(await page.locator('.sunlit-layered-scene').count(), 0); assert.equal(await page.evaluate(() => !!window.__SUNLIT_LAYERED_SCENE__), false);
      await page.evaluate(() => remountMotionFixture()); await ready();
    });
    await check('WebGL unavailable restores CSS without a partially rendered canvas', async () => {
      await page.evaluate(() => { __SUNLIT_LAYERED_SCENE__.dispose(); window.originalGetContext = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /^webgl/.test(type) ? null : originalGetContext.call(this, type, ...args); }; remountMotionFixture(); });
      await page.waitForFunction(() => __SUNLIT_LAYERED_SCENE__.getState().error);
      const actual = await state(); assert.equal(actual.error, 'webgl-unavailable'); assert.equal(actual.ready, false); assert.equal(actual.loopScheduled, false); assert.equal(await page.locator('.sunlit-layered-scene').count(), 0);
      assert.equal(await page.locator('main').evaluate(node => getComputedStyle(node, '::before').visibility), 'visible');
      await page.evaluate(() => { __SUNLIT_LAYERED_SCENE__.dispose(); HTMLCanvasElement.prototype.getContext = originalGetContext; remountMotionFixture(); }); await ready();
    });
    await check('artwork-only natural-speed full-composition WebM previews', async () => {
      for (const scene of ['orchard', 'night']) {
        await select(scene); await page.evaluate(() => document.documentElement.dataset.fusionLivingScene = 'true'); await page.waitForTimeout(20);
        const video = await page.evaluate(async () => {
          const out = document.createElement('canvas'); out.width = 960; out.height = 640; const ctx = out.getContext('2d'), stream = out.captureStream(120), chunks = [], recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 3600000 });
          const finished = new Promise(resolve => recorder.onstop = resolve); recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); }; recorder.start();
          const started = performance.now(); let frames = 0;
          while (performance.now() - started < 7200) { __SUNLIT_LAYERED_SCENE__.freezeTime((performance.now() - started) / 1000); const canvas = document.querySelector('.sunlit-layered-scene'), scale = Math.min(960 / canvas.width, 640 / canvas.height), w = canvas.width * scale, h = canvas.height * scale; ctx.fillStyle = '#151523'; ctx.fillRect(0, 0, 960, 640); ctx.drawImage(canvas, (960 - w) / 2, (640 - h) / 2, w, h); frames++; await new Promise(resolve => requestAnimationFrame(resolve)); }
          const elapsedMs = performance.now() - started; recorder.stop(); await finished; stream.getTracks().forEach(track => track.stop()); const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer()); let binary = ''; for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768)); return { base64: btoa(binary), frames, elapsedMs, actualFps: frames / (elapsedMs / 1000), requestedFps: 120, interpretation: 'Requested ceiling 120; actual frames are limited by the available display RAF' };
        });
        assert.ok(video.base64.length > 50000); fs.writeFileSync(path.join(output, scene + '-motion.webm'), Buffer.from(video.base64, 'base64')); const { base64, ...cadence } = video; evidence[scene] ||= {}; evidence[scene].preview = { ...cadence, backend: 'forced-main-thread-shared-renderer' }; assert.ok(video.actualFps >= 55, 'Preview falls below the verified 60Hz environment: ' + JSON.stringify(cadence));
      }
      const obsolete = path.join(output, 'artwork-motion.webm'); if (fs.existsSync(obsolete)) fs.unlinkSync(obsolete);
    });
    await check('actual distributable payload mounts both scenes and preserves gallery fallback', async () => {
      const probe = await browser.newPage({ viewport: { width: 1280, height: 847 }, reducedMotion: 'no-preference' }); probe.on('pageerror', error => errors.push(error.message));
      try {
        await probe.goto(url); await probe.evaluate(payload => (0, eval)(payload), builtPayload);
        for (const mode of ['light', 'dark']) {
          await probe.evaluate(mode => document.documentElement.dataset.theme = mode, mode);
          for (const scene of ['orchard', 'night']) {
            await probe.evaluate(scene => __SUNLIT_GALLERY__.selectScene(scene), scene);
            await probe.waitForFunction(() => __SUNLIT_LAYERED_SCENE__.getState().ready || __SUNLIT_LAYERED_SCENE__.getState().error, null, { timeout: 20000 });
            const actual = await probe.evaluate(() => ({ scene: __SUNLIT_GALLERY__.getState().scene, motion: __SUNLIT_LAYERED_SCENE__.getState() }));
            assert.equal(actual.scene, scene); assert.equal(actual.motion.ready, true, JSON.stringify(actual)); assert.equal(actual.motion.error, null);
            assert.equal(actual.motion.renderThread, 'worker', 'Default distributable must actually select OffscreenCanvas Worker rendering');
            if (scene === 'night') {
              for (const width of [1600, 720, 420]) {
                await probe.setViewportSize({ width, height: 850 }); await probe.waitForTimeout(120);
                const framing = await probe.evaluate(() => {
                  const main = document.querySelector('main'), box = main.getBoundingClientRect(), css = getComputedStyle(main, '::before'), state = __SUNLIT_LAYERED_SCENE__.getState(), imageWidth = parseFloat(css.backgroundSize), imageHeight = imageWidth * state.sourceHeight / state.sourceWidth, position = css.backgroundPosition.split(/\s+/), offset = (v, space) => v.endsWith('%') ? parseFloat(v) / 100 * space : parseFloat(v);
                  return { cover: state.cover, expected: [box.width / imageWidth, box.height / imageHeight, -offset(position[0], box.width - imageWidth) / imageWidth, -offset(position[1], box.height - imageHeight) / imageHeight], size: css.backgroundSize, source: [state.sourceWidth, state.sourceHeight] };
                });
                assert.match(framing.size, /^\d+(?:\.\d+)?px(?: auto)?$/); assert.deepEqual(framing.source, [1272, 847]); framing.cover.forEach((value, index) => assert.ok(Math.abs(value - framing.expected[index]) < .00001, 'Canvas/CSS framing mismatch ' + JSON.stringify(framing)));
              }
            }
          }
          await probe.evaluate(() => __SUNLIT_GALLERY__.selectScene('sunset')); await probe.waitForTimeout(80); assert.equal(await probe.locator('.sunlit-layered-scene').count(), 0);
        }
        await probe.evaluate(remove => (0, eval)(remove), builtRemove); assert.equal(await probe.locator('.sunlit-layered-scene').count(), 0);
      } finally { await probe.close(); }
    });
    await check('no uncaught browser errors', async () => assert.deepEqual(errors, []));
    await page.close();
  } finally {
    await browser.close(); await new Promise(resolve => server.close(resolve));
    const combinedResults = previousReport ? [...previousReport.results.filter(item => !results.some(next => next.name === item.name)), ...results] : results;
    const combinedEvidence = { ...previousReport?.evidence }; for (const [scene, values] of Object.entries(evidence)) combinedEvidence[scene] = { ...combinedEvidence[scene], ...values };
    const report = { version: manifest.version, fingerprint: builtManifest.fingerprint, results: combinedResults, evidence: combinedEvidence, errors: [...(previousReport?.errors || []), ...errors], passed: combinedResults.filter(item => item.passed).length, total: combinedResults.length, ...(previewsOnly ? { regeneratedPreviewsOnly: true } : {}) };
    if (onlyScene) report.scope = 'Affected ' + onlyScene + ' configuration and current built renderer/config contract only; other prior cases are not rerun';
    if (motionOnly) report.scope = 'Changed motion geometry, fixed roots/anchors, t0 RGBA, blink/light isolation and actual cadence; unchanged host lifecycle/framing cases are not rerun';
    if (verticesOnly) report.scope = 'Only actual GPU transform-feedback/source-CPU vertex comparisons, required scene loading and exact build contract rerun after fixing a test-only explicit-freeze frame-batch assumption; no runtime changes';
    fs.writeFileSync(path.join(output, verticesOnly ? 'vertices-followup.json' : onlyScene ? onlyScene + '-followup.json' : motionOnly ? 'motion-only-report.json' : 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); if (combinedResults.some(item => !item.passed)) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
