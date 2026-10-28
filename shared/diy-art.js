/* Shared decorative rendering. Inputs are validated theme data, never scripts. */
function createSunlitDiyArt({ window: win, document: doc, parent }) {
  const host = doc.createElement('div'); host.setAttribute('data-sunlit-diy-art', '');
  host.setAttribute('aria-hidden', 'true'); host.style.cssText = 'pointer-events:none;position:fixed;inset:0;overflow:hidden;';
  const shadow = host.attachShadow({ mode: 'open' }), style = doc.createElement('style');
  style.textContent = `:host{pointer-events:none!important}.layer{position:fixed;pointer-events:none;transform-origin:50% 50%;box-sizing:border-box}.layer>img{width:100%;height:100%;display:block;pointer-events:none}.effect{overflow:hidden}.particle{position:absolute;display:block;pointer-events:none;will-change:transform;animation:diy-particle var(--duration) linear infinite;animation-delay:var(--delay)}.particle>i{display:block;width:100%;height:100%;animation:diy-sway var(--sway-duration) ease-in-out infinite alternate;transform-origin:center}.bubble{border:1px solid #c7deff80;border-radius:50%;background:radial-gradient(ellipse at 28% 20%,#ffffffaa,transparent 38%),radial-gradient(ellipse at 70% 80%,#b1cffc44,transparent 65%);box-shadow:inset 1px 1px 3px #ffffff66}.leaf{border-radius:90% 12% 90% 12%;background:linear-gradient(135deg,transparent 47%,#d6eeaeaa 49%,#d6eeaeae 52%,transparent 54%),linear-gradient(40deg,#447d2e,#9ac86a);border:1px solid #517c4660}.custom{background-size:contain;background-position:center;background-repeat:no-repeat}@keyframes diy-particle{from{transform:translate3d(var(--from-x),var(--from-y),0)}to{transform:translate3d(var(--to-x),var(--to-y),0)}}@keyframes diy-sway{from{transform:translateX(calc(-1 * var(--sway))) rotate(-12deg)}to{transform:translateX(var(--sway)) rotate(16deg)}}:host([data-paused]) .particle,:host([data-paused]) .particle>i{animation-play-state:paused}:host([data-reduced]) .effect{display:none}@media(prefers-reduced-motion:reduce){.effect{display:none}}`;
  shadow.append(style); (parent || doc.body).append(host);
  const entries = new Map(); let disposed = false;
  const clamp = (v, min, max, fallback) => Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Number(v))) : fallback;
  const safeImage = value => typeof value === 'string' && /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);(?:base64,|utf8,|charset=utf-8,)/i.test(value);
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  function pause() {
    host.toggleAttribute('data-paused', doc.hidden); host.toggleAttribute('data-reduced', motion.matches);
    for (const item of entries.values()) {
      if (!item.image) continue;
      if (doc.hidden && /^data:image\/gif;/i.test(item.source)) item.image.removeAttribute('src');
      else if (item.image.getAttribute('src') !== item.source) item.image.src = item.source;
    }
  }
  doc.addEventListener('visibilitychange', pause); motion.addEventListener('change', pause);
  function effect(item, layer) {
    const e = layer.effect || {}, count = Math.round(clamp(e.count, 1, 64, 18));
    const signature = JSON.stringify([e, layer.source, layer.width, layer.height]);
    if (item.effectSignature === signature) return; item.effectSignature = signature;
    item.node.replaceChildren(); item.image = null;
    const preset = ['leaf','bubble','custom'].includes(e.preset) ? e.preset : 'bubble';
    for (let i = 0; i < count; i++) {
      const particle = doc.createElement('span'), texture = doc.createElement('i');
      particle.className = 'particle'; texture.className = preset;
      const size = clamp(e.size, 2, 160, 28) * (.65 + (i * 17 % 40) / 50);
      const duration = (18 + i % 7 * 2) / clamp(e.speed, .05, 8, 1), horizontal = e.direction === 'left' || e.direction === 'right';
      const location = 4 + (i * 73 % 92), rangeX = Math.max(1, win.innerWidth * clamp(layer.width,.1,200,100)/100), rangeY = Math.max(1, win.innerHeight * clamp(layer.height,.1,200,100)/100);
      const positive = e.direction === 'down' || e.direction === 'right';
      const start = positive ? -size * 2 : (horizontal ? rangeX : rangeY) + size;
      const end = positive ? (horizontal ? rangeX : rangeY) + size : -size * 2;
      particle.style.cssText = `width:${size}px;height:${size}px;left:${horizontal ? 0 : location}%;top:${horizontal ? location : 0}%;--duration:${duration}s;--delay:${-((i * 3.71 + 4) % duration)}s;--from-x:${horizontal ? start : 0}px;--to-x:${horizontal ? end : 0}px;--from-y:${horizontal ? 0 : start}px;--to-y:${horizontal ? 0 : end}px;--sway:${clamp(e.sway,0,150,18)}px;--sway-duration:${2.4 + i % 4}s;`;
      if (preset === 'custom' && safeImage(layer.source)) texture.style.backgroundImage = `url("${layer.source}")`;
      particle.append(texture); item.node.append(particle);
    }
  }
  let lastLayers = [];
  function render(layers) {
    if (disposed) return; lastLayers = layers || [];
    const keep = new Set();
    for (const layer of lastLayers) {
      if (!layer || layer.enabled === false || layer.kind === 'region') continue;
      if (layer.kind !== 'effect' && !safeImage(layer.source)) continue;
      keep.add(layer.id); let item = entries.get(layer.id);
      if (!item) { const node = doc.createElement('div'); node.dataset.layerId = layer.id; shadow.append(node); item = { node }; entries.set(layer.id, item); }
      const node = item.node, css = `left:${clamp(layer.x,-100,200,0)}vw;top:${clamp(layer.y,-100,200,0)}vh;width:${clamp(layer.width,.1,200,20)}vw;height:${clamp(layer.height,.1,200,30)}vh;opacity:${clamp(layer.opacity,0,100,100)/100};z-index:${Math.round(clamp(layer.z,-100,100,0))};transform:rotate(${clamp(layer.rotation,-360,360,0)}deg) scaleX(${layer.flipX ? -1 : 1});filter:blur(${clamp(layer.blur,0,40,0)}px);`;
      if (node.style.cssText !== css) node.style.cssText = css;
      node.className = layer.kind === 'effect' ? 'layer effect' : 'layer';
      if (layer.kind === 'effect') effect(item, layer);
      else {
        if (!item.image) { item.node.replaceChildren(); item.image = doc.createElement('img'); item.image.alt = ''; item.image.draggable = false; item.node.append(item.image); }
        if (item.source !== layer.source) { item.source = layer.source; item.image.src = layer.source; }
        item.image.style.objectFit = layer.fit === 'cover' ? 'cover' : 'contain';
      }
    }
    for (const [id,item] of entries) if (!keep.has(id)) { item.node.remove(); entries.delete(id); }
    pause();
  }
  function resize() { for (const item of entries.values()) item.effectSignature = ''; render(lastLayers); }
  win.addEventListener('resize', resize, { passive:true }); pause();
  return { host, render, dispose() { if(disposed)return;disposed=true;doc.removeEventListener('visibilitychange',pause);motion.removeEventListener('change',pause);win.removeEventListener('resize',resize);host.remove();entries.clear();lastLayers=[]; } };
}
