/* Synthetic DSH only: real Edge keyboard input, reload and alpha stacking. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const project = path.resolve(__dirname, '..'), source = fs.readFileSync(path.join(__dirname, 'client.cjs'), 'utf8');
const { fixture, manifest, assets, cssText } = new Function('require', '__dirname', source.slice(0, source.indexOf('const checks = []')) + ';return {fixture,manifest,assets,cssText}')(require, __dirname);
(async () => {
  const server = http.createServer((q,r) => { r.writeHead(200, {'content-type':'text/html;charset=utf-8'}); r.end(fixture); });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({channel:'msedge',headless:true});
  const checks=[], errors=[], dir=path.join(project,'test-results/decoration-controls'); fs.mkdirSync(dir,{recursive:true});
  try {
    const page=await browser.newPage({viewport:{width:1283,height:823}});
    page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const mount=async()=>{
      await page.addScriptTag({path:path.join(project,'src/client.js')});
      await page.evaluate(options=>{window.disposeControls=mountDshSunlitClient({window,document,...options});},{config:manifest.config,assets,cssText});
      await page.waitForFunction(()=>window.__dshSunlitTidesClient.getLayoutState().main?.width>0);
    };
    const open=()=>page.locator('[data-sunlit-toggle]').click();
    const keyInput=async(key,end)=>{const input=page.locator(`[data-sunlit-setting=${key}]`);await input.focus();await input.press(end);};
    const state=()=>page.evaluate(()=>{
      const alpha=el=>{let a=1;for(;el&&!el.hasAttribute('data-sunlit-main-scene');el=el.parentElement)a*=Number(getComputedStyle(el).opacity);return a;};
      return Object.fromEntries(['companion','emote'].map(type=>{const el=document.querySelector(`[data-sunlit-${type}=left]`);return [type,{alpha:alpha(el),manual:!!el.closest('[data-sunlit-manual-decorations]'),hidden:el.hidden,underWash:!!el.closest('[data-sunlit-artwork]'),pointer:getComputedStyle(el).pointerEvents}];}));
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(()=>localStorage.setItem('dsh.sunlit-tides.palette.v1',JSON.stringify({backgroundOpacity:35,readingWidth:812,scenes:{light:'orchard',dark:'night'}})));
    await mount();
    assert.equal((await state()).companion.manual,false);assert.equal((await state()).companion.alpha,.35);
    assert.equal(await page.locator('[data-sunlit-control=companionOpacity] output').textContent(),'自动跟随背景');
    checks.push('legacy preferences remain auto without resetting background or reading width');
    for(const mode of ['light','dark']) {
      await page.evaluate(dark=>document.body.toggleAttribute('data-ds-dark-theme',dark),mode==='dark');
      await page.waitForFunction(m=>document.body.dataset.sunlitMode===m,mode);
      await open();
      for(const [key,type,other] of [['companionOpacity','companion','emote'],['emoteOpacity','emote','companion']]) {
        const previous=(await state())[other];
        await keyInput(key,'Home'); await page.waitForFunction(t=>document.querySelector(`[data-sunlit-${t}=left]`).hidden,type);
        assert.equal((await state())[type].alpha,0);assert.equal((await state())[type].manual,true);
        assert.deepEqual((await state())[other],previous);
        await keyInput(key,'End');await page.waitForFunction(t=>!document.querySelector(`[data-sunlit-${t}=left]`).hidden,type);
        const full=(await state())[type];assert.equal(full.alpha,1);assert.equal(full.underWash,false);assert.equal(full.pointer,'none');
        assert.equal(await page.locator(`[data-sunlit-setting=${key}]`).inputValue(),'100');
      }
      await page.screenshot({path:path.join(dir,`${mode}-manual-100.png`)});
      // Store a different real keyboard value per mode, independently by class.
      await page.locator('[data-sunlit-setting=companionOpacity]').press(mode==='light'?'ArrowLeft':'Home');
      await page.locator('[data-sunlit-setting=emoteOpacity]').press(mode==='light'?'Home':'ArrowLeft');
      await page.keyboard.press('Escape');
    }
    checks.push('both native range controls accept keyboard 0/100 with independent full-opacity layers in light and dark');
    await page.reload();await mount();
    assert.equal(await page.locator('[data-sunlit-setting=companionOpacity]').inputValue(),'99');
    assert.equal(await page.locator('[data-sunlit-setting=emoteOpacity]').inputValue(),'0');
    await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));
    await page.waitForFunction(()=>document.body.dataset.sunlitMode==='dark');
    assert.equal(await page.locator('[data-sunlit-setting=companionOpacity]').inputValue(),'0');
    assert.equal(await page.locator('[data-sunlit-setting=emoteOpacity]').inputValue(),'99');
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('dsh.sunlit-tides.palette.v1')));
    assert.deepEqual(saved.companionOpacity,{light:99,dark:0});assert.deepEqual(saved.emoteOpacity,{light:0,dark:99});assert.equal(saved.readingWidth,812);assert.equal(saved.backgroundOpacity,35);
    checks.push('real page reload restores distinct bright/dark values and unrelated legacy preferences');
    for(const layout of ['panorama','separate']) {
      await open();await page.locator('[data-sunlit-setting=layout]').selectOption(layout);
      for(const key of ['companionOpacity','emoteOpacity'])await page.locator(`[data-sunlit-follow=${key}]`).click();
      await page.keyboard.press('Escape');
      await page.waitForFunction(l=>window.__dshSunlitTidesClient.getLayoutState().layout===l,layout);
      const auto=await state();assert.equal(auto.companion.manual,false);assert.equal(auto.emote.manual,false);
      assert.equal(auto.companion.underWash,layout==='panorama');assert.equal(auto.companion.alpha,layout==='panorama'?.35:1);
      await open();await keyInput('companionOpacity','End');await keyInput('emoteOpacity','End');await page.keyboard.press('Escape');
      const manual=await state();assert.equal(manual.companion.alpha,1);assert.equal(manual.emote.alpha,1);
      assert.deepEqual(await page.locator('[data-sunlit-manual-decorations]').boundingBox(),await page.locator('[data-sunlit-decorations]').boundingBox());
      await page.locator('#native-settings').click();
    }
    checks.push('follow buttons restore the original chain; manual geometry and native clicks work in both layouts');
    await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'dsh.sunlit-tides.palette.v1',newValue:JSON.stringify({companionOpacity:{light:Infinity,dark:-5},emoteOpacity:{light:'100',dark:999}})})));
    await page.waitForFunction(()=>document.querySelector('[data-sunlit-setting=companionOpacity]').value==='0');
    assert.equal(await page.locator('[data-sunlit-setting=emoteOpacity]').inputValue(),'100');
    await page.evaluate(()=>document.body.removeAttribute('data-ds-dark-theme'));await page.waitForFunction(()=>document.body.dataset.sunlitMode==='light');
    assert.equal(await page.locator('[data-sunlit-control=companionOpacity] output').textContent(),'自动跟随背景');
    assert.equal(await page.locator('[data-sunlit-control=emoteOpacity] output').textContent(),'自动跟随背景');
    await page.evaluate(()=>{disposeControls();disposeControls();});
    assert.equal(await page.locator('[data-sunlit-owner],[data-sunlit-manual-decorations]').count(),0);
    checks.push('invalid alpha values normalize safely and all manual layers dispose');
    assert.deepEqual(errors,[]);
    const report={passed:true,checks,browserErrors:errors,syntheticOnly:true};fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
