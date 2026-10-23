(() => {
  if (window.__sunlitTidesStartupListener)
    window.removeEventListener('sunlit-tides:startup-change', window.__sunlitTidesStartupListener);
  delete window.__sunlitTidesStartupListener;
  delete window.__sunlitTidesStartup;
  window.dispatchEvent(new CustomEvent('sunlit-tides:startup-state', {detail:{available:false}}));
  return true;
})()
