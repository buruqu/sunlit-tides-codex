/* Exercise the actual browser transport source; no native process or app UI. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../src/panel-transport.js'),'utf8');
const factory=()=>vm.runInNewContext(source+'\nmountDshPanelTransport;');
const ctx={connection:{rpc:{call:async()=>({ok:true,value:null})}}};
const makeWindow=()=>({crypto:crypto.webcrypto,AbortController,console});
let passed=0;
for(const external of [undefined,{available:true,send(){},subscribe(){}}]){
 for(const order of [[0,1],[1,0]]){
  const window=makeWindow();
  if(external)window.__SUNLIT_PANEL_TRANSPORT__=external;
  // Separate factories reproduce a reload that cannot share lexical state.
  const stops=[factory()(ctx,window)],first=window.__SUNLIT_PANEL_TRANSPORT__;
  stops.push(factory()(ctx,window));const second=window.__SUNLIT_PANEL_TRANSPORT__;
  assert.notEqual(first,second);
  stops[order[0]]();
  assert.equal(window.__SUNLIT_PANEL_TRANSPORT__,order[0]===0?second:first);
  stops[order[1]]();
  assert.equal(window.__SUNLIT_PANEL_TRANSPORT__,external,'All owned instances are removed, preserving the external predecessor');
  assert.equal(first.available,false);assert.equal(second.available,false);
  stops[0]();stops[1]();assert.equal(window.__SUNLIT_PANEL_TRANSPORT__,external,'Disposal is idempotent');
  passed++;
 }
}
// A different owner may replace the global while this plugin is still loaded.
{
 const window=makeWindow(),stop=factory()(ctx,window),replacement={available:true};
 window.__SUNLIT_PANEL_TRANSPORT__=replacement;stop();
 assert.equal(window.__SUNLIT_PANEL_TRANSPORT__,replacement);passed++;
}
// More than two overlapping reloads must not retain an old disposed instance.
{
 const window=makeWindow(),stops=[factory()(ctx,window),factory()(ctx,window),factory()(ctx,window)];
 stops[1]();stops[0]();stops[2]();
 assert.equal(Object.hasOwn(window,'__SUNLIT_PANEL_TRANSPORT__'),false);passed++;
}
console.log(JSON.stringify({passed,failed:0,actualTransportSource:true,nativeAppTouched:false}));
