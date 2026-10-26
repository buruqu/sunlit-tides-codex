/* Fixed decorative rails do not follow transcript text vertically. Compare only
   their small set of collision anchors on scroll, including horizontal shifts. */
function createFusionScrollGuard(win = window) {
  let owner = null, entries = [], pending = 0, scrollTarget = null;
  const key = (r, horizontal) => horizontal ? `${r.left},${r.right}` : `${r.left},${r.top},${r.right},${r.bottom}`;
  const guard = {
    capture(workspace, anchors) {
      owner = workspace;
      const seen = new Set();
      entries = anchors.filter(([node]) => node && !seen.has(node) && seen.add(node))
        .map(([node, rect, horizontal = false]) => ({ node, horizontal, value: key(rect, horizontal) }));
    },
    unchanged(event) {
      return owner?.isConnected && event.target === owner && entries.length > 0 && entries.every(entry =>
        entry.node.isConnected && key(entry.node.getBoundingClientRect(), entry.horizontal) === entry.value);
    },
    queue(event, schedule) {
      scrollTarget = event.target;
      if (!pending) pending = win.requestAnimationFrame(() => {
        pending = 0;
        // Native absolute footers move with scrolling before the engine anchors
        // them in RAF. Read after that write, not in the raw scroll event.
        if (!guard.unchanged({ target: scrollTarget })) schedule();
        scrollTarget = null;
      });
    },
    clear() { if (pending) win.cancelAnimationFrame(pending); pending = 0; scrollTarget = null; owner = null; entries = []; }
  };
  return guard;
}
function isFusionScrollMutation(record) {
  if (record.type !== "attributes" || record.attributeName !== "style") return false;
  const property = record.target.getAttribute?.("data-fusion-transcript-clip") === "true" ? "--fusion-transcript-clip-bottom" :
    record.target.getAttribute?.("data-fusion-split-footer") === "true" ? "--fusion-split-shift-y" : null;
  if (!property) return false;
  const pattern = new RegExp(property + "\\s*:[^;]*(;|$)", "g");
  const strip = value => (value || "").replace(pattern, "").trim();
  return strip(record.oldValue) === strip(record.target.getAttribute("style"));
}
/* Resolve native geometry without assuming the composer shares the transcript subtree. */
function resolveFusionLayout(doc, win) {
  const visible = node => {
    if (!node?.isConnected || node.closest('[hidden],[aria-hidden="true"],[inert]')) return false;
    const r = node.getBoundingClientRect(), css = win.getComputedStyle(node);
    return r.width > 2 && r.height > 2 && r.right > 0 && r.bottom > 0 && r.left < win.innerWidth && r.top < win.innerHeight &&
      css.display !== "none" && css.visibility !== "hidden" && Number(css.opacity) !== 0;
  };
  const visibleArea = node => { const r = node.getBoundingClientRect(); return Math.max(0, Math.min(win.innerWidth, r.right) - Math.max(0, r.left)) * Math.max(0, Math.min(win.innerHeight, r.bottom) - Math.max(0, r.top)); };
  const workspace = [...doc.querySelectorAll(".thread-scroll-container")].filter(visible).sort((a, b) => visibleArea(b) - visibleArea(a))[0];
  const main = workspace?.closest("main") || [...doc.querySelectorAll('main[data-tessalume-surface="main"],main[data-app-shell-main-surface="default"],main')].find(visible);
  const scope = workspace || main || doc;
  const paper = [...scope.querySelectorAll('[data-tessalume-surface="chat-paper"]')].find(visible) ||
    [...scope.querySelectorAll('[class*="thread-content-max-width"]')].find(visible);
  const area = (workspace || main)?.getBoundingClientRect();
  const candidates = [...doc.querySelectorAll('[data-tessalume-surface="composer"],.composer-surface-chrome,[data-composer-surface-variant]')].filter(visible);
  const composer = candidates.map(node => {
    const r = node.getBoundingClientRect(), owner = node.closest("main");
    if (workspace && node.closest('.app-shell-right-panel,[data-app-shell-right-panel],[data-summary-panel-variant="summary"],[role="dialog"]')) return null;
    const overlap = area ? Math.max(0, Math.min(area.right, r.right) - Math.max(area.left, r.left)) : r.width;
    const matchesArea = !area || overlap >= Math.min(r.width, area.width) * .5;
    if (!matchesArea || (main && owner && owner !== main)) return null;
    return { node, score: (workspace?.contains(node) ? 4000 : 0) + (main?.contains(node) ? 2000 : 0) +
      (node.matches('[data-tessalume-surface="composer"],.composer-surface-chrome') ? 100 : 0) + r.bottom / win.innerHeight + overlap / Math.max(1, r.width) };
  }).filter(Boolean).sort((a, b) => b.score - a.score)[0]?.node;
  const mainBox = main?.getBoundingClientRect();
  const panels = [];
  for (const node of doc.querySelectorAll('.app-shell-right-panel,[data-app-shell-right-panel],[data-summary-panel-variant="summary"],[data-tessalume-surface="output-panel"]')) {
    if (!visible(node)) continue;
    const r = node.getBoundingClientRect();
    if (mainBox && (r.right <= mainBox.left || r.left >= mainBox.right || r.bottom <= mainBox.top || r.top >= mainBox.bottom)) continue;
    if (panels.some(other => { const b = other.getBoundingClientRect(); return Math.abs(r.left - b.left) < 2 && Math.abs(r.top - b.top) < 2 && Math.abs(r.right - b.right) < 2 && Math.abs(r.bottom - b.bottom) < 2; })) continue;
    panels.push(node);
  }
  return { workspace, main, paper, composer, panels };
}

function mountFusion(context) {
  const { document: doc, window: win, root } = context;
  const html = doc.documentElement;
  const runtimeKey = "__SIGRIKA_DENIA_FUSION__";
  const storageKey = "tessalume.fusion.settings.v1:" + context.id;
  win[runtimeKey]?.dispose?.();
  let disposed = false;
  let frame = 0;
  let fullLayout = true;
  let lastMainSurface;
  let tailDirty = false;
  let scrollGeometry = null;
  let saveTimer = 0;
  const initialDefaults = () => FusionSettings.normalize(context.config.fusion?.defaults || FusionSettings.defaults());
  let state = initialDefaults();
  let storageError = "";
  try {
    const saved = win.localStorage.getItem(storageKey);
    if (saved) state = FusionSettings.parse(saved);
  } catch (error) { storageError = "未能读取已保存参数，已使用默认值；可导入备份恢复。"; }
  const attrs = new Map();
  const styles = new Map();
  const ownStyleText = new WeakMap();
  const listeners = [];
  const imageUrls = new Set();
  const revokeTimers = new Set();
  const media = win.matchMedia("(prefers-reduced-motion: reduce)");
  const mode = () => html.getAttribute("data-theme") === "dark" ||
    (!html.hasAttribute("data-theme") && html.classList.contains("electron-dark")) ? "dark" : "light";
  let lastMode = mode();
  function attr(node, name, value) {
    let record = attrs.get(node);
    if (!record) attrs.set(node, record = new Map());
    if (!record.has(name)) record.set(name, node.getAttribute(name));
    const next = String(value);
    if (node.getAttribute(name) !== next) node.setAttribute(name, next);
  }
  function style(node, property, value, priority = "") {
    let record = styles.get(node);
    if (!record) styles.set(node, record = new Map());
    if (!record.has(property)) record.set(property, {
      value: node.style.getPropertyValue(property), priority: node.style.getPropertyPriority(property)
    });
    if (node.style.getPropertyValue(property) !== value || node.style.getPropertyPriority(property) !== priority) {
      node.style.setProperty(property, value, priority);
      ownStyleText.set(node, node.getAttribute("style"));
    }
  }
  function restoreStyle(node, property) {
    const previous = styles.get(node)?.get(property);
    if (!previous) return;
    if (previous.value) node.style.setProperty(property, previous.value, previous.priority);
    else node.style.removeProperty(property);
  }
  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    listeners.push(() => target.removeEventListener(name, handler, options));
  }
  const rectOf = node => node?.getBoundingClientRect();
  const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
  const intersects = (a, b, gap = 0) => a && b &&
    a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
  const makeRect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const save = () => {
    if (disposed) return;
    clearTimeout(saveTimer); saveTimer = 0;
    try {
      win.localStorage.setItem(storageKey, FusionSettings.serialize(state));
      palette.setStatus("参数已保存");
      return true;
    } catch {
      palette.setStatus("本机存储不可用；当前调整已生效，请导出备份。", true);
      return false;
    }
  };
  const update = (next, saveImmediately = false) => {
    if (disposed) return;
    state = FusionSettings.normalize(next);
    palette.update(state, mode());
    applySettings();
    clearTimeout(saveTimer);
    if (saveImmediately) return save();
    saveTimer = win.setTimeout(save, 250);
  };
  const palette = createFusionPalette({
    document: doc, initialState: state, mode: lastMode,
    title: context.config.fusion?.paletteTitle,
    companionsEnabled: context.config.ambient?.companions === true,
    avatarsEnabled: context.config.avatars?.enabled === true,
    sidebarEnabled: context.config.sidebar?.enabled === true,
    xixiEmoteEnabled: context.config.ambient?.xixiEmote === true,
    sceneEffectsEnabled: context.config.sceneEffects?.enabled === true,
    sceneReading: context.config.reading?.style === "scene",
    continuousReading: context.config.reading?.continuous === true,
    version: context.config.designVersion,
    onChange: update,
    onReset: () => update(initialDefaults(), true),
    onImport: text => {
      const next = FusionSettings.parse(text);
      if (update(next, true)) palette.setStatus("配置已导入并保存");
    },
    onExport: () => {
      const blob = new Blob([FusionSettings.serialize(state)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      imageUrls.add(url);
      const anchor = doc.createElement("a");
      anchor.href = url;
      anchor.download = "sigrika-denia-fusion-settings.json";
      anchor.hidden = true;
      doc.body.append(anchor); anchor.click(); anchor.remove();
      const timer = win.setTimeout(() => {
        URL.revokeObjectURL(url);
        imageUrls.delete(url);
        revokeTimers.delete(timer);
      }, 30000);
      revokeTimers.add(timer);
      palette.setStatus("已发起配置备份下载");
    }
  });
  if (storageError) palette.setStatus(storageError, true);
  const bubbles = doc.createElement("div");
  bubbles.dataset.fusionBubbles = "true";
  bubbles.setAttribute("aria-hidden", "true");
  doc.body.append(bubbles);
  const leafScene = () => html.dataset.sgkScene === "orchard";
  let bubbleSignature = "", bubbleSeeds = [];
  function syncBubbles() {
    const { bubbleCount, bubbleSpeed } = state.common;
    const signature = (leafScene() ? "leaf:" : "bubble:") + bubbleCount + ":" + bubbleSpeed;
    if (signature !== bubbleSignature) {
      bubbleSignature = signature;
      bubbles.replaceChildren();
      bubbleSeeds = [];
      const fragment = doc.createDocumentFragment();
      const random = (index, salt) => {
        let value = Math.imul(index + 1, 0x45d9f3b) ^ Math.imul(salt, 0x27d4eb2d);
        value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
        return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
      };
      for (let i = 0; i < bubbleCount; i++) {
        const bubble = doc.createElement("i");
        // Deterministic seeds avoid continually changing the scene on slider edits.
        const seed = random(i, 1);
        const duration = (24 + random(i, 2) * 22) * 100 / bubbleSpeed;
        const size = leafScene() ? 18 + seed * 18 : 12 + seed * 30;
        bubble.style.setProperty("--bubble-x", (2 + random(i, 3) * 93) + "%");
        bubble.style.setProperty("--bubble-size", size + "px");
        bubble.style.setProperty("--bubble-duration", duration + "s");
        bubble.style.setProperty("--bubble-delay", (-random(i, 4) * duration) + "s");
        bubble.style.setProperty("--bubble-drift", ((random(i, 5) - .5) * 90) + "px");
        bubble.style.setProperty("--leaf-hue", (94 + random(i, 6) * 35) + "");
        bubble.style.setProperty("--leaf-light", (34 + random(i, 7) * 18) + "%");
        bubbleSeeds.push({ node: bubble, size, x: .02 + random(i, 3) * .93, drift: (random(i, 5) - .5) * 90 });
        fragment.append(bubble);
      }
      bubbles.append(fragment);
    }
  }
  function placeBubbles(width, readingLeft, readingRight) {
    const narrowLeaves = state.common.layout !== 'panorama' && leafScene() && width >= 540 && width < 760;
    const wind = !leafScene() && state.common.sceneEffects && html.dataset.sunlitSceneFamily === "wind";
    for (const [index, seed] of bubbleSeeds.entries()) {
      const { node, x } = seed;
      const size = narrowLeaves ? 10 + index % 4 : seed.size;
      const requestedDrift = narrowLeaves ? (index % 2 ? -4 : 4) : seed.drift;
      node.style.setProperty("--bubble-size", size + "px");
      if (narrowLeaves && index >= 6) { node.hidden = true; continue; }
      // Preserve the original screen-wide density: particles seeded inside the
      // reading lane stay absent. Visible particles keep their entire silhouette
      // and drift path in a side corridor, instead of being cut by a lane mask.
      const seededX = narrowLeaves ? index % 2 ? width - 18 : 18 : x * width;
      const edge = narrowLeaves ? 4 : 8;
      const corridor = seededX < readingLeft ? [edge, readingLeft - edge] : seededX > readingRight ? [readingRight + edge, width - edge] : null;
      if (!corridor) { node.hidden = true; continue; }
      // Includes every authored particle's scale/rotation and its soft rim.
      // This uses stored seeds and existing layout measurements, no frame reads.
      const particleWidth = size * (narrowLeaves ? 1.4 : 1.75), rim = size * (narrowLeaves ? .2 : .4) + (narrowLeaves ? 2 : 4);
      const room = corridor[1] - corridor[0] - particleWidth - rim * 2;
      const drift = Math.max(-Math.max(0, room), Math.min(Math.max(0, room), requestedDrift));
      const minOffset = wind ? Math.min(-30, drift + 80) : Math.min(0, drift);
      const maxOffset = wind ? Math.max(-30, drift + 80) : Math.max(0, drift);
      const minX = corridor[0] + rim - minOffset, maxX = corridor[1] - particleWidth - rim - maxOffset;
      node.hidden = maxX < minX;
      if (!node.hidden) {
        node.style.setProperty("--bubble-x", Math.max(minX, Math.min(maxX, seededX)) + "px");
        node.style.setProperty("--bubble-drift", drift + "px");
      }
    }
  }
  function applySettings() {
    if (disposed) return;
    const current = state.modes[mode()];
    attr(html, "data-fusion-active", "true");
    attr(html, "data-fusion-layout", state.common.layout);
    attr(html, "data-fusion-focus", state.common.focusMode);
    attr(html, "data-fusion-message-panel", current.messagePanel);
    attr(html, "data-fusion-reduced-motion", state.common.reduceMotion);
    attr(html, "data-fusion-companions", state.common.companions);
    attr(html, "data-fusion-sidebar-art", state.common.sidebarArt);
    attr(html, "data-fusion-sidebar-emote", state.common.sidebarEmote);
    attr(html, "data-fusion-scene-effects", state.common.sceneEffects);
    attr(html, "data-fusion-wallpaper-motion", state.common.wallpaperMotion);
    attr(html, "data-fusion-gradient-text", state.common.gradientText);
    attr(html, "data-fusion-living-scene", state.common.livingScene);
    attr(html, "data-fusion-layered-scene", state.common.layeredScene);
    if (context.config.avatars?.enabled === true) {
      attr(html, "data-fusion-secondary-visible", current.secondary.visible);
      attr(html, "data-fusion-secondary-size", current.secondary.size);
    }
    style(html, "--fusion-chat-width", state.common.chatWidth + "px");
    style(html, "--fusion-message-opacity", String(current.messageOpacity / 100));
    style(html, "--fusion-background-strength", String(current.backgroundStrength / 100));
    syncBubbles();
    schedule();
  }
  const cards = [
    { slot: "left", selector: '[data-theme-role="task-left"]', width: 146, height: 236 },
    { slot: "primary", selector: '[data-theme-role="task-right"][data-theme-priority="primary"]', width: 156, height: 156 },
    { slot: "secondary", selector: '[data-theme-role="task-right"][data-theme-priority="secondary"]', width: 156, height: 156 }
  ].map(card => {
    const geometry = context.config.fusion?.cards?.[card.slot];
    return {
      ...card,
      width: Number.isFinite(geometry?.width) ? clamp(geometry.width, 60, 300) : card.width,
      height: Number.isFinite(geometry?.height) ? clamp(geometry.height, 60, 600) : card.height,
      side: ["left", "right"].includes(geometry?.side) ? geometry.side :
        card.slot === "left" || (card.slot === "secondary" && context.config.fusion?.pairCards === true) ? "left" : "right",
      anchor: ["top", "bottom"].includes(geometry?.anchor) ? geometry.anchor : card.slot === "left" ? "top" : "bottom",
      verticalOffset: Number.isFinite(geometry?.verticalOffset) ? geometry.verticalOffset : 0
    };
  });
  let panoramaMain = null, panoramaCarrier = null, panoramaInset = 0;
  const panoramaContent = new Set(), rootParent = root.parentElement;
  let panoramaAmbient = null, ambientParent = null;
  function placePanoramaLayers(main, enabled) {
    const target = enabled && main && html.classList.contains('tessalume-is-task') ? main : null;
    if (root.parentElement !== (target || rootParent)) (target || rootParent)?.append(root);
    const ambient = doc.querySelector('[data-sunlit-ambient]');
    if (ambient && ambient !== panoramaAmbient) { panoramaAmbient = ambient; ambientParent = ambient.parentElement; }
    if (ambient && ambient.parentElement !== (target || ambientParent)) (target || ambientParent)?.append(ambient);
    for (const node of panoramaContent) if (!target || node.parentElement !== target) {
      attr(node, 'data-fusion-panorama-content', 'false'); panoramaContent.delete(node);
    }
    if (target) for (const node of target.children) {
      if (node === root || node.hasAttribute('data-fusion-ui')) continue;
      const current = node.getAttribute('data-fusion-panorama-content');
      if (!panoramaContent.has(node)) attr(node, 'data-fusion-panorama-content', win.getComputedStyle(node).position === 'static' ? 'static' : 'positioned');
      panoramaContent.add(node);
    }
  }
  function fitPanorama(main) {
    const enabled = state.common.layout === 'panorama';
    if (panoramaMain && panoramaMain !== main) {
      attr(panoramaMain, 'data-fusion-panorama-main', 'false');
      if (panoramaCarrier) attr(panoramaCarrier, 'data-fusion-panorama-carrier', 'false');
      panoramaMain = null; panoramaCarrier = null; panoramaInset = 0;
    }
    placePanoramaLayers(main, enabled);
    if (!main) return 0;
    const sidebar = [...doc.querySelectorAll('aside.app-shell-left-panel,[data-tessalume-surface="sidebar"]')].find(node => {
      const r = node.getBoundingClientRect(), css = win.getComputedStyle(node);
      return !node.closest('[hidden],[aria-hidden="true"],[inert]') && r.width > 2 && r.height > 2 && css.display !== 'none' && css.visibility !== 'hidden';
    });
    const box = rectOf(main), side = rectOf(sidebar);
    // Recover the native origin from our previous inset. No accumulating offsets.
    const nativeLeft = box.left + (panoramaMain === main ? panoramaInset : 0);
    const inset = enabled && side ? Math.max(0, Math.round(nativeLeft - Math.max(0, side.left))) : 0;
    panoramaMain = main; panoramaInset = inset;
    attr(main, 'data-fusion-panorama-main', enabled);
    panoramaCarrier = main.parentElement;
    if (panoramaCarrier) attr(panoramaCarrier, 'data-fusion-panorama-carrier', enabled);
    style(main, '--fusion-panorama-inset', inset + 'px');
    return inset;
  }
  const splitNodes = new Map();
  function clearSplitNodes(keep = new Set()) {
    for (const [node, entry] of splitNodes) if (!keep.has(node)) {
      attr(node, entry.kind === "paper" ? "data-fusion-split-paper" : "data-fusion-split-footer", "false");
      splitNodes.delete(node);
    }
  }
  function fitSplitNode(node, kind, width, center) {
    let entry = splitNodes.get(node);
    if (!entry) {
      entry = { kind, shift: 0, shiftY: 0 }; splitNodes.set(node, entry);
      style(node, "--fusion-split-shift", "0px");
    }
    attr(node, kind === "paper" ? "data-fusion-split-paper" : "data-fusion-split-footer", "true");
    style(node, "--fusion-split-width", Math.round(width) + "px");
    const box = node.getBoundingClientRect();
    // Subtract our previous independent translate; measuring the transformed position
    // as a fresh origin would alternate the column between two positions on every RAF.
    const baseCenter = (box.left + box.right) / 2 - entry.shift;
    entry.shift = Math.round((center - baseCenter) * 2) / 2;
    style(node, "--fusion-split-shift", entry.shift + "px");
  }
  function anchorScrollFooter(node, entry) {
    if (!entry.scrollWorkspace?.isConnected || !node.isConnected) return;
    entry.shiftY = Math.round(rectOf(entry.scrollWorkspace).bottom - (rectOf(node).bottom - entry.shiftY));
    style(node, "--fusion-split-shift-y", entry.shiftY + "px");
  }
  function fitSplitColumns({ enabled, workspace, paper, composer, safeArea, panelRects, current }) {
    if (enabled || attrs.get(html)?.has("data-fusion-split-sides")) attr(html, "data-fusion-split-sides", enabled);
    if (!enabled || !workspace || !paper || !composer) { clearSplitNodes(); return { active: false, scale: 1 }; }
    const left = cards.find(card => card.slot === "left"), right = cards.find(card => card.slot === "primary");
    const rightPanels = panelRects.filter(box => box.left > safeArea.left + safeArea.width * .45 && box.left < safeArea.right);
    const textRight = Math.min(safeArea.right - 16, ...rightPanels.map(box => box.left - 16));
    let columnLeft = safeArea.left + 16, columnRight = textRight, scale = 1, active = false;
    if (state.common.layout !== 'panorama' && !state.common.focusMode && safeArea.width >= 760 && safeArea.height >= 400) {
      for (const candidate of [1, .85, .7, .55]) {
        const leftRail = current.left.visible ? Math.round(left.width * current.left.size / 100 * candidate) + 32 : 16;
        const panoramaRight = state.common.layout === 'panorama';
        const rightRail = current.primary.visible ? Math.round((panoramaRight ? 198 * current.primary.size / 100 + 110 : right.width * current.primary.size / 100) * candidate) + 32 : 16;
        const start = safeArea.left + leftRail, end = Math.min(textRight, safeArea.right - rightRail);
        if (end - start >= Math.min(480, state.common.chatWidth)) { columnLeft = start; columnRight = end; scale = candidate; active = true; break; }
      }
    }
    // Small leaves need an actual rail outside both the paper and footer.
    // Preserve the ordinary reading width when disabled or too narrow.
    if (state.common.layout !== 'panorama' && leafScene() && state.common.bubbles && !state.common.focusMode && safeArea.width >= 540 && safeArea.width < 760) {
      columnLeft = safeArea.left + 50;
      columnRight = Math.min(textRight, safeArea.right - 50);
    }
    const width = Math.max(1, Math.min(state.common.chatWidth, columnRight - columnLeft));
    const center = (columnLeft + columnRight) / 2;
    const footer = composer.closest('[data-pip-obstacle="thread-footer"]') || composer.closest('[data-thread-find-composer="true"]') ||
      composer.closest('.chat-composer-carrier') || composer;
    clearSplitNodes(new Set([paper, footer]));
    fitSplitNode(paper, "paper", width, center);
    fitSplitNode(footer, "footer", width, center);
    // Lightweight shells may anchor an absolute composer inside the scroller.
    // Compensate its scroll displacement without replacing its native transform.
    const footerEntry = splitNodes.get(footer);
    const scrollAnchored = footer.matches('.chat-composer-carrier') && workspace.contains(footer) && win.getComputedStyle(footer).position === "absolute";
    footerEntry.scrollWorkspace = scrollAnchored ? workspace : null;
    if (scrollAnchored) anchorScrollFooter(footer, footerEntry);
    else { footerEntry.shiftY = 0; style(footer, "--fusion-split-shift-y", "0px"); }
    return { active, scale, width, center, footer };
  }
  const transcriptNodes = new Map();
  function fitTranscriptClip(workspace, paper, composer, enabled, measureTail = true) {
    // The native footer can be a sibling of the transcript inside the scroller.
    // Clip only the transcript branch so transparent controls remain interactive.
    let transcript = enabled && workspace && paper && composer ? paper : null;
    if (transcript) {
      while (transcript.parentElement && transcript.parentElement !== workspace) transcript = transcript.parentElement;
      if (transcript.parentElement !== workspace || transcript.contains(composer)) transcript = null;
    }
    for (const [node, entry] of transcriptNodes) if (node !== transcript) {
      attr(node, "data-fusion-transcript-clip", "false"); transcriptNodes.delete(node);
      restoreStyle(node, "padding-bottom"); restoreStyle(entry.workspace, "scroll-padding-bottom");
    }
    if (!transcript) return;
    let entry = transcriptNodes.get(transcript);
    if (!entry) {
      entry = { padding: parseFloat(win.getComputedStyle(transcript).paddingBottom) || 0, extra: 0, workspace };
      transcriptNodes.set(transcript, entry);
      style(transcript, "--fusion-transcript-base-padding", entry.padding + "px");
    }
    const area = rectOf(workspace), composerBox = rectOf(composer);
    const footer = composer.closest('[data-pip-obstacle="thread-footer"]') || composer.closest('[data-thread-find-composer="true"]') || composer.closest('.chat-composer-carrier');
    const controls = footer ? [...footer.querySelectorAll('[data-in-progress-fixed-content]')].filter(node => {
      const box = rectOf(node), css = win.getComputedStyle(node);
      return box.height > 0 && css.display !== "none" && css.visibility !== "hidden";
    }) : [];
    const controlTop = Math.min(composerBox.top, ...controls.map(node => rectOf(node).top));
    const cutoff = clamp(controlTop - 10, area.top, area.bottom);
    const overlap = area.bottom - cutoff;
    // Existing native footer spacers count as tail room. Only add what is missing.
    // Scrolling translates content and transcript equally: their tail distance
    // stays constant. Re-measure only on a content/size/settings layout pass.
    if (measureTail || entry.tail === undefined) {
      let lastBottom = -Infinity;
      for (const node of paper.querySelectorAll('[data-tessalume-message],[data-message-author-role],button,a[href]')) {
        if (node.closest('[hidden],[aria-hidden="true"]') || node.contains(composer)) continue;
        const box = rectOf(node);
        if (box.height > 0) lastBottom = Math.max(lastBottom, box.bottom);
      }
      if (!Number.isFinite(lastBottom)) lastBottom = rectOf(paper).bottom;
      const scrollerTail = parseFloat(win.getComputedStyle(workspace).paddingBottom) || 0;
      entry.tail = Math.max(0, rectOf(transcript).bottom - lastBottom - entry.extra) + scrollerTail;
    }
    const tail = entry.tail;
    const extra = Math.ceil(Math.max(0, overlap - tail));
    const pinned = workspace.scrollHeight > workspace.clientHeight && workspace.scrollHeight - workspace.clientHeight - workspace.scrollTop <= 2;
    if (entry.extra !== extra) {
      entry.extra = extra;
      style(transcript, "--fusion-transcript-tail", extra + "px");
    }
    attr(transcript, "data-fusion-transcript-clip", "true");
    // Later visual layers can set padding-block!important. Inline priority keeps
    // the measured tail real, and native scrollIntoView uses the usable viewport.
    style(transcript, "padding-bottom", (entry.padding + extra) + "px", "important");
    style(workspace, "scroll-padding-bottom", overlap + "px", "important");
    if (pinned) workspace.scrollTop = workspace.scrollHeight - workspace.clientHeight;
    style(transcript, "--fusion-transcript-clip-bottom", Math.max(0, rectOf(transcript).bottom - cutoff) + "px");
  }
  let observed = new Set();
  const resize = new ResizeObserver(() => schedule());
  function observeGeometry(nodes) {
    const next = new Set(nodes.filter(Boolean));
    for (const node of observed) if (!next.has(node)) resize.unobserve(node);
    for (const node of next) if (!observed.has(node)) resize.observe(node);
    observed = next;
  }
  let layoutStatus = {};
  function layout() {
    frame = 0;
    if (disposed) return;
    // The artwork rails and reading lane do not move when the native transcript
    // scrolls. Only its clipping edge needs updating; do not scan every message.
    if (!fullLayout && scrollGeometry && Object.values(scrollGeometry).every(node => node?.isConnected)) {
      for (const [node, entry] of splitNodes) anchorScrollFooter(node, entry);
      fitTranscriptClip(scrollGeometry.workspace, scrollGeometry.paper, scrollGeometry.composer, true, tailDirty);
      tailDirty = false;
      return;
    }
    fullLayout = false;
    tailDirty = false;
    // A large programmatic scroll can place an absolute footer outside the
    // viewport. Restore its known anchor before resolving visible composers.
    for (const [node, entry] of splitNodes) anchorScrollFooter(node, entry);
    const currentMode = mode();
    if (currentMode !== lastMode) {
      lastMode = currentMode;
      palette.update(state, currentMode);
      applySettings();
    }
    const current = state.modes[currentMode];
    // Codex keeps inactive chats mounted; only the visible workspace can own geometry.
    const { workspace, main, paper, composer, panels } = resolveFusionLayout(doc, win);
    // Codex keeps inactive chats mounted. Announce ownership only when the
    // visible surface changes, so artwork follows the active chat without
    // reading layout in its animation loop.
    const currentMainSurface = main || null;
    if (lastMainSurface !== currentMainSurface) {
      lastMainSurface = currentMainSurface;
      win.dispatchEvent(new win.CustomEvent('sunlit-tides:main-surface-change', { detail: { main: currentMainSurface } }));
    }
    const panorama = state.common.layout === "panorama";
    const panoramaInset = fitPanorama(main);
    const mainRect = rectOf(main) || makeRect(0, 44, win.innerWidth, win.innerHeight - 44);
    const area = rectOf(workspace) || mainRect;
    let paperRect = rectOf(paper);
    let composerRect = rectOf(composer);
    const panelRects = panels.map(rectOf);
    const safeArea = makeRect(Math.max(0, area.left, mainRect.left), Math.max(44, area.top, mainRect.top),
      Math.max(0, Math.min(win.innerWidth, area.right, mainRect.right) - Math.max(0, area.left, mainRect.left)),
      Math.max(0, Math.min(win.innerHeight, Math.max(area.bottom, composerRect?.bottom || 0), mainRect.bottom) - Math.max(44, area.top, mainRect.top)));
    // Floating summaries occupy only their actual rectangles, not the entire right gutter.
    const splitSides = context.config.fusion?.splitSides === true;
    if (splitSides && state.common.avoidPanels) for (const panel of panels) {
      const box = panel.getBoundingClientRect();
      const dock = panel.matches('.app-shell-right-panel,[data-app-shell-right-panel]') ||
        (!panel.closest('[data-summary-panel-variant="summary"]') && box.height >= safeArea.height * .85);
      if (dock && box.left > safeArea.left + 200 && box.left < safeArea.right) { safeArea.right = box.left; safeArea.width = safeArea.right - safeArea.left; }
    }
    const split = fitSplitColumns({ enabled: splitSides, workspace, paper, composer, safeArea, panelRects, current });
    paperRect = rectOf(paper); composerRect = rectOf(composer);
    fitTranscriptClip(workspace, paper, composer, splitSides && context.config.reading?.style === "scene");
    scrollGeometry = splitSides && context.config.reading?.style === "scene" && workspace && paper && composer
      ? { workspace, paper, composer } : null;
    palette.setBounds(safeArea);
    // Reading geometry is unchanged; the decorative corridor can include navigation.
    if (panorama) { safeArea.left = Math.max(0, safeArea.left - panoramaInset); safeArea.width = safeArea.right - safeArea.left; }
    const chatLeft = paperRect?.left ?? composerRect?.left ?? safeArea.left;
    const chatRight = paperRect?.right ?? composerRect?.right ?? safeArea.right;
    const occupiedLeft = Math.min(chatLeft, composerRect?.left ?? chatLeft);
    const occupiedRight = Math.max(chatRight, composerRect?.right ?? chatRight);
    const protectedLane = makeRect(occupiedLeft - 10, safeArea.top, occupiedRight - occupiedLeft + 20, safeArea.height);
    const canDecorate = !!workspace && !!composer && safeArea.width >= 600 && (panorama || !splitSides || split.active) &&
      !state.common.focusMode && !html.classList.contains("tessalume-code-review-open");
    const placements = [];
    const reasons = {};
    const planned = new Map();
    let placementStrategy = "authored";
    const dimensions = card => panorama && card.slot === 'left' ? { width: 234, height: 350 } : panorama && card.slot === 'primary' ? { width: 198, height: 344 } : card;
    const requested = card => ({ width: Math.round(dimensions(card).width * current[card.slot].size / 100), height: Math.round(dimensions(card).height * current[card.slot].size / 100) });
    const collides = (box, extra = []) => (!panorama && intersects(box, protectedLane)) ||
      (state.common.avoidPanels && panelRects.some(p => intersects(box, p, 8))) || extra.some(p => intersects(box, p, 6));
    const fitsArea = box => box.left >= safeArea.left + 4 && box.right <= safeArea.right - 4 && box.top >= safeArea.top + 28 && box.bottom <= safeArea.bottom - 8;
    const authored = card => {
      const values = current[card.slot], { width, height } = requested(card);
      return makeRect(clamp(card.side === "left" ? safeArea.left + 8 + values.x : safeArea.right - width - 12 + values.x, safeArea.left + 6, safeArea.right - width - 6),
        clamp((card.anchor === "top" ? safeArea.top + 66 : safeArea.bottom - height - 32) + values.y + card.verticalOffset, safeArea.top + 48, safeArea.bottom - height - 10), width, height);
    };
    const pairedCards = cards.filter(card => card.slot === "left" || card.slot === "primary");
    if (canDecorate && panorama) {
      placementStrategy = 'panorama-background';
      for (const card of pairedCards) {
        const values = current[card.slot], desired = requested(card);
        if (!values.visible) continue;
        const scale = Math.min(1, safeArea.width / 1000, (safeArea.height - 80) / desired.height);
        const width = Math.round(desired.width * scale), height = Math.round(desired.height * scale);
        const leftSide = card.slot === 'left';
        // Keep the left pair together; the right portrait now follows its GIF.
        const x = clamp((leftSide ? safeArea.left + 40 : safeArea.right - width - 16) + values.x,
          safeArea.left + (leftSide ? 8 : 118), safeArea.right - width - (leftSide ? 126 : 16));
        const y = clamp(safeArea.bottom - height - 32 + values.y, safeArea.top + 28, safeArea.bottom - height - 8);
        const candidate = makeRect(x, y, width, height);
        if (fitsArea(candidate) && !collides(candidate)) planned.set(card.slot, candidate);
      }
    }
    if (canDecorate && splitSides && !panorama) {
      placementStrategy = "split-sides";
      for (const card of pairedCards) {
        const values = current[card.slot];
        if (!values.visible) continue;
        const side = card.slot === "left" ? "left" : "right";
        const gutter = side === "left" ? { left: safeArea.left + 12, right: protectedLane.left - 8 } : { left: protectedLane.right + 8, right: safeArea.right - 16 };
        const desired = requested(card);
        for (let scale = panorama && card.slot === "left" ? 1 : split.scale; scale >= .4 && !planned.has(card.slot); scale -= .05) {
          const width = Math.round(desired.width * scale), height = Math.round(desired.height * scale);
          const companionRail = panorama && side === 'right' ? Math.max(52, Math.round(96 * scale)) + 14 : 0;
          if (width < 60 || width + companionRail > gutter.right - gutter.left) continue;
          const rightEdge = gutter.right - companionRail;
          const x = clamp(side === "left" ? gutter.left + values.x : rightEdge - width + values.x, gutter.left, rightEdge - width);
          const preferredY = (card.anchor === "top" ? safeArea.top + 66 : safeArea.bottom - height - 32) + values.y + card.verticalOffset;
          const ys = [preferredY, ...panelRects.flatMap(box => [box.bottom + 10, box.top - height - 10])];
          const found = ys.map(y => makeRect(x, y, width, height)).find(box => fitsArea(box) && !collides(box));
          if (found) planned.set(card.slot, found);
        }
      }
    }
    const adaptivePair = context.config.fusion?.pairCards === true && pairedCards.every(card => current[card.slot].visible &&
      current[card.slot].size === 100 && current[card.slot].x === 0 && current[card.slot].y === 0);
    if (!splitSides && canDecorate && safeArea.height >= 400 && adaptivePair && pairedCards.some(card => { const box = authored(card); return !fitsArea(box) || collides(box); })) {
      const gutters = [
        { side: "left", left: safeArea.left + 8, right: Math.min(safeArea.right - 8, protectedLane.left - 8) },
        { side: "right", left: Math.max(safeArea.left + 8, protectedLane.right + 8), right: safeArea.right - 8 }
      ].sort((a, b) => (b.right - b.left) - (a.right - a.left));
      // Keep the two full-body portraits coherent: move them together into the wider gutter.
      for (let scale = 1; scale >= .45 && !planned.size; scale -= .05) {
        for (const gutter of gutters) {
          const dimensions = pairedCards.map(card => ({ card, width: Math.round(card.width * scale), height: Math.round(card.height * scale) }));
          const total = dimensions.reduce((sum, item) => sum + item.width, 0) + 12;
          if (total > gutter.right - gutter.left) continue;
          let x = Math.round(gutter.left + (gutter.right - gutter.left - total) / 2);
          const boxes = dimensions.map(item => { const b = makeRect(x, safeArea.bottom - 32 - item.height + item.card.verticalOffset, item.width, item.height); x += item.width + 12; return b; });
          if (boxes.every((box, index) => fitsArea(box) && !collides(box, boxes.slice(0, index)))) {
            dimensions.forEach((item, index) => planned.set(item.card.slot, boxes[index]));
            placementStrategy = "paired-" + gutter.side;
            break;
          }
        }
      }
      // If neither gutter holds a coherent pair, retain readable opposite-side miniatures.
      if (!planned.size) {
        for (let scale = .95; scale >= .3 && !planned.size; scale -= .05) {
          const boxes = pairedCards.map(card => { const width = Math.round(card.width * scale), height = Math.round(card.height * scale); return makeRect(card.side === "left" ? safeArea.left + 8 : safeArea.right - width - 12, safeArea.bottom - height - 32 + card.verticalOffset, width, height); });
          if (boxes.every((box, index) => box.width >= 60 && fitsArea(box) && !collides(box, boxes.slice(0, index)))) {
            pairedCards.forEach((card, index) => planned.set(card.slot, boxes[index])); placementStrategy = "paired-compact";
          }
        }
      }
    }
    for (const card of cards) {
      const node = root.querySelector(card.selector);
      if (!node) continue;
      const values = current[card.slot];
      let compactStack = false;
      let { width, height } = requested(card);
      let x = card.side === "left" ? safeArea.left + 8 + values.x : safeArea.right - width - 12 + values.x;
      let y = (card.anchor === "top" ? safeArea.top + 66 : safeArea.bottom - height - 32) + values.y + card.verticalOffset;
      let companionGroup = null;
      if (card.slot === "secondary") {
        const companion = placements.find(p => p.slot === (card.side === "left" ? "left" : "primary"));
        // The companion stays above the character on its own side, using the same collision box.
        if (companion && !companion.hidden) {
          y = companion.rect.top - height - 14 + values.y + card.verticalOffset;
          if (planned.size) x = companion.rect.left + (companion.rect.width - width) / 2 + values.x;
        }
        const pair = placements.filter(p => (p.slot === "left" || p.slot === "primary") && !p.hidden);
        const together = pair.length === 2 && (pair.every(p => p.rect.right <= protectedLane.left) || pair.every(p => p.rect.left >= protectedLane.right));
        if (together) {
          companionGroup = { left: Math.min(...pair.map(p => p.rect.left)), right: Math.max(...pair.map(p => p.rect.right)), top: Math.min(...pair.map(p => p.rect.top)), bottom: Math.max(...pair.map(p => p.rect.bottom)) };
          x = (companionGroup.left + companionGroup.right - width) / 2 + values.x;
          y = companionGroup.top - height - 14 + values.y + card.verticalOffset;
        }
      }
      x = clamp(x, safeArea.left + 6, safeArea.right - width - 6);
      y = clamp(y, safeArea.top + 48, safeArea.bottom - height - 10);
      let box = planned.get(card.slot) || makeRect(x, y, width, height);
      if (companionGroup && values.x === 0 && values.y === 0 && collides(box, placements.filter(p => !p.hidden).map(p => p.rect))) {
        const below = makeRect(x, companionGroup.bottom + 14 + card.verticalOffset, width, height);
        if (fitsArea(below) && !collides(below, placements.filter(p => !p.hidden).map(p => p.rect))) box = below;
      }
      if (canDecorate && card.slot === "secondary" && context.config.fusion?.pairCards === true && values.visible && values.size === 100 && values.x === 0 && values.y === 0 && collides(box, placements.filter(p => !p.hidden).map(p => p.rect))) {
        // The two dumplings can move into the narrow free gutter instead of disappearing.
        for (const side of [card.side, card.side === "left" ? "right" : "left"]) {
          const available = side === "left" ? protectedLane.left - safeArea.left - 16 : safeArea.right - protectedLane.right - 16;
          const scale = Math.min(1, available / width);
          if (scale < .3) continue;
          const w = Math.floor(width * scale), h = scale < .6 ? w * 2 + 6 : Math.floor(height * scale);
          const left = side === "left" ? safeArea.left + 8 : safeArea.right - w - 8;
          const candidates = [safeArea.top + 48, safeArea.bottom - h - 36];
          const found = candidates.map(top => makeRect(left, top, w, h)).find(b => fitsArea(b) && !collides(b, placements.filter(p => !p.hidden).map(p => p.rect)));
          if (found) { box = found; compactStack = scale < .6; break; }
        }
      }
      x = box.left; y = box.top; width = box.width; height = box.height;
      const collision = (!panorama && intersects(box, protectedLane)) ||
        (state.common.avoidPanels && panelRects.some(p => intersects(box, p, 8))) ||
        placements.some(p => !p.hidden && intersects(box, p.rect, 6));
      const fits = box.right <= safeArea.right && box.bottom <= safeArea.bottom;
      const messageAvatars = card.slot === "secondary" && context.config.avatars?.enabled === true;
      const missingSplit = splitSides && card.slot !== "secondary" && !planned.has(card.slot);
      const hidden = messageAvatars || !canDecorate || !values.visible || missingSplit || collision || !fits;
      attr(node, "data-fusion-card", card.slot);
      attr(node, "data-fusion-card-layout", compactStack ? "stacked" : "normal");
      attr(node, "data-fusion-hidden", hidden);
      style(node, "--fusion-card-x", Math.round(x) + "px");
      style(node, "--fusion-card-y", Math.round(y) + "px");
      style(node, "--fusion-card-width", width + "px");
      style(node, "--fusion-card-height", height + "px");
      placements.push({ slot: card.slot, node, rect: box, hidden });
      reasons[card.slot] = messageAvatars ? "message-avatars" : !values.visible ? "disabled" : !canDecorate ? "reading-space" : missingSplit ? "split-space" : collision ? "collision" : !fits ? "viewport" : "visible";
    }
    if (!splitSides && context.config.fusion?.pairCards === true && current.left.visible && current.primary.visible) {
      const pair = placements.filter(p => p.slot === "left" || p.slot === "primary");
      const blocked = pair.find(p => reasons[p.slot] === "collision" || reasons[p.slot] === "viewport");
      if (pair.length === 2 && blocked) {
        for (const placement of pair) {
          if (!placement.hidden) reasons[placement.slot] = "paired-" + reasons[blocked.slot];
          placement.hidden = true;
          attr(placement.node, "data-fusion-hidden", true);
        }
      }
    }
    // Other original decorations retain their authored positions but yield to content.
    for (const node of root.querySelectorAll('[data-theme-role="memory"],[data-theme-role="sync-panel"],[data-theme-role="composer-accessory"]')) {
      const box = node.getBoundingClientRect();
      const collision = intersects(box, protectedLane) ||
        placements.some(p => !p.hidden && intersects(box, p.rect, 6)) ||
        (state.common.avoidPanels && panelRects.some(p => intersects(box, p, 8)));
      attr(node, "data-fusion-hidden", !canDecorate || collision);
    }
    Object.assign(bubbles.style, {
      left: safeArea.left + "px", top: safeArea.top + "px",
      width: safeArea.width + "px", height: safeArea.height + "px"
    });
    bubbles.style.setProperty("--fusion-bubble-travel", (safeArea.height + 90) + "px");
    bubbles.style.setProperty("--fusion-reading-left", clamp(protectedLane.left - safeArea.left, 0, safeArea.width) + "px");
    bubbles.style.setProperty("--fusion-reading-right", clamp(protectedLane.right - safeArea.left, 0, safeArea.width) + "px");
    syncBubbles();
    // Same effective source used by layered/living backgrounds; neither shares an opacity parent.
    bubbles.style.opacity = leafScene()
      ? state.common.layout === 'panorama' ? 'var(--sunlit-panorama-art-opacity)' : 'calc(var(--fusion-background-strength,1) * (1 - var(--sgk-reading-veil)))'
      : '1';
    placeBubbles(safeArea.width, clamp(protectedLane.left - safeArea.left, 0, safeArea.width), clamp(protectedLane.right - safeArea.left, 0, safeArea.width));
    bubbles.dataset.paused = String(!workspace || !state.common.bubbles || state.common.focusMode ||
      state.common.reduceMotion || media.matches || doc.hidden ||
      html.dataset.tessalumeMotion === "reduced" || html.dataset.tessalumeMotion === "off");
    observeGeometry([main, main?.parentElement, ...doc.querySelectorAll("aside.app-shell-left-panel"), workspace, composer, paper, split.footer, ...panels]);
    layoutStatus = { mode: currentMode, width: Math.round(safeArea.width), cards: reasons, panels: panels.length, placementStrategy,
      geometry: { safeArea, readingLane: protectedLane, composer: composerRect ? makeRect(composerRect.left, composerRect.top, composerRect.width, composerRect.height) : null,
        split: splitSides ? { active: split.active, scale: split.scale, width: split.width, center: split.center } : null } };
  }
  function schedule() { fullLayout = true; if (!disposed && !frame) frame = win.requestAnimationFrame(layout); }
  function scroll(event) {
    if (!scrollGeometry || event.target !== scrollGeometry.workspace) { schedule(); return; }
    if (!disposed && !frame) frame = win.requestAnimationFrame(layout);
  }
  const mutation = new MutationObserver(records => {
    const meaningful = records.some(record => {
      const node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (!node || node.closest?.("[data-fusion-ui],[data-fusion-bubbles]")) return false;
      if (record.type === "attributes" && record.attributeName?.startsWith("data-fusion")) return false;
      if (record.type === "attributes" && record.attributeName === "style" && (node === html || root.contains(node))) return false;
      if (record.type === "attributes" && record.attributeName === "style" && ownStyleText.get(node) === node.getAttribute("style")) return false;
      if (record.type === "childList" && root.contains(node)) return false;
      // A min-height/fixed paper can contain text growth without resizing its
      // border box. Refresh its tail even then, without rebuilding side rails.
      if (record.type === "childList" && ![...record.addedNodes, ...record.removedNodes].some(child => child.nodeType === 1)) {
        if (scrollGeometry?.paper.contains(node)) {
          tailDirty = true;
          if (!disposed && !frame) frame = win.requestAnimationFrame(layout);
        }
        return false;
      }
      return true;
    });
    if (meaningful) schedule();
  });
  mutation.observe(html, { childList: true, subtree: true, attributes: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden", "inert", "data-theme", "data-tessalume-motion", "data-tessalume-page-kind", "data-sunlit-scene-family", "data-sgk-scene"] });
  listen(win, "resize", schedule, { passive: true });
  listen(doc, "scroll", scroll, { passive: true, capture: true });
  listen(doc, "visibilitychange", schedule);
  // Late image/font decoding may move the last action inside a fixed/min-height
  // paper without changing that paper's observed border box.
  const contentLoaded = event => { if (scrollGeometry?.paper.contains(event.target)) schedule(); };
  listen(doc, "load", contentLoaded, true);
  listen(doc, "error", contentLoaded, true);
  if (doc.fonts?.addEventListener) {
    listen(doc.fonts, "loadingdone", schedule);
    listen(doc.fonts, "loadingerror", schedule);
  }
  listen(media, "change", schedule);
  listen(win, "storage", event => {
    if (event.key !== storageKey || !event.newValue) return;
    try { state = FusionSettings.parse(event.newValue); palette.update(state, mode()); applySettings(); } catch {}
  });
  listen(win, "pagehide", () => { if (saveTimer) save(); });
  function dispose() {
    if (disposed) return;
    if (saveTimer) save();
    disposed = true;
    clearTimeout(saveTimer);
    win.cancelAnimationFrame(frame);
    resize.disconnect(); mutation.disconnect();
    listeners.splice(0).forEach(off => off());
    palette.destroy(); bubbles.remove();
    for (const [node, values] of attrs) for (const [name, previous] of values) {
      if (previous === null) node.removeAttribute(name); else node.setAttribute(name, previous);
    }
    for (const [node, values] of styles) for (const [property, previous] of values) {
      if (previous.value) node.style.setProperty(property, previous.value, previous.priority);
      else node.style.removeProperty(property);
    }
    for (const url of imageUrls) URL.revokeObjectURL(url);
    for (const timer of revokeTimers) win.clearTimeout(timer);
    attrs.clear(); styles.clear(); observed.clear(); splitNodes.clear(); transcriptNodes.clear();
    if (win[runtimeKey]?.dispose === dispose) delete win[runtimeKey];
  }
  // Only theme settings and geometry are exposed; no chat content is collected.
  win[runtimeKey] = {
    version: FusionSettings.version, storageKey, dispose,
    getSettings: () => FusionSettings.normalize(state),
    setSettings: value => update(value, true),
    importSettings: text => { const value = FusionSettings.parse(text); update(value, true); },
    getStatus: () => ({ ...layoutStatus, disposed }),
    refresh: schedule
  };
  context.addCleanup(dispose);
  applySettings();
}
