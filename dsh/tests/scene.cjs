/* Isolated browser contract test; never connects to a running DSH. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const project=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(project,'theme.json'),'utf8'));
const mime={'.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.gif':'image/gif'};
const assets=Object.fromEntries(Object.entries(manifest.assets).map(([id,file])=>[id,'data:'+mime[path.extname(file)]+';base64,'+fs.readFileSync(path.join(project,file)).toString('base64')]));
async function run(){
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setContent('<html><body style="margin:0"><div id="scene" style="position:fixed;inset:0;background-size:cover;background-position:55% 0%;pointer-events:none"></div><main style="position:relative;margin:100px;width:400px;height:250px">Synthetic chat<input></main></body></html>');
    await page.addScriptTag({path:path.join(project,'src/scene-runtime.js')});
    await page.evaluate(({config,assets})=>{window.api=mountDshSunlitScene({window,document,root:document.querySelector('#scene'),config,assets,settings:{scene:'orchard',motion:false}});},{config:manifest.config,assets});
    assert.equal(await page.locator('canvas').count(),0);
    await page.evaluate(()=>api.refresh({motion:true}));
    await page.waitForFunction(()=>api.getState().ready,{},{timeout:30000});
    let state=await page.evaluate(()=>api.getStateAsync());
    assert.equal(state.scene,'orchard');assert.equal(state.maxFps,120);assert.ok(state.layers>0);
    assert.ok(state.layerMeshes.filter(layer=>/orchard-layer-(xixi|denia)-body/.test(layer.id)).every(layer=>layer.vertices>200),'Breathing bodies must have a deformable mesh');
    const breath=await page.evaluate(async config=>{
      const layers=config.layeredScene.layers.filter(layer=>layer.kind==='body' && layer.breathRegions?.length);
      const samples=layers.map(layer=>{const tip=layer.motionTip,out=new Float32Array(4);sunlitSceneVertexAt(layer,1.2,tip[0],tip[1],out);return {id:layer.asset,displacement:Math.hypot(out[0]-tip[0],out[1]-tip[1])};});
      const fixed=layers.map((layer,index)=>{const point=index?[810,315]:[400,450],out=new Float32Array(4);sunlitSceneVertexAt(layer,1.2,point[0],point[1],out);return Math.hypot(out[0]-point[0],out[1]-point[1]);});
      const renderer=window.__DSH_SUNLIT_SCENE_RENDERER__;renderer.updateSettings({scene:'orchard',motion:true,lighting:false,blink:false});renderer.refresh();renderer.freezeTime(0);
      const first=await renderer.capturePixels(0);renderer.freezeTime(1.2);const second=await renderer.capturePixels(1.2),geometry=renderer.getState();
      let changedPixels=0,maxDelta=0;
      for(let sy=687;sy<747;sy++)for(let sx=335;sx<395;sx++){
        const px=Math.round((sx/geometry.sourceWidth-geometry.cover[2])/geometry.cover[0]*second.width),py=Math.round((sy/geometry.sourceHeight-geometry.cover[3])/geometry.cover[1]*second.height);
        if(px<0 || px>=second.width || py<0 || py>=second.height)continue;
        const i=((second.height-1-py)*second.width+px)*4,delta=Math.abs(second.data[i]-first.data[i])+Math.abs(second.data[i+1]-first.data[i+1])+Math.abs(second.data[i+2]-first.data[i+2]);
        if(delta>8)changedPixels++;maxDelta=Math.max(maxDelta,delta);
      }
      return {samples,fixed,changedPixels,maxDelta,thread:geometry.renderThread};
    },manifest.config);
    assert.equal(breath.samples.length,2);assert.ok(breath.samples.every(sample=>sample.displacement>1));assert.ok(breath.fixed.every(distance=>distance<.001));assert.ok(breath.changedPixels>25,'GPU pixels in the body garment must visibly change with breathing');
    await page.screenshot({path:path.join(project,'test-results/orchard-breathing.png')});
    fs.writeFileSync(path.join(project,'test-results/orchard-breathing.json'),JSON.stringify(breath,null,2));
    await page.evaluate(()=>{window.__DSH_SUNLIT_SCENE_RENDERER__.freezeTime(null);api.refresh({lighting:true,blink:true});});
    const geometry=await page.locator('canvas').boundingBox();assert.equal(geometry.width,1280);assert.equal(geometry.height,800);
    assert.deepEqual(await page.evaluate(()=>({html:document.documentElement.getAttributeNames(),main:document.querySelector('main').getAttributeNames()})),{html:[],main:['style']});
    await page.evaluate(()=>api.refresh({scene:'night-tears'}));
    await page.waitForFunction(()=>api.getState().ready && api.getState().scene==='night-tears',{},{timeout:30000});
    state=await page.evaluate(()=>api.getStateAsync());assert.equal(state.tearEnabled,true);assert.ok(state.tearAmounts.length>0);
    await page.evaluate(()=>document.querySelector('input').dispatchEvent(new Event('input',{bubbles:true})));
    assert.equal((await page.evaluate(()=>api.getState())).reason,'interaction');
    await page.waitForFunction(()=>api.getState().reason==='running');
    await page.evaluate(()=>api.refresh({lighting:false,blink:false}));
    state=await page.evaluate(()=>api.getStateAsync());assert.equal(state.lightingEnabled,false);assert.equal(state.blinkEnabled,false);
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>api.getState().reason==='reduced-motion');assert.equal(await page.locator('canvas').count(),0);
    await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>api.getState().ready);
    await page.evaluate(()=>api.refresh({scene:'gallery-other'}));assert.equal(await page.locator('canvas').count(),0);
    await page.evaluate(()=>{api.dispose();api.dispose();});assert.equal(await page.locator('canvas').count(),0);assert.equal(await page.evaluate(()=>!!window.__DSH_SUNLIT_SCENE_RENDERER__),false);
    await page.evaluate(({config,assets})=>{config.layeredScene.forceMainThread=true;window.fixture={config,assets};window.api=mountDshSunlitScene({window,document,root:document.querySelector('#scene'),config,assets,settings:{scene:'night'}});},{config:manifest.config,assets});
    await page.waitForFunction(()=>api.getState().ready,{},{timeout:30000});assert.equal((await page.evaluate(()=>api.getStateAsync())).renderThread,'main');
    await page.evaluate(()=>{api.dispose();const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).includes('webgl')?null:original.call(this,type,...args);};try{window.api=mountDshSunlitScene({window,document,root:document.querySelector('#scene'),...fixture,settings:{scene:'orchard'}});}finally{HTMLCanvasElement.prototype.getContext=original;}});
    assert.equal((await page.evaluate(()=>api.getState())).reason,'error');assert.equal(await page.locator('canvas').count(),0);
    await page.evaluate(()=>api.dispose());
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,fullViewport:true,tearEnabled:true,orchardBreathing:breath,thread:state.renderThread,mainThreadFallback:true,gpuFailureStaticFallback:true,scenes:['orchard','night','night-tears'],reducedMotion:true,interactionPause:true,disposed:true}));
  }finally{await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
