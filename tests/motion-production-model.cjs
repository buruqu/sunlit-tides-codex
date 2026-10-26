// Load production's pure motion helpers and its actual layer/mesh preparation.
// No browser, renderer mount, image decode or application module is executed.
const assert = require('node:assert/strict'), vm = require('node:vm');
function declaration(source, name) {
  const start = source.lastIndexOf('function ' + name + '('); assert.ok(start >= 0, 'Missing production ' + name);
  const first = source.indexOf('{', start); let depth = 0;
  for (let cursor = first; cursor < source.length; cursor++) { if (source[cursor] === '{') depth++; if (source[cursor] === '}' && --depth === 0) return source.slice(start, cursor + 1); }
  throw Error('Unclosed production ' + name);
}
function loadModel(source, options, scene) {
  const pureStart = source.indexOf('function sunlitSceneFrameDue('), pureEnd = source.indexOf('function sunlitCreateSceneGpuBackend(');
  assert.ok(pureStart >= 0 && pureEnd > pureStart, 'Read the production pure-helper block');
  const rendererStart = source.indexOf('function mountSunlitLayeredSceneRenderer(');
  const normalizeStart = source.indexOf('  const finite=', rendererStart), normalizeEnd = source.indexOf('  const eyes=', normalizeStart);
  const meshStart = source.indexOf('  const baseMesh=appendMesh(', rendererStart), meshEnd = source.indexOf('  const setAttr=', meshStart);
  assert.ok(normalizeStart > rendererStart && normalizeEnd > normalizeStart && meshStart > normalizeEnd && meshEnd > meshStart, 'Read actual production layer and mesh setup');
  const context = { options, scene };
  vm.runInNewContext(source.slice(pureStart, pureEnd), context);
  for (const name of ['sunlitSceneWindAt', 'sunlitSceneMotionWave', 'sunlitSceneVertexAt']) assert.equal(typeof context[name], 'function', 'Missing shared pure motion contract: ' + name);
  vm.runInNewContext(`const canonicalArtworkScene=scene==='night-tears'?'night':scene,sourceWidth=options.width||1280,sourceHeight=options.height||1280,sourceAsset=canonicalArtworkScene==='night'?options.sourceAsset:null;
    ${source.slice(normalizeStart, normalizeEnd)}
    const positions=[];${declaration(source, 'appendMesh')}
    ${source.slice(meshStart, meshEnd)}
    globalThis.normalizedLayers=layers;globalThis.uploadedVertices=new Float32Array(positions);`, context);
  return { context, layers: context.normalizedLayers, positions: context.uploadedVertices, wind: context.sunlitSceneWindAt, wave: context.sunlitSceneMotionWave, vertex: context.sunlitSceneVertexAt };
}
function motionPeaks(model, duration = 180, step = .05) {
  const out = new Float64Array(4), records = [];
  for (const layer of model.layers.filter(layer => ['hair', 'cloth', 'foliage'].includes(layer.kind))) {
    assert.ok(layer.motionTip?.length === 2, layer.id + ' requires an authored visible point');
    const [x, y] = layer.motionTip, at = time => { model.vertex(layer, time, x, y, out); return { time, displacement: Math.hypot(out[0] - x, out[1] - y), angle: out[2], wave: out[3] }; };
    let maximum = at(0), positive = maximum, negative = maximum;
    for (let frame = 1; frame <= Math.ceil(duration / step); frame++) { const sample = at(Math.min(duration, frame * step)); if (sample.displacement > maximum.displacement) maximum = sample; if (sample.angle > positive.angle) positive = sample; if (sample.angle < negative.angle) negative = sample; }
    function refine(sample, value) {
      let left = Math.max(0, sample.time - step), right = Math.min(duration, sample.time + step);
      for (let iteration = 0; iteration < 24; iteration++) { const a = left + (right - left) / 3, b = right - (right - left) / 3; if (value(at(a)) < value(at(b))) left = a; else right = b; }
      return at((left + right) / 2);
    }
    maximum = refine(maximum, sample => sample.displacement); positive = refine(positive, sample => sample.angle); negative = refine(negative, sample => -sample.angle);
    records.push({ id: layer.id, kind: layer.kind, duration, step, maximum, positive, negative });
  }
  return records;
}
module.exports = { declaration, loadModel, motionPeaks };
