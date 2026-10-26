/* Read-only local motion diagnostics. No clicks, screenshot, chat text or preference changes. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/theme/manifest.json'),'utf8'));
const port=Number(process.argv.find(value=>value.startsWith('--port='))?.slice(7));
const expectedScene=process.argv.find(value=>value.startsWith('--expect-scene='))?.slice(15),checkTearPixels=process.argv.includes('--check-tear-pixels');
assert.ok(Number.isInteger(port)&&port>=1024&&port<=65535,'Pass verified loopback port');
(async()=>{
 const browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
 try{
  const pages=browser.contexts().flatMap(context=>context.pages()).filter(page=>page.url()==='app://-/index.html');
  assert.ok(pages.length,'No main page');const evidence=[];
  const snapshot=page=>page.evaluate(async()=>{
   const mains=[...document.querySelectorAll('main')],hiddenChain=node=>{const hidden=[];for(let current=node;current;current=current.parentElement){const css=getComputedStyle(current);if(current.hidden||current!==node&&current.getAttribute('aria-hidden')==='true'||current.inert||css.display==='none'||css.visibility==='hidden'||Number(css.opacity)===0)hidden.push({tag:current.tagName,display:css.display,visibility:css.visibility,opacity:css.opacity});}return hidden;},rect=node=>{const box=node?.getBoundingClientRect();return box?{x:box.x,y:box.y,width:box.width,height:box.height,right:box.right,bottom:box.bottom}:null;};
   const canvasHosts=[...document.querySelectorAll('.sunlit-layered-scene')].map(canvas=>{const main=canvas.closest('main');return {mainIndex:mains.indexOf(main),mainConnected:!!main?.isConnected,mainRect:rect(main),canvasRect:rect(canvas),hiddenAncestors:hiddenChain(canvas)};});
   return {version:window.__TESSALUME_RUNTIME__?.context.config.designVersion,fingerprint:window.__TESSALUME_RUNTIME__?.fingerprint,scene:document.documentElement.dataset.sgkScene,state:await window.__SUNLIT_LAYERED_SCENE__?.getStateAsync(),workerSupported:typeof Worker==='function'&&typeof HTMLCanvasElement.prototype.transferControlToOffscreen==='function',canvases:canvasHosts.length,mainCount:mains.length,canvasHosts,viewport:{width:innerWidth,height:innerHeight}};
  });
  for(const page of pages){
   const before=await snapshot(page),started=performance.now();await new Promise(resolve=>setTimeout(resolve,3000));const after=await snapshot(page),durationMs=performance.now()-started;
   assert.equal(after.version,manifest.version);assert.equal(after.fingerprint,manifest.fingerprint);assert.ok(after.canvases<=1);assert.equal(after.state?.error,null);if(expectedScene)assert.equal(after.scene,expectedScene);
   if(after.state?.ready){assert.ok(['orchard','night','night-tears'].includes(after.scene));assert.equal(after.state.scene,after.scene);assert.equal(after.canvases,1);assert.equal(after.state.maxFps,120);const host=after.canvasHosts[0];assert.equal(host.mainConnected,true);assert.ok(host.mainIndex>=0);assert.deepEqual(host.hiddenAncestors,[],'Artwork canvas is inside a hidden retained chat');assert.ok(host.mainRect.width>2&&host.mainRect.height>2&&host.mainRect.right>0&&host.mainRect.bottom>0&&host.mainRect.x<after.viewport.width&&host.mainRect.y<after.viewport.height&&host.canvasRect.width>2&&host.canvasRect.height>2,'Artwork canvas is bound to a zero-size/offscreen retained main');if(after.workerSupported){assert.equal(after.state.renderThread,'worker');assert.equal(after.state.workerReady,true);}}
   const frames=(after.state?.frames||0)-(before.state?.frames||0);
   const workerDurationMs=after.state?.workerTimestamp-before.state?.workerTimestamp;
   const renderFrames=(after.state?.cadence.renderedFrames||0)-(before.state?.cadence.renderedFrames||0);
   const rafCallbacks=(after.state?.cadence.rafCallbacks||0)-(before.state?.cadence.rafCallbacks||0),comparable=before.state?.reason==='running'&&after.state?.reason==='running'&&before.scene===after.scene&&before.state?.renderThread===after.state?.renderThread&&workerDurationMs>0;
   const observedFps=after.state?.renderThread==='worker'&&workerDurationMs>0?renderFrames*1000/workerDurationMs:frames*1000/durationMs,observedRafHz=after.state?.renderThread==='worker'&&workerDurationMs>0?rafCallbacks*1000/workerDurationMs:after.state?.cadence.observedRafHz,availableTargetFps=Math.min(120,observedRafHz || 0);
   if(comparable){assert.ok(renderFrames>0,'No actual rendered progress');assert.ok(observedRafHz>=55,'Native RAF itself is stalled on the verified 60Hz-or-faster environment');assert.ok(observedFps>=Math.max(55,availableTargetFps*.92)&&observedFps<=availableTargetFps*1.08,JSON.stringify({observedFps,observedRafHz,availableTargetFps}));}
   let tearPixels;
   if(checkTearPixels){
    assert.equal(after.scene,'night-tears');assert.equal(after.state?.tearEnabled,true);assert.equal(after.state?.reason,'running');
    tearPixels=await page.evaluate(async()=>{
     const api=__SUNLIT_LAYERED_SCENE__,samples=[];let previous=null;const initial=await api.getStateAsync(),cover=initial.cover;
     for(let sample=0;sample<8;sample++){
      if(sample)await new Promise(resolve=>setTimeout(resolve,600));const capture=await api.capturePixels(),state=await api.getStateAsync();let changed=0,count=0,hash=2166136261;
      for(let y=0;y<capture.height;y++){const sy=((y+.5)/capture.height*cover[1]+cover[3])*state.sourceHeight;if(sy<268||sy>=301)continue;for(let x=0;x<capture.width;x++){const sx=((x+.5)/capture.width*cover[0]+cover[2])*state.sourceWidth;if(!((sx>=532&&sx<545)||(sx>=584&&sx<602)))continue;const i=((capture.height-1-y)*capture.width+x)*4;count++;hash=Math.imul(hash^capture.data[i]^capture.data[i+1]<<8^capture.data[i+2]<<16,16777619);if(previous&&Math.max(...[0,1,2].map(k=>Math.abs(capture.data[i+k]-previous.data[i+k])))>2)changed++;}}
      samples.push({time:capture.time,frameId:capture.frameId,captureSequence:capture.captureSequence,cheekPixels:count,changedSincePrevious:changed,hash:hash>>>0,tearEnabled:state.tearEnabled,tearAmounts:state.tearAmounts});previous=capture;
     }
     return {samples,sourceRegions:[[532,268,13,33],[584,268,18,33]],method:'Actual installed artwork-only GPU readPixels at its natural running time; cheek corridors exclude blink masks and local-light masks; no seek or setting change'};
    });
    assert.ok(tearPixels.samples.every(sample=>sample.tearEnabled&&sample.cheekPixels>10));assert.ok(tearPixels.samples.some(sample=>sample.changedSincePrevious>5),'Installed main artwork has no actual moving cheek pixels');assert.ok(tearPixels.samples.at(-1).time-tearPixels.samples[0].time>=3);assert.ok(new Set(tearPixels.samples.map(sample=>sample.hash)).size>=3,'Installed tear GPU pixels must evolve, independently of diagnostics');
   }
   evidence.push({before,after,frames,durationMs,workerDurationMs,renderFrames,rafCallbacks,comparable,observedFps,observedRafHz,tearPixels,configuredTargetFps:120,availableTargetFps,refreshLimited:observedRafHz<114,interpretation:'120 is the configured ceiling. Actual frames follow min(observed native RAF,120); a 60Hz stream is reported as about 60, never 120.'});
  }
  const result={at:new Date().toISOString(),passed:true,evidence};fs.mkdirSync(path.join(root,'test-results'),{recursive:true});fs.writeFileSync(path.join(root,'test-results/motion-live.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({passed:true,version:manifest.version,evidence:evidence.map(({after,frames,observedFps,observedRafHz,availableTargetFps,refreshLimited,comparable,tearPixels})=>({scene:after.scene,ready:after.state?.ready,reason:after.state?.reason,renderer:after.state?.renderer,renderThread:after.state?.renderThread,mainCount:after.mainCount,canvasHosts:after.canvasHosts,frames,observedFps,observedRafHz,availableTargetFps,refreshLimited,comparable,tearPixels,cadence:after.state?.cadence,maxFps:after.state?.maxFps}))}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
