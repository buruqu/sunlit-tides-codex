registerTheme({
  async mount(context) {
    const { root, config } = context;
    const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    root.setAttribute("aria-hidden", "true");
    context.renderTemplateV1({
      stageClass: "sgk-stage",
      hero: {
        tag: "section", className: "sgk-hero-copy",
        html: `<div class="sgk-home-title"><span class="sgk-hero-kicker" data-theme-part="hero-kicker"><i></i><span class="sgk-light-only">西格莉卡 · 达妮娅</span><span class="sgk-dark-only">西格莉卡 · 达妮娅</span></span>
          <h1 class="sgk-light-only" data-theme-part="hero-title-light">晴光<em>与泡影</em></h1>
          <h1 class="sgk-dark-only" data-theme-part="hero-title-dark">夜色<em>相依</em></h1>
          <p class="sgk-light-only">${escape(config.subtitle || "把期待写成晴光，让灵感泛起涟漪。")}</p>
          <p class="sgk-dark-only">温暖仍在，只是回应更轻。</p>
          <div class="sgk-dumpling-pair"><i class="sgk-dumpling-sigrika" aria-label="西西团子"></i><i class="sgk-dumpling-denia" aria-label="娅娅团子"></i></div><div class="sgk-duo-orbit" data-theme-part="hero-motion"><i></i><i></i><i></i><span></span></div>
          <div class="sgk-hero-note" data-theme-part="hero-note"><span class="sgk-light-only">把每一个相伴的瞬间，收进今天。</span><span class="sgk-dark-only">靠近一点，听见夜色里的回应。</span></div></div>
          <figure class="sgk-travel-postcard"><i class="sgk-light-only sgk-photo-train"></i><i class="sgk-dark-only sgk-photo-dream"></i><figcaption><span class="sgk-light-only">风经过的地方 · 也想带你去</span><span class="sgk-dark-only">晚安 · 把你抱进梦里</span><b>♡</b></figcaption></figure>
          <div class="sgk-moment-stack"><figure class="sgk-moment-one"><i class="sgk-light-only sgk-photo-heart"></i><i class="sgk-dark-only sgk-photo-evening"></i><figcaption class="sgk-light-only">把心意，悄悄比给你</figcaption><figcaption class="sgk-dark-only">一起望向夜色</figcaption></figure><figure class="sgk-moment-two"><i class="sgk-photo-story"></i><figcaption>靠近，就有了晴天</figcaption></figure></div>`
      },
      identity: {
        tag: "div", className: "sgk-identity",
        html: `<span class="sgk-identity-emblem" data-theme-part="identity-emblem"><i></i><i></i></span><div data-theme-part="identity-copy"><b class="sgk-light-only">${escape(config.title || "晴光与泡影")}</b><b class="sgk-dark-only">夜色相依</b><small>西格莉卡 · 达妮娅</small></div><i data-theme-part="identity-status"></i>`
      },
      taskLeft: {
        tag: "aside", className: "sgk-task-card sgk-task-card-left",
        html: `<div class="sgk-rail-memory"><i class="sgk-light-only sgk-photo-heart"></i><i class="sgk-dark-only sgk-photo-dream"></i><span class="sgk-light-only">心意相通 ♡</span><span class="sgk-dark-only">藏在梦里的牵挂</span></div><i data-theme-part="task-card-art"></i><div data-theme-part="task-card-caption"><b><span>01</span> 西格莉卡</b><small>把晴光分给你</small></div>`
      },
      taskPrimary: {
        tag: "aside", className: "sgk-task-card sgk-task-card-right sgk-task-card-primary",
        html: `<div class="sgk-rail-memory"><i class="sgk-light-only sgk-photo-evening"></i><i class="sgk-dark-only sgk-photo-story"></i><span class="sgk-light-only">并肩的每一天</span><span class="sgk-dark-only">等你再靠近一点</span></div><i data-theme-part="task-card-art"></i><div data-theme-part="task-card-caption"><b><span>02</span> 达妮娅</b><small class="sgk-light-only">也把泡影送给你</small><small class="sgk-dark-only">夜色深处，仍有回应</small></div>`
      },
      taskSecondary: {
        tag: "aside", className: "sgk-task-card sgk-task-card-right sgk-task-card-secondary",
        html: `<i class="sgk-dumpling-sigrika" data-theme-part="task-card-art" aria-label="西西团子"></i><i class="sgk-dumpling-denia" data-theme-part="dumpling-companion" aria-label="娅娅团子"></i><div data-theme-part="task-card-caption"><b>片刻相伴</b></div>`
      },
      memory: {
        tag: "aside", className: "sgk-memory sgk-quiet-placeholder", html: ""
      },
      syncPanel: { tag: "div", className: "sgk-quiet-placeholder", html: "" },
      composerAccessory: { tag: "div", className: "sgk-quiet-placeholder", html: "" }
    });
    context.mountCanonicalTheme({
      namespace: "sgk", themeClass: "sgk-theme", templateVersion: "1.0",
      preserveRoot: true, adaptiveLayout: true,
      sidebar: {
        palette: ["sunlight", "ripple", "rose", "moonlight"],
        projectTone: "semantic", threadIndex: "entry",
        sections: { "置顶": "置顶", "项目": "项目" }
      }
    });
    // Align the authored collage to the actual native banner, including narrow panes.
    let frame = 0;
    const hero = root.querySelector('[data-theme-role="hero"]');
    const stage = root.querySelector('[data-theme-stage]');
    const layout = () => {
      frame = 0;
      // A native popup may live inside main's stacking context while this hero
      // lives in the global stage. Yield only our decorative copy so an upward
      // project picker remains visible without restyling the native menu.
      const popup = [...context.document.querySelectorAll('[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper]')].some(node => {
        if (root.contains(node) || node.closest('[data-sgk-gallery],[data-fusion-ui],[hidden],[aria-hidden="true"],[data-state="closed"]')) return false;
        const b = node.getBoundingClientRect(), css = context.window.getComputedStyle(node);
        return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < context.window.innerHeight &&
          css.display !== "none" && css.visibility !== "hidden" && Number(css.opacity) !== 0;
      });
      if (hero && hero.getAttribute("data-sgk-native-popup") !== String(popup)) hero.setAttribute("data-sgk-native-popup", String(popup));
      const banner = context.document.querySelector('[data-tessalume-home-part="banner"]');
      if (!banner || !hero || !stage) return;
      const b = banner.getBoundingClientRect(), s = stage.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) return;
      for (const [key, value] of Object.entries({
        "--sgk-home-left":(b.left-s.left)+"px","--sgk-home-top":(b.top-s.top)+"px",
        "--sgk-home-width":b.width+"px","--sgk-home-height":b.height+"px"
      })) if (hero.style.getPropertyValue(key)!==value) hero.style.setProperty(key,value);
      hero.classList.toggle("sgk-home-compact",b.width<940);
      hero.classList.toggle("sgk-home-small",b.width<620);
    };
    const schedule = () => {if(!frame)frame=context.window.requestAnimationFrame(layout)};
    const observer = new MutationObserver(records => {
      if(records.some(r=>!(typeof isFusionScrollMutation === "function" && isFusionScrollMutation(r))&&!root.contains(r.target)&&!r.target.closest?.('[data-sgk-gallery],[data-fusion-ui],[data-fusion-bubbles]')))schedule();
    });
    observer.observe(context.document.documentElement,{subtree:true,childList:true,attributes:true,attributeOldValue:true,attributeFilter:["class","style","hidden","aria-hidden","role","data-state"]});
    context.window.addEventListener("resize",schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(context.document.documentElement);
    const pane = context.document.querySelector('[data-app-shell-main-content-layout]');
    if(pane)resize.observe(pane);
    schedule();
    context.addCleanup(()=>{observer.disconnect();resize.disconnect();context.window.removeEventListener("resize",schedule);context.window.cancelAnimationFrame(frame)});
  },
  async unmount() {}
});

