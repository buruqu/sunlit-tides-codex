// Test-side signal measurements. No renderer equations are reimplemented here.
// A frequency search with free phase, gain and DC offset rejects an old
// constant sine even when its period/phase is changed to evade a fixed-period
// comparison. Residuals are normalized by the signal's own variance.
function bestSingleSine(times, values, minimumHz = .005, maximumHz = 1.5) {
  if (times.length !== values.length || times.length < 16) throw Error('Need matching motion samples');
  const count = times.length, mean = values.reduce((a, b) => a + b, 0) / count;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  if (!(variance > 1e-16)) return { frequencyHz: 0, normalizedResidual: 0, rms: 0, amplitude: 0 };
  function fit(frequencyHz) {
    let sumS = 0, sumC = 0, ss = 0, cc = 0, sc = 0, sy = 0, cy = 0;
    for (let i = 0; i < count; i++) {
      const angle = 2 * Math.PI * frequencyHz * times[i], s = Math.sin(angle), c = Math.cos(angle), y = values[i] - mean;
      sumS += s; sumC += c; ss += s * s; cc += c * c; sc += s * c; sy += s * y; cy += c * y;
    }
    ss -= sumS * sumS / count; cc -= sumC * sumC / count; sc -= sumS * sumC / count;
    const determinant = ss * cc - sc * sc;
    if (determinant <= 1e-14) return { frequencyHz, normalizedResidual: 1, rms: Math.sqrt(variance / count), amplitude: 0 };
    const sine = (sy * cc - cy * sc) / determinant, cosine = (cy * ss - sy * sc) / determinant;
    return { frequencyHz, normalizedResidual: Math.sqrt(Math.max(0, variance - sine * sy - cosine * cy) / variance), rms: Math.sqrt(variance / count), amplitude: Math.hypot(sine, cosine) };
  }
  const duration = times.at(-1) - times[0], step = 1 / (duration * 8);
  let best = fit(minimumHz);
  for (let hz = minimumHz + step; hz <= maximumHz; hz += step) { const result = fit(hz); if (result.normalizedResidual < best.normalizedResidual) best = result; }
  let left = Math.max(minimumHz, best.frequencyHz - step), right = Math.min(maximumHz, best.frequencyHz + step);
  for (let iteration = 0; iteration < 28; iteration++) {
    const a = left + (right - left) / 3, b = right - (right - left) / 3;
    if (fit(a).normalizedResidual < fit(b).normalizedResidual) right = b; else left = a;
  }
  const refined = fit((left + right) / 2);
  return refined.normalizedResidual < best.normalizedResidual ? refined : best;
}
function correlation(a, b) {
  if (a.length !== b.length || !a.length) throw Error('Need matching signals');
  const ma = a.reduce((s, n) => s + n, 0) / a.length, mb = b.reduce((s, n) => s + n, 0) / b.length;
  let aa = 0, bb = 0, ab = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; aa += x * x; bb += y * y; ab += x * y; }
  return aa * bb > 1e-20 ? ab / Math.sqrt(aa * bb) : null;
}
module.exports = { bestSingleSine, correlation };
