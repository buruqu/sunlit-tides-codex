(async () => {
  if (!(%%ALLOWED%%)) return true;
  const gate = window.__SUNLIT_TIDES_HOST_GATE__ ||= {enabled:false,epoch:0,inFlight:null};
  gate.enabled = false;
  gate.epoch++;
  // An image/settings await may precede runtime publication. Wait through that commit;
  // its captured generation then forces disposal before restoration can report success.
  try { await gate.inFlight; } catch {}
  await (%%REMOVAL%%);
  delete window.__SUNLIT_TIDES_HOST_MARKER__;
  return true;
})()
