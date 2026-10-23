/* Scene atmosphere reuses the engine's particles and reading-lane mask.
   No transcript observers, geometry reads, timers, or animation-frame loop. */
function mountSunlitSceneEffects(context) {
  const { document: doc, window: win } = context;
  const html = doc.documentElement, key = "__SUNLIT_SCENE_EFFECTS__";
  win[key]?.dispose?.();
  const scenes = {
    sunset: ["glow", "239 177 83", "255 218 162"],
    night: ["star", "166 174 247", "224 202 255"],
    orchard: ["leaf", "156 180 82", "246 198 99"],
    heart: ["petal", "228 145 180", "255 195 214"],
    story: ["petal", "216 153 155", "255 220 196"],
    evening: ["glow", "229 142 109", "255 203 160"],
    train: ["wind", "178 160 222", "249 222 181"],
    breeze: ["wind", "111 187 181", "209 241 219"],
    daydream: ["leaf", "121 184 158", "211 234 183"],
    dream: ["dream", "191 155 215", "244 201 232"],
    "sigrika-paws": ["prism", "228 179 115", "255 221 165"],
    "denia-paws": ["prism", "175 143 211", "231 196 250"],
    "dsh-palace-light": ["petal", "218 159 199", "255 213 236"],
    "dsh-palace-dark": ["star", "127 158 228", "183 203 255"]
  };
  // Small camera moves belong to the original artwork pseudo-element only.
  // The workbench's independent translate/scale and mirror remain intact.
  const cameras = {
    sunset: [24, .9, -.4], night: [28, -.7, .5],
    orchard: [22, -.9, -.35], heart: [26, .55, -.55],
    story: [28, -.55, .6], evening: [26, .8, .4],
    train: [20, 1.05, -.2], breeze: [22, -.95, .3],
    daydream: [25, .6, -.55], dream: [30, -.45, -.6],
    "sigrika-paws": [23, .65, .4], "denia-paws": [25, -.65, .45],
    "dsh-palace-light": [28, .5, -.6], "dsh-palace-dark": [30, -.6, -.4]
  };
  const attrs = ["data-sunlit-scene-family", "data-sunlit-scene-motion", "data-sunlit-scene-enabled",
    "data-sunlit-wallpaper-enabled", "data-sunlit-wallpaper-motion", "data-sunlit-wallpaper-owner"];
  const vars = ["--sunlit-scene-tint", "--sunlit-scene-light", "--sunlit-wallpaper-duration",
    "--sunlit-wallpaper-x", "--sunlit-wallpaper-y", "--sunlit-wallpaper-amplitude", "--sunlit-wallpaper-geometry"];
  const previousAttrs = new Map(attrs.map(name => [name, html.getAttribute(name)]));
  const previousVars = new Map(vars.map(name => [name, [html.style.getPropertyValue(name), html.style.getPropertyPriority(name)]]));
  const host = doc.createElement("div");
  host.className = "sunlit-scene-edges";
  host.dataset.fusionUi = "scene-effects";
  host.setAttribute("aria-hidden", "true");
  host.hidden = true;
  host.append(doc.createElement("i"), doc.createElement("i"));
  doc.body.append(host);
  const bubbles = doc.querySelector("[data-fusion-bubbles]");
  const media = win.matchMedia("(prefers-reduced-motion: reduce)");
  let disposed = false, state = null;
  let inspectedSheet = null;
  const unlockedRules = [];
  function unlockWallpaperTransform() {
    const sheet = doc.getElementById("tessalume-theme-style")?.sheet;
    if (!sheet || sheet === inspectedSheet) return;
    inspectedSheet = sheet;
    // The native template marks only these two geometry declarations important,
    // which prevents compositor transform keyframes. Preserve their exact values
    // and remove only that priority in this theme's own runtime stylesheet.
    for (const rule of sheet.cssRules) {
      const selector = rule.selectorText || "", declaration = rule.style;
      if (!selector.includes('main[data-tessalume-surface="main"]::before') || !declaration) continue;
      const value = declaration.getPropertyValue("transform").trim();
      if (!/^var\(--tessalume-visual-chat-(?:light|dark)-geometry-transform,\s*none\)$/.test(value) || declaration.getPropertyPriority("transform") !== "important") continue;
      unlockedRules.push({ declaration, value });
      declaration.setProperty("transform", value);
    }
  }
  const setAttr = (name, value) => { if (html.getAttribute(name) !== value) html.setAttribute(name, value); };
  function refresh() {
    if (disposed) return;
    unlockWallpaperTransform();
    const mode = html.dataset.theme === "dark" || (!html.hasAttribute("data-theme") && html.classList.contains("electron-dark")) ? "dark" : "light";
    const scene = html.dataset.sgkScene || (mode === "dark" ? "night" : "sunset");
    const [family, tint, light] = scenes[scene] || scenes[mode === "dark" ? "night" : "sunset"];
    const enabled = html.dataset.fusionSceneEffects === undefined ? context.config?.sceneEffects?.enabled !== false : html.dataset.fusionSceneEffects !== "false";
    const wallpaperEnabled = html.dataset.fusionWallpaperMotion !== "false";
    const paused = !!(doc.hidden || media.matches || html.dataset.fusionFocus === "true" ||
      context.root?.getAttribute("data-fusion-focus") === "true" || html.dataset.fusionReducedMotion === "true" ||
      ["off", "reduced"].includes(html.dataset.tessalumeMotion));
    setAttr(attrs[0], family); setAttr(attrs[1], paused ? "paused" : "running"); setAttr(attrs[2], String(enabled));
    const [duration, x, y] = cameras[scene] || cameras[mode === "dark" ? "night" : "sunset"];
    const magnitude = Math.hypot(x, y), amplitude = (magnitude * 1.7).toFixed(2);
    const geometry = html.style.getPropertyValue(`--tessalume-visual-chat-${mode}-geometry-transform`).trim();
    // An authored workbench loop wins over the default scene camera. The
    // runtime updates this style together with its html placement attributes.
    const authored = doc.getElementById("tessalume-artwork-motion-style")?.textContent.includes(`tessalume-artwork-chat-${mode}-full`) || false;
    const layered = scene === "orchard" && html.dataset.sunlitLayeredReady === "true";
    const living = layered || (scene === "orchard" && html.dataset.sunlitLivingReady === "true");
    const owner = authored ? "workbench" : layered ? "layered-scene" : living ? "living-scene" : "scene";
    setAttr(attrs[3], String(wallpaperEnabled));
    setAttr(attrs[4], !wallpaperEnabled || paused ? "paused" : "running");
    setAttr(attrs[5], owner);
    for (const [name, value] of [[vars[0], tint], [vars[1], light], [vars[2], `${duration}s`],
      [vars[3], `calc(var(--sunlit-wallpaper-amplitude) * ${(x / magnitude).toFixed(4)})`],
      [vars[4], `calc(var(--sunlit-wallpaper-amplitude) * ${(y / magnitude).toFixed(4)})`],
      [vars[5], `clamp(2px, min(${amplitude}vw, ${amplitude}vh), 16px)`],
      [vars[6], !geometry || geometry === "none" ? "translateZ(0)" : geometry]]) {
      if (html.style.getPropertyValue(name) !== value) html.style.setProperty(name, value);
    }
    if (bubbles) {
      // Copy the already measured safe area, including panel exclusion. No new
      // layout read or transcript observer is needed for the edge-light mask.
      for (const name of ["left", "top", "width", "height", "--fusion-reading-left", "--fusion-reading-right"]) {
        const value = bubbles.style.getPropertyValue(name);
        if (value) host.style.setProperty(name, value);
      }
    }
    host.hidden = !enabled || paused;
    state = { scene, mode, family, enabled, paused, edgeLayers: 2, wallpaperEnabled,
      moving: !living && wallpaperEnabled && !paused, wallpaperPaused: living || !wallpaperEnabled || paused,
      wallpaperOwner: owner, wallpaperDuration: duration };
  }
  const observer = new win.MutationObserver(refresh);
  observer.observe(html, { attributes: true, attributeFilter: ["data-sgk-scene", "data-theme", "class", "style", "data-fusion-scene-effects", "data-sunlit-living-ready", "data-sunlit-layered-ready", "data-fusion-wallpaper-motion", "data-fusion-focus", "data-fusion-reduced-motion", "data-tessalume-motion", "data-tessalume-visual-placement"] });
  if (bubbles) observer.observe(bubbles, { attributes: true, attributeFilter: ["style"] });
  if (context.root && context.root !== html) observer.observe(context.root, { attributes: true, attributeFilter: ["data-fusion-focus"] });
  doc.addEventListener("visibilitychange", refresh);
  media.addEventListener("change", refresh);
  function dispose() {
    if (disposed) return;
    disposed = true; observer.disconnect();
    doc.removeEventListener("visibilitychange", refresh); media.removeEventListener("change", refresh);
    host.remove();
    for (const { declaration, value } of unlockedRules) {
      if (declaration.getPropertyValue("transform").trim() === value && !declaration.getPropertyPriority("transform")) declaration.setProperty("transform", value, "important");
    }
    for (const [name, value] of previousAttrs) { if (value === null) html.removeAttribute(name); else html.setAttribute(name, value); }
    for (const [name, [value, priority]] of previousVars) { if (value) html.style.setProperty(name, value, priority); else html.style.removeProperty(name); }
    if (win[key] === api) delete win[key];
  }
  const api = { getState: () => ({ ...state, disposed }), refresh, dispose };
  win[key] = api; context.addCleanup?.(dispose); refresh();
  return dispose;
}
