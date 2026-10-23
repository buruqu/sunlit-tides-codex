/* Decorative message avatars; native message nodes and controls stay in place. */
function mountSunlitAvatars(context) {
  const { document: doc, window: win } = context;
  const apiKey = "__SUNLIT_AVATARS__";
  win[apiKey]?.dispose?.();
  if (context.config?.avatars?.enabled !== true) return null;
  const html = doc.documentElement, records = new Map();
  const previousEnabled = html.getAttribute("data-sunlit-message-avatars");
  html.setAttribute("data-sunlit-message-avatars", "true");
  let disposed = false, frame = 0, discoveryDirty = true, geometryDirty = true, candidates = new Map();
  const sources = {};
  for (const [role, key] of [["assistant", "task-right-secondary"], ["user", "dumpling-denia"]]) {
    try { sources[role] = context.assetDataUrl?.(key) || context.assets?.[key] || ""; }
    catch { sources[role] = ""; }
  }
  const setAttr = (node, key, value) => { if (node.getAttribute(key) !== value) node.setAttribute(key, value); };
  // Message height changes constantly while a reply streams. Avatar placement
  // depends on width, so those height-only deliveries need no DOM work.
  const resize = new win.ResizeObserver(changes => {
    let changed = false;
    for (const change of changes) {
      const entry = records.get(change.target);
      if (!entry) continue;
      const border = change.borderBoxSize?.[0] || change.borderBoxSize;
      const width = border?.inlineSize ?? change.contentRect.width;
      if (entry.observedWidth === undefined || Math.abs(entry.observedWidth - width) > .1) entry.measureDirty = changed = true;
      entry.observedWidth = width;
    }
    if (changed) schedule();
  });
  const attributeNames = ["data-sunlit-avatar-role", "data-sunlit-avatar-active", "data-sunlit-avatar-compact", "data-sunlit-avatar-position"];
  const propertyNames = ["--sunlit-avatar-original-start", "--sunlit-avatar-original-end", "--sunlit-message-avatar-scale"];
  function remove(node, entry) {
    resize.unobserve(node); entry.image.remove();
    for (const [key, value] of entry.attributes) { if (value === null) node.removeAttribute(key); else node.setAttribute(key, value); }
    for (const [key, value, priority] of entry.properties) { if (value) node.style.setProperty(key, value, priority); else node.style.removeProperty(key); }
    records.delete(node);
  }
  function add(node, role, css) {
    const image = doc.createElement("img");
    image.dataset.sunlitMessageAvatar = role; image.alt = ""; image.setAttribute("aria-hidden", "true");
    image.draggable = false; image.decoding = "async";
    const entry = { role, image, failed: false,
      attributes: attributeNames.map(key => [key, node.getAttribute(key)]),
      properties: propertyNames.map(key => [key, node.style.getPropertyValue(key), node.style.getPropertyPriority(key)]) };
    records.set(node, entry);
    image.onerror = () => { if (disposed || records.get(node) !== entry) return; entry.failed = true; setAttr(node, "data-sunlit-avatar-active", "false"); };
    node.style.setProperty(propertyNames[0], css.paddingInlineStart || "0px");
    node.style.setProperty(propertyNames[1], css.paddingInlineEnd || "0px");
    setAttr(node, "data-sunlit-avatar-role", role);
    if (css.position === "static") setAttr(node, "data-sunlit-avatar-position", "relative");
    node.append(image); image.src = sources[role]; resize.observe(node, { box: "border-box" });
    return entry;
  }
  function layout() {
    frame = 0; if (disposed) return;
    const focus = html.dataset.fusionFocus === "true" || context.root?.dataset.fusionFocus === "true";
    const mode = html.getAttribute("data-theme") === "dark" || (!html.hasAttribute("data-theme") && html.classList.contains("electron-dark")) ? "dark" : "light";
    const values = win.__SIGRIKA_DENIA_FUSION__?.getSettings?.()?.modes?.[mode]?.secondary;
    const enabled = values?.visible !== false;
    const scale = typeof values?.size === "number" && Number.isFinite(values.size) ? Math.min(160, Math.max(40, values.size)) / 100 : 1;
    if (discoveryDirty) {
      discoveryDirty = false;
      candidates = discover();
    }
    const nodes = candidates;
    for (const [node, entry] of records) if (!nodes.has(node) || nodes.get(node) !== entry.role) remove(node, entry);
    // Finish geometry/style reads before adding avatars or changing padding.
    const measurements = [...nodes].filter(([, role]) => sources[role]).map(([node, role]) => {
      const entry = records.get(node), css = entry ? null : win.getComputedStyle(node);
      return { node, role, width: geometryDirty || !entry || entry.measureDirty ? node.getBoundingClientRect().width : entry.width,
        hidden: !!node.closest('[hidden],[inert]'),
        css: css && { paddingInlineStart: css.paddingInlineStart, paddingInlineEnd: css.paddingInlineEnd, position: css.position } };
    });
    for (const { node, role, width, hidden, css } of measurements) {
      const entry = records.get(node) || add(node, role, css);
      entry.width = width; entry.measureDirty = false;
      if (node.style.getPropertyValue("--sunlit-message-avatar-scale") !== String(scale)) node.style.setProperty("--sunlit-message-avatar-scale", String(scale));
      setAttr(node, "data-sunlit-avatar-compact", String(width < 520));
      setAttr(node, "data-sunlit-avatar-active", String(enabled && !focus && !entry.failed && width >= 180 && !hidden));
    }
    geometryDirty = false;
  }
  function discover() {
    const nodes = new Map([...doc.querySelectorAll('.thread-scroll-container [data-tessalume-message="assistant"],.thread-scroll-container [data-tessalume-message="user"]')].map(node => [node, node.getAttribute("data-tessalume-message")]));
    // Native user bubbles can contain plain text or attachments without any
    // MarkdownRoot, so the runtime may not have assigned a message role yet.
    for (const bubble of doc.querySelectorAll('.thread-scroll-container [data-user-message-bubble="true"]')) {
      const node = bubble.closest('[data-tessalume-message="user"]') || bubble.closest('[data-content-search-unit-key]') || bubble.parentElement;
      if (node && node.getAttribute("data-tessalume-message") !== "assistant") nodes.set(node, "user");
    }
    for (const node of [...nodes.keys()]) for (let parent = node.parentElement; parent; parent = parent.parentElement) if (nodes.has(parent)) { nodes.delete(node); break; }
    return nodes;
  }
  function schedule() { if (!disposed && !frame) frame = win.requestAnimationFrame(layout); }
  const observer = new win.MutationObserver(changes => {
    let update = false;
    const selector = '.thread-scroll-container,[data-tessalume-message],[data-user-message-bubble="true"]';
    for (const change of changes) {
      if (change.type === "attributes") {
        if (change.attributeName === "data-tessalume-message" || change.attributeName === "data-user-message-bubble" ||
          (change.attributeName === "class" && (change.target.matches('.thread-scroll-container') || (change.oldValue || '').split(/\s+/).includes('thread-scroll-container')))) discoveryDirty = update = true;
        else if (change.target === html || change.target === context.root || change.attributeName === "hidden" || change.attributeName === "inert") {
          update = true;
          if (change.attributeName === "hidden" || change.attributeName === "inert") geometryDirty = true;
        }
      } else if ([...change.addedNodes, ...change.removedNodes].some(node => node.nodeType === 1 &&
        !node.matches('[data-sunlit-message-avatar]') && (node.matches(selector) || node.querySelector(selector) || [...records.keys()].some(message => node.contains(message))))) discoveryDirty = update = true;
    }
    if (update) schedule();
  });
  observer.observe(html, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ["data-tessalume-message", "data-user-message-bubble", "data-fusion-focus", "data-fusion-secondary-visible", "data-fusion-secondary-size", "data-theme", "hidden", "inert", "class"] });
  const onResize = () => { geometryDirty = true; schedule(); };
  win.addEventListener("resize", onResize, { passive: true });
  function dispose() {
    if (disposed) return; disposed = true; win.cancelAnimationFrame(frame);
    observer.disconnect(); resize.disconnect(); win.removeEventListener("resize", onResize);
    for (const [node, entry] of records) { entry.image.onerror = null; remove(node, entry); }
    candidates.clear();
    if (previousEnabled === null) html.removeAttribute("data-sunlit-message-avatars"); else html.setAttribute("data-sunlit-message-avatars", previousEnabled);
    if (win[apiKey]?.dispose === dispose) delete win[apiKey];
  }
  const api = { refresh: () => { discoveryDirty = geometryDirty = true; schedule(); }, dispose, getStatus: () => ({ disposed, count: records.size, active: [...records.keys()].filter(node => node.dataset.sunlitAvatarActive === "true").length }) };
  win[apiKey] = api; context.addCleanup(dispose); schedule(); return api;
}
