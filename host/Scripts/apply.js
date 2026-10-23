(async () => {
  if (!(%%ALLOWED%%)) return {installed:false,skipped:true};
  const gate = window.__SUNLIT_TIDES_HOST_GATE__ ||= {enabled:true,epoch:0,inFlight:null};
  gate.enabled = true;
  const install = %%INSTALL%%;
  return await install(gate, gate.epoch);
})()
