/* Sidebar markers and SVG paint resources only; never inspect transcript text
   or add a native flex item. Observers never scan the streaming transcript. */
function mountSunlitSidebar(context) {
  const { document: doc, window: win } = context;
  const key = "__SUNLIT_SIDEBAR__", html = doc.documentElement;
  win[key]?.dispose?.();
  const selector = 'aside.app-shell-left-panel,[data-tessalume-surface="sidebar"]';
  const originalActive = html.getAttribute("data-sunlit-sidebar-active");
  html.setAttribute("data-sunlit-sidebar-active", "true");
  let sidebar = null, originalSidebar = null, disposed = false, frame = 0, updates = 0;
  let brand = null, brandMarker = null, paint = null;
  const brandSelector = '[data-sidebar-navigation-root] [class~="@container/navigation-header"]>button svg[role="img"]';
  const sidebarStructure = new win.MutationObserver(() => {
    if (!brand?.isConnected) schedule();
  });
  function detachBrand() {
    paint?.remove(); paint = null;
    if (brand) {
      if (brandMarker === null) brand.removeAttribute("data-sunlit-brand");
      else brand.setAttribute("data-sunlit-brand", brandMarker);
    }
    brand = null; brandMarker = null;
  }
  function attachBrand() {
    if (brand?.isConnected) return;
    detachBrand();
    brand = sidebar?.querySelector(brandSelector);
    if (!brand) return;
    // A native sidebar clone can carry our old paint resources. Adopt it as a
    // fresh attachment so IDs stay unique and disposal removes all our marks.
    const stalePaint = brand.querySelector('defs[data-sunlit-paint="true"]');
    brandMarker = stalePaint ? null : brand.getAttribute("data-sunlit-brand");
    stalePaint?.remove();
    brand.setAttribute("data-sunlit-brand", "true");
    const svg = "http://www.w3.org/2000/svg";
    paint = doc.createElementNS(svg, "defs");
    paint.setAttribute("data-sunlit-paint", "true");
    const gradient = doc.createElementNS(svg, "linearGradient");
    gradient.id = "sunlit-sidebar-brand-gradient";
    gradient.setAttribute("x1", "0%"); gradient.setAttribute("x2", "100%");
    gradient.setAttribute("y1", "0%"); gradient.setAttribute("y2", "55%");
    for (const offset of ["0%", "48%", "100%"]) {
      const stop = doc.createElementNS(svg, "stop");stop.setAttribute("offset", offset);gradient.append(stop);
    }
    paint.append(gradient);brand.prepend(paint);
  }
  function detach() {
    sidebarStructure.disconnect(); detachBrand();
    if (!sidebar) return;
    if (originalSidebar === null) sidebar.removeAttribute("data-sunlit-sidebar");
    else sidebar.setAttribute("data-sunlit-sidebar", originalSidebar);
    sidebar = null; originalSidebar = null;
  }
  function refresh() {
    frame = 0; if (disposed) return; updates++;
    if (sidebar?.isConnected) { attachBrand(); return; }
    detach();
    sidebar = doc.querySelector(selector);
    if (sidebar) {
      originalSidebar = sidebar.getAttribute("data-sunlit-sidebar");
      if (originalSidebar !== "true") sidebar.setAttribute("data-sunlit-sidebar", "true");
      sidebarStructure.observe(sidebar, { childList:true, subtree:true });
      attachBrand();
    }
  }
  function schedule() { if (!disposed && !frame) frame = win.requestAnimationFrame(refresh); }
  const structure = new win.MutationObserver(changes => {
    // Streaming additions elsewhere require no queries, geometry, or frames.
    if (sidebar?.isConnected) return;
    if (changes.some(change => [...change.addedNodes, ...change.removedNodes].some(node => node.nodeType === 1))) schedule();
  });
  structure.observe(doc.body, { childList: true, subtree: true });
  function dispose() {
    if (disposed) return; disposed = true;
    win.cancelAnimationFrame(frame); structure.disconnect(); detach();
    if (originalActive === null) html.removeAttribute("data-sunlit-sidebar-active"); else html.setAttribute("data-sunlit-sidebar-active", originalActive);
    if (win[key]?.dispose === dispose) delete win[key];
  }
  const api = {
    getStatus: () => ({ attached: !!sidebar?.isConnected, artwork: html.dataset.fusionSidebarArt !== "false", brand: !!brand?.isConnected, updates, disposed }),
    refresh: schedule, dispose
  };
  win[key] = api; context.addCleanup?.(dispose); refresh(); return api;
}
