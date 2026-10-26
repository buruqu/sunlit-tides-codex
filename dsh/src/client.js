/* DSH client adapter. No account, chat, network, or native preference writes. */
function mountDshSunlitClient({ window, document, config = {}, assets = {}, cssText = "" }) {
  const INSTANCE = "__dshSunlitTidesClient";
  const STORAGE = "dsh.sunlit-tides.palette.v1";
  if (typeof window[INSTANCE] === "function") window[INSTANCE]();
  const body = document.body;
  if (!body) return function () {};
  const owner = "sunlit-tides";
  const owned = [];
  const listeners = [];
  const mutations = new Map();
  const changedStyles = new Map(), ownStyleSnapshots = new WeakMap(), originalStylePresence = new WeakMap();
  let disposed = false, frame = 0, structureDirty = true, renderer = null, editorMode = null;
  let nodes = {}, layoutState = {}, observed = new Set();
  let lastFocus = null;
  const SIDEBAR = ":is([data-pane='sidebar'],[class*='sidebarCol'])";
  const CENTER = "[class*='_centerCol']";
  const scenes = (config.gallery?.scenes || []).filter(s => s && typeof s.id === "string" && assets[s.asset]);
  const sceneById = new Map(scenes.map(s => [s.id, s]));
  const fallback = mode => sceneById.has(config.gallery?.defaults?.[mode]) ? config.gallery.defaults[mode] : scenes[0]?.id || "";
  const defaults = { version: 1, scenes: { light: fallback("light"), dark: fallback("dark") }, backgroundOpacity: 100,
    contentOpacity: 60, readingWidth: 800, motion: true, lighting: true, blink: true,
    bubbles: true, bubbleCount: 18, bubbleSpeed: 100, companions: true, emotes: true, gradientText: true, layout: "panorama" };
  function normalize(value) {
    const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const out = { ...defaults, scenes: { ...defaults.scenes } };
    if (v.layout === "panorama" || v.layout === "separate") out.layout = v.layout;
    for (const mode of ["light", "dark"]) if (sceneById.has(v.scenes?.[mode])) out.scenes[mode] = v.scenes[mode];
    for (const key of ["motion", "lighting", "blink", "bubbles", "companions", "emotes", "gradientText"]) {
      if (typeof v[key] === "boolean") out[key] = v[key];
    }
    for (const [key, min, max] of [["bubbleCount", 5, 40], ["bubbleSpeed", 30, 200], ["backgroundOpacity", 0, 100], ["contentOpacity", 0, 100], ["readingWidth", 480, 1440]]) {
      if (typeof v[key] === "number" && Number.isFinite(v[key])) out[key] = Math.round(Math.max(min, Math.min(max, v[key])));
    }
    return out;
  }
  let settings = normalize();
  try { settings = normalize(JSON.parse(window.localStorage.getItem(STORAGE) || "null")); } catch (_) {}
  function listen(el, event, fn, options) {
    el.addEventListener(event, fn, options);
    listeners.push(() => el.removeEventListener(event, fn, options));
  }
  function attr(el, name, value) {
    let previous = mutations.get(el);
    if (!previous) { previous = new Map(); mutations.set(el, previous); }
    // Adapter markers belong only to this skin. A host may clone an already
    // decorated subtree; those copied markers must also disappear on disposal.
    if (!previous.has(name)) previous.set(name, null);
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }
  function node(tag, attrs = {}, text) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function nativeStyle(el, name, value) {
    if (!el) return;
    let properties = changedStyles.get(el);
    if (!properties) { properties = new Map(); changedStyles.set(el, properties); originalStylePresence.set(el, el.hasAttribute("style")); }
    // Only skin-owned custom properties are written. Copied React subtrees may
    // carry these markers and properties; they must not survive disposal.
    if (!properties.has(name)) properties.set(name, null);
    if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
    ownStyleSnapshots.set(el, el.getAttribute("style"));
  }
  function appendOwned(el, parent = body) {
    el.setAttribute("data-sunlit-owner", owner); parent.appendChild(el); owned.push(el); return el;
  }
  const style = appendOwned(node("style", { "data-sunlit-style": "" }, cssText), document.head || body);
  const viewport = appendOwned(node("div", { "data-sunlit-viewport": "", "aria-hidden": "true" }));
  const sidebarArt = node("div", { "data-sunlit-sidebar-art": "" });
  const sceneArea = node("div", { "data-sunlit-main-scene": "" });
  const artwork = node("div", { "data-sunlit-artwork": "" });
  const background = node("div", { "data-sunlit-background": "" });
  const wash = node("div", { "data-sunlit-reading-wash": "" });
  const sidebarVeil = node("div", { "data-sunlit-sidebar-veil": "" });
  viewport.append(sidebarArt, sceneArea);
  const decorations = node("div", { "data-sunlit-decorations": "" });
  const light = node("div", { "data-sunlit-light": "" });
  const bubbles = node("div", { "data-sunlit-bubbles": "" });
  let leafSignature = "";
  function renderLeaves() {
    // Keep the historic bubbles key and container so saved on/off preferences
    // survive the new leaf material; count and speed are validated additions.
    const signature = `${leafScene()}:${settings.bubbleCount}:${settings.bubbleSpeed}`;
    if (signature === leafSignature) return;
    leafSignature = signature; bubbles.replaceChildren();
    for (let i = 0; i < settings.bubbleCount; i++) {
      const leaf = node("i"), duration = ((leafScene() ? 22 : 20) + i % 8 * 3) * 100 / settings.bubbleSpeed;
      leaf.style.cssText = `--bubble-size:${18 + i * 17 % (leafScene() ? 19 : 55)}px;--bubble-delay:-${leafScene() ? (i * 7.3) % duration : i * 1.9}s;--bubble-time:${duration}s;--leaf-hue:${94 + i * 13 % 35};--leaf-light:${34 + i * 7 % 19}%`;
      bubbles.append(leaf);
    }
  }
  const companionLeft = node("img", { "data-sunlit-companion": "left", alt: "", draggable: "false" });
  const companionRight = node("img", { "data-sunlit-companion": "right", alt: "", draggable: "false" });
  const emoteLeft = node("img", { "data-sunlit-emote": "left", alt: "", draggable: "false" });
  const emoteRight = node("img", { "data-sunlit-emote": "right", alt: "", draggable: "false" });
  decorations.append(bubbles, companionLeft, companionRight, emoteLeft, emoteRight);
  // Panorama art, portraits and GIFs share one opacity group and one wash.
  // Separate layout keeps its original vivid margin decorations above the wash.
  artwork.append(background, light);
  sceneArea.append(artwork, wash, sidebarVeil, decorations);
  const toggle = appendOwned(node("button", { type: "button", "data-sunlit-toggle": "", "aria-expanded": "false", "aria-controls": "dsh-sunlit-palette", title: "晴光与泡影 · 本机外观设置" }, "✦ 晴光"));
  const panel = appendOwned(node("section", { id: "dsh-sunlit-palette", "data-sunlit-panel": "", role: "dialog", "aria-label": "晴光与泡影 · 本机调色板", hidden: "" }));
  const header = node("header");
  const heading = node("div");
  heading.append(node("strong", {}, config.title || "晴光与泡影"), node("small", {}, "DSH 本机调色板"));
  const close = node("button", { type: "button", "aria-label": "关闭调色板" }, "×");
  header.append(heading, close);
  const subtitle = node("p", { "data-sunlit-hint": "" }, "随 DSH 明暗模式自动切换。相册可分别记住两种模式；这些设置仅保存在本机。 ");
  const status = node("p", { "data-sunlit-status": "", role: "status", "aria-live": "polite" });
  const tabs = node("div", { "data-sunlit-modes": "", role: "group", "aria-label": "设置哪种模式的背景" });
  const modeButtons = {};
  for (const [mode, label] of [["light", "晴光 · 亮色"], ["dark", "泡影 · 暗色"]]) {
    const button = node("button", { type: "button", "data-sunlit-mode-choice": mode, "aria-pressed": "false" }, label);
    listen(button, "click", () => { editorMode = mode; refreshPanel(); });
    tabs.append(button); modeButtons[mode] = button;
  }
  const gallery = node("div", { "data-sunlit-gallery": "", role: "group", "aria-label": "选择背景相册" });
  const galleryButtons = new Map();
  for (const scene of scenes) {
    const button = node("button", { type: "button", "data-sunlit-scene-choice": scene.id, "aria-pressed": "false", title: `${scene.label} · ${scene.description || ""}` });
    const image = node("img", { alt: "", loading: "lazy", decoding: "async" });
    image.src = assets[scene.asset]; image.style.objectPosition = scene.position || "center";
    button.append(image, node("span", {}, scene.label));
    listen(button, "click", () => { settings.scenes[editorMode || mode()] = scene.id; saveAndApply(); });
    gallery.append(button); galleryButtons.set(scene.id, button);
  }
  const controls = node("div", { "data-sunlit-controls": "" });
  const inputs = new Map();
  const layoutRow = node("label", { "data-sunlit-control": "layout" });
  const layoutSelect = node("select", { "data-sunlit-setting": "layout", "aria-label": "背景布局（亮暗通用）" });
  for (const [value, label] of [["panorama", "背景贯穿"], ["separate", "独立侧栏"]]) layoutSelect.append(node("option", { value }, label));
  layoutRow.append(node("span", {}, "背景布局（亮暗通用）"), layoutSelect); controls.append(layoutRow);
  inputs.set("layout", { input: layoutSelect });
  listen(layoutSelect, "change", () => { settings.layout = layoutSelect.value; saveAndApply(); });
  function slider(label, key, min, max, suffix) {
    const row = node("label", { "data-sunlit-control": key });
    const top = node("span");
    const output = node("output");
    top.append(node("span", {}, label), output);
    const input = node("input", { type: "range", min: String(min), max: String(max), step: "1", "data-sunlit-setting": key });
    const update = () => { settings = normalize({ ...settings, [key]: Number(input.value) }); saveAndApply(); };
    listen(input, "input", update);
    inputs.set(key, { input, output, suffix }); row.append(top, input); controls.append(row);
  }
  slider("背景强度", "backgroundOpacity", 0, 100, "%");
  slider("阅读底色", "contentOpacity", 0, 100, "%");
  slider("阅读宽度", "readingWidth", 480, 1440, " px");
  slider("粒子数量", "bubbleCount", 5, 40, "");
  slider("粒子速度", "bubbleSpeed", 30, 200, "%");
  for (const [key, label] of [["motion", "场景动态"], ["lighting", "氛围光影"], ["blink", "人物眨眼"], ["bubbles", "场景粒子（果园落叶 / 其他泡泡）"], ["companions", "双人立绘"], ["emotes", "双人 GIF"], ["gradientText", "字体渐变"]]) {
    const row = node("label", { "data-sunlit-control": key });
    const input = node("input", { type: "checkbox", "data-sunlit-setting": key });
    row.append(node("span", {}, label), input); inputs.set(key, { input }); controls.append(row);
    listen(input, "change", () => { settings[key] = input.checked; saveAndApply(); });
  }
  const footer = node("footer");
  const reset = node("button", { type: "button", "data-sunlit-reset": "" }, "恢复主题默认");
  footer.append(node("small", {}, "不改变 DSH 账号、模型及聊天设置。"), reset);
  panel.append(header, subtitle, tabs, gallery, controls, status, footer);
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const mode = () => body.hasAttribute("data-ds-dark-theme") ? "dark" : "light";
  const leafScene = () => settings.scenes[mode()] === "orchard";
  const effectiveMotion = () => settings.motion && !document.hidden && !reducedMotion?.matches;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const rect = el => el?.getBoundingClientRect();
  const visible = el => { const r = rect(el); return !!r && r.width > 0 && r.height > 0 && window.getComputedStyle(el).visibility !== "hidden"; };
  function assignImage(el, id, visible) {
    const src = assets[id];
    // Only measured layout reveals art, avoiding natural-size flashes on a
    // theme/visibility refresh while a narrow window is being recomputed.
    if (!visible || !src) el.hidden = true;
    if (src && el.getAttribute("src") !== src) el.src = src;
  }
  function sceneSettings() { return { scene: settings.scenes[mode()], motion: effectiveMotion(), lighting: settings.lighting, blink: settings.blink && effectiveMotion() }; }
  function decorateHost() {
    // These are DSH desktop/web selectors, verified from its installed skin.
    const sidebar = document.querySelector(SIDEBAR);
    const host = document.getElementById("root");
    if (host) attr(host, "data-sunlit-host", "");
    if (sidebar && sidebar.parentElement !== body && sidebar.parentElement !== document.documentElement) attr(sidebar.parentElement, "data-sunlit-frame", "");
    const center = document.querySelector(CENTER);
    if (center) {
      // _centerCol may be inside a painted flex/grid carrier. Clear only its
      // path to #root, preserving the right panel and all interactive descendants.
      for (let el = center; el && el !== body; el = el.parentElement) {
        attr(el, "data-sunlit-surface", "");
        if (el === host) break;
      }
      // DSH Conversation has its own full-height _root below centerCol and
      // paints --dsw-alias-bg-base. Clear only the view's structural ancestor
      // path, keeping native menus, cards, editors and popovers readable.
      for (const view of center.querySelectorAll("[class*='_viewArea']")) {
        for (let el = view; el && el !== center; el = el.parentElement) attr(el, "data-sunlit-surface", "");
      }
    }
    const content = center && [...center.querySelectorAll("[data-conversation-content][data-conversation-region='chat'],[class*='_body']")].find(el => el.matches("[data-conversation-content]") && visible(el));
    const scope = content || center;
    const composer = scope && [...scope.querySelectorAll("[data-composer-seat],[class*='_composerSeat']")].find(visible);
    const views = scope ? [...scope.querySelectorAll("[class*='_viewArea']")].filter(el => visible(el) && !el.contains(composer)) : [];
    const scroller = composer?.closest("[data-conversation-scroll],[class*='_scrollBody']") || (scope && [...scope.querySelectorAll("[data-conversation-scroll],[class*='_scrollBody']")].find(visible));
    nodes = { center, sidebar, content, composer, views, scroller, rightbar: document.querySelector("[data-rightbar-col],[class*='_rightbarCol']"),
      obstacles: [...document.querySelectorAll("[role='dialog'],[role='menu'],[data-trigger-menu]")].filter(el => !el.closest("[data-sunlit-owner]")) };
    const next = new Set([center, sidebar, content, composer, scroller, nodes.rightbar, ...views].filter(Boolean));
    for (const el of observed) if (!next.has(el)) resize.unobserve(el);
    for (const el of next) if (!observed.has(el)) resize.observe(el);
    observed = next;
  }
  function placeBox(el, x, y, width, height) {
    for (const [key, value] of Object.entries({ left: x, top: y, width, height })) {
      const next = Math.round(value * 2) / 2 + "px";
      if (el.style[key] !== next) el.style[key] = next;
    }
  }
  function fitTranscript() {
    const { scroller, composer, views = [] } = nodes;
    const scroll = rect(scroller), input = rect(composer);
    const phase = composer?.closest("[data-phase]")?.getAttribute("data-phase");
    const active = !!scroll && !!input && phase !== "hero" && input.height > 0 && input.top < scroll.bottom && input.bottom > scroll.top;
    const reserve = active ? Math.ceil(input.height + 16) : 0;
    if (scroller) { attr(scroller, "data-sunlit-scroll", ""); nativeStyle(scroller, "--sunlit-input-reserve", reserve + "px"); }
    const clipped = [];
    for (const view of views) {
      if (!view.hasAttribute("data-sunlit-transcript")) {
        const previousBase = view.style.getPropertyValue("--sunlit-base-padding");
        nativeStyle(view, "--sunlit-base-padding", previousBase || window.getComputedStyle(view).paddingBottom);
        attr(view, "data-sunlit-transcript", "");
      }
      // The view is a sibling of the sticky/absolute composer, never its parent.
      // Extra scroll room makes the last line reachable above the input deck.
      const before = rect(view);
      const existingTail = scroll ? Math.max(0, scroll.top + scroller.scrollHeight - scroller.scrollTop - before.bottom) : 0;
      nativeStyle(view, "--sunlit-input-tail", Math.ceil(Math.max(0, reserve - existingTail)) + "px");
      const area = rect(view), cutoff = active ? Math.max(scroll.top, input.top - 12) : area.bottom;
      const bottom = active ? clamp(area.bottom - cutoff, 0, area.height) : 0;
      nativeStyle(view, "--sunlit-clip-bottom", Math.round(bottom) + "px");
      clipped.push({ bottom, cutoff });
    }
    return { reserve, clipped, composerTop: input?.top || 0 };
  }
  function layout() {
    frame = 0;
    if (disposed) return;
    if (body.getAttribute("data-sunlit-mode") !== mode()) { apply(); return; }
    if (structureDirty) { decorateHost(); structureDirty = false; }
    const center = rect(nodes.center), sidebar = rect(nodes.sidebar);
    if (!center || center.width <= 0 || center.height <= 0) { sceneArea.hidden = true; sidebarArt.hidden = true; return; }
    let left = Math.max(0, center.left), top = Math.max(0, center.top), right = Math.min(window.innerWidth, center.right), bottom = Math.min(window.innerHeight, center.bottom);
    for (const child of nodes.rightbar?.children || []) {
      const r = rect(child);
      if (r.width > 80 && r.height > 100 && r.left > left + 240 && r.left < right && window.getComputedStyle(child).visibility !== "hidden") right = Math.min(right, r.left);
    }
    const width = Math.max(0, right - left), height = Math.max(0, bottom - top);
    sceneArea.hidden = width < 1 || height < 1;
    const panorama = settings.layout === "panorama";
    const sceneLeft = panorama && sidebar && sidebar.width > 0 ? Math.max(0, Math.min(left, sidebar.left)) : left;
    const sceneTop = panorama && sidebar && sidebar.width > 0 ? Math.max(0, Math.min(top, sidebar.top)) : top;
    const sceneBottom = panorama && sidebar && sidebar.width > 0 ? Math.min(window.innerHeight, Math.max(bottom, sidebar.bottom)) : bottom;
    placeBox(sceneArea, sceneLeft, sceneTop, right - sceneLeft, sceneBottom - sceneTop);
    // Panorama decorations belong to the full illustrated plane, including the
    // sidebar. Separate mode retains its original center-only side corridors.
    placeBox(decorations, panorama ? 0 : left - sceneLeft, panorama ? 0 : top - sceneTop, panorama ? right - sceneLeft : width, panorama ? sceneBottom - sceneTop : height);
    sidebarArt.hidden = panorama || !sidebar || sidebar.width < 1;
    if (sidebar) placeBox(sidebarArt, sidebar.left, sidebar.top, sidebar.width, sidebar.height);
    sidebarVeil.hidden = !panorama || !sidebar || sidebar.width < 1;
    if (panorama && sidebar) placeBox(sidebarVeil, sidebar.left - sceneLeft, sidebar.top - sceneTop, sidebar.width + 96, sidebar.height);
    const narrowLeaves = leafScene() && !panorama && settings.bubbles && effectiveMotion() && width >= 540 && width < 687;
    let scale = 0, readingWidth = Math.max(0, Math.min(settings.readingWidth, width - (narrowLeaves ? 112 : 32)));
    let laneLeft = 16, laneRight = width - 16;
    if (!panorama && (settings.companions || settings.emotes && effectiveMotion()) && height >= 400 && width >= 650) {
      for (const candidate of [1, .85, .7, .55, .5]) {
        const available = width - 154 * candidate - 132 * candidate - 64;
        if (available >= Math.min(480, settings.readingWidth)) { scale = candidate; break; }
      }
      if (scale) { laneLeft = 154 * scale + 32; laneRight = width - 132 * scale - 32; readingWidth = Math.min(settings.readingWidth, laneRight - laneLeft); }
    }
    const readingCenter = (laneLeft + laneRight) / 2, shift = readingCenter - width / 2;
    for (const el of [nodes.content, ...nodes.views || [], nodes.composer].filter(Boolean)) {
      attr(el, el === nodes.content ? "data-sunlit-conversation-body" : "data-sunlit-reading-column", "");
      nativeStyle(el, "--sunlit-column-width", Math.max(0, Math.round(readingWidth)) + "px");
      nativeStyle(el, "--sunlit-column-shift", Math.round(shift) + "px");
    }
    const overlaps = (box, other, gap = 8) => box.left < other.right + gap && box.right > other.left - gap && box.top < other.bottom + gap && box.bottom > other.top - gap;
    const obstacles = [...nodes.obstacles, ...(!panel.hidden ? [panel] : [])].filter(visible).map(rect);
    const protectedLane = { left: left + readingCenter - readingWidth / 2 - 8, right: left + readingCenter + readingWidth / 2 + 8, top, bottom };
    const placed = [];
    const pairs = [[companionLeft, emoteLeft, 154, "left"], [companionRight, emoteRight, 132, "right"]];
    for (const [character, emote, nominalWidth, side] of pairs) {
      const sceneWidth = right - sceneLeft, sceneHeight = sceneBottom - sceneTop;
      const artScale = panorama && sceneWidth >= 360 && sceneHeight >= 320 ? Math.min(1, sceneWidth / 1100, sceneHeight / 700) : 0;
      const w = panorama ? (side === "left" ? 240 : 206) * artScale : nominalWidth * scale;
      const h = panorama ? (side === "left" ? 360 : 344) * artScale : 230 * scale;
      // Move Xixi and her GIF together by 28px at full scale. The opposite
      // group keeps its outer bounds while the GIF and standee swap order.
      const x = panorama ? side === "left" ? 44 * artScale : sceneWidth - w - 20 * artScale : side === "left" ? 16 : width - w - 16;
      const y = panorama ? sceneHeight - h - (side === "left" ? 20 : 54) * artScale : height - h - 56;
      const originLeft = panorama ? sceneLeft : left, originTop = panorama ? sceneTop : top;
      const box = { left: originLeft + x, right: originLeft + x + w, top: originTop + y, bottom: originTop + y + h };
      const anchorFits = panorama ? !!artScale : !!scale && !obstacles.some(r => overlaps(box, r)) && !overlaps(box, protectedLane, 0);
      const show = settings.companions && anchorFits && !!character.getAttribute("src");
      character.hidden = !show;
      if (show) { placeBox(character, x, y, w, h); placed.push({ side, ...box, width: w, height: h }); }
      emote.hidden = true;
      if (anchorFits && settings.emotes && effectiveMotion()) {
        if (panorama) {
          const size = 96 * artScale, ex = side === "left" ? x + w + 18 * artScale : x - size - 18 * artScale;
          let ey = sceneHeight - size - (side === "left" ? 38 : 76) * artScale;
          const input = rect(nodes.composer);
          if (side === "right" && input && sceneLeft + ex < input.right && sceneLeft + ex + size > input.left) {
            // The swapped GIF may now sit underneath the native input deck.
            // Raise only that GIF; keep both figures and the reading width fixed.
            ey = Math.min(ey, input.top - sceneTop - size - 12);
          }
          if (ex >= 0 && ex + size <= sceneWidth - 8 && ey >= 24 && ey + size <= sceneHeight - 8) {
            placeBox(emote, ex, ey, size, size); emote.hidden = false;
          }
        } else for (const size of [96, 84, 72]) {
          const ex = x + (w - size) / 2, ey = y - size - 26;
          const bubble = { left: left + ex, right: left + ex + size, top: top + ey, bottom: top + ey + size };
          if (ex >= 8 && ex + size <= width - 8 && ey >= 48 && !overlaps(bubble, protectedLane, 0) && !obstacles.some(r => overlaps(bubble, r))) {
            placeBox(emote, ex, ey, size, size); emote.hidden = false; break;
          }
        }
      }
      if (emote.hidden && emote.hasAttribute("src")) emote.removeAttribute("src");
      else if (!emote.hidden) assignImage(emote, side === "left" ? mode() === "dark" ? "sigrika-emote-dark" : "sigrika-emote" : mode() === "dark" ? "denia-chibi-dark" : "denia-chibi", true);
    }
    // Panorama uses the illustrated sidebar's spare room, never sacrificing
    // reading width; separate mode keeps small leaves in its measured rails.
    for (const [index, bubble] of [...bubbles.children].entries()) {
      const size = narrowLeaves ? 10 + index % 5 : 18 + index * 17 % (leafScene() ? 19 : 55), side = index % 2 ? "right" : "left";
      const planeLeft = panorama ? sceneLeft : left, planeWidth = panorama ? right - sceneLeft : width;
      const start = side === "left" ? 4 : protectedLane.right - planeLeft + 16;
      const end = side === "left" ? protectedLane.left - planeLeft - 16 : planeWidth - 4;
      const drift = leafScene() ? (index % 2 ? -1 : 1) * (narrowLeaves ? 4 : 24) : 4;
      const room = end - start - size * 1.4 - Math.abs(drift);
      bubble.hidden = room < (narrowLeaves ? 2 : 8) || narrowLeaves && index >= 8;
      bubble.style.setProperty("--bubble-size", size + "px");
      if (!bubble.hidden) {
        bubble.style.setProperty("--bubble-x", Math.round(start + size * .2 + Math.max(0, -drift) + room * ((index * 37 % 100) / 100)) + "px");
        bubble.style.setProperty("--bubble-drift", drift + "px");
      }
    }
    bubbles.style.setProperty("--sunlit-leaf-travel", ((panorama ? sceneBottom - sceneTop : height) + 90) + "px");
    const clip = fitTranscript();
    layoutState = { layout: settings.layout, scene: { left: sceneLeft, top: sceneTop, width: right - sceneLeft, height: sceneBottom - sceneTop }, main: { left, top, width, height }, sidebar: sidebar ? { left: sidebar.left, width: sidebar.width } : null, readingWidth, shift, scale, characters: placed, ...clip };
  }
  function refreshPanel() {
    const current = mode(), editing = editorMode || current;
    for (const [name, button] of Object.entries(modeButtons)) button.setAttribute("aria-pressed", String(name === editing));
    for (const [id, button] of galleryButtons) button.setAttribute("aria-pressed", String(settings.scenes[editing] === id));
    for (const [key, { input, output, suffix }] of inputs) {
      if (input.type === "checkbox") input.checked = settings[key];
      else if (input.tagName === "SELECT") input.value = settings[key];
      else { input.value = String(settings[key]); output.textContent = `${settings[key]}${suffix}`; }
    }
    subtitle.textContent = `DSH 当前为${current === "dark" ? "暗色" : "亮色"}。正在设置${editing === "dark" ? "暗色" : "亮色"}背景；切换这里仅选择相册，不修改 DSH 明暗模式。字体渐变开启时，实际阅读底色最低亮色60% / 暗色68%，保留滑块偏好。`;
  }
  function apply() {
    if (disposed) return;
    const current = mode(), scene = sceneById.get(settings.scenes[current]);
    attr(body, "data-dsh-sunlit", "");
    attr(body, "data-sunlit-mode", current);
    attr(body, "data-sunlit-motion", effectiveMotion() ? "on" : "off");
    attr(body, "data-sunlit-lighting", settings.lighting ? "on" : "off");
    attr(body, "data-sunlit-gradient", settings.gradientText ? "on" : "off");
    attr(body, "data-sunlit-layout", settings.layout);
    const decorationParent = settings.layout === "panorama" ? artwork : sceneArea;
    if (decorations.parentElement !== decorationParent) decorationParent.append(decorations);
    // Keep all variables on owned nodes; native body styles are never rewritten.
    viewport.style.setProperty("--sunlit-background-opacity", String(settings.backgroundOpacity / 100));
    const effectiveVeil = Math.max(settings.contentOpacity / 100, settings.gradientText ? current === "dark" ? .68 : .60 : 0);
    viewport.style.setProperty("--sunlit-content-opacity", String(effectiveVeil));
    background.dataset.sunlitScene = scene?.id || "";
    background.dataset.sunlitMode = current;
    background.style.backgroundImage = scene ? `url(${JSON.stringify(assets[scene.asset])})` : "none";
    background.style.backgroundPosition = scene?.position || "50% 50%";
    background.style.backgroundSize = "cover";
    sidebarArt.style.backgroundImage = settings.layout === "separate" && assets[current === "dark" ? "sidebar-dark" : "sidebar-light"] ? `url(${JSON.stringify(assets[current === "dark" ? "sidebar-dark" : "sidebar-light"])})` : "none";
    renderLeaves();
    bubbles.dataset.sunlitParticles = leafScene() ? "leaf" : "bubble";
    // Panorama already has one common background-alpha parent and the wash
    // above it. Separate leaves live above that wash, so match its contribution
    // explicitly; never multiply the panorama background alpha a second time.
    bubbles.style.opacity = leafScene() && settings.layout === "separate" ? String(settings.backgroundOpacity / 100 * (1 - effectiveVeil)) : "1";
    bubbles.hidden = !settings.bubbles || !effectiveMotion();
    light.hidden = !settings.lighting;
    assignImage(companionLeft, current === "dark" ? "task-left-dark" : "task-left", settings.companions);
    assignImage(companionRight, current === "dark" ? "task-right-primary-dark" : "task-right-primary", settings.companions);
    // Animated GIFs are removed from their nodes when motion is disabled, so a
    // motion-off request also stops decoders rather than only CSS animations.
    assignImage(emoteLeft, current === "dark" ? "sigrika-emote-dark" : "sigrika-emote", settings.emotes && effectiveMotion());
    assignImage(emoteRight, current === "dark" ? "denia-chibi-dark" : "denia-chibi", settings.emotes && effectiveMotion());
    if (!settings.emotes || !effectiveMotion()) { emoteLeft.removeAttribute("src"); emoteRight.removeAttribute("src"); }
    schedule(true);
    if (renderer) renderer.refresh(sceneSettings());
    refreshPanel();
  }
  function saveAndApply() {
    settings = normalize(settings);
    try { window.localStorage.setItem(STORAGE, JSON.stringify(settings)); status.textContent = "已保存到本机。"; }
    catch (_) { status.textContent = "浏览器阻止了本机保存；本次设置仍然有效。"; }
    apply();
  }
  function setOpen(open) {
    if (open) { lastFocus = document.activeElement; editorMode = mode(); refreshPanel(); }
    panel.hidden = !open; toggle.setAttribute("aria-expanded", String(open));
    if (open) close.focus();
    else if (lastFocus?.isConnected) lastFocus.focus();
    schedule();
  }
  listen(toggle, "click", () => setOpen(panel.hidden));
  listen(close, "click", () => setOpen(false));
  listen(document, "keydown", event => { if (event.key === "Escape" && !panel.hidden) { event.preventDefault(); setOpen(false); } });
  listen(reset, "click", () => { settings = normalize(); saveAndApply(); });
  listen(window, "storage", event => {
    if (event.key !== STORAGE) return;
    try { settings = normalize(JSON.parse(event.newValue || "null")); apply(); } catch (_) {}
  });
  listen(document, "visibilitychange", apply);
  if (reducedMotion?.addEventListener) listen(reducedMotion, "change", apply);
  function schedule(structural = false) {
    if (disposed) return;
    structureDirty ||= structural;
    if (!frame) frame = window.requestAnimationFrame(layout);
  }
  const resize = new window.ResizeObserver(() => schedule());
  const observer = new window.MutationObserver(records => {
    for (const record of records) {
      const target = record.target;
      if (target.nodeType !== 1 || target.closest?.("[data-sunlit-owner]")) continue;
      if (record.type === "childList") {
        if ([...record.addedNodes, ...record.removedNodes].some(n => n.nodeType === 1 && !n.closest?.("[data-sunlit-owner]"))) { schedule(true); break; }
      } else if (record.attributeName !== "style" || ownStyleSnapshots.get(target) !== target.getAttribute("style")) { schedule(true); break; }
    }
  });
  listen(window, "resize", () => schedule(), { passive: true });
  listen(document, "scroll", event => { if (event.target === nodes.scroller) schedule(); }, { passive: true, capture: true });
  apply();
  if (frame) { window.cancelAnimationFrame(frame); frame = 0; }
  layout();
  const sceneMount = typeof mountDshSunlitScene === "function" ? mountDshSunlitScene : window.mountDshSunlitScene;
  if (typeof sceneMount === "function") {
    try { renderer = sceneMount({ window, document, root: background, config, assets, settings: sceneSettings() }); }
    catch (_) { status.textContent = "动态场景不可用，已使用原画背景。"; }
  }
  observer.observe(body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-ds-dark-theme", "class", "style", "hidden", "aria-hidden", "data-phase", "data-content-phase", "data-conversation-composer-overlay", "data-rightbar-collapsed", "data-sidebar-collapsed"] });
  function dispose() {
    if (disposed) return;
    disposed = true; observer.disconnect(); resize.disconnect();
    if (frame) window.cancelAnimationFrame(frame);
    for (const remove of listeners) remove();
    try { renderer?.dispose(); } catch (_) {}
    for (const el of owned) el.remove();
    // A route can clone decorated native DOM immediately before unmount, before
    // the next animation frame discovers it. Sweep only this skin's markers.
    const nativeMarkers = ["data-sunlit-host", "data-sunlit-frame", "data-sunlit-surface", "data-sunlit-reading-column", "data-sunlit-conversation-body", "data-sunlit-transcript", "data-sunlit-scroll"];
    for (const el of document.querySelectorAll(nativeMarkers.map(name => `[${name}]`).join(","))) {
      for (const name of nativeMarkers) el.removeAttribute(name);
      for (const name of [...el.style]) if (name.startsWith("--sunlit-")) el.style.removeProperty(name);
    }
    for (const [el, attrs] of mutations) for (const [name, value] of attrs) {
      if (value === null) el.removeAttribute(name); else el.setAttribute(name, value);
    }
    mutations.clear();
    for (const [el, properties] of changedStyles) {
      for (const name of properties.keys()) el.style.removeProperty(name);
      if (!originalStylePresence.get(el) && !el.style.length) el.removeAttribute("style");
    }
    changedStyles.clear(); observed.clear();
    if (window[INSTANCE] === dispose) delete window[INSTANCE];
  }
  dispose.getLayoutState = () => structuredClone(layoutState);
  window[INSTANCE] = dispose;
  return dispose;
}
