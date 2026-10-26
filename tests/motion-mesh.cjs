// CPU geometry regression: actual production Float32 mesh and pure vertex map.
// Envelope grids and real-time samples are reported separately; neither is
// described as GPU transform feedback or a proof about arbitrary functions.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { loadModel, motionPeaks } = require('./motion-production-model.cjs');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'test-results/motion-mesh'), sourceOnly = process.argv.includes('--source');
const manifest = JSON.parse(fs.readFileSync(path.join(root, sourceOnly ? 'theme/manifest.json' : 'dist/theme/manifest.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, sourceOnly ? 'theme/design/layered-scene.js' : 'dist/theme/theme.js'), 'utf8');
const results = [], evidence = {};
for (const scene of ['orchard', 'night']) {
  const options = scene === 'orchard' ? manifest.config.layeredScene : manifest.config.layeredScene.scenes.night, model = loadModel(source, options, scene), peaks = motionPeaks(model);
  const originalResponse = model.context.sunlitSceneResponseAt;
  assert.equal(typeof originalResponse, 'function', 'Read the actual per-station source of the bounded CPU/GPU coefficients');
  let forced = null;
  model.context.sunlitSceneResponseAt = (layer, time, station) => { if (!forced) return originalResponse(layer, time, station); assert.ok([0, .5, 1].includes(station)); return Math.fround(forced[Math.round(station * 2)]); };
  evidence[scene] = [];
  for (const layer of model.layers.filter(layer => ['hair', 'cloth', 'foliage'].includes(layer.kind))) {
    const vertices = model.positions, unique = [], indexes = [], map = new Map();
    for (let vertex = layer.mesh.first; vertex < layer.mesh.first + layer.mesh.count; vertex++) { const point = [vertices[vertex * 2], vertices[vertex * 2 + 1]], key = point.join(','); if (!map.has(key)) { map.set(key, unique.length); unique.push(point); } indexes.push(map.get(key)); }
    const triangleCount = indexes.length / 3, sourceAreas = new Float64Array(triangleCount), moved = new Float64Array(unique.length * 2), out = new Float64Array(4);
    const area = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    let degenerateSourceTriangles = 0;
    for (let i = 0; i < indexes.length; i += 3) { const a = unique[indexes[i]], b = unique[indexes[i + 1]], c = unique[indexes[i + 2]]; sourceAreas[i / 3] = area(...a, ...b, ...c); if (Math.abs(sourceAreas[i / 3]) < 1e-8) degenerateSourceTriangles++; }
    const empty = () => ({ minimumJacobian: Infinity, foldedSamples: 0, checkedTriangles: 0, samples: 0, worst: null }), actualTime = empty(), coefficientEnvelope = empty();
    function evaluate(bucket, time, coefficients = null) {
      forced = coefficients; bucket.samples++;
      if (forced) for (let i = 0; i < 3; i++) assert.equal(model.wave(layer, time, i / 2), Math.fround(forced[i]), 'Envelope injection must actually reach the production vertex map');
      for (let i = 0; i < unique.length; i++) { model.vertex(layer, time, unique[i][0], unique[i][1], out); moved[i * 2] = out[0]; moved[i * 2 + 1] = out[1]; }
      for (let triangle = 0; triangle < triangleCount; triangle++) {
        if (Math.abs(sourceAreas[triangle]) < 1e-8) continue;
        const a = indexes[triangle * 3] * 2, b = indexes[triangle * 3 + 1] * 2, c = indexes[triangle * 3 + 2] * 2, jacobian = area(moved[a], moved[a + 1], moved[b], moved[b + 1], moved[c], moved[c + 1]) / sourceAreas[triangle];
        assert.ok(Number.isFinite(jacobian)); bucket.checkedTriangles++; if (jacobian <= 0) bucket.foldedSamples++;
        if (jacobian < bucket.minimumJacobian) { bucket.minimumJacobian = jacobian; bucket.worst = { time: coefficients ? null : time, coefficients, triangle, original: [unique[indexes[triangle * 3]], unique[indexes[triangle * 3 + 1]], unique[indexes[triangle * 3 + 2]]], moved: [[moved[a], moved[a + 1]], [moved[b], moved[b + 1]], [moved[c], moved[c + 1]]] }; }
      }
    }
    const scale = layer.motionResponse.waveScale, spatial = layer.motionResponse.lagSeconds > 0, peak = peaks.find(record => record.id === layer.id);
    if (spatial) for (const a of [-scale, 0, scale]) for (const b of [-scale, 0, scale]) for (const c of [-scale, 0, scale]) evaluate(coefficientEnvelope, 1, [a, b, c]);
    else for (let index = 0; index <= 64; index++) { const value = -scale + 2 * scale * index / 64; evaluate(coefficientEnvelope, 1, [value, value, value]); }
    const times = new Set([0, .31, .8, 1.7, 2.9, 4.1, 5.3, 13.7, 37.1, 67.9, 113.41, 179.7, peak.maximum.time, peak.positive.time, peak.negative.time]);
    if (spatial) for (let index = 0; index <= 360; index++) times.add(index / 2);
    for (const time of times) evaluate(actualTime, time);
    forced = null;
    const minimumJacobian = Math.min(actualTime.minimumJacobian, coefficientEnvelope.minimumJacobian), foldedSamples = actualTime.foldedSamples + coefficientEnvelope.foldedSamples;
    const record = { id: layer.id, kind: layer.kind, meshStep: layer.meshStep, anchorLock: layer.anchorLock, spatial, vertices: layer.mesh.count, uniqueVertices: unique.length, triangles: triangleCount, rotationDegrees: layer.rotationRadians * 180 / Math.PI, anchorFade: layer.anchorFade, minimumJacobian, foldedSamples, degenerateSourceTriangles, actualTime, coefficientEnvelope, ownership: 'Every actual uploaded triangle, including transparent bbox ownership. If an envelope-only corner fails, distinguish reachable motion from conservative coefficient combinations before claiming a visible fold.' };
    evidence[scene].push(record);
    const passed = foldedSamples === 0 && degenerateSourceTriangles === 0 && minimumJacobian > 0;
    results.push({ name: layer.id + ': uploaded mesh preserves orientation across real wind samples and its coefficient envelope', passed });
  }
}
assert.ok(evidence.night.some(layer => layer.id === 'night-xixi-braid-loop'));
fs.mkdirSync(output, { recursive: true });
const report = { at: new Date().toISOString(), version: manifest.version, input: sourceOnly ? 'source' : 'built', fingerprint: sourceOnly ? null : manifest.fingerprint, rendererSha256: crypto.createHash('sha256').update(source).digest('hex'), geometrySha256: crypto.createHash('sha256').update(JSON.stringify(manifest.config.layeredScene)).digest('hex'), method: 'Production normalization, Float32 upload vertices, appendMesh and sunlitSceneVertexAt. Old scalar pieces:65 angle-envelope steps and representative actual times. Spatial pieces:27 independent root/middle/tip coefficient grid combinations plus0..180s/.5s and actual locally-refined free-point extrema. CPU geometry evidence; samples and conservative grids remain separately attributable.', results, evidence, passed: results.filter(result => result.passed).length, total: results.length };
fs.writeFileSync(path.join(output, sourceOnly ? 'report-source.json' : 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); if (results.some(result => !result.passed)) process.exitCode = 1;
