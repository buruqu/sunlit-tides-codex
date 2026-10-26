// Browser-side test support. The legacy glove rectangle also contains the
// newly animated orange braid at x629..631/y327..334. Source-art inspection
// confirms those pixels are braid, not glove. Keep raw rectangle counts and
// exclude only its authored source ownership, never its swept motion bounds.
module.exports = function fixedRegionOwnership(spec) {
  const layer = spec.layers.find(layer => layer.id === 'night-xixi-small-braid-right');
  if (!layer) throw new Error('Missing source ownership for the reviewed braid/glove overlap');
  const canvas = document.createElement('canvas'); canvas.width = spec.width; canvas.height = spec.height;
  const ctx = canvas.getContext('2d'), contour = new Path2D(layer.path);
  ctx.fillStyle = ctx.strokeStyle = 'white'; ctx.fill(contour);
  if (layer.coveragePadding) { ctx.lineWidth = layer.coveragePadding * 2; ctx.lineJoin = 'round'; ctx.stroke(contour); }
  ctx.globalCompositeOperation = 'destination-out'; for (const hole of layer.fixedHoles || []) ctx.fill(new Path2D(hole));
  const pixels = ctx.getImageData(0, 0, spec.width, spec.height).data;
  return {
    metadata: { regionId: 'yaya-glove-on-xixi-shoulder', movingLayerId: layer.id, sourceOwnership: 'Authored path plus its source AA coverage; alpha >=128. No displacement dilation.', reason: 'Source-reviewed orange braid overlaps the legacy rectangular glove ROI; actual glove and every remaining rectangle pixel remain strictly fixed.' },
    contains(regionId, x, y) { return regionId === 'yaya-glove-on-xixi-shoulder' && pixels[(y * spec.width + x) * 4 + 3] >= 128; }
  };
};
