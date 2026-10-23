(() => {
  if (!(%%ALLOWED%%)) return;
  // Capture the generation before queueing DOM readiness: restore invalidates this callback.
  const gate = window.__SUNLIT_TIDES_HOST_GATE__ ||= {enabled:true,epoch:0,inFlight:null};
  const epoch = gate.epoch;
  const install = %%INSTALL%%;
  const boot = () => {
    if (gate.enabled && gate.epoch === epoch) void install(gate, epoch).catch(() => {});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})()
