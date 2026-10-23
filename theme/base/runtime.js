// TESSALUME_RUNTIME_FRAGMENT: payload bootstrap, assets, and Template 1.0 rendering
(async () => {
  const RUNTIME_KEY = "__TESSALUME_RUNTIME__";
  const themeId = __TESSALUME_PAYLOAD_THEME_ID_JSON__;
  const templateCssText = __TESSALUME_PAYLOAD_TEMPLATE_CSS_JSON__;
  const cssText = __TESSALUME_PAYLOAD_CSS_JSON__;
  const hasThemeScript = __TESSALUME_PAYLOAD_HAS_SCRIPT__;
  const stagedAssetDataUrls = window.__TESSALUME_STAGED_ASSETS__;
  const stagedVisualSettings = window.__TESSALUME_STAGED_VISUAL_SETTINGS__;
  const stagedVisualImages = window.__TESSALUME_STAGED_VISUAL_IMAGES__;
  delete window.__TESSALUME_STAGED_ASSETS__;
  delete window.__TESSALUME_STAGED_VISUAL_SETTINGS__;
  delete window.__TESSALUME_STAGED_VISUAL_IMAGES__;
  const assetDataUrls = stagedAssetDataUrls || __TESSALUME_PAYLOAD_ASSETS_JSON__;
  const config = __TESSALUME_PAYLOAD_CONFIG_JSON__;
  // Shared compatibility runtime: scheduling changes are explicit per-theme.
  const runtimePerformance = themeId === "sunlit-tides.codex" && config.fusion?.runtimePerformance === true;
  const allowPetOverlay = __TESSALUME_PAYLOAD_ALLOW_PET_OVERLAY__;
  const fingerprint = __TESSALUME_PAYLOAD_FINGERPRINT_JSON__;
  const compatibilityProfile = __TESSALUME_PAYLOAD_COMPATIBILITY_PROFILE_JSON__;
  const compatibilitySelectors = compatibilityProfile?.selectors || {};
  const isPetOverlay = new URLSearchParams(location.search).get("initialRoute") === "/avatar-overlay";

  const selectorList = (name, fallback = []) => {
    const configured = compatibilitySelectors[name];
    return Array.isArray(configured) && configured.length
      ? configured.filter((selector) => typeof selector === "string" && selector.trim())
      : fallback;
  };
  const queryFirst = (scope, name, fallback = []) => {
    if (!scope?.querySelector) return null;
    for (const selector of selectorList(name, fallback)) {
      try {
        const match = scope.querySelector(selector);
        if (match) return match;
      } catch { }
    }
    return null;
  };
  const queryAll = (scope, name, fallback = []) => {
    if (!scope?.querySelectorAll) return [];
    const matches = new Set();
    for (const selector of selectorList(name, fallback)) {
      try {
        scope.querySelectorAll(selector).forEach((node) => matches.add(node));
      } catch { }
    }
    return Array.from(matches);
  };
  const closestFirst = (node, name, fallback = []) => {
    if (!node?.closest) return null;
    for (const selector of selectorList(name, fallback)) {
      try {
        const match = node.closest(selector);
        if (match) return match;
      } catch { }
    }
    return null;
  };
  // Text inside an already identified message/editor cannot change page,
  // header or output-panel ownership. New elements still take the repair path.
  const isStableTextMutation = (mutation) => {
    if (!runtimePerformance || mutation.type !== "childList" ||
        [...mutation.addedNodes, ...mutation.removedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE)) return false;
    const target = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
    return Boolean(target?.closest('[data-tessalume-surface="markdown"],[data-user-message-bubble="true"],[data-codex-composer="true"],[contenteditable="true"]'));
  };

  const disposeCompatibleRuntime = async (preserveSharedAppearance = false) => {
    if ([themeId, "sigrika-denia.sunlit-tides"].includes(window[RUNTIME_KEY]?.themeId) && window[RUNTIME_KEY]?.dispose) {
      await window[RUNTIME_KEY].dispose({ preserveSharedAppearance });
      return true;
    }
    return false;
  };

  if (isPetOverlay && !allowPetOverlay) {
    if (!(await disposeCompatibleRuntime()) && window.__CODEX_DREAM_SKIN_STATE__?.cleanup) {
      window.__CODEX_DREAM_SKIN_STATE__.cleanup();
    }
    // This target was intentionally handled. Keep the marker so the desktop
    // watcher does not resend the (potentially very large) asset payload on
    // every health check just because this compact window has no theme UI.
    window.__TESSALUME_THEME_ID__ = themeId;
    return { installed: false, skipped: "pet-overlay" };
  }

  const safeThemeId = themeId.replace(/[^a-z0-9_-]/gi, "-");
  const style = document.createElement("style");
  style.id = "tessalume-theme-style";
  style.dataset.themeId = themeId;
  // Codex 26.924 inserted display:contents wrappers around the home hero.
  // Translate the historical home-only chains at injection time so existing
  // character CSS and the frozen Template 1.0 geometry keep their meaning.
  const retargetHomeCss = (source) => source.replace(
    /(\[data-tessalume-surface="home"\]|\.[a-z][a-z0-9]*-home)((?:\s*>\s*div(?::first-child|:nth-child\(2\)))+)/g,
    (selector, home, chain) => {
      const steps = Array.from(chain.matchAll(/div(:first-child|:nth-child\(2\))/g),
        (match) => match[1]);
      const part = steps.at(-1) === ":nth-child(2)" && steps.length === 4
        ? "composer-carrier"
        : steps.every((step) => step === ":first-child")
          ? ["", "layout", "hero-region", "banner", "banner-inner", "native-title"][steps.length]
          : null;
      return part ? `${home} [data-tessalume-home-part="${part}"]` : selector;
    },
  );
  // React rewrites the native composer's className while submitting. Match its
  // stable attribute as well, at the same specificity, so the editor and its
  // surrounding fade never fall back to native colors between repair passes.
  const retargetComposerCss = (source) => source.replace(
    /\.composer-surface-chrome(?![\w-])/g,
    ':is(.composer-surface-chrome,[data-composer-surface-variant])',
  );
  style.textContent = retargetComposerCss(retargetHomeCss(`${templateCssText}\n${cssText}`));
  const compatibilityStyle = document.createElement("style");
  compatibilityStyle.id = "tessalume-runtime-compatibility-style";
  compatibilityStyle.dataset.themeId = themeId;
  compatibilityStyle.textContent = retargetComposerCss(`
html.tessalume-theme-active.tessalume-is-home [data-tessalume-surface="home"] [data-tessalume-home-part="composer-carrier"] {
  top:0!important;
  left:auto!important;
  right:auto!important;
}
html.tessalume-theme-active :is(main,[role="main"]):has(.composer-surface-chrome) .thread-scroll-container .sticky.bottom-0.tessalume-composer-fade-carrier {
  pointer-events:none!important;
  z-index:0!important;
}
/* The solid footer backdrop can be replaced independently of the composer.
   Clear only its empty decoration from its first paint, without a JS marker. */
html.tessalume-theme-active .thread-scroll-container [data-thread-scroll-footer="true"] > [aria-hidden="true"].pointer-events-none.absolute:empty {
  background:transparent!important;
  background-color:transparent!important;
  background-image:none!important;
}
html.tessalume-theme-active.tessalume-is-task main[data-tessalume-surface="main"]::before,
html.tessalume-theme-active.tessalume-is-task main[data-tessalume-surface="main"]::after {
  left:var(--tessalume-chat-canvas-left,0px)!important;
  right:auto!important;
  width:var(--tessalume-chat-canvas-width,100%)!important;
}
html.tessalume-theme-active.tessalume-is-task body [data-tessalume-surface="task-title"][data-app-shell-titlebar-content="true"] {
  max-width:var(--tessalume-task-title-primary-width,calc(100vw - 24px))!important;
}
/* Codex moved the fixed titlebar outside main. Keep its painted task header
   below the canonical stage (9), so it cannot cover the centered identity. */
html.tessalume-theme-active.tessalume-is-task header[data-app-shell-titlebar="true"]:has([data-tessalume-surface="task-header"]) {
  z-index:8!important;
}
html.tessalume-theme-active #tessalume-theme-root:is([data-tessalume-page-kind="other"],[data-tessalume-page-kind="settings"]) > *,
html.tessalume-theme-active #tessalume-theme-root[data-tessalume-native-tab-strip="true"] [data-theme-role="identity"] {
  display:none!important;
}`);
  const visualMotionStyle = document.createElement("style");
  visualMotionStyle.id = "tessalume-artwork-motion-style";
  visualMotionStyle.dataset.themeId = themeId;

  const root = document.createElement("div");
  root.id = "tessalume-theme-root";
  root.dataset.themeId = themeId;

  const managedCleanups = [];
  const assetVariables = [];
  const assetAssignments = [];
  const assetObjectUrls = [];
  const customImageObjectUrls = new Map();
  const customSlotImageKeys = new Map();
  const visualSettingVariables = new Set();
  const visualSlotStates = new Map();
  const visualImageDimensions = new Map();
  let visualSettingsTarget = document.createElement("div");
  let appearanceCommitted = false;
  let visualPlacementRevision = 0;
  let visualSurfaceResizeObserver = null;
  let definition = null;
  let disposed = false;
  let syncDisplayPreferences = () => {};

  const addCleanup = (cleanup) => {
    if (typeof cleanup !== "function") throw new TypeError("cleanup must be a function");
    managedCleanups.push(cleanup);
    return cleanup;
  };

  const assetDataUrl = (name) => {
    const value = assetDataUrls[name];
    if (!value) throw new Error(`Theme asset not found: ${name}`);
    return value;
  };

  const createObjectUrl = (dataUrl) => {
    const comma = dataUrl.indexOf(",");
    if (comma < 0 || !dataUrl.slice(0, comma).endsWith(";base64")) {
      throw new Error("Theme asset is not a base64 data URL");
    }

    const mimeType = dataUrl.slice(5, comma).split(";", 1)[0] || "application/octet-stream";
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  };

  const createAssetObjectUrl = (dataUrl) => {
    const objectUrl = createObjectUrl(dataUrl);
    assetObjectUrls.push(objectUrl);
    return objectUrl;
  };

  try {
    for (const [name, dataUrl] of Object.entries(assetDataUrls)) {
      const variable = `--tessalume-asset-${name.replace(/[^a-z0-9_-]/gi, "-")}`;
      const objectUrl = createAssetObjectUrl(dataUrl);
      assetAssignments.push([variable, objectUrl]);
    }
  } catch (error) {
    for (const objectUrl of assetObjectUrls) URL.revokeObjectURL(objectUrl);
    throw error;
  }

  const renderTemplateV1 = (spec) => {
    if (!spec || typeof spec !== "object") {
      throw new TypeError("renderTemplateV1 expects a slot specification");
    }
    const createSlot = (slotName, role, part, priority, defaultTag) => {
      const slot = spec[slotName];
      if (!slot || typeof slot !== "object") {
        throw new TypeError(`Template 1.0 requires the ${slotName} slot`);
      }
      const tagName = String(slot.tag || defaultTag);
      if (!/^[a-z][a-z0-9-]*$/i.test(tagName)) {
        throw new TypeError(`Invalid Template 1.0 slot tag: ${tagName}`);
      }
      const element = document.createElement(tagName);
      if (slot.className) element.className = String(slot.className);
      element.setAttribute("data-theme-role", role);
      element.setAttribute("data-theme-part", part);
      if (priority) element.setAttribute("data-theme-priority", priority);
      for (const [name, value] of Object.entries(slot.attributes || {})) {
        if (/^(?:class|data-theme-(?:role|part|priority))$/i.test(name)) continue;
        element.setAttribute(name, String(value));
      }
      element.innerHTML = String(slot.html || "");
      return element;
    };
    const appendDecorations = (parent, html) => {
      if (!html) return;
      const template = document.createElement("template");
      template.innerHTML = String(html);
      parent.append(...template.content.childNodes);
    };

    const stage = document.createElement("div");
    stage.className = String(spec.stageClass || "");
    stage.setAttribute("data-theme-stage", "");
    const hero = createSlot("hero", "hero", "hero-copy", null, "section");
    const identity = createSlot("identity", "identity", "identity", null, "div");
    const taskLeft = createSlot("taskLeft", "task-left", "task-card-left", null, "aside");
    const taskSecondary = createSlot(
      "taskSecondary", "task-right", "task-card-right-secondary", "secondary", "aside");
    const taskPrimary = createSlot(
      "taskPrimary", "task-right", "task-card-right-primary", "primary", "aside");
    const memory = createSlot("memory", "memory", "memory-card", null, "aside");
    const syncPanel = createSlot("syncPanel", "sync-panel", "sync-panel", "secondary", "section");
    const composerAccessory = createSlot(
      "composerAccessory", "composer-accessory", "composer-accessory", null, "div");
    stage.append(hero, identity, taskLeft, taskSecondary, taskPrimary, memory);
    appendDecorations(stage, spec.stageDecorations);
    root.replaceChildren(stage);
    appendDecorations(root, spec.rootDecorations);
    root.append(syncPanel, composerAccessory);
    return Object.freeze({
      stage,
      hero,
      identity,
      taskLeft,
      taskSecondary,
      taskPrimary,
      memory,
      syncPanel,
      composerAccessory,
    });
  };

  let context;
// TESSALUME_RUNTIME_FRAGMENT: native artwork surface discovery and personal card image layers
const artworkRegions = ["hero", "sidebar", "chat", "taskLeft", "memory", "taskRightSecondary", "taskRightPrimary"];
  const cardArtworkSlots = {
    taskLeft: { asset: "task-left", selector: '[data-theme-role="task-left"]' },
    memory: { asset: "memory", selector: '[data-theme-role="memory"]' },
    taskRightSecondary: { asset: "task-right-secondary", selector: '[data-theme-role="task-right"][data-theme-priority="secondary"]' },
    taskRightPrimary: { asset: "task-right-primary", selector: '[data-theme-role="task-right"][data-theme-priority="primary"]' },
  };
  const nativeArtworkAssetKey = (region, mode) => {
    const card = cardArtworkSlots[region];
    if (!card || region === "memory") return `${card?.asset || region}-${mode}`;
    const dark = `${card.asset}-dark`;
    return mode === "dark" && assetAssignments.some(([name]) => name === `--tessalume-asset-${dark}`)
      ? dark : card.asset;
  };
  const isArtworkSurfaceVisible = (element) => {
    if (!element?.isConnected || element.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const pane = element.closest('[data-app-shell-main-content-layout]');
    if (pane && pane !== element) {
      const clip = pane.getBoundingClientRect();
      if (Math.min(box.right, clip.right) - Math.max(box.left, clip.left) <= 1 ||
          Math.min(box.bottom, clip.bottom) - Math.max(box.top, clip.top) <= 1) return false;
    }
    return box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > 0 &&
      box.left < window.innerWidth && box.top < window.innerHeight &&
      style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse";
  };
  const artworkSurface = (region) => {
    if (cardArtworkSlots[region]) {
      const card = root.querySelector(cardArtworkSlots[region].selector);
      return { element: region === "memory" ? card : card?.querySelector('[data-theme-part="task-card-art"]'), pseudo: null };
    }
    if (region === "sidebar") {
      return { element: document.querySelector('[data-tessalume-surface="sidebar"]'), pseudo: "::after" };
    }
    if (region === "chat") {
      const main = Array.from(document.querySelectorAll('main[data-tessalume-surface="main"]'))
        .find(isArtworkSurfaceVisible);
      return {
        element: (main && Array.from(main.querySelectorAll(".thread-scroll-container"))
          .find(isArtworkSurfaceVisible)) || main,
        pseudo: "::before",
      };
    }
    return {
      element: document.querySelector(
        '[data-tessalume-home-part="banner"]',
      ) || document.querySelector(
        '[data-tessalume-surface="home"]>div:first-child>div:first-child>div:first-child',
      ),
      pseudo: "::before",
    };
  };

  // Modify only the native artwork node. Memory originally paints its image
  // on the text container, so give replacements a separate layer to ensure
  // brightness/opacity/crop never affect the caption or authored instruments.
  const cardArtworkEdits = new Map();
  const splitArtworkBackgroundLayers = (value) => {
    const layers = [];
    let depth = 0;
    let quote = "";
    let start = 0;
    for (let index = 0; index < value.length; index += 1) {
      const token = value[index];
      if (quote) {
        if (token === quote && value[index - 1] !== "\\") quote = "";
      } else if (token === '"' || token === "'") quote = token;
      else if (token === "(") depth += 1;
      else if (token === ")") depth -= 1;
      else if (token === "," && depth === 0) {
        layers.push(value.slice(start, index).trim());
        start = index + 1;
      }
    }
    layers.push(value.slice(start).trim());
    return layers;
  };
  const restoreCardArtworkEdit = (element, entry) => {
    for (const [property, value, priority] of entry.originalStyles) {
      if (value) element.style.setProperty(property, value, priority);
      else element.style.removeProperty(property);
    }
    entry.layer?.remove();
    cardArtworkEdits.delete(element);
  };
  addCleanup(() => {
    for (const [element, entry] of cardArtworkEdits) restoreCardArtworkEdit(element, entry);
  });
  const cardHasAdjustment = (state) => {
    const value = state.adjustment || {};
    return Boolean(value.customImageKey) || enumName(value.compositionMode, "theme") !== "theme" ||
      ["brightness", "contrast", "saturation", "opacity"].some((key) => finite(value[key], 100) !== 100) ||
      ["grayscale", "hueRotation", "blur", "overlayOpacity", "vignette"].some((key) => finite(value[key], 0) !== 0) ||
      enumName(value.blendMode, "normal") !== "normal";
  };
  const synchronizeCardArtworkLayers = () => {
    if (!appearanceCommitted || !root.isConnected) return;
    const mode = document.documentElement.classList.contains("electron-dark") ? "dark" : "light";
    const activeElements = new Set();
    for (const region of Object.keys(cardArtworkSlots)) {
      const state = visualSlotStates.get(`${region}-${mode}`);
      const element = artworkSurface(region).element;
      if (!state || !element || !cardHasAdjustment(state)) continue;
      activeElements.add(element);
      let entry = cardArtworkEdits.get(element);
      if (entry && entry.mode !== mode) {
        restoreCardArtworkEdit(element, entry);
        entry = null;
      }
      if (!entry) {
        const properties = region === "memory" ? ["background-image"] : [
          "background-image", "background-size", "background-position", "background-repeat",
          "filter", "opacity", "mix-blend-mode", "translate", "scale",
        ];
        entry = {
          mode,
          originalStyles: properties.map((property) => [property,
            element.style.getPropertyValue(property), element.style.getPropertyPriority(property)]),
          layer: null,
          foregroundLayers: [],
        };
        if (region === "memory") {
          const originalBackground = getComputedStyle(element).backgroundImage;
          const originalLayers = splitArtworkBackgroundLayers(originalBackground);
          const originalImageIndex = originalLayers.findIndex((layer) => /^url\(/i.test(layer));
          entry.foregroundLayers = originalImageIndex > 0 ? originalLayers.slice(0, originalImageIndex) : [];
          // Retain the original gradients and solid fill, removing only its URL
          // layer. No theme variables, captions, pseudo-elements or DOM are lost.
          element.style.setProperty("background-image", originalBackground.replace(
            /url\((?:[^"')]|"[^"]*"|'[^']*')*\)/g, "linear-gradient(transparent,transparent)"), "important");
          // A private tag avoids inheriting broad theme rules for memory span
          // meters, their pseudo-elements, or div instruments.
          const layer = document.createElement("tessalume-artwork-layer");
          layer.dataset.tessalumePersonalArtwork = "memory";
          layer.setAttribute("aria-hidden", "true");
          for (const [property, value] of Object.entries({
            // Memory's positioned root already owns a stacking context. Negative
            // z-index paints above its background, below both native pseudos and
            // the text/instrument children, including themes using ::before veils.
            position: "absolute", inset: "0", "z-index": "-1", "pointer-events": "none",
            "border-radius": "inherit", display: "block", margin: "0", padding: "0",
            width: "auto", height: "auto", "min-width": "0", "min-height": "0",
            "max-width": "none", "max-height": "none", border: "0", "box-shadow": "none",
          })) layer.style.setProperty(property, value, "important");
          element.prepend(layer);
          entry.layer = layer;
        }
        cardArtworkEdits.set(element, entry);
      }
      const target = entry.layer || element;
      const prefix = `--tessalume-visual-${region}-${mode}`;
      const nativeOverlayCount = entry.foregroundLayers.length;
      for (const [property, value] of Object.entries({
        "background-image": [...entry.foregroundLayers, `var(${state.assetVariable})`].join(","),
        "background-size": layeredValue(nativeOverlayCount, "100% 100%", `var(${prefix}-background-size)`),
        "background-position": layeredValue(nativeOverlayCount, "center", `var(${prefix}-background-position)`),
        "background-repeat": "no-repeat",
        filter: `var(${prefix}-filter)`,
        opacity: `var(${prefix}-opacity)`,
        "mix-blend-mode": `var(${prefix}-blend)`,
        translate: `var(${prefix}-translate)`,
        scale: `${state.baseScale * (state.placement?.geometry?.mirrorX ? -1 : 1)} ${state.baseScale * (state.placement?.geometry?.mirrorY ? -1 : 1)}`,
      })) target.style.setProperty(property, value, "important");
    }
    for (const [element, entry] of cardArtworkEdits) {
      if (!activeElements.has(element)) restoreCardArtworkEdit(element, entry);
    }
  };
// TESSALUME_RUNTIME_FRAGMENT: absolute artwork placement, projection, and authored motion
const enumName = (value, fallback) => {
    const candidate = String(value || "").trim().toLowerCase();
    return candidate || fallback;
  };
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const lengthCss = (length) => {
    const unit = enumName(length?.unit, "auto");
    const value = finite(length?.value, unit === "percent" ? 100 : 1);
    if (unit === "percent") return `${value}%`;
    if (unit === "pixels") return `${value}px`;
    return "auto";
  };
  const positionCss = (position, horizontal) => {
    const kind = enumName(position?.kind, "center");
    const value = finite(position?.value, kind === "percent" ? 50 : 0);
    if (kind === "start") return horizontal ? "left" : "top";
    if (kind === "end") return horizontal ? "right" : "bottom";
    if (kind === "percent") return `${value}%`;
    if (kind === "pixels") return `${value}px`;
    return "center";
  };
  const placementCss = (placement, region = "") => {
    const storedSizeMode = enumName(placement?.sizeMode, "cover");
    const sizeMode = (region === "hero" || region === "chat") &&
      storedSizeMode === "explicit"
      ? "cover"
      : storedSizeMode;
    const size = sizeMode === "contain" || sizeMode === "cover"
      ? sizeMode
      : region === "sidebar"
        ? `${lengthCss(placement?.width)} auto`
        : `${lengthCss(placement?.width)} ${lengthCss(placement?.height)}`;
    return {
      size,
      position: `${positionCss(placement?.positionX, true)} ${positionCss(placement?.positionY, false)}`,
    };
  };
  const resolveLengthPixels = (length, targetLength) => {
    const unit = enumName(length?.unit, "auto");
    const value = finite(length?.value, 0);
    if (unit === "percent") return targetLength * value / 100;
    if (unit === "pixels") return value;
    return null;
  };
  const resolvePositionPixels = (position, targetLength, renderedLength, asOrigin = false) => {
    const kind = enumName(position?.kind, "center");
    const value = finite(position?.value, kind === "percent" ? 50 : 0);
    const basis = asOrigin ? targetLength : targetLength - renderedLength;
    if (kind === "start") return 0;
    if (kind === "end") return basis;
    if (kind === "percent") return basis * value / 100;
    if (kind === "pixels") return value;
    return basis / 2;
  };
  const readImageDimensions = (url) => {
    if (!url) return Promise.resolve(null);
    if (visualImageDimensions.has(url)) return visualImageDimensions.get(url);
    const promise = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve(null);
      image.src = url;
    });
    visualImageDimensions.set(url, promise);
    return promise;
  };
  const layeredValue = (overlayCount, overlayValue, imageValue) =>
    [...Array(overlayCount).fill(overlayValue), imageValue].join(",");
  const rebuildSlotLayers = (state, surfaceWidth) => {
    const adjustment = state.adjustment || {};
    const clampPercent = (value, fallback = 0) => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback;
    };
    const color = (value) => /^#[0-9a-f]{6}$/i.test(String(value || ""))
      ? String(value).toUpperCase()
      : "#000000";
    const colorAlpha = (hex, opacity) => {
      const value = Number.parseInt(hex.slice(1), 16);
      return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${opacity})`;
    };
    const overlayColor = color(adjustment.overlayColor);
    const imageLayers = [];
    const maskLayers = [];
    const vignette = clampPercent(adjustment.vignette) / 100;
    if (vignette > 0) {
      imageLayers.push(`radial-gradient(circle at center,transparent 45%,rgba(0,0,0,${Math.min(.78, vignette * .78)}) 100%)`);
    }
    let gradientVeil = adjustment.gradientVeil || {};
    let readabilityVeil = adjustment.readabilityVeil || {};
    for (const variant of adjustment.responsiveVariants || []) {
      const minimum = Number(variant?.minWidth);
      const maximum = Number(variant?.maxWidth);
      if ((Number.isFinite(minimum) && surfaceWidth < minimum) ||
          (Number.isFinite(maximum) && surfaceWidth > maximum)) continue;
      if (variant?.gradientVeil) gradientVeil = variant.gradientVeil;
      if (variant?.readabilityVeil) readabilityVeil = variant.readabilityVeil;
    }
    const legacyGradientStrength = clampPercent(adjustment.gradientStrength) / 100;
    if (gradientVeil?.enabled === true) {
      const strength = clampPercent(gradientVeil.strength, 100) / 100;
      const configured = Array.isArray(gradientVeil.layers)
        ? gradientVeil.layers.slice(0, 8)
        : [];
      for (const layer of configured) {
        const stops = Array.isArray(layer?.stops) ? layer.stops.slice(0, 16) : [];
        if (!stops.length) continue;
        const stopCss = stops.map((stop) =>
          `${colorAlpha(color(stop?.color), Math.min(1, clampPercent(stop?.opacity) / 100 * strength))} ${clampPercent(stop?.position)}%`,
        ).join(",");
        maskLayers.push(`linear-gradient(${finite(layer?.directionDeg, 90)}deg,${stopCss})`);
      }
      if (!configured.length && strength > 0) {
        maskLayers.push(`linear-gradient(90deg,${colorAlpha(overlayColor, Math.min(.82, strength * .82))},transparent 72%)`);
      }
    }
    if (legacyGradientStrength > 0) {
      maskLayers.push(`linear-gradient(90deg,${colorAlpha(overlayColor, Math.min(.82, legacyGradientStrength * .82))},transparent 72%)`);
    }
    if (readabilityVeil?.enabled === true) {
      maskLayers.push(
        `linear-gradient(${finite(readabilityVeil.directionDeg, 90)}deg,` +
        `${colorAlpha(color(readabilityVeil.color), clampPercent(readabilityVeil.opacity) / 100)} ` +
        `${clampPercent(readabilityVeil.rangeStart)}%,transparent ` +
        `${clampPercent(readabilityVeil.rangeEnd, 100)}%)`,
      );
    }
    const overlayOpacity = clampPercent(adjustment.overlayOpacity) / 100;
    let overlayLayer = null;
    if (overlayOpacity > 0) {
      const value = colorAlpha(overlayColor, Math.min(.86, overlayOpacity * .86));
      overlayLayer = `linear-gradient(${value},${value})`;
    }
    if (state.region === "chat") {
      visualSettingsTarget.style.setProperty(
        state.maskVariable,
        maskLayers.length ? maskLayers.join(",") : "none",
      );
      visualSettingVariables.add(state.maskVariable);
    } else {
      imageLayers.push(...maskLayers);
    }
    if (overlayLayer) imageLayers.push(overlayLayer);
    imageLayers.push(`url("${state.imageUrl}")`);
    state.overlayCount = imageLayers.length - 1;
    visualSettingsTarget.style.setProperty(state.assetVariable, imageLayers.join(","));
    visualSettingVariables.add(state.assetVariable);
  };
  const setPlacementVariables = (state, size, position) => {
    const html = visualSettingsTarget;
    const prefix = `--tessalume-visual-${state.region}-${state.mode}`;
    const sizeVariable = `${prefix}-background-size`;
    const positionVariable = `${prefix}-background-position`;
    const repeatVariable = `${prefix}-background-repeat`;
    const geometryVariable = `${prefix}-geometry-transform`;
    html.style.setProperty(sizeVariable, layeredValue(state.overlayCount, "100% 100%", size));
    html.style.setProperty(positionVariable, layeredValue(state.overlayCount, "center", position));
    html.style.setProperty(repeatVariable, layeredValue(state.overlayCount, "no-repeat", "no-repeat"));
    const geometry = state.placement?.geometry || {};
    const mirrorX = geometry.mirrorX === true;
    const mirrorY = geometry.mirrorY === true;
    html.style.setProperty(
      geometryVariable,
      mirrorX || mirrorY ? `scale(${mirrorX ? -1 : 1},${mirrorY ? -1 : 1})` : "none",
    );
    for (const variable of [sizeVariable, positionVariable, repeatVariable, geometryVariable]) {
      visualSettingVariables.add(variable);
    }
  };
  const resolveFoldedPlacement = async (state, target) => {
    const placement = state.placement || {};
    const geometry = placement.geometry || {};
    const scale = Math.min(10, Math.max(.1, finite(geometry.scale, 1)));
    const raw = placementCss(placement, state.region);
    const storedSizeMode = enumName(placement.sizeMode, "cover");
    const sizeMode = (state.region === "hero" || state.region === "chat") &&
      storedSizeMode === "explicit"
      ? "cover"
      : storedSizeMode;
    const fixedWidthSidebar = state.region === "sidebar" && sizeMode === "explicit";
    if (Math.abs(scale - 1) < .000001 && !fixedWidthSidebar) return raw;
    const dimensions = await readImageDimensions(state.imageUrl);
    if (!dimensions || !target?.width || !target?.height) return raw;
    let width;
    let height;
    if (sizeMode === "cover" || sizeMode === "contain") {
      const factor = (sizeMode === "cover" ? Math.max : Math.min)(
        target.width / dimensions.width,
        target.height / dimensions.height,
      );
      width = dimensions.width * factor;
      height = dimensions.height * factor;
    } else {
      width = resolveLengthPixels(placement.width, target.width);
      height = resolveLengthPixels(placement.height, target.height);
      if (width == null && height == null) {
        width = dimensions.width;
        height = dimensions.height;
      } else if (width == null) {
        width = height * dimensions.width / dimensions.height;
      } else if (height == null) {
        height = width * dimensions.height / dimensions.width;
      }
      if (fixedWidthSidebar) {
        width = resolveLengthPixels(placement.width, target.width) ?? dimensions.width;
        height = width * dimensions.height / dimensions.width;
      }
    }
    const left = resolvePositionPixels(placement.positionX, target.width, width);
    const storedHeightUnit = enumName(placement.height?.unit, "auto");
    const storedHeightPercent = finite(placement.height?.value, 0);
    const encodedReferenceHeight = fixedWidthSidebar &&
      storedHeightUnit === "percent" && storedHeightPercent > 0
      ? height * 100 / storedHeightPercent
      : null;
    const verticalBasis = encodedReferenceHeight ?? target.height;
    const top = resolvePositionPixels(placement.positionY, verticalBasis, height);
    const originX = resolvePositionPixels(geometry.originX, target.width, 0, true);
    const originY = resolvePositionPixels(geometry.originY, verticalBasis, 0, true);
    let renderedTop = originY + ((top - originY) * scale);
    if (fixedWidthSidebar && encodedReferenceHeight == null) {
      const widthChanged = !Number.isFinite(state.sidebarReferenceWidth) ||
        Math.abs(state.sidebarReferenceWidth - target.width) > .5;
      if (widthChanged || !Number.isFinite(state.sidebarReferenceTop) ||
          target.height >= finite(state.sidebarReferenceHeight, 0)) {
        state.sidebarReferenceWidth = target.width;
        state.sidebarReferenceHeight = target.height;
        state.sidebarReferenceTop = renderedTop;
      } else {
        renderedTop = state.sidebarReferenceTop;
      }
    }
    return {
      size: `${width * scale}px ${height * scale}px`,
      position: `${originX + ((left - originX) * scale)}px ${renderedTop}px`,
    };
  };
  const synchronizeVisualPlacements = async (revision = visualPlacementRevision) => {
    for (const state of visualSlotStates.values()) {
      if (revision !== visualPlacementRevision || disposed) return false;
      const surface = artworkSurface(state.region).element;
      if (surface && visualSurfaceResizeObserver) visualSurfaceResizeObserver.observe(surface);
      const box = surface?.getBoundingClientRect();
      rebuildSlotLayers(state, box?.width || window.innerWidth);
      const placement = await resolveFoldedPlacement(state, box);
      if (revision !== visualPlacementRevision || disposed) return false;
      setPlacementVariables(state, placement.size, placement.position);
    }
    synchronizeCardArtworkLayers();
    return true;
  };

  const motionSelector = (region, mode) => {
    const color = mode === "dark" ? ".electron-dark" : ":not(.electron-dark)";
    if (region === "sidebar") {
      return `html.tessalume-theme-active${color} [data-tessalume-surface="sidebar"]::after`;
    }
    if (region === "chat") {
      return `html.tessalume-theme-active${color}.tessalume-is-task ` +
        `main[data-tessalume-surface="main"]::before`;
    }
    return `html.tessalume-theme-active${color}.tessalume-is-home ` +
      `[data-tessalume-surface="home"] [data-tessalume-home-part="banner"]::before`;
  };
  const motionLength = (value) => {
    const match = String(value || "").trim().toLowerCase().match(
      /^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|%)$/,
    );
    if (!match) return { value: 0, unit: "px" };
    return { value: finite(match[1], 0), unit: match[2] };
  };
  const combinedMotionLength = (basePixels, deltaToken, factor) => {
    const delta = motionLength(deltaToken);
    const value = delta.value * factor;
    if (delta.unit === "px") return `${basePixels + value}px`;
    if (Math.abs(basePixels) < .000001) return `${value}%`;
    const operator = value < 0 ? "-" : "+";
    return `calc(${basePixels}px ${operator} ${Math.abs(value)}%)`;
  };
  const buildMotionKeyframes = (state, factor, name, properties) => {
    const frames = Array.isArray(state.adjustment?.motion?.keyframes)
      ? state.adjustment.motion.keyframes.slice(0, 16)
      : [];
    const body = frames.map((frame) => {
      const at = Math.min(100, Math.max(0, finite(frame?.at, 0)));
      const scaleDelta = Math.min(1, Math.max(-.9, finite(frame?.scaleDelta, 0)));
      const opacityDelta = Math.min(100, Math.max(-100, finite(frame?.opacityDelta, 0)));
      const scale = Math.max(.01, state.baseScale * (1 + scaleDelta * factor));
      const opacity = Math.min(1, Math.max(0, state.baseOpacity + opacityDelta * factor / 100));
      return `${at}%{${properties.x}:${combinedMotionLength(
        state.baseOffsetX,
        frame?.translateX,
        factor,
      )};${properties.y}:${combinedMotionLength(
        state.baseOffsetY,
        frame?.translateY,
        factor,
      )};${properties.scale}:${scale};${properties.opacity}:${opacity}}`;
    }).join("");
    return `@keyframes ${name}{${body}}`;
  };
  const rebuildVisualMotionStyle = () => {
    const rules = [];
    for (const state of visualSlotStates.values()) {
      if (cardArtworkSlots[state.region]) continue; // Preserve theme-owned card animation.
      const motion = state.adjustment?.motion;
      if (enumName(motion?.mode, "none") !== "loop" ||
          !Array.isArray(motion?.keyframes) || motion.keyframes.length < 2) continue;
      const slot = `${state.region}-${state.mode}`;
      const prefix = `--tessalume-artwork-motion-${slot}`;
      const properties = {
        x: `${prefix}-x`,
        y: `${prefix}-y`,
        scale: `${prefix}-scale`,
        opacity: `${prefix}-opacity`,
      };
      const fullName = `tessalume-artwork-${slot}-full`;
      const reducedName = `tessalume-artwork-${slot}-reduced`;
      const selector = motionSelector(state.region, state.mode);
      const reducedSelector = selector.replace(
        /^html/,
        'html[data-tessalume-motion="reduced"]',
      );
      const offSelector = selector.replace(/^html/, 'html[data-tessalume-motion="off"]');
      const duration = Math.min(300000, Math.max(100, finite(motion.durationMs, 1000)));
      const easing = ["linear", "ease", "ease-in", "ease-out", "ease-in-out"]
        .includes(enumName(motion.easing, "ease-in-out"))
        ? enumName(motion.easing, "ease-in-out")
        : "ease-in-out";
      const direction = ["normal", "reverse", "alternate", "alternate-reverse"]
        .includes(enumName(motion.direction, "alternate"))
        ? enumName(motion.direction, "alternate")
        : "alternate";
      rules.push(
        `@property ${properties.x}{syntax:"<length-percentage>";inherits:false;initial-value:${state.baseOffsetX}px}`,
        `@property ${properties.y}{syntax:"<length-percentage>";inherits:false;initial-value:${state.baseOffsetY}px}`,
        `@property ${properties.scale}{syntax:"<number>";inherits:false;initial-value:${state.baseScale}}`,
        `@property ${properties.opacity}{syntax:"<number>";inherits:false;initial-value:${state.baseOpacity}}`,
        buildMotionKeyframes(state, 1, fullName, properties),
        buildMotionKeyframes(state, .35, reducedName, properties),
        `${selector}{translate:var(${properties.x}) var(${properties.y})!important;` +
          `scale:var(${properties.scale})!important;opacity:var(${properties.opacity})!important;` +
          `animation-name:${fullName}!important;animation-duration:${duration}ms!important;` +
          `animation-timing-function:${easing}!important;animation-direction:${direction}!important;` +
          "animation-iteration-count:infinite!important;animation-fill-mode:both!important;" +
          "animation-play-state:running!important}",
        `${reducedSelector}{animation-name:${reducedName}!important}`,
        `${offSelector}{animation:none!important;translate:${state.baseOffsetX}px ${state.baseOffsetY}px!important;` +
          `scale:${state.baseScale}!important;opacity:${state.baseOpacity}!important}`,
        `@media(prefers-reduced-motion:reduce){${selector}{animation:none!important;` +
          `translate:${state.baseOffsetX}px ${state.baseOffsetY}px!important;` +
          `scale:${state.baseScale}!important;opacity:${state.baseOpacity}!important}}`,
      );
    }
    visualMotionStyle.textContent = rules.join("\n");
  };
// TESSALUME_RUNTIME_FRAGMENT: resolved artwork settings and incremental image updates
const setVisualSettings = async (settings = {}, imageDataUrls = Object.create(null)) => {
    const html = visualSettingsTarget;
    const readPercent = (value, fallback, minimum, maximum) => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
    };
    const readChoice = (value, fallback, choices) => {
      const candidate = String(value || "").trim().toLowerCase();
      return choices.includes(candidate) ? candidate : fallback;
    };
    const readColor = (value) => /^#[0-9a-f]{6}$/i.test(String(value || ""))
      ? String(value).toUpperCase()
      : "#000000";
    const rgba = (hex, opacity) => {
      const value = Number.parseInt(hex.slice(1), 16);
      return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${opacity})`;
    };
    const nextSlotImageKeys = new Map();
    for (const mode of ["light", "dark"]) {
      for (const region of artworkRegions) {
        if (cardArtworkSlots[region] && !assetAssignments.some(
          ([name]) => name === `--tessalume-asset-${nativeArtworkAssetKey(region, mode)}`,
        )) continue;
        const key = settings?.[mode]?.[region]?.customImageKey;
        if (typeof key === "string" && key) nextSlotImageKeys.set(`${region}-${mode}`, key);
      }
    }

    // Decode every newly referenced image before changing a slot. A malformed or
    // interrupted delta therefore leaves the previously rendered image set intact.
    const preparedImageUrls = new Map();
    try {
      for (const key of new Set(nextSlotImageKeys.values())) {
        if (customImageObjectUrls.has(key)) continue;
        const dataUrl = imageDataUrls?.[key];
        if (typeof dataUrl !== "string" || !dataUrl) {
          throw new Error(`Custom artwork payload missing for fingerprint: ${key}`);
        }
        const objectUrl = createObjectUrl(dataUrl);
        preparedImageUrls.set(key, objectUrl);
        if (!(await readImageDimensions(objectUrl))) {
          throw new Error(`Custom artwork could not be decoded: ${key}`);
        }
      }
    } catch (error) {
      for (const objectUrl of preparedImageUrls.values()) {
        URL.revokeObjectURL(objectUrl);
        visualImageDimensions.delete(objectUrl);
      }
      preparedImageUrls.clear();
      throw error;
    }
    let preparedImagesCommitted = false;
    try {
    visualSlotStates.clear();
    const readability = [];
    for (const mode of ["light", "dark"]) {
      for (const region of artworkRegions) {
        const adjustment = settings?.[mode]?.[region] || {};
        const brightness = readPercent(adjustment.brightness, 100, 20, 180) / 100;
        const contrast = readPercent(adjustment.contrast, 100, 20, 180) / 100;
        const saturation = readPercent(adjustment.saturation, 100, 0, 200) / 100;
        const opacity = readPercent(adjustment.opacity, 100, 0, 100) / 100;
        const zoom = readPercent(adjustment.zoom, 100, 70, 200) / 100;
        const offsetX = readPercent(adjustment.offsetX, 0, -200, 200);
        const offsetY = readPercent(adjustment.offsetY, 0, -200, 200);
        const grayscale = readPercent(adjustment.grayscale, 0, 0, 100) / 100;
        const hueRotation = readPercent(adjustment.hueRotation, 0, -180, 180);
        const blur = readPercent(adjustment.blur, 0, 0, 20);
        const overlayColor = readColor(adjustment.overlayColor);
        const overlayOpacity = readPercent(adjustment.overlayOpacity, 0, 0, 100) / 100;
        const gradientStrength = readPercent(adjustment.gradientStrength, 0, 0, 100) / 100;
        const vignette = readPercent(adjustment.vignette, 0, 0, 100) / 100;
        const blendMode = readChoice(
          adjustment.blendMode,
          "normal",
          [
            "normal", "multiply", "screen", "overlay", "darken", "lighten",
            "color-dodge", "color-burn", "hard-light", "soft-light", "difference",
            "exclusion", "hue", "saturation", "color", "luminosity", "plus-lighter",
          ],
        );
        const compositionMode = readChoice(
          adjustment.compositionMode,
          "theme",
          ["theme", "legacy", "custom"],
        );
        const filterVariable = `--tessalume-visual-${region}-${mode}-filter`;
        const opacityVariable = `--tessalume-visual-${region}-${mode}-opacity`;
        const translateVariable = `--tessalume-visual-${region}-${mode}-translate`;
        const scaleVariable = `--tessalume-visual-${region}-${mode}-scale`;
        const blendVariable = `--tessalume-visual-${region}-${mode}-blend`;
        const cardSlot = cardArtworkSlots[region];
        // Card output has separate variables; native package assets remain immutable.
        const assetVariable = cardSlot
          ? `--tessalume-visual-${region}-${mode}-image`
          : `--tessalume-asset-${region}-${mode}`;
        const maskVariable = `--tessalume-visual-${region}-${mode}-mask-image`;
        const themeAssetKey = typeof adjustment.themeAssetKey === "string" && adjustment.themeAssetKey
          ? adjustment.themeAssetKey.replace(/[^a-z0-9_-]/gi, "-")
          : nativeArtworkAssetKey(region, mode);
        const sourceAssetVariable = `--tessalume-asset-${themeAssetKey}`;
        const originalAssetUrl = assetAssignments.find(
          ([name]) => name === sourceAssetVariable,
        )?.[1] || null;
        const customImageKey = nextSlotImageKeys.get(`${region}-${mode}`);
        const nativeSlotExists = !cardSlot || assetAssignments.some(
          ([name]) => name === `--tessalume-asset-${nativeArtworkAssetKey(region, mode)}`,
        );
        const imageUrl = !nativeSlotExists ? null : customImageKey
          ? customImageObjectUrls.get(customImageKey) || preparedImageUrls.get(customImageKey)
          : originalAssetUrl;
        if (imageUrl) {
          const imageLayers = [];
          const maskLayers = [];
          if (vignette > 0) {
            imageLayers.push(`radial-gradient(circle at center,transparent 45%,rgba(0,0,0,${Math.min(.78, vignette * .78)}) 100%)`);
          }
          let gradientVeil = adjustment.gradientVeil || {};
          let readabilityVeil = adjustment.readabilityVeil || {};
          const surfaceWidth = artworkSurface(region).element?.getBoundingClientRect().width ||
            window.innerWidth;
          for (const variant of adjustment.responsiveVariants || []) {
            const minimum = Number(variant?.minWidth);
            const maximum = Number(variant?.maxWidth);
            if ((Number.isFinite(minimum) && surfaceWidth < minimum) ||
                (Number.isFinite(maximum) && surfaceWidth > maximum)) continue;
            if (variant?.gradientVeil) gradientVeil = variant.gradientVeil;
            if (variant?.readabilityVeil) readabilityVeil = variant.readabilityVeil;
          }
          if (gradientVeil?.enabled === true) {
            const strength = readPercent(gradientVeil.strength, 100, 0, 100) / 100;
            const configuredLayers = Array.isArray(gradientVeil.layers)
              ? gradientVeil.layers.slice(0, 8)
              : [];
            if (configuredLayers.length) {
              for (const layer of configuredLayers) {
                const stops = Array.isArray(layer?.stops) ? layer.stops.slice(0, 16) : [];
                if (!stops.length) continue;
                const stopCss = stops.map((stop) => {
                  const color = readColor(stop?.color);
                  const stopOpacity = readPercent(stop?.opacity, 0, 0, 100) / 100;
                  const position = readPercent(stop?.position, 0, 0, 100);
                  return `${rgba(color, Math.min(1, stopOpacity * strength))} ${position}%`;
                }).join(",");
                maskLayers.push(`linear-gradient(${finite(layer?.directionDeg, 90)}deg,${stopCss})`);
              }
            } else if (strength > 0) {
              // Deterministic schema-five compatibility for the former single veil.
              maskLayers.push(`linear-gradient(90deg,${rgba(overlayColor, Math.min(.82, strength * .82))},transparent 72%)`);
            }
          }
          if (gradientStrength > 0) {
            maskLayers.push(`linear-gradient(90deg,${rgba(overlayColor, Math.min(.82, gradientStrength * .82))},transparent 72%)`);
          }
          if (readabilityVeil?.enabled === true) {
            const color = readColor(readabilityVeil.color);
            const veilOpacity = readPercent(readabilityVeil.opacity, 0, 0, 100) / 100;
            const direction = finite(readabilityVeil.directionDeg, 90);
            const start = readPercent(readabilityVeil.rangeStart, 0, 0, 100);
            const end = readPercent(readabilityVeil.rangeEnd, 100, 0, 100);
            maskLayers.push(
              `linear-gradient(${direction}deg,${rgba(color, veilOpacity)} ${start}%,transparent ${end}%)`,
            );
          }
          let overlayLayer = null;
          if (overlayOpacity > 0) {
            overlayLayer = `linear-gradient(${rgba(overlayColor, Math.min(.86, overlayOpacity * .86))},${rgba(overlayColor, Math.min(.86, overlayOpacity * .86))})`;
          }
          if (region === "chat") {
            html.style.setProperty(
              maskVariable,
              maskLayers.length ? maskLayers.join(",") : "none",
            );
            visualSettingVariables.add(maskVariable);
          } else {
            imageLayers.push(...maskLayers);
          }
          if (overlayLayer) imageLayers.push(overlayLayer);
          imageLayers.push(`url("${imageUrl}")`);
          html.style.setProperty(assetVariable, imageLayers.join(","));
          visualSettingVariables.add(assetVariable);
          const state = {
            region,
            mode,
            placement: adjustment.placement || {
              sizeMode: "Cover",
              positionX: { kind: "Center" },
              positionY: { kind: "Center" },
              geometry: { scale: 1 },
            },
            imageUrl,
            overlayCount: imageLayers.length - 1,
            adjustment,
            assetVariable,
            maskVariable,
            baseOffsetX: compositionMode === "legacy" ? offsetX : 0,
            baseOffsetY: compositionMode === "legacy" ? offsetY : 0,
            baseScale: compositionMode === "legacy" ? zoom : 1,
            baseOpacity: opacity,
          };
          visualSlotStates.set(`${region}-${mode}`, state);
          const rawPlacement = placementCss(state.placement, state.region);
          setPlacementVariables(state, rawPlacement.size, rawPlacement.position);
        } else {
          // An absent key explicitly means "use the theme original". Removing the
          // prior variable also handles packages that do not define this slot.
          html.style.removeProperty(assetVariable);
          if (region === "chat") html.style.removeProperty(maskVariable);
        }
        html.style.setProperty(
          filterVariable,
          `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) grayscale(${grayscale}) hue-rotate(${hueRotation}deg) blur(${blur}px)`,
        );
        html.style.setProperty(opacityVariable, String(opacity));
        html.style.setProperty(
          translateVariable,
          compositionMode === "legacy" ? `${offsetX}px ${offsetY}px` : "0px 0px",
        );
        html.style.setProperty(scaleVariable, compositionMode === "legacy" ? String(zoom) : "1");
        html.style.setProperty(blendVariable, blendMode);
        visualSettingVariables.add(filterVariable);
        visualSettingVariables.add(opacityVariable);
        visualSettingVariables.add(translateVariable);
        visualSettingVariables.add(scaleVariable);
        visualSettingVariables.add(blendVariable);
        if (adjustment.readabilityProtection === true ||
            adjustment.readabilityVeil?.enabled === true) readability.push(`${region}-${mode}`);
      }
    }
    html.dataset.tessalumeReadability = readability.join(" ");
    html.dataset.tessalumeVisualPlacement = Array.from(visualSlotStates.keys()).join(" ");
    const display = settings?.display || {};
    html.dataset.tessalumeMotion = readChoice(
      display.motionIntensity,
      "full",
      ["full", "reduced", "off"],
    );
    html.dataset.tessalumeTextScale = readChoice(
      display.textScale,
      "standard",
      ["small", "standard", "large"],
    );
    html.dataset.tessalumeDensity = readChoice(
      display.density,
      "comfortable",
      ["compact", "comfortable", "spacious"],
    );
    rebuildVisualMotionStyle();
    if (appearanceCommitted) syncDisplayPreferences();
    for (const [key, objectUrl] of preparedImageUrls) customImageObjectUrls.set(key, objectUrl);
    customSlotImageKeys.clear();
    for (const [slot, key] of nextSlotImageKeys) customSlotImageKeys.set(slot, key);
    const activeImageKeys = new Set(customSlotImageKeys.values());
    for (const [key, objectUrl] of customImageObjectUrls) {
      if (activeImageKeys.has(key)) continue;
      URL.revokeObjectURL(objectUrl);
      visualImageDimensions.delete(objectUrl);
      customImageObjectUrls.delete(key);
    }
    preparedImagesCommitted = true;
    visualPlacementRevision += 1;
    await synchronizeVisualPlacements(visualPlacementRevision);
    return true;
    } finally {
      if (!preparedImagesCommitted) {
        for (const objectUrl of preparedImageUrls.values()) {
          URL.revokeObjectURL(objectUrl);
          visualImageDimensions.delete(objectUrl);
        }
      }
    }
  };
// TESSALUME_RUNTIME_FRAGMENT: semantic page recognition, route state, and stable surface discovery
const mountCanonicalTheme = (spec) => {
    if (!spec || typeof spec !== "object") {
      throw new TypeError("mountCanonicalTheme expects a theme specification");
    }
    const namespace = String(spec.namespace || "");
    const themeClass = String(spec.themeClass || "");
    const templateVersion = spec.templateVersion == null
      ? ""
      : String(spec.templateVersion);
    if (!/^[a-z][a-z0-9]*$/.test(namespace) || !themeClass) {
      throw new TypeError("Canonical themes require a lowercase namespace and themeClass");
    }
    if (templateVersion && templateVersion !== "1.0") {
      throw new TypeError(`Unsupported canonical theme template: ${templateVersion}`);
    }

    const html = document.documentElement;
    let marked = [];
    let surfaced = [];
    let themeDisposed = false;
    let ensureTimer = 0;
    let layoutResizeObserver = null;
    let layoutObserved = new Set();
    let layoutFrame = 0;
    let layoutTrackingStartedAt = 0;
    let layoutLastSignature = "";
    let layoutStableFrames = 0;
    let taskTitleWidthManaged = false;
    let taskTitleWidthPrevious = "";
    const chatCanvasStyles = new Map();
    const adaptiveLayout = spec.adaptiveLayout === true ||
      (spec.adaptiveLayout && typeof spec.adaptiveLayout === "object");

    const roleClass = (role) => `${namespace}-${role}`;
    const dataName = (name) => `data-${namespace}-${name}`;
    const validateTemplateStructure = () => {
      if (templateVersion !== "1.0") return;
      const stage = root.querySelectorAll("[data-theme-stage]");
      const role = (name) =>
        Array.from(root.querySelectorAll(`[data-theme-role="${name}"]`));
      const exactlyOne = [
        "hero",
        "identity",
        "task-left",
        "memory",
        "sync-panel",
        "composer-accessory",
      ];
      if (stage.length !== 1 || stage[0].parentElement !== root) {
        throw new TypeError("Template 1.0 requires one root-level data-theme-stage");
      }
      for (const name of exactlyOne) {
        const nodes = role(name);
        if (nodes.length !== 1) {
          throw new TypeError(`Template 1.0 requires exactly one ${name} role`);
        }
      }
      const rightCards = role("task-right");
      const primary = rightCards.filter(
        (node) => node.getAttribute("data-theme-priority") === "primary",
      );
      const secondary = rightCards.filter(
        (node) => node.getAttribute("data-theme-priority") === "secondary",
      );
      if (rightCards.length !== 2 || primary.length !== 1 || secondary.length !== 1) {
        throw new TypeError(
          "Template 1.0 requires one primary and one secondary task-right card",
        );
      }
      const stageNode = stage[0];
      for (const name of ["hero", "identity", "task-left", "task-right", "memory"]) {
        if (role(name).some((node) => !stageNode.contains(node))) {
          throw new TypeError(`Template 1.0 requires ${name} inside data-theme-stage`);
        }
      }
      for (const name of ["sync-panel", "composer-accessory"]) {
        if (role(name)[0].parentElement !== root) {
          throw new TypeError(`Template 1.0 requires root-level ${name}`);
        }
      }
      if (role("sync-panel")[0].getAttribute("data-theme-priority") !== "secondary") {
        throw new TypeError(
          "Template 1.0 sync-panel must hide with the secondary task card",
        );
      }
      root.setAttribute("data-tessalume-template-version", templateVersion);
    };
const mark = (node, className) => {
      if (!node || node.classList.contains(className)) return node;
      node.classList.add(className);
      marked.push([node, className]);
      return node;
    };
    const markSurface = (node, surface) => {
      if (!node) return node;
      const previous = node.getAttribute("data-tessalume-surface");
      if (previous === surface) return node;
      node.setAttribute("data-tessalume-surface", surface);
      surfaced.push([node, previous]);
      return node;
    };
    const markMessage = (node, role) => {
      if (!node) return node;
      const previous = node.getAttribute("data-tessalume-message");
      if (previous === role) return node;
      node.setAttribute("data-tessalume-message", role);
      surfaced.push([node, previous, "data-tessalume-message"]);
      return node;
    };
    const setData = (node, name, value) => {
      if (!node) return;
      const next = String(value), attribute = dataName(name);
      if (node.getAttribute(attribute) !== next) node.setAttribute(attribute, next);
    };
    // Full-view file tabs retain the chat DOM offscreen. Size alone is not a
    // visibility signal: that hidden chat can still have a 792px-wide editor.
    const isVisibleSurface = (node, options = null) => {
      if (!node?.isConnected || node.closest('[hidden],[aria-hidden="true"]')) return false;
      const inertScope = options?.allowSelfInert === true ? node.parentElement : node;
      if (inertScope?.closest('[inert]')) return false;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const pane = node.closest('[data-app-shell-main-content-layout]');
      if (pane && pane !== node) {
        const clip = pane.getBoundingClientRect();
        if (Math.min(box.right, clip.right) - Math.max(box.left, clip.left) <= 1 ||
            Math.min(box.bottom, clip.bottom) - Math.max(box.top, clip.top) <= 1) return false;
      }
      return box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > 0 &&
        box.left < window.innerWidth && box.top < window.innerHeight &&
        style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse";
    };
    // Submission disables the native shell with inert; it remains visible and
    // still defines the space available for cards. Inert page ancestors still
    // exclude offscreen/hidden tabs, as do all the usual visibility checks.
    const isVisibleComposerSurface = (node) => isVisibleSurface(node, { allowSelfInert: true });
    const findHome = () => {
      // The native home icon is decorative and now carries aria-hidden itself.
      // Only hidden ancestors exclude its page; the icon remains a route marker.
      const icon = queryAll(findMain(), "homeIcon", ['[data-testid="home-icon"]']).find((node) =>
        !node.closest('[hidden],[inert]') &&
        !node.parentElement?.closest('[aria-hidden="true"]') &&
        isVisibleSurface(closestFirst(node, "homeAncestor", ['[role="main"]', "main"])));
      const home = closestFirst(icon, "homeAncestor", ['[role="main"]', "main"]);
      if (!isVisibleSurface(home)) return null;
      const markHomePart = (node, part) => {
        if (!node || node.getAttribute("data-tessalume-home-part") === part) return;
        const previous = node.getAttribute("data-tessalume-home-part");
        node.setAttribute("data-tessalume-home-part", part);
        surfaced.push([node, previous, "data-tessalume-home-part"]);
      };
      const banner = icon.parentElement?.parentElement?.parentElement?.parentElement;
      if (banner && home.contains(banner)) {
        markHomePart(home.firstElementChild, "layout");
        markHomePart(banner.parentElement, "hero-region");
        markHomePart(banner, "banner");
        markHomePart(banner.firstElementChild, "banner-inner");
        markHomePart(banner.firstElementChild?.firstElementChild, "native-title");
      }
      const editor = queryFirst(home, "composerEditor", ['[data-codex-composer="true"]']);
      const composerCarrier = editor?.closest('[class*="z-20"][class*="pb-4"]');
      markHomePart(composerCarrier, "composer-carrier");
      return home;
    };
    const findMain = () => queryAll(
      document,
      "main",
      [
        'main[data-app-shell-main-surface="default"]',
        'main[class*="MainContentSurface"]',
        "main.main-surface",
        "main",
      ],
    ).find(isVisibleSurface) || null;
    const findTaskWorkspace = (main = findMain()) =>
      queryAll(main, "workspace", [".thread-scroll-container"]).find(isVisibleSurface) || null;
    const findComposerSurface = () => {
      const scope = findTaskWorkspace() || findHome();
      if (!scope) return null;
      // The native shell survives submission and read-only previews. The
      // editor's data-codex-composer flag is assigned later by a React effect
      // and can disappear while the shell still occupies the same space.
      const nativeSurface = queryAll(
        scope,
        "composerNativeSurface",
        ['[data-composer-surface-variant]'],
      ).find(isVisibleComposerSurface);
      const legacySurface = queryAll(
        scope,
        "composerLegacySurface",
        [".composer-surface-chrome"],
      ).find(isVisibleComposerSurface);
      const editor = queryAll(
        scope,
        "composerEditor",
        ['[data-codex-composer="true"]'],
      ).find(isVisibleSurface);
      const surface = nativeSurface || legacySurface ||
        closestFirst(editor, "composerRootAncestor", ['[class*="ComposerLayoutRoot"]']) ||
        closestFirst(editor, "composerBodyAncestor", ['[class*="ComposerLayoutBody"]'])?.parentElement ||
        null;
      if (!surface || !scope.contains(surface) || !isVisibleComposerSurface(surface)) return null;

      // Codex renamed both the composer root and footer CSS-module classes in
      // mid-2026. Keep the stable Tessalume aliases at the compatibility layer
      // so every existing theme can continue styling the native composer.
      mark(surface, "composer-surface-chrome");
      // Newer Codex footers split the backdrop into a short gradient and a
      // solid floor. Only clear the empty, noninteractive decoration beside
      // this composer; the editor and status/control surfaces keep their skin.
      const scrollFooter = surface.closest('[data-thread-scroll-footer="true"]');
      if (scrollFooter && scope.contains(scrollFooter)) {
        for (const backdrop of scrollFooter.children) {
          if (backdrop.getAttribute("aria-hidden") !== "true" ||
              backdrop.childNodes.length !== 0) continue;
          const backdropStyle = getComputedStyle(backdrop);
          if (backdropStyle.position === "absolute" &&
              backdropStyle.pointerEvents === "none") {
            mark(backdrop, "tessalume-composer-native-fade");
          }
        }
      }
      const surfaceBox = surface.getBoundingClientRect();
      let bottomCarrier = surface.parentElement;
      while (bottomCarrier && bottomCarrier !== document.body) {
        const carrierStyle = getComputedStyle(bottomCarrier);
        const carrierBottom = parseFloat(carrierStyle.bottom);
        const carrierBox = bottomCarrier.getBoundingClientRect();
        const isBottomPositioned = carrierStyle.position === "sticky" ||
          carrierStyle.position === "absolute" ||
          carrierStyle.position === "fixed";
        if (isBottomPositioned &&
            Number.isFinite(carrierBottom) &&
            Math.abs(carrierBottom) < .5 &&
            carrierBox.width >= surfaceBox.width) {
          break;
        }
        bottomCarrier = bottomCarrier.parentElement;
      }
      if (bottomCarrier && bottomCarrier !== document.body) {
        const carrierBox = bottomCarrier.getBoundingClientRect();
        // Current Codex builds place the native fade outside the composer
        // carrier in a sibling sticky spacer. Search their nearest shared
        // layout parent so both the legacy nested and current sibling shapes work.
        const fadeSearchRoot = bottomCarrier.parentElement || bottomCarrier;
        const nativeFade = Array.from(fadeSearchRoot.querySelectorAll(
          '[class*="gradient"],[class*="from-surface"],[style*="gradient"]',
        ))
          .find((node) => {
            if (node === surface || node.contains(surface) || surface.contains(node)) return false;
            const style = getComputedStyle(node);
            if (style.pointerEvents !== "none" || style.position !== "absolute") return false;
            const className = typeof node.className === "string" ? node.className : "";
            if (!style.backgroundImage.includes("linear-gradient") &&
                !className.includes("bg-gradient")) return false;
            const box = node.getBoundingClientRect();
            return box.width >= carrierBox.width * .8 &&
              box.height >= surfaceBox.height &&
              Math.abs(box.bottom - carrierBox.bottom) < 2;
          });
        mark(nativeFade, "tessalume-composer-native-fade");
        const nativeFadeCarrier = nativeFade?.parentElement;
        if (nativeFadeCarrier && !nativeFadeCarrier.contains(surface)) {
          mark(nativeFadeCarrier, "tessalume-composer-fade-carrier");
        }
      }
      const footer = queryFirst(
        surface,
        "composerFooter",
        ['[class*="ComposerLayoutFooter"]', '[class*="_footer_"]'],
      );
      if (footer && !footer.matches('[class*="_footer_"]')) mark(footer, "_footer_");
      return surface;
    };
    const findSettingsSurface = (main = findMain()) => {
      if (!main) return null;
      const configuredSurface = queryAll(
        main,
        "settingsSurface",
        [".main-surface.flex.h-full.min-h-0.flex-col"],
      ).find((surface) => queryFirst(
        surface,
        "settingsScrollChild",
        [":scope > .scrollbar-stable.flex-1.overflow-y-auto.p-panel"],
      ));
      if (configuredSurface) return configuredSurface;

      // Codex 26.810 removed the legacy main-surface token from the settings
      // carrier but retained its dedicated panel scroll viewport. Resolve the
      // carrier from that stable child instead of binding route recognition to
      // utility classes on the replaceable outer element.
      const settingsScrollChild = queryFirst(
        main,
        "settingsScrollChild",
        [
          ".scrollbar-stable.flex-1.overflow-y-auto.p-panel",
          '[data-app-shell-main-content-layout="full-bleed"] .flex-1.scrollbar-stable.overflow-y-auto:has([class*="_shell_"])',
        ],
      );
      return settingsScrollChild?.parentElement || null;
    };
    const syncRouteState = () => {
      const home = findHome();
      const isHome = Boolean(home);
      const settingsSurface = findSettingsSurface();
      const isSettings = isVisibleSurface(settingsSurface);
      const workspace = !isHome && !isSettings ? findTaskWorkspace() : null;
      const isTask = Boolean(workspace);
      const scope = workspace || home;
      for (const [node, className] of marked) {
        if (className === "composer-surface-chrome" &&
            (!scope?.contains(node) || !isVisibleComposerSurface(node))) {
          node.classList.remove(className);
          if (node.getAttribute("data-tessalume-surface") === "composer")
            node.removeAttribute("data-tessalume-surface");
        }
      }
      mark(settingsSurface, roleClass("settings-surface"));
      markSurface(settingsSurface, "settings");
      html.classList.toggle(roleClass("is-home"), isHome);
      html.classList.toggle(roleClass("is-task"), isTask);
      html.classList.toggle(roleClass("is-settings"), isSettings);
      html.classList.toggle("tessalume-is-home", isHome);
      html.classList.toggle("tessalume-is-task", isTask);
      html.classList.toggle("tessalume-is-settings", isSettings);
      const pageKind = isHome ? "home" : isTask ? "task" : isSettings ? "settings" : "other";
      if (root.getAttribute("data-tessalume-page-kind") !== pageKind)
        root.setAttribute("data-tessalume-page-kind", pageKind);
      const nativeTabs = queryAll(document, "nativeTabStrip", ['[data-app-shell-tab-row="true"]'])
        .some(isVisibleSurface);
      const nativeTabValue = String(nativeTabs);
      if (root.getAttribute("data-tessalume-native-tab-strip") !== nativeTabValue)
        root.setAttribute("data-tessalume-native-tab-strip", nativeTabValue);
      return home;
    };
    const findStage = () =>
      root.querySelector("[data-theme-stage]") || root.querySelector(`.${roleClass("stage")}`);
    const syncStageGeometry = (main, stage) => {
      if (!main || !stage) return "";
      const box = main.getBoundingClientRect();
      if (!(box.width > 0 && box.height > 0)) return "";
      const workspace = findTaskWorkspace(main);
      const workspaceBox = workspace?.getBoundingClientRect();
      const canvasBox = workspaceBox && workspaceBox.width > 0 &&
        workspaceBox.left >= box.left && workspaceBox.right <= box.right + 1
        ? workspaceBox
        : box;
      const pixels = (value) => `${Math.round(value * 100) / 100}px`;
      if (!chatCanvasStyles.has(main)) {
        chatCanvasStyles.set(main, {
          left: main.style.getPropertyValue("--tessalume-chat-canvas-left"),
          width: main.style.getPropertyValue("--tessalume-chat-canvas-width"),
        });
      }
      main.style.setProperty("--tessalume-chat-canvas-left", pixels(canvasBox.left - box.left));
      main.style.setProperty("--tessalume-chat-canvas-width", pixels(canvasBox.width));
      const geometry = {
        left: pixels(canvasBox.left),
        top: pixels(box.top),
        width: pixels(canvasBox.width),
        height: pixels(box.height),
      };
      for (const [property, value] of Object.entries(geometry)) {
        if (stage.style[property] !== value) stage.style[property] = value;
      }
      return [canvasBox.left, box.top, canvasBox.width, box.height]
        .map((value) => Math.round(value * 4) / 4)
        .join(":");
    };
// TESSALUME_RUNTIME_FRAGMENT: effective motion, text-scale, and density preferences
const MotionReductionFactor = .55;
    const TextScaleFactors = Object.freeze({ small:.9, standard:1, large:1.16 });
    const textStyles = new Map();
    const densityStyles = new Map();
    const animationRates = new Map();
    const animationFrames = new Map();
    let preferenceFrame = 0;
    let appliedPreferenceSignature = "";
    const preferenceSignature = () => [html.dataset.tessalumeTextScale || "standard",
      html.dataset.tessalumeDensity || "comfortable", html.dataset.tessalumeMotion || "full"].join(":");

    const removeLegacyReducedMotionRule = () => {
      const sheet = style.sheet;
      if (!sheet) return;
      try {
        for (let index = sheet.cssRules.length - 1; index >= 0; index -= 1) {
          const rule = sheet.cssRules[index];
          if (rule instanceof CSSStyleRule &&
              rule.selectorText.includes('data-tessalume-motion="reduced"') &&
              rule.style.getPropertyValue("animation-duration").trim() === ".8s") {
            sheet.deleteRule(index);
          }
        }
      } catch { }
    };
    removeLegacyReducedMotionRule();

    const ensureStyleRecord = (registry, node) => {
      let record = registry.get(node);
      if (!record) {
        record = { inline:new Map(), metrics:Object.create(null) };
        registry.set(node, record);
      }
      return record;
    };
    const rememberInlineStyle = (record, node, property) => {
      if (record.inline.has(property)) return;
      record.inline.set(property, {
        value:node.style.getPropertyValue(property),
        priority:node.style.getPropertyPriority(property),
      });
    };
    const setManagedStyle = (registry, node, property, value) => {
      const record = ensureStyleRecord(registry, node);
      rememberInlineStyle(record, node, property);
      if (node.style.getPropertyValue(property) !== value || node.style.getPropertyPriority(property) !== "important")
        node.style.setProperty(property, value, "important");
      return record;
    };
    const restoreManagedStyles = (registry) => {
      for (const [node, record] of registry) {
        if (!node?.style) continue;
        for (const [property, previous] of record.inline) {
          if (previous.value) {
            node.style.setProperty(property, previous.value, previous.priority);
          } else {
            node.style.removeProperty(property);
          }
        }
      }
      registry.clear();
    };
    const withNeutralPreference = (datasetName, neutralValue, callback) => {
      const previous = html.dataset[datasetName];
      html.dataset[datasetName] = neutralValue;
      try { return callback(); }
      finally {
        if (previous == null) delete html.dataset[datasetName];
        else html.dataset[datasetName] = previous;
      }
    };
    const finitePixels = (value, fallback = 0) => {
      const number = Number.parseFloat(value);
      return Number.isFinite(number) ? number : fallback;
    };
    const pixels = (value) => `${Math.round(value * 100) / 100}px`;

    const cloneKeyframes = (effect) => effect.getKeyframes().map((frame) => {
      const copy = { ...frame };
      delete copy.computedOffset;
      return copy;
    });
    const softenTransform = (reference, value) => {
      if (!reference || !value || reference === "none" || value === "none") return value;
      try {
        const origin = new DOMMatrixReadOnly(reference);
        const target = new DOMMatrixReadOnly(value);
        const names = [
          "m11", "m12", "m13", "m14", "m21", "m22", "m23", "m24",
          "m31", "m32", "m33", "m34", "m41", "m42", "m43", "m44",
        ];
        const values = names.map((name) =>
          origin[name] + ((target[name] - origin[name]) * MotionReductionFactor));
        return `matrix3d(${values.join(",")})`;
      } catch {
        return value;
      }
    };
    const softenKeyframes = (frames) => {
      const reference = frames.find((frame) => frame.transform && frame.transform !== "none")?.transform;
      if (!reference) return frames;
      return frames.map((frame) => frame.transform ? {
        ...frame,
        transform:softenTransform(reference, frame.transform),
      } : { ...frame });
    };

    const textTargetSelector = [
        "p", "li", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6",
        "blockquote", "figcaption", "label", "button", "a", "input", "textarea",
        "code", "pre", "span", "[role='button']", "[role='textbox']",
        "[contenteditable='true']", "[data-user-message-bubble='true']",
        "[data-app-action-sidebar-project-row]", "[data-app-action-sidebar-thread-row]",
      ].join(",");
    const textSurfaceSelector = '[data-tessalume-surface="main"],[data-tessalume-surface="sidebar"]';
    const isTextTarget = (node) => node.isConnected && !root.contains(node) && !node.closest("svg") &&
      node.getAttribute("aria-hidden") !== "true" &&
      (node.matches("input,textarea,[contenteditable='true']") || /\S/.test(node.textContent || ""));
    const collectTextTargets = () => {
      const targets = new Set();
      document.querySelectorAll(
        textSurfaceSelector,
      ).forEach((surface) => {
        if (root.contains(surface)) return;
        if (surface.matches(textTargetSelector)) targets.add(surface);
        surface.querySelectorAll(textTargetSelector).forEach((node) => targets.add(node));
      });
      return Array.from(targets).filter(isTextTarget);
    };
    const applyTextScale = () => {
      const mode = html.dataset.tessalumeTextScale || "standard";
      const factor = TextScaleFactors[mode] || 1;
      if (factor === 1) {
        restoreManagedStyles(textStyles);
        return;
      }

      const targets = collectTextTargets();
      const measurements = withNeutralPreference("tessalumeTextScale", "standard", () =>
        targets.map((node) => {
          const record = ensureStyleRecord(textStyles, node);
          if (record.metrics.fontSize == null) {
            const computed = getComputedStyle(node);
            record.metrics.fontSize = finitePixels(computed.fontSize);
            const lineHeight = finitePixels(computed.lineHeight, Number.NaN);
            record.metrics.lineHeight = Number.isFinite(lineHeight) ? lineHeight : null;
          }
          return [node, record];
        }));

      for (const [node, record] of measurements) {
        if (!(record.metrics.fontSize > 0)) continue;
        setManagedStyle(textStyles, node, "font-size", pixels(record.metrics.fontSize * factor));
        if (record.metrics.lineHeight > 0) {
          setManagedStyle(textStyles, node, "line-height", pixels(record.metrics.lineHeight * factor));
        }
      }
    };

    const measureDensityTarget = (node, kind) => {
      const record = ensureStyleRecord(densityStyles, node);
      if (record.metrics.kind) return record;
      const computed = getComputedStyle(node);
      record.metrics.kind = kind;
      record.metrics.paddingTop = finitePixels(computed.paddingTop);
      record.metrics.paddingBottom = finitePixels(computed.paddingBottom);
      record.metrics.marginTop = finitePixels(computed.marginTop);
      record.metrics.marginBottom = finitePixels(computed.marginBottom);
      record.metrics.height = finitePixels(computed.height);
      record.metrics.minHeight = Math.max(
        finitePixels(computed.minHeight),
        record.metrics.height,
      );
      return record;
    };
    const applyDensity = () => {
      const mode = html.dataset.tessalumeDensity || "comfortable";
      if (mode === "comfortable") {
        restoreManagedStyles(densityStyles);
        return;
      }

      const messages = Array.from(document.querySelectorAll("[data-tessalume-message]"))
        .filter((node) => node.isConnected && !root.contains(node));
      const sidebarRows = Array.from(document.querySelectorAll(
        '[data-tessalume-surface="sidebar"] :is([data-app-action-sidebar-project-row],[data-app-action-sidebar-thread-row])',
      )).filter((node) => node.isConnected && !root.contains(node));
      const measured = withNeutralPreference("tessalumeDensity", "comfortable", () => [
        ...messages.map((node) => [node, measureDensityTarget(node, "message")]),
        ...sidebarRows.map((node) => [node, measureDensityTarget(node, "sidebar-row")]),
      ]);

      for (const [node, record] of measured) {
        const metric = record.metrics;
        if (metric.kind === "message") {
          const paddingDelta = mode === "compact" ? -4 : 10;
          const margin = mode === "compact" ? -4 : 10;
          setManagedStyle(densityStyles, node, "padding-top", pixels(Math.max(0, metric.paddingTop + paddingDelta)));
          setManagedStyle(densityStyles, node, "padding-bottom", pixels(Math.max(0, metric.paddingBottom + paddingDelta)));
          setManagedStyle(densityStyles, node, "margin-top", pixels(margin));
          setManagedStyle(densityStyles, node, "margin-bottom", pixels(margin));
        } else {
          const heightDelta = mode === "compact" ? -8 : 10;
          const paddingDelta = mode === "compact" ? -3 : 5;
          const targetHeight = Math.max(30, metric.height + heightDelta);
          setManagedStyle(densityStyles, node, "height", pixels(targetHeight));
          setManagedStyle(densityStyles, node, "min-height", pixels(Math.max(targetHeight, metric.minHeight + heightDelta)));
          setManagedStyle(densityStyles, node, "padding-top", pixels(Math.max(1, metric.paddingTop + paddingDelta)));
          setManagedStyle(densityStyles, node, "padding-bottom", pixels(Math.max(1, metric.paddingBottom + paddingDelta)));
        }
      }
    };

    const applyMotionIntensity = () => {
      const reduced = html.dataset.tessalumeMotion === "reduced";
      for (const animation of root.getAnimations({ subtree:true })) {
        if (!animationRates.has(animation)) {
          const baseRate = Number.isFinite(animation.playbackRate) && animation.playbackRate !== 0
            ? animation.playbackRate
            : 1;
          animationRates.set(animation, baseRate);
        }
        const baseRate = animationRates.get(animation);
        const targetRate = reduced ? baseRate * MotionReductionFactor : baseRate;
        try {
          const effect = animation.effect;
          if (effect && typeof effect.getKeyframes === "function" && typeof effect.setKeyframes === "function") {
            if (!animationFrames.has(animation)) animationFrames.set(animation, cloneKeyframes(effect));
            const frames = animationFrames.get(animation);
            effect.setKeyframes(reduced ? softenKeyframes(frames) : frames);
          }
        } catch { }
        try {
          if (typeof animation.updatePlaybackRate === "function") {
            animation.updatePlaybackRate(targetRate);
          } else {
            animation.playbackRate = targetRate;
          }
        } catch {
          // A detached CSS animation must not block text or density updates.
        }
      }
    };
    const applyDisplayPreferences = () => {
      preferenceFrame = 0;
      if (themeDisposed) return;
      applyMotionIntensity();
      applyTextScale();
      applyDensity();
      appliedPreferenceSignature = preferenceSignature();
    };
    const scheduleDisplayPreferences = () => {
      if (themeDisposed || preferenceFrame) return;
      preferenceFrame = requestAnimationFrame(applyDisplayPreferences);
    };

    syncDisplayPreferences = scheduleDisplayPreferences;
    const preferenceObserver = new MutationObserver((mutations) => {
      if (runtimePerformance && appliedPreferenceSignature === preferenceSignature() && mutations.every((mutation) => {
        if (!isStableTextMutation(mutation)) return false;
        if ((TextScaleFactors[html.dataset.tessalumeTextScale || "standard"] || 1) === 1) return true;
        // An empty p/span can acquire its first text without adding an element.
        // Check just this ancestor chain for newly eligible scale targets.
        const target = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
        for (let node = target; node; node = node.parentElement) {
          if (node.matches(textTargetSelector) && isTextTarget(node) && node.closest(textSurfaceSelector) && !textStyles.has(node)) return false;
        }
        return true;
      })) return;
      scheduleDisplayPreferences();
    });
    preferenceObserver.observe(document.documentElement, { childList:true, subtree:true });
    addCleanup(() => {
      preferenceObserver.disconnect();
      if (preferenceFrame) cancelAnimationFrame(preferenceFrame);
      preferenceFrame = 0;
      restoreManagedStyles(textStyles);
      restoreManagedStyles(densityStyles);
      for (const [animation, baseRate] of animationRates) {
        try {
          if (typeof animation.updatePlaybackRate === "function") animation.updatePlaybackRate(baseRate);
          else animation.playbackRate = baseRate;
        } catch { }
      }
      animationRates.clear();
      animationFrames.clear();
      syncDisplayPreferences = () => {};
    });
    scheduleDisplayPreferences();
// TESSALUME_RUNTIME_FRAGMENT: responsive geometry, collision handling, and layout observers
    const positionComposerAccessory = (main, selector, size = 76, gap = 18) => {
      const accessory = root.querySelector(selector);
      const composer = findComposerSurface();
      if (!main || !accessory || !composer) return;
      const mainBox = findStage()?.getBoundingClientRect() || main.getBoundingClientRect();
      const composerBox = composer.getBoundingClientRect();
      const left = Math.max(mainBox.left + 14, Math.round(composerBox.left - size - gap));
      const top = Math.max(
        mainBox.top + 56,
        Math.min(
          Math.round(mainBox.bottom - size - 22),
          Math.round(composerBox.top + (composerBox.height - size) / 2),
        ),
      );
      Object.assign(accessory.style, { left:`${left}px`, top:`${top}px`, right:"auto", bottom:"auto" });
    };
    const positionPanelAboveCards = (main, panelSelector, cardSelectors, width, height, gap = 14) => {
      const panel = root.querySelector(panelSelector);
      const cards = cardSelectors.map((selector) => root.querySelector(selector));
      if (!main || !panel || cards.some((card) => !card)) return;
      const cardMetrics = cards.map((card) => {
        const style = window.getComputedStyle(card);
        return {
          width: Number.parseFloat(style.width),
          height: Number.parseFloat(style.height),
          right: Number.parseFloat(style.right),
          bottom: Number.parseFloat(style.bottom),
        };
      });
      if (!cardMetrics.flatMap((item) => Object.values(item)).every(Number.isFinite)) return;
      const mainBox = findStage()?.getBoundingClientRect() || main.getBoundingClientRect();
      const cardsLeft = mainBox.right - Math.max(...cardMetrics.map((item) => item.right + item.width));
      const cardsRight = mainBox.right - Math.min(...cardMetrics.map((item) => item.right));
      const cardsTop = Math.min(...cardMetrics.map((item) => mainBox.bottom - item.bottom - item.height));
      const left = Math.max(mainBox.left + 18, Math.round((cardsLeft + cardsRight - width) / 2));
      const top = Math.max(mainBox.top + 56, Math.round(cardsTop - height - gap));
      Object.assign(panel.style, { left:`${left}px`, top:`${top}px`, right:"auto", bottom:"auto" });
    };
    const setAdaptiveAttribute = (node, name, value) => {
      if (!node) return;
      const next = String(value);
      if (node.getAttribute(name) !== next) node.setAttribute(name, next);
    };
    const setAutoHidden = (node, hidden, reason = "") => {
      if (!node) return;
      setAdaptiveAttribute(node, "data-tessalume-auto-hidden", hidden);
      if (hidden && reason) {
        setAdaptiveAttribute(node, "data-tessalume-auto-hidden-reason", reason);
      } else {
        node.removeAttribute("data-tessalume-auto-hidden-reason");
      }
    };
    const syncTaskTitleWidth = () => {
      if (templateVersion !== "1.0") return;
      const primary = Array.from(document.querySelectorAll(
        '[data-tessalume-surface="task-title"]',
      )).find((node) => isVisibleSurface(node) &&
        (node.matches('[data-app-shell-titlebar-content="true"]') || node.querySelector("button.truncate")));
      if (!primary?.isConnected) {
        if (taskTitleWidthManaged) {
          if (taskTitleWidthPrevious) html.style.setProperty("--tessalume-task-title-primary-width", taskTitleWidthPrevious);
          else html.style.removeProperty("--tessalume-task-title-primary-width");
          taskTitleWidthManaged = false;
        }
        return;
      }

      const primaryBox = primary.getBoundingClientRect();
      if (!(primaryBox.width > 0 && primaryBox.height > 0)) return;

      const header = primary.closest('[data-tessalume-surface="task-header"]');
      const identity = root.querySelector('[data-theme-role="identity"]');
      const secondary = Array.from(header?.querySelectorAll(
        '[data-tessalume-surface="task-title"]',
      ) || []).find((node) => node !== primary &&
        !node.matches('[data-app-shell-titlebar-content="true"]') &&
        !node.querySelector("button.truncate"));
      const boundaries = [identity, secondary]
        .map((node) => node?.getBoundingClientRect())
        .filter((box) => box && box.width > 0 && box.height > 0 && box.left > primaryBox.left + 120)
        .map((box) => box.left);
      const boundary = boundaries.length
        ? Math.min(...boundaries)
        : (findTaskWorkspace()?.getBoundingClientRect().right || window.innerWidth) - 24;
      const available = Math.max(120, Math.floor(boundary - primaryBox.left - 14));
      const variable = "--tessalume-task-title-primary-width";
      if (!taskTitleWidthManaged) {
        taskTitleWidthManaged = true;
        taskTitleWidthPrevious = html.style.getPropertyValue(variable);
      }
      html.style.setProperty(variable, `${available}px`);
    };
    const syncLayoutObservers = (nodes) => {
      if (typeof ResizeObserver !== "function") return;
      if (!layoutResizeObserver) {
        layoutResizeObserver = new ResizeObserver(() => {
          syncLiveLayout();
          startLayoutTracking();
          schedule();
        });
      }
      const next = new Set(nodes.filter(Boolean));
      for (const node of layoutObserved) {
        if (!next.has(node)) layoutResizeObserver.unobserve(node);
      }
      for (const node of next) {
        if (!layoutObserved.has(node)) layoutResizeObserver.observe(node);
      }
      layoutObserved = next;
    };
    const syncAdaptiveVisibility = (main, stage, home) => {
      if (!adaptiveLayout) return;

      const leftRoles = Array.from(root.querySelectorAll(
        '[data-theme-role="task-left"],[data-theme-role="memory"]',
      ));
      const rightRoles = Array.from(root.querySelectorAll(
        '[data-theme-role="task-right"],[data-theme-role="sync-panel"],[data-theme-role="domain"]',
      ));
      const accessories = Array.from(root.querySelectorAll(
        '[data-theme-role="composer-accessory"]',
      ));
      const managed = [...leftRoles, ...rightRoles, ...accessories];

      if (home) {
        managed.forEach((node) => setAutoHidden(node, false));
        setAdaptiveAttribute(root, "data-tessalume-task-layout", "inactive");
        return;
      }

      const workspace = findTaskWorkspace(main);
      const composer = findComposerSurface();

      const workspaceBox = workspace?.getBoundingClientRect();
      const composerBox = composer?.getBoundingClientRect();
      const validWorkspace = workspaceBox && workspaceBox.width > 0 && workspaceBox.height > 0;
      const validComposer = composerBox && composerBox.width > 0 && composerBox.height > 0;
      if (!main || !stage || !validWorkspace || !validComposer) {
        managed.forEach((node) => setAutoHidden(node, true, "content-unavailable"));
        setAdaptiveAttribute(root, "data-tessalume-task-layout", "minimal");
        setAdaptiveAttribute(root, "data-tessalume-left-rail", "none");
        setAdaptiveAttribute(root, "data-tessalume-right-rail", "none");
        setAdaptiveAttribute(root, "data-tessalume-composer-accessory", "hidden");
        return;
      }

      const leftGutter = Math.max(0, composerBox.left - workspaceBox.left);
      const rightGutter = Math.max(0, workspaceBox.right - composerBox.right);
      const workspaceHeight = workspaceBox.height;
      const reviewOpen = html.classList.contains("tessalume-code-review-open");
      const summaryPanel = Array.from(document.querySelectorAll(
        '[data-summary-panel-variant="summary"] [data-tessalume-surface="output-panel"]',
      )).find((node) => node.getBoundingClientRect().width > 0);
      const summaryBox = summaryPanel?.getBoundingClientRect();
      const stageBox = stage.getBoundingClientRect();
      const navigation = document.querySelector('[data-thread-user-message-navigation-rail-list="true"]');
      const navigationBox = navigation?.getBoundingClientRect();
      const leftInset = navigationBox?.width > 0 && navigationBox.height > 0
        ? Math.max(4, Math.ceil(navigationBox.right - stageBox.left + 8))
        : 4;
      const insetValue = `${leftInset}px`;
      if (root.style.getPropertyValue("--tessalume-left-rail-inset") !== insetValue) {
        root.style.setProperty("--tessalume-left-rail-inset", insetValue);
      }
      const summaryOverlapsRightRail = !!summaryBox && rightRoles.some((node) => {
        const style = window.getComputedStyle(node);
        const width = Number.parseFloat(style.width);
        const height = Number.parseFloat(style.height);
        const right = Number.parseFloat(style.right);
        const bottom = Number.parseFloat(style.bottom);
        if (![width, height, right, bottom].every(Number.isFinite)) return false;
        const anchor = style.position === "fixed"
          ? { right: window.innerWidth, bottom: window.innerHeight }
          : stageBox;
        const railLeft = anchor.right - right - width;
        const railTop = anchor.bottom - bottom - height;
        return summaryBox.left < anchor.right - right &&
          summaryBox.right > railLeft &&
          summaryBox.top < railTop + height &&
          summaryBox.bottom > railTop - 10;
      });

      const previousLeft = root.getAttribute("data-tessalume-left-rail");
      const previousRight = root.getAttribute("data-tessalume-right-rail");
      const previousAccessory = root.getAttribute("data-tessalume-composer-accessory");

      const leftFits = !reviewOpen &&
        leftGutter >= Math.max(previousLeft === "full" ? 164 : 180, leftInset + 146 + 14) &&
        workspaceHeight >= (previousLeft === "full" ? 680 : 720);

      let rightRail = "none";
      if (!reviewOpen && !summaryOverlapsRightRail) {
        // Cards retain the summary-open footprint in both summary states.
        const fullThreshold = 352;
        const singleThreshold = 184;
        const fullFits =
          rightGutter >= (previousRight === "full" ? fullThreshold - 16 : fullThreshold) &&
          workspaceHeight >= (previousRight === "full" ? 680 : 720);
        const singleFits =
          rightGutter >= (previousRight === "single" || previousRight === "full"
            ? singleThreshold - 16 : singleThreshold) &&
          workspaceHeight >= (previousRight === "single" || previousRight === "full" ? 590 : 620);
        rightRail = fullFits ? "full" : singleFits ? "single" : "none";
      }

      const accessoryFits = !reviewOpen &&
        leftGutter >= (previousAccessory === "visible" ? 96 : 108) &&
        workspaceHeight >= 560;

      leftRoles.forEach((node) => setAutoHidden(node, !leftFits, "left-rail"));
      rightRoles.forEach((node) => {
        const secondary = node.getAttribute("data-theme-priority") === "secondary";
        const hidden = rightRail === "none" || (rightRail === "single" && secondary);
        setAutoHidden(node, hidden, summaryOverlapsRightRail ? "summary-panel" : "right-rail");
      });
      accessories.forEach((node) => setAutoHidden(node, !accessoryFits, "composer-rail"));

      const taskLayout = leftFits && rightRail === "full"
        ? "full"
        : leftFits || rightRail === "single" || accessoryFits
          ? "reduced"
          : "minimal";
      setAdaptiveAttribute(root, "data-tessalume-task-layout", taskLayout);
      setAdaptiveAttribute(root, "data-tessalume-left-rail", leftFits ? "full" : "none");
      setAdaptiveAttribute(root, "data-tessalume-right-rail", rightRail);
      setAdaptiveAttribute(root, "data-tessalume-composer-accessory", accessoryFits ? "visible" : "hidden");
      setAdaptiveAttribute(root, "data-tessalume-workspace-width", Math.round(workspaceBox.width));
      setAdaptiveAttribute(root, "data-tessalume-workspace-height", Math.round(workspaceHeight));
      setAdaptiveAttribute(root, "data-tessalume-left-gutter", Math.round(leftGutter));
      setAdaptiveAttribute(root, "data-tessalume-right-gutter", Math.round(rightGutter));
    };
    const liveLayoutSignature = (nodes) => nodes.filter(Boolean).map((node) => {
      const box = node.getBoundingClientRect();
      return [box.left, box.top, box.width, box.height]
        .map((value) => Math.round(value * 4) / 4)
        .join(":");
    }).join("|");
    const syncLiveLayout = (decorate = false) => {
      if (themeDisposed) return "";
      const main = findMain();
      const aside = queryFirst(document, "sidebar", ["aside.app-shell-left-panel"]);
      const home = syncRouteState();
      const stage = findStage();
      const workspace = adaptiveLayout
        ? findTaskWorkspace(main)
        : null;
      const composer = findComposerSurface();
      const summaryPanel = document.querySelector(
        '[data-summary-panel-variant="summary"] [data-tessalume-surface="output-panel"]',
      );
      const messageNavigation = document.querySelector('[data-thread-user-message-navigation-rail-list="true"]');

      syncLayoutObservers(adaptiveLayout
        ? [main, workspace, composer, summaryPanel, messageNavigation]
        : [main]);
      syncStageGeometry(main, stage);
      if (decorate) decorateSharedSurfaces(main, aside, home);
      else decorateTaskHeaders();
      syncTaskTitleWidth();
      spec.onEnsure?.({ ...api, main, aside, home, stage });
      syncAdaptiveVisibility(main, stage, home);

      return liveLayoutSignature(adaptiveLayout ? [main, workspace, composer] : [main]);
    };
    const startLayoutTracking = () => {
      if (themeDisposed || layoutFrame) return;
      layoutTrackingStartedAt = window.performance.now();
      layoutLastSignature = "";
      layoutStableFrames = 0;
      const track = (timestamp) => {
        layoutFrame = 0;
        if (themeDisposed) return;
        const signature = syncLiveLayout();
        if (signature && signature === layoutLastSignature) {
          layoutStableFrames += 1;
        } else {
          layoutLastSignature = signature;
          layoutStableFrames = 0;
        }
        if (layoutStableFrames >= 2 || timestamp - layoutTrackingStartedAt >= 480) {
          schedule();
          return;
        }
        layoutFrame = window.requestAnimationFrame(track);
      };
      layoutFrame = window.requestAnimationFrame(track);
    };
// TESSALUME_RUNTIME_FRAGMENT: sidebar, message, task, output, and shared surface decoration
    let observedSidebar = null;
    let sidebarObserver = null;
    let sidebarNeedsDecoration = true;
    const decorateSidebar = (aside) => {
      const sidebar = spec.sidebar;
      if (!aside || !sidebar) return;
      if (aside !== observedSidebar) {
        sidebarObserver?.disconnect();
        observedSidebar = aside;
        sidebarNeedsDecoration = true;
        sidebarObserver = new MutationObserver(() => {
          sidebarNeedsDecoration = true;
          schedule();
        });
        sidebarObserver.observe(aside, { childList:true, characterData:true, subtree:true });
      }
      if (!sidebarNeedsDecoration) return;
      sidebarNeedsDecoration = false;
      const palette = sidebar.palette || [];
      const projectTone = sidebar.projectTone || "phase";
      const threadIndex = sidebar.threadIndex || "thread";
      const threadTone = sidebar.threadTone || "";
      const projectRows = '[data-app-action-sidebar-project-row]';
      const threadRows = '[data-app-action-sidebar-thread-row]';

      aside.querySelectorAll('[data-sidebar-project-drop-zone="project-icon"]').forEach((icon, index) => {
        const row = icon.closest(projectRows);
        if (!row) return;
        // The current sidebar gives the icon its own fixed-width slot. Theme
        // heading padding and badges belong to the branch containing both the
        // icon and title, leaving the native action buttons in their own lane.
        const title = (row.getAttribute("aria-labelledby") || "").split(/\s+/)
          .map((id) => document.getElementById(id))
          .find((node) => node && row.contains(node)) || row.querySelector('[data-marquee-text]');
        let heading = icon;
        while (heading.parentElement && heading.parentElement !== row) heading = heading.parentElement;
        if (heading === icon || !title || !heading.contains(title)) heading = row;
        const headingClass = roleClass("project-heading");
        for (const previous of [row, ...row.querySelectorAll(`.${headingClass}`)]) {
          if (previous !== heading) previous.classList.remove(headingClass);
        }
        mark(heading, headingClass);
        setData(heading, "index", String(index + 1).padStart(2, "0"));
        setData(row, "index", String(index + 1).padStart(2, "0"));
        if (row && palette.length) setData(row, projectTone, palette[index % palette.length]);
      });

      if (sidebar.inheritProjectTone && threadTone) {
        let tone = palette[0] || "";
        let index = 0;
        aside.querySelectorAll(`${projectRows},${threadRows}`).forEach((row) => {
          if (row.hasAttribute("data-app-action-sidebar-project-row")) {
            tone = row.getAttribute(dataName(projectTone)) || tone;
          } else {
            setData(row, threadTone, tone);
            setData(row, threadIndex, String(++index).padStart(2, "0"));
          }
        });
      } else {
        let index = 0;
        aside.querySelectorAll(threadRows).forEach((row) => {
          setData(row, threadIndex, String(++index).padStart(2, "0"));
        });
      }

      const sections = sidebar.sections || {};
      aside.querySelectorAll("*").forEach((node) => {
        if (node.children.length !== 0) return;
        const text = node.textContent?.trim() || "";
        if (sidebar.expandLabel && text === sidebar.expandLabel) {
          mark(node, roleClass("expand-label"));
          mark(node.parentElement, roleClass("expand-row"));
        }
        if (!Object.prototype.hasOwnProperty.call(sections, text)) return;
        mark(node.parentElement, roleClass("section-label"));
        setData(node.parentElement, "section", sections[text]);
      });
    };
    const decorateMarkdownSurface = (content) => {
      if (!content?.isConnected) return null;
      mark(content, roleClass("markdown"));
      markSurface(content, "markdown");
      if (content.querySelector('table,[role="table"],pre,.katex-display') &&
          content.getAttribute("data-tessalume-wide-content") !== "true") {
        const wideContentAttribute = "data-tessalume-wide-content";
        const previousWideContent = content.getAttribute(wideContentAttribute);
        content.setAttribute(wideContentAttribute, "true");
        surfaced.push([content, previousWideContent, wideContentAttribute]);
      }
      const unit = closestFirst(content, "messageUnitAncestor", ["[data-content-search-unit-key]"]);
      const key = unit?.getAttribute("data-content-search-unit-key") || "";
      const unitId = key.split(":").at(-1) || "";
      const label = unit?.querySelector("h4.sr-only")?.textContent?.trim() || "";
      const isUserMessage = Boolean(queryFirst(
        unit,
        "userMessageBubble",
        ['[data-user-message-bubble="true"]'],
      )) ||
        /^(?:you|你)\s*(?:said|说)/i.test(label);
      const isAssistantMessage = !isUserMessage &&
        (/^(?:chatgpt|assistant|助手)\s*(?:said|说)/i.test(label) || /^msg_/i.test(unitId));
      if (isAssistantMessage || key.endsWith(":assistant")) {
        mark(unit, roleClass("message-assistant"));
        markMessage(unit, "assistant");
      }
      if (isUserMessage || key.endsWith(":user")) {
        mark(unit, roleClass("message-user"));
        markMessage(unit, "user");
      }
      if (isAssistantMessage || isUserMessage ||
        key.endsWith(":assistant") || key.endsWith(":user")) {
        const paper = closestFirst(unit, "chatPaperAncestor", ['[class*="thread-content-max-width"]']);
        mark(paper, roleClass("chat-paper"));
        markSurface(paper, "chat-paper");
        return unit;
      }
      return null;
    };
    const decorateTaskHeaders = () => {
      const activeHeaders = new Set();
      const activeTitles = new Set();
      queryAll(
        document,
        "taskHeader",
        ['[data-testid="app-shell-header-context-menu-surface"]'],
      ).forEach((header) => {
        // A unified file/chat tab strip reuses the old task-header element.
        // Never apply content-sized title geometry to the native tab carrier.
        if (!html.classList.contains("tessalume-is-task") || !isVisibleSurface(header) ||
            header.closest('[data-app-shell-tab-row="true"]') ||
            header.querySelector('[role="tab"],[role="tablist"],[data-app-shell-tab-row="true"]')) return;
        const currentTitle = header.querySelector('[data-app-shell-titlebar-content="true"]');
        const titleButton = header.querySelector("span > button.truncate");
        const title = titleButton?.parentElement?.parentElement ||
          header.querySelector("span > span.truncate")?.parentElement;
        const secondaryTitle = header.querySelector("span > span.truncate")?.parentElement;
        mark(header, roleClass("task-header"));
        markSurface(header, "task-header");
        activeHeaders.add(header);
        for (const candidate of new Set([currentTitle, title, secondaryTitle])) {
          if (!candidate || !isVisibleSurface(candidate)) continue;
          mark(candidate, roleClass("task-title"));
          markSurface(candidate, "task-title");
          activeTitles.add(candidate);
        }
      });
      for (const [surface, active] of [["task-header", activeHeaders], ["task-title", activeTitles]]) {
        document.querySelectorAll(`.${roleClass(surface)},[data-tessalume-surface="${surface}"]`).forEach((node) => {
          if (active.has(node)) return;
          node.classList.remove(roleClass(surface));
          if (node.getAttribute("data-tessalume-surface") === surface)
            node.removeAttribute("data-tessalume-surface");
        });
      }
    };
    const decorateOutputPanels = () => {
      const sections = new Set();
      const panels = new Set();
      const collectSection = (node) => {
        const section = node?.closest?.("section");
        if (section?.isConnected) sections.add(section);
      };

      // Current Codex builds render a data-dependent set of summary sections.
      // Git/worktree rows use item-trigger rather than item-button, while plan,
      // usage, and other sections may contain neither slot. Bind the summary
      // container itself so every present section receives the same theme.
      document.querySelectorAll('[data-summary-panel-variant="summary"]').forEach((root) => {
        const panel = root.firstElementChild;
        if (!panel?.isConnected) return;
        panels.add(panel);
        panel.querySelectorAll(':scope > div > section').forEach((section) => sections.add(section));
      });

      // Keep compatibility with older Codex builds that predate the summary
      // variant attribute.
      const panelItems = queryAll(
        document,
        "outputPanelItem",
        ['[data-slot="thread-summary-panel-item-button"]'],
      );
      panelItems.forEach(collectSection);

      const legacyLabels = new Set(["\u8f93\u51fa", "\u6765\u6e90", "Output", "Sources"]);
      if (panelItems.length === 0 && (!runtimePerformance || panels.size === 0)) {
        document.querySelectorAll("button").forEach((button) => {
          if (legacyLabels.has(button.textContent?.trim() || "")) collectSection(button);
        });
      }

      sections.forEach((section) => {
        const panel = section.parentElement?.parentElement;
        if (panel?.isConnected) panels.add(panel);
        mark(section, roleClass("output-section"));
        mark(section.querySelector("header"), roleClass("output-header"));
        markSurface(section, "output-section");
        markSurface(section.querySelector("header"), "output-header");
      });
      panels.forEach((panel) => {
        mark(panel, roleClass("output-panel"));
        markSurface(panel, "output-panel");
      });
    };
    const decorateComposerProgressFade = () => {
      const composer = findComposerSurface();
      if (!composer) return;
      markSurface(composer, "composer");
      const composerRoot = composer.closest('[data-codex-composer-root]');
      const progress = composerRoot?.querySelector(
        '[data-in-progress-fixed-content="true"]',
      );
      const fade = progress?.firstElementChild?.firstElementChild;
      if (fade) fade.setAttribute("data-tessalume-progress-fade", "true");
    };
    const decorateTaskCriticalSurfaces = (mutations) => {
      if (!mutations?.length || !html.classList.contains(roleClass("is-task"))) return;
      const markdownSelector = selectorList(
        "markdownContent",
        ['[class*="_MarkdownRoot_"]', '[class*="_markdownContent_"]'],
      ).join(",");
      const contents = new Set();
      const collectMarkdown = (node, includeDescendants = false) => {
        const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
        if (!element?.isConnected) return;
        const closest = element.matches(markdownSelector)
          ? element
          : element.closest(markdownSelector);
        if (closest?.isConnected) contents.add(closest);
        if (includeDescendants) {
          element.querySelectorAll(markdownSelector).forEach((content) => {
            if (content.isConnected) contents.add(content);
          });
        }
      };

      for (const mutation of mutations) {
        collectMarkdown(mutation.target);
        mutation.addedNodes?.forEach((node) => {
          collectMarkdown(node, node.nodeType === Node.ELEMENT_NODE);
        });
      }

      contents.forEach(decorateMarkdownSurface);
      // Codex commonly reuses the header node and replaces its class/text during
      // task navigation, so the tiny header query is safer than relying only on
      // added nodes. This path performs no layout reads or whole-page scans.
      decorateTaskHeaders();
      // Mark the environment panel immediately as well. Deferring this work to
      // the debounced repair can starve while live counters keep mutating.
      decorateOutputPanels();
      // The fixed progress row adds its own surface-colored fade behind the
      // status badge. Mark that full-width layer immediately so it cannot paint
      // a dark rectangle over theme chat artwork.
      decorateComposerProgressFade();
    };
    const decorateSharedSurfaces = (main, aside, home) => {
      mark(main, roleClass("main"));
      mark(aside, roleClass("sidebar"));
      mark(home, roleClass("home"));
      const windowBar = queryFirst(
        document,
        "windowBar",
        [".group\\/application-menu-top-bar"],
      );
      mark(windowBar, roleClass("window-bar"));
      markSurface(main, "main");
      markSurface(aside, "sidebar");
      markSurface(home, "home");
      markSurface(windowBar, "window-bar");
      decorateComposerProgressFade();

      let messageIndex = 0;
      queryAll(
        document,
        "markdownContent",
        ['[class*="_MarkdownRoot_"]', '[class*="_markdownContent_"]'],
      ).forEach((content) => {
        const unit = decorateMarkdownSurface(content);
        if (unit) {
          setData(unit, "message", String(++messageIndex).padStart(2, "0"));
        }
      });

      decorateOutputPanels();
      const outputOpen = Array.from(document.querySelectorAll(`.${roleClass("output-panel")}`)).some((panel) => {
        const box = panel.getBoundingClientRect();
        return box.width > 120 && box.height > 80 &&
          box.right > 0 && box.left < window.innerWidth &&
          box.bottom > 0 && box.top < window.innerHeight;
      });
      html.classList.toggle(roleClass("has-output"), outputOpen);
      html.classList.toggle("tessalume-has-output", outputOpen);

      document.querySelectorAll(`[${dataName("card")}]`).forEach((node) => node.removeAttribute(dataName("card")));
      queryFirst(home, "homeSuggestions", [".group\\/home-suggestions"])
        ?.querySelectorAll("button").forEach((button, index) => {
        setData(button, "card", String(index + 1).padStart(2, "0"));
      });
      decorateTaskHeaders();
      decorateSidebar(aside);
    };

    const api = Object.freeze({
      namespace,
      themeClass,
      templateVersion,
      html,
      root,
      document,
      window,
      config,
      roleClass,
      dataName,
      mark,
      setData,
      syncRouteState,
      positionComposerAccessory,
      positionPanelAboveCards,
    });
    const pruneDetachedState = () => {
      const detached = new Set();
      // Restore before forgetting: a native node may later be reinserted and
      // must be discovered as native again, with a fresh rollback record.
      for (const [node, className] of marked) if (!node.isConnected) {
        node.classList.remove(className); detached.add(node);
      }
      for (let index = surfaced.length - 1; index >= 0; index--) {
        const [node, previous, attribute = "data-tessalume-surface"] = surfaced[index];
        if (node.isConnected) continue;
        if (previous == null) node.removeAttribute(attribute); else node.setAttribute(attribute, previous);
        detached.add(node);
      }
      marked = marked.filter(([node]) => node.isConnected);
      surfaced = surfaced.filter(([node]) => node.isConnected);
      for (const node of detached) for (const attribute of Array.from(node.attributes || [])) {
        if (attribute.name.startsWith(`data-${namespace}-`)) node.removeAttribute(attribute.name);
      }
      for (const registry of [textStyles, densityStyles]) for (const [node, record] of registry) if (!node.isConnected) {
        for (const [property, previous] of record.inline) {
          if (previous.value) node.style.setProperty(property, previous.value, previous.priority);
          else node.style.removeProperty(property);
        }
        registry.delete(node);
      }
      for (const [node, previous] of chatCanvasStyles) if (!node.isConnected) {
        for (const [property, value] of [["--tessalume-chat-canvas-left", previous.left], ["--tessalume-chat-canvas-width", previous.width]]) {
          if (value) node.style.setProperty(property, value); else node.style.removeProperty(property);
        }
        chatCanvasStyles.delete(node);
      }
      for (const [animation, baseRate] of animationRates) if (animation.effect?.target?.isConnected === false) {
        try {
          const frames = animationFrames.get(animation);
          if (frames) animation.effect.setKeyframes(frames);
          if (typeof animation.updatePlaybackRate === "function") animation.updatePlaybackRate(baseRate);
          else animation.playbackRate = baseRate;
        } catch { }
        animationRates.delete(animation); animationFrames.delete(animation);
      }
      for (const node of layoutObserved) if (!node.isConnected) {
        layoutResizeObserver?.unobserve(node); layoutObserved.delete(node);
      }
      if (observedSidebar && !observedSidebar.isConnected) {
        sidebarObserver?.disconnect(); sidebarObserver = null; observedSidebar = null;
      }
    };
    const ensure = () => {
      if (themeDisposed) return;
      ensureTimer = 0;
      syncLiveLayout(true);
    };
    const schedule = (routeStateIsCurrent = false) => {
      if (themeDisposed) return;
      if (!routeStateIsCurrent) syncRouteState();
      if (ensureTimer) window.clearTimeout(ensureTimer);
      ensureTimer = window.setTimeout(ensure, spec.debounceMilliseconds ?? 96);
    };
    const onDocumentMutations = (mutations) => {
      if (themeDisposed) return;
      if (mutations.some((mutation) => mutation.type === "childList" &&
          Array.from(mutation.removedNodes).some((node) => node.nodeType === Node.ELEMENT_NODE))) pruneDetachedState();
      const relevant = runtimePerformance
        ? mutations.filter((mutation) => !root.contains(mutation.target) && !isStableTextMutation(mutation))
        : mutations;
      if (!relevant.length) return;
      syncRouteState();
      decorateTaskCriticalSurfaces(relevant);
      schedule(true);
    };
// TESSALUME_RUNTIME_FRAGMENT: cleanup, rollback, code-review isolation, and theme lifecycle recovery
const cleanup = () => {
      if (themeDisposed) return true;
      themeDisposed = true;
      if (ensureTimer) window.clearTimeout(ensureTimer);
      sidebarObserver?.disconnect();
      sidebarObserver = null;
      if (layoutFrame) window.cancelAnimationFrame(layoutFrame);
      layoutFrame = 0;
      layoutResizeObserver?.disconnect();
      layoutResizeObserver = null;
      layoutObserved = new Set();
      root.style.removeProperty("--tessalume-left-rail-inset");
      if (taskTitleWidthManaged) {
        if (taskTitleWidthPrevious) {
          html.style.setProperty("--tessalume-task-title-primary-width", taskTitleWidthPrevious);
        } else {
          html.style.removeProperty("--tessalume-task-title-primary-width");
        }
        taskTitleWidthManaged = false;
      }
      for (const [main, previous] of chatCanvasStyles) {
        for (const [property, value] of [
          ["--tessalume-chat-canvas-left", previous.left],
          ["--tessalume-chat-canvas-width", previous.width],
        ]) {
          if (value) main.style.setProperty(property, value);
          else main.style.removeProperty(property);
        }
      }
      chatCanvasStyles.clear();
      spec.onCleanup?.(api);
      for (const [node, className] of marked) {
        try { node?.classList?.remove(className); } catch { }
      }
      for (const [node, previous, attribute = "data-tessalume-surface"] of [...surfaced].reverse()) {
        try {
          if (previous == null) node?.removeAttribute?.(attribute);
          else node?.setAttribute?.(attribute, previous);
        } catch { }
      }
      try {
        document.querySelectorAll("*").forEach((node) => {
          for (const attribute of Array.from(node.attributes || [])) {
            if (attribute.name.startsWith(`data-${namespace}-`)) node.removeAttribute(attribute.name);
          }
        });
      } catch { }
      marked = []; surfaced = [];
      html.classList.remove(
        themeClass,
        roleClass("is-home"),
        roleClass("is-task"),
        roleClass("is-settings"),
        roleClass("has-output"),
        "tessalume-is-home",
        "tessalume-is-task",
        "tessalume-is-settings",
        "tessalume-has-output",
      );
      root.removeAttribute("data-tessalume-template-version");
      return true;
    };

    html.classList.add(themeClass);
    root.setAttribute("aria-hidden", "true");
    if (!spec.preserveRoot) {
      root.innerHTML = typeof spec.render === "function" ? spec.render(api) : String(spec.render || "");
    }
    spec.onMount?.(api);
    validateTemplateStructure();
    context.observe(document.documentElement, {
      childList:true, subtree:true, attributes:true,
      attributeFilter:["aria-hidden", "hidden", "inert", "data-app-shell-workspace-layout", "data-app-shell-unified-tab-strip"],
    }, onDocumentMutations);
    context.on(window, "resize", () => {
      syncLiveLayout();
      startLayoutTracking();
      schedule();
    }, { passive:true });
    context.interval(ensure, 4000);
    context.addCleanup(cleanup);
    ensure();
    return cleanup;
  };

  let visualPlacementFrame = 0;
  const scheduleVisualPlacementSync = () => {
    if (visualPlacementFrame || disposed) return;
    visualPlacementFrame = requestAnimationFrame(async () => {
      visualPlacementFrame = 0;
      await synchronizeVisualPlacements(visualPlacementRevision);
    });
  };
  window.addEventListener("resize", scheduleVisualPlacementSync, { passive: true });
  addCleanup(() => window.removeEventListener("resize", scheduleVisualPlacementSync));
  const visualSurfaceObserver = new MutationObserver(scheduleVisualPlacementSync);
  visualSurfaceObserver.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-tessalume-surface"],
  });
  addCleanup(() => visualSurfaceObserver.disconnect());
  if (typeof ResizeObserver === "function") {
    visualSurfaceResizeObserver = new ResizeObserver(scheduleVisualPlacementSync);
    addCleanup(() => visualSurfaceResizeObserver?.disconnect());
  }
  addCleanup(() => {
    if (visualPlacementFrame) cancelAnimationFrame(visualPlacementFrame);
  });
  for (const delay of [0, 80, 240, 720]) {
    const handle = setTimeout(scheduleVisualPlacementSync, delay);
    addCleanup(() => clearTimeout(handle));
  }

  context = Object.freeze({
    id: themeId,
    fingerprint,
    root,
    document,
    window,
    cssText,
    config: Object.freeze(config),
    get mode() {
      return document.documentElement.classList.contains("electron-dark") ? "dark" : "light";
    },
    assets: Object.freeze({ ...assetDataUrls }),
    assetDataUrl,
    renderTemplateV1,
    mountCanonicalTheme,
    addCleanup,
    on(target, eventName, listener, options) {
      target.addEventListener(eventName, listener, options);
      addCleanup(() => target.removeEventListener(eventName, listener, options));
      return listener;
    },
    observe(target, options, callback) {
      const observer = new MutationObserver(callback);
      observer.observe(target, options);
      addCleanup(() => observer.disconnect());
      return observer;
    },
    interval(callback, milliseconds) {
      const handle = setInterval(callback, milliseconds);
      addCleanup(() => clearInterval(handle));
      return handle;
    },
    timeout(callback, milliseconds) {
      const handle = setTimeout(callback, milliseconds);
      addCleanup(() => clearTimeout(handle));
      return handle;
    },
  });

  const dispose = async (options = null) => {
    if (disposed) return true;
    disposed = true;
    const preserveSharedAppearance = options?.preserveSharedAppearance === true;
    try {
      if (definition?.unmount) await definition.unmount(context);
    } finally {
      for (const cleanup of managedCleanups.reverse()) {
        try { await cleanup(); } catch { }
      }
      style.remove();
      root.remove();
      document.documentElement.classList.remove(`tessalume-theme-${safeThemeId}`);
      if (!preserveSharedAppearance) {
        document.documentElement.classList.remove("tessalume-theme-active");
        for (const variable of assetVariables) document.documentElement.style.removeProperty(variable);
        for (const variable of visualSettingVariables) document.documentElement.style.removeProperty(variable);
        delete document.documentElement.dataset.tessalumeReadability;
        delete document.documentElement.dataset.tessalumeMotion;
        delete document.documentElement.dataset.tessalumeTextScale;
        delete document.documentElement.dataset.tessalumeDensity;
        delete document.documentElement.dataset.tessalumeVisualPlacement;
      }
      delete window.__TESSALUME_STAGED_VISUAL_SETTINGS__;
      delete window.__TESSALUME_STAGED_VISUAL_IMAGES__;
      for (const objectUrl of customImageObjectUrls.values()) URL.revokeObjectURL(objectUrl);
      customImageObjectUrls.clear();
      customSlotImageKeys.clear();
      visualImageDimensions.clear();
      for (const objectUrl of assetObjectUrls) URL.revokeObjectURL(objectUrl);
      if (window.__TESSALUME_THEME_ID__ === themeId) {
        delete window.__TESSALUME_THEME_ID__;
      }
      if (window[RUNTIME_KEY]?.fingerprint === fingerprint) delete window[RUNTIME_KEY];
    }
    return true;
  };

  try {
    // Resolve every artwork layer and absolute placement against a detached
    // style target first. The visible page remains entirely owned by the
    // predecessor until this preparation succeeds.
    await setVisualSettings(stagedVisualSettings || {}, stagedVisualImages || Object.create(null));
    if (!(await disposeCompatibleRuntime()) && window.__CODEX_DREAM_SKIN_STATE__?.cleanup) {
      window.__CODEX_DREAM_SKIN_STATE__.cleanup();
    }

    // The predecessor's cleanup removes its legacy color-mode alias. Install
    // ours only after that cleanup so live reapplication keeps the dark skin.
    const colorModeRoot = document.documentElement;
    const hadNativeDarkClass = colorModeRoot.classList.contains("electron-dark");
    const syncLegacyColorMode = () => {
      const mode = colorModeRoot.getAttribute("data-theme");
      if (mode === "dark" || mode === "light") {
        colorModeRoot.classList.toggle("electron-dark", mode === "dark");
      }
    };
    syncLegacyColorMode();
    const colorModeObserver = new MutationObserver(syncLegacyColorMode);
    colorModeObserver.observe(colorModeRoot, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    addCleanup(() => {
      colorModeObserver.disconnect();
      if (!hadNativeDarkClass && colorModeRoot.hasAttribute("data-theme")) {
        colorModeRoot.classList.remove("electron-dark");
      }
    });

    (document.head || document.documentElement).appendChild(style);
    (document.head || document.documentElement).appendChild(compatibilityStyle);
    addCleanup(() => compatibilityStyle.remove());
    (document.head || document.documentElement).appendChild(visualMotionStyle);
    addCleanup(() => visualMotionStyle.remove());
    document.body?.appendChild(root);
    for (const [variable, objectUrl] of assetAssignments) {
      document.documentElement.style.setProperty(variable, `url("${objectUrl}")`);
      assetVariables.push(variable);
    }
    const preparedTarget = visualSettingsTarget;
    for (const variable of Array.from(preparedTarget.style)) {
      document.documentElement.style.setProperty(
        variable,
        preparedTarget.style.getPropertyValue(variable),
        preparedTarget.style.getPropertyPriority(variable),
      );
    }
    for (const [name, value] of Object.entries(preparedTarget.dataset)) {
      document.documentElement.dataset[name] = value;
    }
    visualSettingsTarget = document.documentElement;
    appearanceCommitted = true;
    document.documentElement.classList.add("tessalume-theme-active", `tessalume-theme-${safeThemeId}`);
    syncDisplayPreferences();
  } catch (error) {
    await dispose({ preserveSharedAppearance: true });
    throw error;
  }

  window[RUNTIME_KEY] = {
    themeId,
    fingerprint,
    compatibilityProfileVersion: compatibilityProfile.profileVersion,
    appearanceHandoffVersion: 2,
    artworkCompositionProtocolVersion: 1,
    visualImageProtocolVersion: 1,
    dispose,
    context,
    setVisualSettings,
    getVisualImageKeys: () => Array.from(customImageObjectUrls.keys()),
  };

  try {
    // Theme packages can add floating task cards and companion instruments.
    // Keep those decorations out of Codex's code-review diff. Ordinary Files,
    // Browser, and Terminal sidebars must not change the cards.
    let reviewFrame = 0;
    const syncCodeReview = () => {
      reviewFrame = 0;
      const main = queryFirst(
        document,
        "main",
        [
          'main[data-app-shell-main-surface="default"]',
          'main[class*="MainContentSurface"]',
          "main.main-surface",
          "main",
        ],
      );
      const mainBox = main?.getBoundingClientRect();
      const reviewLabel = /review|diff|changes|审阅|差异|更改/i;
      const rightEdge = mainBox ? mainBox.left + mainBox.width * .6 : window.innerWidth * .6;
      const reviewTabs = Array.from(document.querySelectorAll('[role="tab"]')).filter((tab) => {
        const box = tab.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.left >= rightEdge;
      });
      const hasReviewTab = reviewTabs.some((tab) => reviewLabel.test(tab.textContent || ""));
      const rightDiffControls = (!runtimePerformance || (!hasReviewTab && reviewTabs.length > 0)) && Array.from(document.querySelectorAll("button[aria-label]")).some((button) => {
        if (runtimePerformance && !reviewLabel.test(button.getAttribute("aria-label") || "")) return false;
        const box = button.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.left >= rightEdge && reviewLabel.test(button.getAttribute("aria-label") || "");
      });
      const codeReviewOpen = hasReviewTab || (reviewTabs.length > 0 && rightDiffControls);

      document.documentElement.classList.toggle("tessalume-code-review-open", codeReviewOpen);
      if (!mainBox) return;

      const stage = root.firstElementChild;
      const candidates = new Set([
        ...Array.from(stage?.children || []),
        ...Array.from(root.children),
      ]);
      candidates.delete(stage);

      const rightThreshold = mainBox.left + mainBox.width * .54;
      const lowerThreshold = mainBox.top + mainBox.height * .24;
      for (const candidate of candidates) {
        const box = candidate.getBoundingClientRect();
        const isRightTaskOverlay =
          box.width >= 48 &&
          box.height >= 28 &&
          box.right >= rightThreshold &&
          box.top >= lowerThreshold;
        const nextValue = String(isRightTaskOverlay);
        if (candidate.getAttribute("data-tessalume-side-panel-overlay") !== nextValue) {
          candidate.setAttribute("data-tessalume-side-panel-overlay", nextValue);
        }
      }
    };
    const scheduleCodeReviewSync = () => {
      if (reviewFrame || disposed) return;
      reviewFrame = window.requestAnimationFrame(syncCodeReview);
    };
    syncCodeReview();
    context.observe(document.documentElement, { childList: true, subtree: true }, (mutations) => {
      if (mutations.some((mutation) => !isStableTextMutation(mutation))) scheduleCodeReviewSync();
    });
    context.on(window, "resize", scheduleCodeReviewSync, { passive: true });
    context.interval(syncCodeReview, 1000);
    context.addCleanup(() => {
      if (reviewFrame) window.cancelAnimationFrame(reviewFrame);
      document.documentElement.classList.remove("tessalume-code-review-open");
      root.querySelectorAll("[data-tessalume-side-panel-overlay]").forEach((node) => {
        node.removeAttribute("data-tessalume-side-panel-overlay");
      });
    });

    // Native React nodes are retained for reversible theme removal.

    if (hasThemeScript) {
      const registerTheme = (candidate) => {
        if (!candidate || typeof candidate !== "object") {
          throw new TypeError("registerTheme expects a theme lifecycle object");
        }
        definition = candidate;
      };
      try {
        (() => {
          __TESSALUME_PAYLOAD_SCRIPT_BODY__
        })();
      } catch (error) {
        throw new Error(`TESSALUME_THEME_SCRIPT: ${error?.message || String(error)}`);
      }
      if (!definition || typeof definition.mount !== "function") {
        throw new Error("TESSALUME_THEME_SCRIPT: Advanced theme script must call registerTheme({ mount, unmount? })");
      }
      try {
        await definition.mount(context);
      } catch (error) {
        throw new Error(`TESSALUME_THEME_SCRIPT: ${error?.message || String(error)}`);
      }
    }

    window.__TESSALUME_THEME_ID__ = themeId;
    return { installed: true, themeId, fingerprint, advanced: hasThemeScript };
  } catch (error) {
    await dispose();
    throw error;
  }
})()
