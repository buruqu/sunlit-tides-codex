// Deterministic tests execute the exact production RAF gate without a browser/GPU.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../theme/design/layered-scene.js'), 'utf8');
const sandbox = {}; vm.runInNewContext(source, sandbox);
const productionGate = sandbox.sunlitSceneFrameDue, targetFps = 120, interval = 1000 / targetFps;
assert.equal(typeof productionGate, 'function');
assert.match(source, /sunlitSceneFrameDue\(frameClock,timestamp,frameInterval,frameTolerance\)/, 'Actual production tick must use this gate');
const mainTolerance = Number(source.match(/frameTolerance=([\d.]+)/)?.[1]), workerTolerance = Number(source.match(/sunlitSceneFrameDue\(clock,timestamp,interval,([\d.]+)\)/)?.[1]);
assert.ok(Number.isFinite(mainTolerance) && Number.isFinite(workerTolerance), 'Read the actual production main and Worker call-site tolerances');
assert.equal(mainTolerance, workerTolerance, 'Main fallback and Worker must use the same gate tolerance');
const due = (clock, timestamp) => productionGate(clock, timestamp, interval, workerTolerance);
const clock = () => ({ nextDue: -Infinity, missedFrameSlots: 0 });
function simulate(hz, jitter = () => 0) {
  const state = clock(), drawn = [], callbacks = [];
  for (let index = 0; index < hz * 10; index++) {
    const timestamp = index * 1000 / hz + jitter(index); callbacks.push(timestamp);
    if (due(state, timestamp)) drawn.push(timestamp);
  }
  return { state, drawn, callbacks };
}
for (const hz of [60, 90, 120, 144, 165, 240]) test(hz + 'Hz RAF renders min(refresh,120) with a bounded deadline distribution', () => {
  const actual = simulate(hz), expected = Math.min(hz, targetFps); assert.ok(Math.abs(actual.drawn.length - expected * 10) <= 1, JSON.stringify({ hz, frames: actual.drawn.length, expected: expected * 10 }));
  if (hz >= targetFps) assert.equal(actual.state.missedFrameSlots, 0);
  for (let second = 0; second < 10; second++) { const frames = actual.drawn.filter(time => time >= second * 1000 - .001 && time < (second + 1) * 1000 - .001).length; assert.ok(Math.abs(frames - expected) <= 1, 'Cadence must stay distributed across the full interval'); }
  for (let index = 1; index < actual.drawn.length; index++) { const gap = actual.drawn[index] - actual.drawn[index - 1]; assert.ok(gap > 0); assert.ok(gap <= Math.ceil(hz / expected) * 1000 / hz + .001, 'Frames must not clump into a low-frequency burst'); }
  if (hz <= targetFps) assert.equal(actual.drawn.length, actual.callbacks.length, 'Below 120Hz each actual RAF can produce one frame; no invented extra frames');
  if ([120, 240].includes(hz)) for (let index = 1; index < actual.drawn.length; index++) assert.ok(Math.abs(actual.drawn[index] - actual.drawn[index - 1] - interval) < .001, '120Hz draws every callback; 240Hz draws once per two callbacks with genuine 1/120-second timestamps');
});
test('sub-millisecond RAF timestamp noise cannot halve supported refresh rates', () => {
  for (const hz of [60, 90, 120, 144, 165, 240]) for (const jitter of [.2, .4, .6]) for (const polarity of [-1, 1]) {
    const actual = simulate(hz, index => (index % 2 ? -jitter : jitter) * polarity), expected = Math.min(hz, targetFps);
    assert.ok(Math.abs(actual.drawn.length - expected * 10) <= 1, JSON.stringify({ hz, jitter, polarity, frames: actual.drawn.length, expected: expected * 10 }));
    if (hz <= targetFps) assert.equal(actual.drawn.length, actual.callbacks.length, 'A supported native rate must not lose alternating callbacks to timestamp jitter');
    for (let second = 0; second < 10; second++) { const frames = actual.drawn.filter(time => time >= second * 1000 - .7 && time < (second + 1) * 1000 - .7).length; assert.ok(Math.abs(frames - expected) <= 1, JSON.stringify({ hz, jitter, polarity, second, frames, expected })); }
    const maxGap = Math.max(...actual.drawn.slice(1).map((time, index) => time - actual.drawn[index]));
    assert.ok(maxGap <= Math.ceil(hz / expected) * 1000 / hz + 2 * jitter + .001, 'Timestamp noise must not produce a recurring low-rate gap');
  }
});

test('60/90/120Hz refresh changes preserve every supported callback without resetting the clock', () => {
  for (const jitter of [0, .2, .4, .6]) {
    const state = clock(); let time = 0, index = 0;
    for (const hz of [60, 90, 120, 90, 60, 120]) {
      // Odd callback counts deliberately move each transition away from integer
      // target-rate grid boundaries, as a real monitor mode change can do.
      const count = hz * 2 + 1, drawn = [];
      for (let frame = 0; frame < count; frame++, index++) { const timestamp = time + (index % 2 ? -jitter : jitter); if (due(state, timestamp)) drawn.push(timestamp); time += 1000 / hz; }
      assert.equal(drawn.length, count, JSON.stringify({ hz, jitter, expected: count, actual: drawn.length }));
      for (let frame = 1; frame < drawn.length; frame++) assert.ok(drawn[frame] - drawn[frame - 1] <= 1000 / hz + jitter * 2 + .001, 'A refresh change must not leave the scheduler at the prior rate');
    }
  }
});
test('a real 60Hz callback stream cannot be reported as 120 actual rendered frames', () => {
  const actual = simulate(60); assert.equal(actual.callbacks.length, 600); assert.equal(actual.drawn.length, 600); assert.notEqual(actual.drawn.length, 1200);
});

test('a repeated native RAF timestamp cannot produce another GPU frame at any refresh rate', () => {
  for (const hz of [60, 90, 120, 144, 165, 240]) {
    const state = clock();
    for (let index = 0; index < hz * 2; index++) { const timestamp = index * 1000 / hz + (index % 2 ? -.6 : .6); due(state, timestamp); assert.equal(due(state, timestamp), false, JSON.stringify({ hz, timestamp })); }
  }
});
test('dropped callbacks skip missed slots without multi-frame catch-up or deadline drift', () => {
  const state = clock(), timestamps = [0, interval, interval * 2, interval * 6, interval * 7];
  assert.ok(timestamps.every(timestamp => due(state, timestamp)));
  assert.equal(state.missedFrameSlots, 3);
  assert.equal(due(state, interval * 7), false, 'A repeated callback at the same timestamp cannot render again');
  assert.equal(due(state, interval * 7 + 1), false, 'A late frame does not start a catch-up render burst');
  assert.ok(Math.abs(state.nextDue - interval * 8) < .001);
});
test('resume resets the deadline without a paused-duration catch-up burst', () => {
  const state = clock(); due(state, 0); due(state, interval); state.nextDue = -Infinity;
  assert.equal(due(state, 90000), true); assert.equal(due(state, 90000), false); assert.equal(state.missedFrameSlots, 0);
  assert.ok(Math.abs(state.nextDue - (90000 + interval)) < .001);
});
