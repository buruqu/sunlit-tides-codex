(async (gate, epoch) => {
  if (!gate.enabled || gate.epoch !== epoch) return {installed:false,cancelled:true};
  if (gate.inFlight) return await gate.inFlight;
  const job = (async () => {
    const result = await (%%PAYLOAD%%);
    if (!gate.enabled || gate.epoch !== epoch) {
      await (%%REMOVAL%%);
      delete window.__SUNLIT_TIDES_HOST_MARKER__;
      return {installed:false,cancelled:true};
    }
    const runtime = window.__TESSALUME_RUNTIME__;
    if (result?.installed !== true || result?.themeId !== 'sunlit-tides.codex' ||
        runtime?.themeId !== 'sunlit-tides.codex' || runtime?.fingerprint !== %%FINGERPRINT%%) {
      throw new Error('theme-acceptance');
    }
    window.__SUNLIT_TIDES_HOST_MARKER__ = {id:'sunlit-tides.codex',version:'1.1.0',fingerprint:%%FINGERPRINT%%};
    return {installed:true,themeId:'sunlit-tides.codex'};
  })();
  gate.inFlight = job;
  try { return await job; }
  finally { if (gate.inFlight === job) gate.inFlight = null; }
})
