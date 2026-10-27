/* Exercise the actual built ModuleLoader boundary using a synthetic DSH shell. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const fixtureSource=fs.readFileSync(path.join(root,'tests/client.cjs'),'utf8').match(/const fixture = (`[\s\S]+?`);\r?\nconst checks/);
if(!fixtureSource)throw Error('Real-shell fixture contract changed');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(vm.runInNewContext(fixtureSource[1]));
  await page.evaluate(()=>{window.__ModuleLoader__={load(entry){window.loadedId=entry.id;window.loadedModule=entry.factory(()=>{throw Error('Unexpected dependency')});}};});
  await page.addScriptTag({path:path.join(root,'lib/client.js')});
  await page.evaluate(()=>{window.effects=[];window.loadedModule.apply({effect(fn){window.effects.push(fn());}});});
  await page.waitForFunction(()=>window.__DSH_SUNLIT_SCENE_RENDERER__?.getState().ready,null,{timeout:30000});
  const active=await page.evaluate(async()=>({id:loadedId,version:loadedModule.version,fingerprint:loadedModule.fingerprint,state:await __DSH_SUNLIT_SCENE_RENDERER__.getStateAsync(),roots:document.querySelectorAll('[data-sunlit-viewport]').length}));
  assert.equal(active.id,'@dsh-external/dsh-client-ui-skin-sunlit-tides');assert.equal(active.version,pkg.version);assert.equal(active.roots,1);assert.equal(active.state.renderThread,'worker');assert.equal(active.state.maxFps,120);
  await page.locator('[data-sunlit-toggle]').click();
  for(const [key,type] of [['companionOpacity','companion'],['emoteOpacity','emote']]) {
   const slider=page.locator(`[data-sunlit-setting=${key}]`);await slider.focus();await slider.press('Home');
   await page.waitForFunction(type=>document.querySelector(`[data-sunlit-${type}=left]`).hidden,type);
   await slider.press('End');
   assert.equal(await page.locator(`[data-sunlit-manual-category=${type}]`).evaluate(el=>getComputedStyle(el).opacity),'1');
   await page.locator(`[data-sunlit-follow=${key}]`).click();
   assert.equal(await page.locator(`[data-sunlit-${type}=left]`).evaluate(el=>!!el.closest('[data-sunlit-manual-decorations]')),false);
  }
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{loadedModule.apply({effect(fn){effects.push(fn());}});effects[0]();});
  assert.equal(await page.locator('[data-sunlit-viewport]').count(),1);
  await page.evaluate(()=>effects[1]());
  assert.equal(await page.locator('[data-sunlit-owner]').count(),0);assert.equal(await page.locator('canvas').count(),0);assert.deepEqual(errors,[]);
  const result={passed:true,version:active.version,fingerprint:active.fingerprint,moduleLoader:true,actualBundleBytes:fs.statSync(path.join(root,'lib/client.js')).size,worker:true,reentry:true,cleanup:true,browserErrors:errors,syntheticOnly:true};
  fs.writeFileSync(path.join(root,'test-results/package.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
