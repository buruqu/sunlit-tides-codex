// Behavioural checks of actual production motion, independent of its formula.
// CPU only. Synthetic callback histories do not claim physical high-refresh QA.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm');
const { declaration, loadModel, motionPeaks } = require('./motion-production-model.cjs');
const { bestSingleSine, correlation } = require('./motion-signal-metrics.cjs');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-results/motion-wind'), sourceOnly = process.argv.includes('--source'), clockOnly = process.argv.includes('--clock-only');
const manifest = JSON.parse(fs.readFileSync(path.join(root, sourceOnly ? 'theme/manifest.json' : 'dist/theme/manifest.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, sourceOnly ? 'theme/design/layered-scene.js' : 'dist/theme/theme.js'), 'utf8');
const results = [], evidence = {}, out = new Float64Array(4), times = Array.from({ length: 641 }, (_, i) => 8 + i / 10);
function check(name, task) { if (clockOnly && !name.startsWith('actual production elapsed-time clocks')) return; try { task(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
const point = (model, layer, time, position = layer.motionTip) => { model.vertex(layer, time, position[0], position[1], out); return Array.from(out); };
check('actual production elapsed-time clocks preserve wall-clock speed at each supported refresh and through refresh changes', () => {
  const mainClock = declaration(source, 'sceneTime'), workerClock = source.match(/const sceneTime=\(\)=>[^;]+;/)?.[0];
  assert.ok(workerClock, 'Read actual Worker clock'); assert.match(source, /draw\(sceneTime\(timestamp\)\)/); assert.match(source, /drawAt\(sceneTime\(\)\)/, 'Actual draw calls must consume these elapsed-time clocks');
  evidence.actualClocks = [];
  for (const history of ['60', '90', '120', '60-90-120']) {
    const main = { elapsed: 0, clockStart: 0, frames: 0, cadenceFrames: 0, now: 0 }, worker = { elapsed: 0, start: 0, frames: 0, renderedFrames: 0, now: 0 }, gate = {};
    main.win = { performance: { now: () => main.now } }; worker.performance = { now: () => worker.now };
    vm.runInNewContext(mainClock + ';globalThis.clock=sceneTime;', main); vm.runInNewContext(workerClock + ';globalThis.clock=sceneTime;', worker); vm.runInNewContext(declaration(source, 'sunlitSceneFrameDue'), gate);
    const deadline = { nextDue: -Infinity, missedFrameSlots: 0 }; let milliseconds = 0, maximumMainError = 0, maximumWorkerError = 0, drawn = 0;
    while (milliseconds <= 12000) {
      const hz = history.includes('-') ? milliseconds < 4000 ? 60 : milliseconds < 8000 ? 90 : 120 : Number(history);
      main.now = worker.now = milliseconds;
      if (gate.sunlitSceneFrameDue(deadline, milliseconds)) { drawn++; main.frames = main.cadenceFrames = worker.frames = worker.renderedFrames = drawn; maximumMainError = Math.max(maximumMainError, Math.abs(main.clock(milliseconds) - milliseconds / 1000)); maximumWorkerError = Math.max(maximumWorkerError, Math.abs(worker.clock() - milliseconds / 1000)); }
      milliseconds += 1000 / hz;
    }
    evidence.actualClocks.push({ history, drawn, maximumMainError, maximumWorkerError }); assert.ok(maximumMainError < 1e-12 && maximumWorkerError < 1e-12, 'A frame-count clock changes animation speed with refresh rate');
    main.elapsed = worker.elapsed = .7; main.clockStart = worker.start = 2000; main.now = worker.now = 2300; assert.ok(Math.abs(main.clock() - 1) < 1e-12); assert.ok(Math.abs(worker.clock() - 1) < 1e-12);
    main.clockStart = worker.start = null; main.now = worker.now = 90000; assert.equal(main.clock(), .7); assert.equal(worker.clock(), .7);
  }
  const wrongAt60Hz = 60 * 12 / 120, wrongAt120Hz = 120 * 12 / 120; assert.notEqual(wrongAt60Hz, 12); assert.equal(wrongAt120Hz, 12); evidence.frameClockNegativeControl = { model: 'renderedFrames/120', secondsAt60Hz: wrongAt60Hz, secondsAt120Hz: wrongAt120Hz, expectedSeconds: 12, rejected: wrongAt60Hz !== 12 };
});
check('the non-sine detector rejects old fixed-period, phase-shifted and offset sine controls', () => {
  evidence.negativeControls = [];
  for (const period of [2.3, 4.7, 7.1, 43]) {
    const values = times.map(t => .17 + .43 * Math.sin(t * 2 * Math.PI / period + .71)), fit = bestSingleSine(times, values);
    evidence.negativeControls.push({ period, ...fit }); assert.ok(fit.normalizedResidual < .001, 'A constant sine must be recognized despite gain/phase/offset'); assert.equal(fit.normalizedResidual >= .08, false, 'The same behavioural acceptance must reject the old sine');
    assert.ok(Math.abs(correlation(values, values.map(x => x * -2 + 7))) > .999999, 'Lockstep controls must also be recognized despite opposite sign/gain');
  }
});
for (const scene of clockOnly ? [] : ['orchard', 'night']) {
  const options = scene === 'orchard' ? manifest.config.layeredScene : manifest.config.layeredScene.scenes.night, model = loadModel(source, options, scene), flex = model.layers.filter(layer => ['hair', 'cloth', 'foliage'].includes(layer.kind));
  const data = evidence[scene] = { configuredLayers: model.layers.length, flexibleLayers: flex.length };
  check(scene + ': motion remains deterministic, bounded and exactly zero at t0 without moving its attachments', () => {
    let largestWave = 0, largestRootError = 0, largestT0Error = 0;
    for (const layer of flex) {
      const scale = scene === 'night' ? .5 : 1; assert.equal(layer.motionResponse?.enabled, true); assert.equal(layer.motionResponse.waveScale, scale);
      const zero = point(model, layer, 0); largestT0Error = Math.max(largestT0Error, Math.hypot(zero[0] - layer.motionTip[0], zero[1] - layer.motionTip[1]));
      for (let i = 0; i <= 2400; i++) { const time = i * .075; for (const progress of [0, .3, .7, 1]) { const wave = model.wave(layer, time, progress); assert.ok(Number.isFinite(wave)); largestWave = Math.max(largestWave, Math.abs(wave) / scale); assert.ok(Math.abs(wave) <= scale + 1e-12, layer.id + ' exceeds the preserved angle envelope'); } }
      for (const root of layer.rootSegments) for (const location of [...root, [(root[0][0] + root[1][0]) / 2, (root[0][1] + root[1][1]) / 2]]) for (const time of [.31, 7.3, 31.7, 113.41]) { const moved = point(model, layer, time, location); largestRootError = Math.max(largestRootError, Math.hypot(moved[0] - location[0], moved[1] - location[1])); }
    }
    data.bounds = { sampledSeconds: 180, sampledProgress: [0, .3, .7, 1], largestWaveFractionOfPreviousEnvelope: largestWave, largestRootError, largestT0Error };
    assert.equal(largestT0Error, 0); assert.ok(largestRootError < 1e-10);
  });
  check(scene + ': every actual free-point response has time variation beyond any constant single sine', () => {
    data.singleSineFits = [];
    for (const layer of flex) for (const start of [8, 130]) {
      const sampleTimes = times.map(time => time + start - 8), values = sampleTimes.map(time => point(model, layer, time)[2]), fit = bestSingleSine(sampleTimes, values);
      data.singleSineFits.push({ id: layer.id, start, ...fit }); assert.ok(fit.rms > 1e-5, layer.id + ' is static'); assert.ok(fit.normalizedResidual >= .08, layer.id + ' remains effectively a constant sine: ' + JSON.stringify(fit));
    }
  });
  check(scene + ': people and clothing do not simply follow one scaled copy of the same swing', () => {
    const pairs = scene === 'orchard' ? [['orchard-layer-xixi-braid-low', 'orchard-layer-denia-hair-tip'], ['orchard-layer-denia-hair-tip', 'orchard-layer-denia-skirt-hem']] : [['night-xixi-free-hair-end', 'night-yaya-free-long-hair'], ['night-xixi-free-hair-end', 'night-xixi-loose-cloak-hem'], ['night-yaya-free-long-hair', 'night-yaya-loose-sleeve-hem']];
    data.interPart = pairs.map(ids => { const layers = ids.map(id => flex.find(layer => layer.id === id)); assert.ok(layers.every(Boolean)); const signals = layers.map(layer => times.map(time => point(model, layer, time)[2])); return { ids, correlation: correlation(...signals) }; });
    for (const pair of data.interPart) assert.ok(pair.correlation !== null && Math.abs(pair.correlation) < .9995, 'Rigidly synchronized response: ' + JSON.stringify(pair));
  });
  check(scene + ': authored spatial lag produces a delayed distal response rather than a whole-layer time offset', () => {
    data.spatialLag = [];
    for (const layer of flex.filter(layer => layer.motionResponse?.lagSeconds > 0)) {
      const near = times.map(time => model.wave(layer, time, .2)), far = times.map(time => model.wave(layer, time, .9));
      let best = { delay: 0, correlation: correlation(near, far) };
      for (let index = 1; index <= 30; index++) { const delay = index / 50, shifted = times.map(time => model.wave(layer, time + delay, .9)), score = correlation(near, shifted); if (score > best.correlation) best = { delay, correlation: score }; }
      const maximumWaveDifference = Math.max(...near.map((value, i) => Math.abs(value - far[i]))), record = { id: layer.id, authoredLag: layer.motionResponse.lagSeconds, nearProgress: .2, farProgress: .9, zeroLagCorrelation: correlation(near, far), maximumWaveDifference, bestDelaySeconds: best.delay, bestCorrelation: best.correlation }; data.spatialLag.push(record);
      assert.ok(maximumWaveDifference > layer.motionResponse.waveScale * .003, layer.id + ' ignores position'); assert.ok(best.delay >= .02 && best.delay <= layer.motionResponse.lagSeconds + .04, JSON.stringify(record));
    }
    assert.ok(data.spatialLag.length > 0, 'No actual layer has spatially delayed motion');
  });
  check(scene + ': 60/90/120Hz, refresh changes, duplicates and out-of-order seeks give identical positions at the same real time', () => {
    const layer = flex.find(layer => layer.motionResponse.lagSeconds > 0), checkpoints = [.7, 3.1, 7.8, 12.3], reference = checkpoints.map(time => point(model, layer, time)); data.callbackHistoryChecks = [];
    for (const history of ['60', '90', '120', '60-90-120', 'backward-and-duplicate']) {
      if (history === 'backward-and-duplicate') for (const time of [99, 2, 2, 20, 0, 1234.5, 3]) point(model, layer, time);
      else { let t = 0, index = 0; while (t < 13) { const hz = history.includes('-') ? (t < 4 ? 60 : t < 8 ? 90 : 120) : Number(history); point(model, layer, t + (index++ % 2 ? -.0006 : .0006)); t += 1 / hz; } }
      const actual = checkpoints.map(time => point(model, layer, time)), maximumError = Math.max(...actual.flatMap((position, index) => position.map((value, component) => Math.abs(value - reference[index][component])))); data.callbackHistoryChecks.push({ history, checkpoints, maximumError }); assert.equal(maximumError, 0, 'Motion depends on rendered-frame history, not elapsed seconds');
    }
    let largestNormalizationError = 0;
    for (const layer of flex) { const raw = options.layers.find(raw => (raw.id || raw.asset) === layer.id); for (const time of [0, .7, 7.8, 31.2]) { const a = point(model, layer, time), b = point(model, raw, time, layer.motionTip); largestNormalizationError = Math.max(largestNormalizationError, ...a.map((value, i) => Math.abs(value - b[i]))); } }
    data.rawNormalizedMaximumError = largestNormalizationError; assert.ok(largestNormalizationError < 1e-9, 'CPU raw-config and uploaded normalized layer contracts disagree');
  });
  data.peaks = motionPeaks(model);
}
fs.mkdirSync(output, { recursive: true });
const report = { at: new Date().toISOString(), version: manifest.version, fingerprint: sourceOnly ? null : manifest.fingerprint, input: sourceOnly ? 'source' : 'built', rendererSha256: crypto.createHash('sha256').update(source).digest('hex'), configSha256: crypto.createHash('sha256').update(JSON.stringify(manifest.config.layeredScene)).digest('hex'), method: 'Actual production pure helpers, layer normalization and actual main/Worker elapsed-time clocks; independent signal fitting, inter-part correlation, spatial-delay observation and callback-history negative controls. CPU evidence, not physical high-refresh or GPU position evidence.', results, evidence, passed: results.filter(result => result.passed).length, total: results.length };
fs.writeFileSync(path.join(output, clockOnly ? 'clock-report.json' : sourceOnly ? 'report-source.json' : 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); if (results.some(result => !result.passed)) process.exitCode = 1;
