(() => {
  const enabled = %%ENABLED%%;
  const key = 'sunlit-tides.startup.enabled';
  if (!window.__sunlitTidesStartupListener) {
    window.__sunlitTidesStartupListener = event => {
      if (typeof event.detail?.enabled === 'boolean' && typeof window.sunlitTidesStartupChanged === 'function')
        window.sunlitTidesStartupChanged(JSON.stringify({enabled:event.detail.enabled}));
    };
    window.addEventListener('sunlit-tides:startup-change', window.__sunlitTidesStartupListener);
  }
  try { localStorage.setItem(key, String(enabled)); } catch {}
  window.__sunlitTidesStartup = {enabled,available:true};
  window.dispatchEvent(new CustomEvent('sunlit-tides:startup-state', {detail:{enabled,available:true}}));
  return true;
})()
