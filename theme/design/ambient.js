/* Small, local-only companions. The GIF is genuinely removed whenever motion stops. */
function mountSunlitAmbient(context) {
  const { document: doc, window: win } = context;
  const html = doc.documentElement, apiKey = "__SUNLIT_AMBIENT__";
  win[apiKey]?.dispose?.();
  const media = win.matchMedia("(prefers-reduced-motion: reduce)");
  const host = doc.createElement("div");
  host.className = "sunlit-ambient-host";
  host.dataset.fusionUi = "ambient";
  host.dataset.sunlitAmbient = "true";
  host.setAttribute("aria-hidden", "true");
  host.hidden = true;
  const listeners = [];
  let disposed = false, frame = 0, observed = new Set(), status = { paused: true, companions: [], suppressed: [] };
  const scrollGuard = typeof createFusionScrollGuard === "function" ? createFusionScrollGuard(win) : null;
  function listen(node, type, handler, options) {
    node.addEventListener(type, handler, options);
    listeners.push(() => node.removeEventListener(type, handler, options));
  }
  function asset(key) {
    try { return context.assetDataUrl?.(key) || context.assets?.[key] || ""; }
    catch { return ""; }
  }
  const sources = { light: asset("denia-chibi"), dark: asset("denia-chibi-dark"), sigrika: asset("task-right-secondary"), xixiEmote: asset("sigrika-emote") };
  const partners = [
    { id: "xixi-emote", preferredSide: "left", animated: true },
    { id: "sigrika", preferredSide: "left", animated: false },
    { id: "denia", preferredSide: "right", animated: true }
  ].filter(partner => partner.id !== "xixi-emote" || context.config?.ambient?.xixiEmote === true).map(partner => {
    const node = doc.createElement("div"), image = doc.createElement("img");
    node.className = "sunlit-ambient-companion sunlit-ambient-" + partner.id;
    node.dataset.sunlitCompanion = partner.id;
    node.hidden = true;
    image.alt = ""; image.draggable = false; image.decoding = "async";
    node.append(image); host.append(node);
    const result = { ...partner, node, image, failedSource: "" };
    listen(image, "error", () => { result.failedSource = image.getAttribute("src") || ""; node.hidden = true; });
    return result;
  });
  doc.body.append(host);
  let boxes = new Map(), computed = new Map();
  const box = node => {
    if (!boxes.has(node)) boxes.set(node, node.getBoundingClientRect());
    return boxes.get(node);
  };
  function shown(node, native = true) {
    if (!node?.isConnected || node.closest("[hidden]")) return false;
    if (native && node.closest('[aria-hidden="true"]')) return false;
    const rect = box(node);
    if (!computed.has(node)) computed.set(node, win.getComputedStyle(node));
    const css = computed.get(node);
    return rect.width > 2 && rect.height > 2 && css.display !== "none" && css.visibility !== "hidden" && Number(css.opacity) !== 0 &&
      rect.right > 0 && rect.bottom > 0 && rect.left < win.innerWidth && rect.top < win.innerHeight;
  }
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const overlap = (a, b, gap = 0) => a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
  function setStyle(node, key, value) { if (node.style.getPropertyValue(key) !== value) node.style.setProperty(key, value); }
  function setHidden(node, value) { if(node.hidden!==value)node.hidden=value; }
  function hidePartner(partner) {
    setHidden(partner.node, true);
    if(partner.image.hasAttribute("src"))partner.image.removeAttribute("src");
  }
  function hideAll() {
    setHidden(host, true);
    for (const partner of partners) {
      // CSS animation-play-state cannot pause an animated GIF decoder.
      hidePartner(partner);
    }
  }
  const resize = new win.ResizeObserver(schedule);
  function observe(nodes) {
    const next = new Set(nodes.filter(Boolean));
    for (const node of observed) if (!next.has(node)) resize.unobserve(node);
    for (const node of next) if (!observed.has(node)) resize.observe(node);
    observed = next;
  }
  function layout() {
    frame = 0;
    if (disposed) return;
    // Geometry is shared only within this pass, never across scroll/resize.
    boxes = new Map(); computed = new Map();
    const settings = win.__SIGRIKA_DENIA_FUSION__?.getSettings?.();
    const dark = html.getAttribute("data-theme") === "dark" || (!html.hasAttribute("data-theme") && html.classList.contains("electron-dark"));
    const paused = !!(doc.hidden || media.matches || html.dataset.fusionFocus === "true" || html.dataset.fusionReducedMotion === "true" ||
      settings?.common?.focusMode || settings?.common?.reduceMotion || settings?.common?.companions === false ||
      context.config?.ambient?.companions === false || ["off", "reduced"].includes(html.dataset.tessalumeMotion));
    status = { paused, mode: dark ? "dark" : "light", companions: [], suppressed: [] };
    if (paused) { hideAll(); observe([]); scrollGuard?.clear(); return; }
    const shared = typeof resolveFusionLayout === "function" ? resolveFusionLayout(doc, win) : null;
    const workspace = shared?.workspace || [...doc.querySelectorAll(".thread-scroll-container")].find(node => shown(node));
    const main = shared?.main || workspace?.closest("main");
    const paper = shared?.paper || (workspace && [...workspace.querySelectorAll('[data-tessalume-surface="chat-paper"],.thread-content-max-width')].find(node => shown(node)));
    const composer = shared?.composer || (main && [...main.querySelectorAll('[data-tessalume-surface="composer"],.composer-surface-chrome')].find(node => shown(node)));
    const panels = [...new Set([...(shared?.panels || [...doc.querySelectorAll('.app-shell-right-panel,[data-app-shell-right-panel],[data-summary-panel-variant="summary"],[data-tessalume-surface="output-panel"]')]),
      ...doc.querySelectorAll('.sgk-gallery-chat-open,[role="dialog"]')])].filter(node => shown(node));
    const cards = [...doc.querySelectorAll('[data-fusion-card],[data-theme-role="memory"]')].filter(node => shown(node, false));
    observe([workspace, main, paper, composer, ...panels, ...cards]);
    if (!workspace || !main || !paper || !composer || html.classList.contains("tessalume-code-review-open")) { hideAll(); scrollGuard?.clear(); return; }
    const area = box(workspace), mainBox = box(main), paperBox = box(paper), composerBox = box(composer);
    const bounds = rect(Math.max(0, area.left, mainBox.left), Math.max(58, area.top, mainBox.top),
      Math.min(win.innerWidth, area.right, mainBox.right) - Math.max(0, area.left, mainBox.left),
      Math.min(win.innerHeight, Math.max(area.bottom, composerBox.bottom), mainBox.bottom) - Math.max(58, area.top, mainBox.top));
    const lane = rect(Math.min(paperBox.left, composerBox.left) - 8, bounds.top,
      Math.max(paperBox.right, composerBox.right) - Math.min(paperBox.left, composerBox.left) + 16, bounds.height);
    const cardBoxes = cards.map(box);
    const occupied = [...panels.map(box), ...cardBoxes];
    scrollGuard?.capture(workspace, [[workspace, box(workspace)], [main, box(main)], [paper, box(paper), true],
      [composer, box(composer)], ...panels.map(node => [node, box(node)]), ...cards.map(node => [node, box(node)])]);
    const visibleDumplingPair = cards.some(node => node.matches('[data-fusion-card="secondary"]') &&
      ['task-card-art', 'dumpling-companion'].every(part => shown(node.querySelector(`[data-theme-part="${part}"]`), false)));
    const sides = {
      left: { left: bounds.left + 6, right: Math.min(lane.left - 4, bounds.right - 6) },
      right: { left: Math.max(lane.right + 4, bounds.left + 6), right: bounds.right - 6 }
    };
    for (const partner of partners) {
      if (partner.id === "xixi-emote" && (context.config?.ambient?.xixiEmote !== true || html.dataset.fusionSidebarEmote === "false")) {
        hidePartner(partner); continue;
      }
      if (partner.id === "sigrika" && (visibleDumplingPair || context.config?.avatars?.enabled === true)) {
        hidePartner(partner); status.suppressed.push(context.config?.avatars?.enabled === true ? "sigrika-message-avatars" : "sigrika-duplicate"); continue;
      }
      const source = partner.id === "xixi-emote" ? sources.xixiEmote : partner.animated ? sources[dark ? "dark" : "light"] : sources.sigrika;
      if (!source || source === partner.failedSource) { hidePartner(partner); continue; }
      let position = null;
      if (partner.id === "xixi-emote") {
        // This GIF belongs to the left standee. Never relocate it to another
        // gutter when the card disappears or its headroom becomes occupied.
        const anchor = cards.find(node => node.matches('[data-fusion-card="left"]') && node.dataset.fusionHidden !== "true");
        if (anchor) {
          const card = box(anchor), side = sides.left;
          for (const size of [96, 88, 80, 64, 52]) {
            const x = Math.round(card.left + (card.width - size) / 2);
            const top = card.top - 64 - size;
            const tops = [top, ...occupied.map(other => other.top - size - 10)];
            for (let y = top - 18; y >= bounds.top + 12; y -= 18) tops.push(y);
            position = tops.map(y => rect(x, Math.round(y), size, size)).find(candidate =>
              candidate.left >= side.left && candidate.right <= side.right && candidate.top >= bounds.top + 12 &&
              candidate.bottom <= card.top - 48 && candidate.bottom <= bounds.bottom - 16 && !overlap(candidate, lane) &&
              !occupied.some(other => overlap(candidate, other, 8)));
            if (position) break;
          }
        }
      }
      for (const sideName of partner.id === "xixi-emote" ? [] : [partner.preferredSide, partner.preferredSide === "left" ? "right" : "left"]) {
        const side = sides[sideName], available = Math.floor(side.right - side.left);
        const sizes = [...new Set([Math.min(partner.animated ? 112 : 96, available), 96, 80, 64, 60, 52])].filter(size => size >= 52 && size <= available && size <= (partner.animated ? 112 : 96));
        for (const size of sizes) {
          const sameSideCards = cardBoxes.filter(card => sideName === "left" ? card.right <= lane.left : card.left >= lane.right);
          const tops = [bounds.top + 46];
          if (sameSideCards.length) tops.unshift(Math.min(...sameSideCards.map(card => card.top)) - size - 22);
          for (const obstacle of occupied) { tops.push(obstacle.bottom + 10, obstacle.top - size - 10); }
          for (let y = bounds.top + 46; y + size <= bounds.bottom - 16; y += size + 22) tops.push(y);
          const xs = [Math.round(side.left + (side.right - side.left - size) / 2), Math.ceil(side.left), Math.floor(side.right - size)];
          for (const obstacle of occupied) xs.push(Math.floor(obstacle.left - size - 10), Math.ceil(obstacle.right + 10));
          const candidates = tops.flatMap(y => xs.map(x => rect(x, Math.round(y), size, size)));
          position = candidates.find(candidate => candidate.left >= side.left && candidate.right <= side.right &&
            candidate.top >= bounds.top + 28 && candidate.bottom <= bounds.bottom - 16 && !overlap(candidate, lane) &&
            !occupied.some(other => overlap(candidate, other, 8)));
          if (position) break;
        }
        if (position) break;
      }
      if (!position) { hidePartner(partner); continue; }
      setStyle(partner.node, "--sunlit-companion-x", position.left + "px");
      setStyle(partner.node, "--sunlit-companion-y", position.top + "px");
      setStyle(partner.node, "--sunlit-companion-size", position.width + "px");
      const compact = String(position.width < 80);
      if (partner.node.dataset.sunlitCompact !== compact) partner.node.dataset.sunlitCompact = compact;
      if (partner.image.getAttribute("src") !== source) partner.image.setAttribute("src", source);
      setHidden(partner.node, false);
      occupied.push(position);
      status.companions.push({ id: partner.id, ...position });
    }
    setHidden(host, !status.companions.length);
  }
  function schedule() { if (!disposed && !frame) frame = win.requestAnimationFrame(layout); }
  const mutation = new win.MutationObserver(records => {
    if (records.some(record => {
      const node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (typeof isFusionScrollMutation === "function" && isFusionScrollMutation(record)) return false;
      if (record.type === "childList" && ![...record.addedNodes, ...record.removedNodes].some(child => child.nodeType === 1)) return false;
      return node && !node.closest?.('[data-sunlit-ambient],[data-fusion-bubbles],[data-fusion-ui="palette"]');
    })) schedule();
  });
  mutation.observe(html, { subtree: true, childList: true, attributes: true, attributeOldValue: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden", "data-theme", "data-fusion-focus", "data-fusion-reduced-motion", "data-fusion-companions", "data-fusion-sidebar-emote", "data-fusion-hidden", "data-tessalume-auto-hidden", "data-tessalume-motion"] });
  // Home -> task can expose a card while its CSS opacity is still zero. The
  // first pass correctly excludes it, but opacity completion changes neither
  // attributes nor dimensions. Retry only when an anchor's transition ends.
  listen(doc, "transitionend", event => {
    if (["opacity", "visibility", "transform"].includes(event.propertyName) &&
      event.target?.matches?.('[data-fusion-card],[data-theme-role="memory"],[data-theme-stage]')) schedule();
  }, { passive: true, capture: true });
  listen(win, "resize", schedule, { passive: true });
  listen(doc, "scroll", event => { if (scrollGuard) scrollGuard.queue(event, schedule); else schedule(); }, { passive: true, capture: true });
  listen(doc, "visibilitychange", () => {
    // A hidden document can suspend RAF, so stop the decoder before scheduling anything.
    if (doc.hidden) { status = { ...status, paused: true, companions: [] }; hideAll(); }
    else schedule();
  });
  listen(media, "change", schedule);
  function dispose() {
    if (disposed) return;
    disposed = true; win.cancelAnimationFrame(frame);
    mutation.disconnect(); resize.disconnect();
    listeners.splice(0).forEach(off => off());
    hideAll(); host.remove(); observed.clear(); boxes.clear(); computed.clear(); scrollGuard?.clear();
    if (win[apiKey]?.dispose === dispose) delete win[apiKey];
  }
  win[apiKey] = { refresh: schedule, getStatus: () => ({ ...status, companions: status.companions.map(item => ({ ...item })), suppressed: [...status.suppressed] }), dispose };
  context.addCleanup(dispose);
  schedule();
  return win[apiKey];
}

