/* Real CSS leaf motion on synthetic DSH; no running host or conversation reads. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const project = path.resolve(__dirname, '..'), source = fs.readFileSync(path.join(__dirname, 'client.cjs'), 'utf8');
const { fixture, manifest, assets, cssText } = new Function('require', '__dirname', source.slice(0, source.indexOf('const checks = []')) + ';return {fixture,manifest,assets,cssText}')(require, __dirname);
async function run() {
  const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html;charset=utf-8' }); r.end(fixture); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [], checks = [], dir = path.join(project, 'test-results/leaves'); fs.mkdirSync(dir, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const mount = async () => { await page.addScriptTag({ path: path.join(project, 'src/client.js') }); await page.evaluate(options => { window.disposeLeafSkin = mountDshSunlitClient({ window, document, ...options }); }, { config: manifest.config, assets, cssText }); await page.waitForFunction(() => window.__dshSunlitTidesClient.getLayoutState().main?.width > 0); };
    const open = () => page.locator('[data-sunlit-toggle]').click();
    const setRange = async (key, value) => { const input = page.locator(`[data-sunlit-setting=${key}]`); await input.fill(String(value)); await input.dispatchEvent('input'); };
    const chooseLayout = async value => { await open(); await page.locator('[data-sunlit-setting=layout]').selectOption(value); await page.keyboard.press('Escape'); await page.waitForFunction(layout => window.__dshSunlitTidesClient.getLayoutState().layout === layout, value); };
    const chooseScene = async (mode, scene) => {
      await open(); await page.locator(`[data-sunlit-mode-choice=${mode}]`).click(); await page.locator(`[data-sunlit-scene-choice=${scene}]`).click(); await page.keyboard.press('Escape');
      await page.evaluate(dark => document.body.toggleAttribute('data-ds-dark-theme', dark), mode === 'dark');
      await page.waitForFunction(value => document.querySelector('[data-sunlit-background]').dataset.sunlitScene === value, scene);
    };
    await page.goto(`http://127.0.0.1:${server.address().port}`); await mount();
    const leaf = page.locator('[data-sunlit-bubbles]>i:not([hidden])').first();
    assert.equal(await page.locator('[data-sunlit-bubbles]>i').count(), 18);
    const material = await leaf.evaluate(el => { const s = getComputedStyle(el); return { width: parseFloat(s.width), height: parseFloat(s.height), radius: s.borderRadius, background: s.backgroundImage, veins: getComputedStyle(el, '::before').content, animation: s.animationName, pointer: s.pointerEvents }; });
    assert.ok(material.width > material.height * 1.5); assert.notEqual(material.radius, '50%'); assert.match(material.background, /linear-gradient/); assert.equal(material.veins, '""'); assert.equal(material.animation, 'sunlit-leaf-fall'); assert.equal(material.pointer, 'none');
    checks.push('green leaf silhouette and veins retain click-through CSS');
    const before = await page.locator('[data-sunlit-bubbles]>i').evaluateAll(els => els.map(el => ({ y: el.getBoundingClientRect().y, hidden: el.hidden })));
    await page.waitForTimeout(600);
    const after = await page.locator('[data-sunlit-bubbles]>i').evaluateAll(els => els.map(el => el.getBoundingClientRect().y));
    assert.ok(before.some((item, index) => !item.hidden && after[index] - item.y > 5 && after[index] - item.y < 100));
    checks.push('live leaves fall downward'); await page.screenshot({ path: path.join(dir, 'dsh-leaves-light.png') });
    await open(); await page.locator('[data-sunlit-setting=bubbles]').uncheck();
    assert.equal(await page.locator('[data-sunlit-bubbles]').isVisible(), false);
    await page.reload(); await mount(); assert.equal(await page.locator('[data-sunlit-bubbles]').isVisible(), false);
    checks.push('legacy bubbles key remains the leaf switch and persists on reload');
    await open(); await page.locator('[data-sunlit-setting=bubbles]').check();
    const duration = await leaf.evaluate(el => parseFloat(getComputedStyle(el).animationDuration));
    await setRange('bubbleSpeed', 200); assert.ok(await leaf.evaluate(el => parseFloat(getComputedStyle(el).animationDuration)) < duration);
    await setRange('bubbleCount', 5); assert.equal(await page.locator('[data-sunlit-bubbles]>i').count(), 5);
    await page.keyboard.press('Escape'); await page.reload(); await mount();
    assert.equal(await page.locator('[data-sunlit-bubbles]>i').count(), 5); assert.equal(await page.locator('[data-sunlit-setting=bubbleSpeed]').inputValue(), '200');
    checks.push('leaf quantity and speed update immediately and survive reload');
    await open(); await page.locator('[data-sunlit-setting=motion]').uncheck(); assert.equal(await page.locator('[data-sunlit-bubbles]').isVisible(), false);
    await page.locator('[data-sunlit-setting=motion]').check(); await page.keyboard.press('Escape');
    await page.emulateMedia({ reducedMotion: 'reduce' }); assert.equal(await page.locator('[data-sunlit-bubbles]').isVisible(), false);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.body.dataset.sunlitMotion === 'on');
    checks.push('motion off and OS reduced motion suppress all leaves');
    for (const scene of ['night', 'night-tears', 'heart']) {
      await chooseScene('dark', scene);
      const bubble = await leaf.evaluate(el => { const s=getComputedStyle(el); return { animation:s.animationName,radius:s.borderRadius,width:s.width,height:s.height,veins:getComputedStyle(el,'::before').content,hostOpacity:getComputedStyle(el.parentElement).opacity }; });
      assert.equal(bubble.animation, 'sunlit-rise'); assert.equal(bubble.radius, '50%'); assert.equal(bubble.width,bubble.height); assert.equal(bubble.veins,'none'); assert.equal(bubble.hostOpacity,'1');
      await page.screenshot({ path: path.join(dir, `dsh-bubbles-${scene}.png`) });
    }
    checks.push('night, night-tears and other scenes restore original translucent rising bubbles');
    await chooseScene('dark', 'orchard');
    assert.equal(await leaf.evaluate(el => getComputedStyle(el).animationName), 'sunlit-leaf-fall');
    await page.screenshot({ path: path.join(dir, 'dsh-leaves-dark-orchard.png') });
    checks.push('dark orchard also uses leaves because particle choice follows scene, not theme mode');
    await page.evaluate(()=>{window.leafNativeClicks=0;document.querySelector('#native-settings').addEventListener('click',()=>leafNativeClicks++);});
    for(const layout of ['panorama','separate']) {
      await chooseLayout(layout);
      for(const mode of ['light','dark']) {
        await chooseScene(mode,'orchard');
        for(const value of [0,35,100]) {
          await open(); await setRange('backgroundOpacity',value); await page.keyboard.press('Escape');
          const contribution=await leaf.evaluate(el=>{
            const alpha=node=>{let value=1;for(;node&&!node.hasAttribute('data-sunlit-main-scene');node=node.parentElement)value*=Number(getComputedStyle(node).opacity);return value;};
            const host=el.parentElement,background=document.querySelector('[data-sunlit-background]'),veil=Number(getComputedStyle(document.querySelector('[data-sunlit-viewport]')).getPropertyValue('--sunlit-content-opacity'));
            const underWash=!!el.closest('[data-sunlit-artwork]');
            return {leafAlpha:alpha(el)*(underWash?1-veil:1),wallpaperAlpha:alpha(background)*(1-veil),ownAlpha:Number(getComputedStyle(el).opacity),hostAlpha:Number(getComputedStyle(host).opacity),veil,underWash};
          });
          assert.ok(Math.abs(contribution.leafAlpha-contribution.wallpaperAlpha)<.001,`${layout}/${mode}/${value}%: leaves must match wallpaper contribution exactly once`);
          assert.equal(contribution.ownAlpha,1);
          assert.equal(contribution.underWash,layout==='panorama');
          assert.ok(Math.abs(contribution.hostAlpha-(layout==='panorama'?1:value/100*(1-contribution.veil)))<.001);
          await page.locator('#native-settings').click();
        }
      }
    }
    assert.equal(await page.evaluate(()=>leafNativeClicks),12);
    checks.push('0/35/100 background alpha applies once in both layouts and orchard modes; native sidebar remains clickable');
    for (const layout of ['panorama', 'separate']) {
      await chooseLayout(layout);
      for (const width of [760, 920]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForFunction(() => Math.abs(window.__dshSunlitTidesClient.getLayoutState().main.width - document.querySelector('.mP3x-q_centerCol').getBoundingClientRect().width) < 1);
        const state = await page.evaluate(() => window.__dshSunlitTidesClient.getLayoutState());
        const leaves = await page.locator('[data-sunlit-bubbles]>i:not([hidden])').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.left, right: r.right, pointer: getComputedStyle(el).pointerEvents }; }));
        assert.ok(leaves.length > 0, `visible leaves in ${layout} at ${width}px`);
        const laneLeft = state.main.left + (state.main.width - state.readingWidth) / 2 + state.shift, laneRight = laneLeft + state.readingWidth;
        const composer = await page.locator('.composer').boundingBox();
        for (const item of leaves) { assert.ok(item.right <= laneLeft - 8 || item.x >= laneRight + 8); assert.ok(item.right <= composer.x || item.x >= composer.x + composer.width); assert.equal(item.pointer, 'none'); }
        await open(); await page.locator('[data-sunlit-setting=bubbles]').uncheck(); await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelector('[data-sunlit-bubbles]').hidden);
        const off = await page.evaluate(() => window.__dshSunlitTidesClient.getLayoutState());
        if (layout === 'panorama') assert.equal(off.readingWidth, state.readingWidth, 'panorama leaves must not squeeze the reading column');
        else { assert.ok(off.readingWidth >= state.readingWidth); if (width === 760) assert.ok(off.readingWidth > state.readingWidth); }
        await open(); await page.locator('[data-sunlit-setting=bubbles]').check(); await page.keyboard.press('Escape');
        await page.screenshot({ path: path.join(dir, `${layout}-narrow-${width}.png`) });
      }
    }
    checks.push('both layouts keep narrow-window leaves outside text and input; panorama preserves reading width');
    await page.evaluate(() => { disposeLeafSkin(); disposeLeafSkin(); });
    assert.equal(await page.locator('[data-sunlit-owner]').count(), 0); assert.equal(await page.locator('[data-sunlit-bubbles]').count(), 0);
    checks.push('leaf effects and controls dispose completely');
    assert.deepEqual(errors, []);
    const report = { passed: true, checks, browserErrors: errors, syntheticOnly: true, material };
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
