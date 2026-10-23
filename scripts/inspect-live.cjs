/* Read-only post-install diagnostic: style/geometry/theme markers only, no chat text. */
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const port=Number(process.argv.find(v=>v.startsWith('--port='))?.slice(7));
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Pass verified local Codex port as --port=N');
(async()=>{
 const browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
 try{
  const pages=browser.contexts().flatMap(c=>c.pages()).filter(p=>p.url()==='app://-/index.html');
  const results=[];
  for(const page of pages)results.push(await page.evaluate(()=>{
   const visible=n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&!n.closest('[hidden],[aria-hidden="true"]');};
   const describe=n=>({tag:n.tagName,overflowX:getComputedStyle(n).overflowX,overflowY:getComputedStyle(n).overflowY,clientHeight:n.clientHeight,scrollHeight:n.scrollHeight,scrollTop:n.scrollTop});
   return {themeId:window.__TESSALUME_RUNTIME__?.themeId??null,version:window.__TESSALUME_RUNTIME__?.context.config.designVersion??null,
    fingerprint:window.__TESSALUME_RUNTIME__?.fingerprint??null,host:window.__SUNLIT_TIDES_HOST_MARKER__??null,
    mode:document.documentElement.getAttribute('data-theme'),scene:document.documentElement.getAttribute('data-sgk-scene'),galleryElements:document.querySelectorAll('[data-sgk-gallery]').length,
    themeRoots:document.querySelectorAll('#tessalume-theme-root').length,palettes:document.querySelectorAll('[data-fusion-ui="palette"]').length,
    layer:window.__SUNLIT_LAYERED_SCENE__?{ready:window.__SUNLIT_LAYERED_SCENE__.getState().ready,error:window.__SUNLIT_LAYERED_SCENE__.getState().error}:null,
    main:[...document.querySelectorAll('main')].filter(visible).map(describe),transcript:[...document.querySelectorAll('.thread-scroll-container')].filter(visible).map(describe)};
  }));
  const out=path.resolve(__dirname,'../test-results/live-inspect.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),results},null,2));console.log(JSON.stringify(results));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
