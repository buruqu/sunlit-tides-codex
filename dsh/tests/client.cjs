/* Browser contract and visual preview on a synthetic DSH page only. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const project = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(project, 'theme.json'), 'utf8'));
const cssText = fs.readFileSync(path.join(project, 'src/style.css'), 'utf8') + '\n' + fs.readFileSync(path.join(project, 'src/typography.css'), 'utf8');
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif' };
const assets = Object.fromEntries(Object.entries(manifest.assets).map(([id, file]) => [id, `data:${mime[path.extname(file)]};base64,${fs.readFileSync(path.join(project, file)).toString('base64')}`]));
// Structural selectors and paint rules below come from the installed DSH
// 0.2.1-rc.3 app.asar: ui-layout/AppFrame and ui-conversation/Conversation.
// AppFrame owns the three columns directly; there is no intermediate .layout.
const fixture = `<!doctype html><html lang="zh-CN" data-windows-titlebar><head><meta charset="utf-8"><title>DSH · 合成主题预览</title>
<style id="corner_shape_css_default">:root{--dsw-corner-shape:superellipse(1.5)}*,:before,:after{corner-shape:var(--dsw-corner-shape)}</style>
<style id="native-layout-css">
.mP3x-q_frame{background:var(--dsw-alias-bg-base);grid-template-rows:minmax(0,1fr) auto;height:100%;display:grid;position:relative;overflow:hidden}
[data-windows-titlebar] .mP3x-q_frame{--dsh-windows-content-radius:16px;box-sizing:border-box;padding-top:var(--dsh-windows-titlebar-height);background:var(--dsw-specific-sidebar-fill)}
[data-windows-titlebar] .mP3x-q_centerCol{background:var(--dsw-alias-bg-base);border-radius:var(--dsh-windows-content-radius) 0 0 0;corner-shape:round}
[data-windows-titlebar] .mP3x-q_frame:before{content:"";height:var(--dsh-windows-titlebar-height);background:var(--dsw-specific-sidebar-fill);-webkit-app-region:drag;position:absolute;inset:0 0 auto}
.mP3x-q_sidebarCol{background:var(--dsw-specific-sidebar-fill);border-right:.5px solid var(--dsw-alias-border-l3);min-width:0;overflow:hidden}
.mP3x-q_centerCol{flex-direction:column;min-width:0;display:flex;overflow:hidden}
.mP3x-q_rightbarCol{position:relative;min-width:0}
.mP3x-q_bottomRow{background:var(--dsw-alias-bg-base);grid-column:1/-1;min-width:0;min-height:0;overflow:auto}
.mP3x-q_overlayLayer{pointer-events:none;position:absolute;inset:0}
.an3WzG_root{background:var(--dsw-alias-bg-base);flex-direction:column;min-width:0;height:100%;display:flex;position:relative}
.an3WzG_viewArea{flex-direction:column;flex:1;min-height:0;display:flex}
.an3WzG_body{--dsh-chat-content-width:var(--dsh-chat-user-width,clamp(680px,calc(var(--dsh-conversation-column-width,0px)*.64),920px));--dsh-composer-card-max-width:calc(var(--dsh-chat-content-width) + 32px);--dsh-composer-side-clearance:16px;--dsh-composer-dock-inset:8px;flex-direction:column;flex:1;min-height:0;display:flex;position:relative}
.an3WzG_root[data-phase=active]{overflow:hidden}.an3WzG_root[data-phase=active] .an3WzG_viewArea{flex:1 0 auto;min-height:auto}
.an3WzG_root[data-phase=active] .an3WzG_composerSeat{z-index:7;background:linear-gradient(180deg,transparent,var(--dsw-alias-bg-base) 36px);position:sticky;bottom:0}
.an3WzG_scrollBody:has([data-conversation-composer-overlay]){scrollbar-gutter:auto;position:relative;overflow:hidden auto}
.an3WzG_scrollBody:has([data-conversation-composer-overlay])>[data-slot='conversation.session']>.an3WzG_viewArea{flex:1 1 0;min-height:0;overflow:hidden}
.an3WzG_scrollBody:has([data-conversation-composer-overlay])>.an3WzG_composerSeat{right:var(--dsh-scrollbar-width,0px);position:absolute;bottom:0;left:0}
</style><style id="native-style">
*{box-sizing:border-box}html,body{margin:0;height:100%;font:14px/1.7 'Segoe UI','Microsoft YaHei',sans-serif;color:#303241}
:root{--dsh-windows-titlebar-height:40px}body{background:#fafafa;--dsw-alias-bg-base:#fff;--dsw-specific-sidebar-fill:#ececee}
button,textarea{font:inherit;color:inherit}button{cursor:pointer}#root{height:100vh;background:#fff}
.synthetic-titlebar{position:absolute;inset:0 0 auto;z-index:20;height:40px;display:flex;align-items:center;padding:0 18px;gap:12px;background:#161521;color:#f5f0f7;font-size:12px;pointer-events:none}.synthetic-titlebar span:last-child{margin-left:auto}
.wtg9ga_root{height:100%;padding:25px 18px;background:var(--dsw-specific-sidebar-fill);display:flex;flex-direction:column}
.brand{font-size:19px;font-weight:650;letter-spacing:.03em;margin:0 0 25px}.side-button{display:block;width:100%;border:0;border-radius:8px;text-align:left;padding:10px 12px;background:transparent}
.side-button[aria-current=page]{background:#9985aa20}.sidebar-caption{margin:25px 12px 8px;font-size:11px;opacity:.6}.native-settings{margin-top:auto}
.chat-header{height:55px;flex:none;padding:15px 28px;border-bottom:1px solid #a5a0aa20}.an3WzG_scrollBody{overflow-y:auto;flex:1;min-height:0;scrollbar-width:thin;display:flex;flex-direction:column;scrollbar-gutter:stable;margin-right:2px}[data-slot="conversation.session"]{display:contents}
.an3WzG_viewArea{padding:30px 34px}.hero{display:grid;place-items:center;min-height:470px;text-align:center}.hero h1{font-size:32px;font-weight:550;letter-spacing:.08em;margin:0 0 12px}.hero p{margin:0;opacity:.7}
.an3WzG_composerSeat{padding:14px 28px 34px}.composer{padding:14px 16px;background:var(--dsw-specific-input-major,#fff);border:1px solid #a5a0aa40;border-radius:15px;box-shadow:0 4px 16px #2620380a}
.composer textarea{display:block;resize:none;width:100%;height:55px;border:0;outline:0;background:transparent}.composer-tools{display:flex;gap:16px;align-items:center;font-size:12px;opacity:.75}.composer-tools button{margin-left:auto;border:0;border-radius:16px;padding:4px 12px;background:#9679a5;color:white}
.message{margin:0 0 35px;padding:8px;background:#fff}.message pre{padding:14px;background:#edeaf0;border-radius:8px;overflow:auto}.mP3x-q_sidebarCol button:hover{background:#aa8eb624}
.native-portal{position:fixed;left:50%;top:100px;background:var(--dsw-alias-bg-overlay,#fff);padding:10px;border:1px solid #bbb;z-index:20}body[data-ds-dark-theme]{color:#eee}
</style></head><body><div id="root" data-native="keep">
<div class="mP3x-q_frame" style="grid-template-columns:220px minmax(0px,1fr) minmax(0px,0px);--dsh-windows-sidebar-width:220px" data-rightbar-collapsed>
<div class="mP3x-q_sidebarCol"><div class="wtg9ga_root"><div class="brand _preview_brandName">DeepSeek Harness</div><button class="side-button" id="native-new">＋ 新会话</button><button class="side-button" aria-current="page">◌ 合成预览</button><div class="sidebar-caption">工作区</div><div role="tree"><button class="side-button" role="treeitem">⌘ 本机测试</button></div><div class="native-settings" data-slot="sidebar.settings"><button class="side-button" id="native-settings">⚙ 设置</button></div></div></div>
<div class="mP3x-q_centerCol"><section class="an3WzG_root" data-phase="hero"><div class="chat-header an3WzG_crumbCurrent">合成预览</div><div class="an3WzG_body" data-conversation-content data-conversation-region="chat" data-content-phase="hero"><div class="an3WzG_scrollBody" data-conversation-scroll><div data-slot="conversation.session"><div class="an3WzG_viewArea"><div class="hero"><div><h1>今天，写下新的灵感</h1><p>晴光落在身旁，泡影轻轻回响。</p></div></div><div id="messages" hidden></div></div></div><div class="an3WzG_composerSeat" data-composer-seat data-conversation-region="composer"><div class="composer"><textarea aria-label="合成输入框" placeholder="仅用于主题测试的合成输入框"></textarea><div class="composer-tools"><span>＋</span><span>本机工作区</span><button id="native-send">发送测试</button></div></div></div></div></div></section></div>
<div class="mP3x-q_rightbarCol" data-rightbar-col></div><div class="mP3x-q_bottomRow" data-shell-bottom></div><div class="mP3x-q_overlayLayer" data-shell-overlay></div>
</div><div class="synthetic-titlebar"><b>◈ DeepSeek Harness</b><span>合成 DSH 页面 · 不包含真实会话</span></div></div></body></html>`;
const checks = [];
async function check(name, fn) { await fn(); checks.push(name); }
async function run() {
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html;charset=utf-8' }); res.end(fixture); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
  const errors = [], requests = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1283, height: 823 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!request.url().startsWith(origin) && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) requests.push(request.url()); });
    await page.goto(origin);
    await page.addScriptTag({ path: path.join(project, 'src/scene-runtime.js') });
    await page.addScriptTag({ path: path.join(project, 'src/client.js') });
    await page.evaluate(({ config, assets, cssText }) => {
      window.fixtureOptions = { window, document, config, assets, cssText };
      window.nativeClicks = 0;
      document.querySelector('#native-new').addEventListener('click', () => window.nativeClicks++);
      localStorage.setItem('native.account.fixture', 'unchanged');
      // A real 0.1.1-shaped saved preference has no layout field. Adopt the new
      // panorama default without rewriting or resetting any existing preference.
      window.legacyPalette = { version: 1, scenes: { light: 'orchard', dark: 'night' }, readingWidth: 812, backgroundOpacity: 100, contentOpacity: 60, motion: true, lighting: true, blink: true, bubbles: true, companions: true, emotes: true, gradientText: true };
      localStorage.setItem('dsh.sunlit-tides.palette.v1', JSON.stringify(window.legacyPalette));
      window.nativeSnapshot = { body: document.body.getAttributeNames(), host: document.querySelector('#root').outerHTML, style: document.querySelector('#native-style').textContent };
      window.disposeSkin = mountDshSunlitClient(window.fixtureOptions);
    }, { config: manifest.config, assets, cssText });
    const revealControl = async key => {
      const group=page.locator(`[data-sunlit-control-group]:has([data-sunlit-setting="${key}"])`);
      if(await group.count() && await group.getAttribute('open') === null) await group.locator('summary').click();
    };
    const chooseLayout = async layout => {
      await page.locator('[data-sunlit-toggle]').click();
      await revealControl('layout'); await page.locator('[data-sunlit-setting=layout]').selectOption(layout);
      await page.keyboard.press('Escape');
      await page.waitForFunction(value => window.__dshSunlitTidesClient.getLayoutState().layout === value, layout);
    };
    await check('legacy preferences adopt panorama without resetting or silently rewriting saved values', async () => {
      assert.equal(await page.locator('[data-sunlit-setting=layout]').inputValue(), 'panorama');
      assert.equal(await page.locator('[data-sunlit-setting=readingWidth]').inputValue(), '812');
      assert.equal(await page.evaluate(() => localStorage.getItem('dsh.sunlit-tides.palette.v1') === JSON.stringify(legacyPalette)), true);
      assert.equal(await page.locator('label[data-sunlit-control=layout]>span').innerText(), '背景布局（亮暗通用）');
      assert.deepEqual(await page.locator('[data-sunlit-setting=layout] option').allTextContents(), ['背景贯穿', '独立侧栏']);
    });
    await check('light and dark panorama use one canvas with identical moving and static geometry', async () => {
      for (const mode of ['light', 'dark']) {
        await page.evaluate(dark => document.body.toggleAttribute('data-ds-dark-theme', dark), mode === 'dark');
        await page.locator('[data-sunlit-toggle]').click(); await revealControl('motion'); await page.locator('[data-sunlit-setting=motion]').check(); await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.__DSH_SUNLIT_SCENE_RENDERER__?.getState().ready, {}, { timeout: 30000 });
        const moving = await page.locator('[data-sunlit-background]').boundingBox();
        assert.deepEqual(moving, { x: 0, y: 40, width: 1283, height: 783 });
        assert.equal(await page.locator('[data-sunlit-background] canvas').count(), 1);
        assert.deepEqual(await page.locator('[data-sunlit-background] canvas').boundingBox(), moving);
        assert.deepEqual(await page.locator('[data-sunlit-decorations]').boundingBox(), await page.locator('[data-sunlit-background]').boundingBox());
        assert.equal(await page.locator('[data-sunlit-sidebar-art]').isVisible(), false);
        assert.equal(await page.locator('[data-sunlit-sidebar-art]').evaluate(el => el.style.backgroundImage), 'none');
        assert.equal(await page.locator('.mP3x-q_sidebarCol').evaluate(el => getComputedStyle(el).borderRightColor), 'rgba(0, 0, 0, 0)');
        assert.equal(await page.locator('[data-sunlit-sidebar-veil]').evaluate(el => el.getBoundingClientRect().right - document.querySelector('.mP3x-q_sidebarCol').getBoundingClientRect().right), 96);
        assert.equal(await page.locator('[data-sunlit-background]').evaluate(el => getComputedStyle(el).backgroundPosition), mode === 'dark' ? '55% 0%' : '50% 32%');
        const composition = await page.evaluate(() => {
          const box = el => { const r = el.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom }; };
          return { left:box(document.querySelector('[data-sunlit-companion=left]')), right:box(document.querySelector('[data-sunlit-companion=right]')), input:box(document.querySelector('[data-composer-seat]')), gifs:[...document.querySelectorAll('[data-sunlit-emote]')].map(el => ({ side:el.dataset.sunlitEmote, ...box(el) })), readingWidth:window.__dshSunlitTidesClient.getLayoutState().readingWidth };
        });
        assert.ok(composition.left.x < 220 && composition.left.width >= 200 && composition.left.width <= 260);
        assert.ok(composition.left.height >= 300 && composition.left.height <= 390);
        assert.equal(composition.left.x, 68, 'Xixi and GIF receive another 24px shift at full scale');
        assert.equal(composition.gifs.find(gif => gif.side === 'left').x, 326, 'Xixi GIF follows the same 24px translation');
        assert.equal(await page.locator('[data-sunlit-companion=right]').evaluate(el => getComputedStyle(el).transform), 'matrix(-1, 0, 0, 1, 0, 0)');
        assert.equal(await page.locator('[data-sunlit-emote=right]').evaluate(el => getComputedStyle(el).transform), 'none', 'Only Yaya standee is mirrored; her GIF keeps its own direction');
        assert.equal(composition.readingWidth, 812, 'Background figures must not reserve foreground reading corridors');
        for (const gif of composition.gifs) {
          const character = composition[gif.side];
          assert.ok((gif.side === 'left' ? gif.x >= character.right : gif.right <= character.x) && gif.y > character.y && gif.bottom <= 823);
          if (gif.x < composition.input.right && gif.right > composition.input.x) assert.ok(gif.bottom <= composition.input.y - 11.5, 'Yaya GIF must clear the native input deck');
        }
        await page.screenshot({ path: path.join(project, `preview/${mode}.png`) });
        await page.locator('[data-sunlit-toggle]').click(); await revealControl('motion'); await page.locator('[data-sunlit-setting=motion]').uncheck(); await page.keyboard.press('Escape');
        assert.equal(await page.locator('[data-sunlit-background] canvas').count(), 0);
        assert.deepEqual(await page.locator('[data-sunlit-background]').boundingBox(), moving);
        assert.ok(await page.locator('[data-sunlit-background]').evaluate(el => el.style.backgroundImage.startsWith('url(')));
      }
      await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
      await page.locator('[data-sunlit-toggle]').click(); await revealControl('motion'); await page.locator('[data-sunlit-setting=motion]').check(); await page.keyboard.press('Escape');
    });
    await check('both GIFs clear native input at 760, 1280 and 1440px in both themes', async () => {
      for (const mode of ['light','dark']) {
        await page.evaluate(dark=>document.body.toggleAttribute('data-ds-dark-theme',dark),mode==='dark');
        for (const width of [760,1280,1440]) {
          await page.setViewportSize({width,height:900});
          await page.waitForFunction(value=>document.body.dataset.sunlitMode===value && document.querySelector('[data-sunlit-background]').getBoundingClientRect().width===innerWidth,mode);
          const positions=await page.evaluate(()=>{
            const box=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
            return {gifs:[...document.querySelectorAll('[data-sunlit-emote]')].map(el=>({...box(el),visible:!el.hidden})),input:box(document.querySelector('[data-composer-seat]'))};
          });
          for (const gif of positions.gifs) {
            assert.equal(gif.visible,true);
            if(gif.left<positions.input.right && gif.right>positions.input.left) assert.ok(Math.abs(positions.input.top-gif.bottom-12)<1);
          }
          await page.screenshot({path:path.join(project,`test-results/gif-input-${mode}-${width}.png`)});
        }
      }
      await page.locator('[data-sunlit-toggle]').click(); await revealControl('readingWidth'); await page.locator('[data-sunlit-setting=readingWidth]').fill('480'); await page.locator('[data-sunlit-setting=readingWidth]').dispatchEvent('input'); await page.keyboard.press('Escape');
      await page.waitForFunction(()=>window.__dshSunlitTidesClient.getLayoutState().readingWidth===480);
      const base=await page.evaluate(()=>({gif:document.querySelector('[data-sunlit-emote=right]').getBoundingClientRect().toJSON(),input:document.querySelector('[data-composer-seat]').getBoundingClientRect().toJSON()}));
      assert.ok(base.gif.left>=base.input.right); assert.equal(base.gif.bottom,824,'Without horizontal overlap, keep the original bottom anchor');
      await page.locator('[data-sunlit-toggle]').click(); await revealControl('readingWidth'); await page.locator('[data-sunlit-setting=readingWidth]').fill('812'); await page.locator('[data-sunlit-setting=readingWidth]').dispatchEvent('input'); await page.keyboard.press('Escape');
      await page.evaluate(()=>document.body.removeAttribute('data-ds-dark-theme')); await page.setViewportSize({width:1283,height:823});
      await page.waitForFunction(()=>document.body.dataset.sunlitMode==='light' && document.querySelector('[data-sunlit-background]').getBoundingClientRect().width===1283);
    });
    await check('panorama figures and GIFs share wallpaper opacity once and remain behind native controls', async () => {
      for (const value of [38, 0, 100]) {
        await page.locator('[data-sunlit-toggle]').click();
        await revealControl('backgroundOpacity'); await page.locator('[data-sunlit-setting=backgroundOpacity]').fill(String(value)); await page.locator('[data-sunlit-setting=backgroundOpacity]').dispatchEvent('input'); await page.keyboard.press('Escape');
        const state = await page.evaluate(() => {
          const opacity = el => { let alpha = 1; for (let node=el; node && !node.hasAttribute('data-sunlit-main-scene'); node=node.parentElement) alpha*=Number(getComputedStyle(node).opacity); return alpha; };
          const artwork = document.querySelector('[data-sunlit-artwork]'), wash = document.querySelector('[data-sunlit-reading-wash]');
          const elements = [...document.querySelectorAll('[data-sunlit-background],[data-sunlit-companion],[data-sunlit-emote]')];
          return { alphas:elements.map(opacity), oneGroup:elements.every(el => el.closest('[data-sunlit-artwork]') === artwork), coveredByWash:!!(artwork.compareDocumentPosition(wash)&Node.DOCUMENT_POSITION_FOLLOWING), pointerEvents:elements.map(el => getComputedStyle(el).pointerEvents) };
        });
        for (const alpha of state.alphas) assert.ok(Math.abs(alpha-value/100)<.001, 'Background visibility must not multiply twice on any panorama child');
        assert.equal(state.oneGroup, true); assert.equal(state.coveredByWash, true); assert.ok(state.pointerEvents.every(v => v === 'none'));
      }
      await page.evaluate(() => { window.nativeSettingsClicks=0; document.querySelector('#native-settings').addEventListener('click',()=>nativeSettingsClicks++); });
      await page.locator('#native-settings').click(); assert.equal(await page.evaluate(() => nativeSettingsClicks), 1);
    });
    await check('panorama adapts to narrow windows, collapsed sidebar, and both right-panel modes', async () => {
      for (const [width, height] of [[1575, 839], [760, 760], [1283, 823]]) {
        await page.setViewportSize({ width, height });
        await page.waitForFunction(() => document.querySelector('[data-sunlit-background]').getBoundingClientRect().width === innerWidth);
        assert.deepEqual(await page.locator('[data-sunlit-decorations]').boundingBox(), await page.locator('[data-sunlit-background]').boundingBox());
        const portraits = await page.locator('[data-sunlit-companion]').evaluateAll(nodes => nodes.filter(n => !n.hidden).map(n => { const r=n.getBoundingClientRect(); return { left:r.left,right:r.right,top:r.top,bottom:r.bottom }; }));
        assert.equal(portraits.length, 2);
        for (const portrait of portraits) assert.ok(portrait.left >= 0 && portrait.right <= width && portrait.top >= 40 && portrait.bottom <= height);
        assert.ok(portraits[0].left < 220, 'Panorama Xixi can enter the sidebar instead of being forced into a reading gutter');
      }
      await page.evaluate(() => document.querySelector('.mP3x-q_frame').style.gridTemplateColumns = '0px minmax(0px,1fr) 0px');
      await page.waitForFunction(() => window.__dshSunlitTidesClient.getLayoutState().main.left === 0 && document.querySelector('[data-sunlit-sidebar-veil]').hidden);
      assert.equal(await page.locator('[data-sunlit-sidebar-veil]').isVisible(), false);
      await page.evaluate(() => { document.querySelector('.mP3x-q_frame').style.gridTemplateColumns = '220px minmax(0px,1fr) 360px'; const panel = document.createElement('div'); panel.id = 'panorama-right-fixture'; panel.style.cssText = 'width:360px;height:100%;background:#292536'; document.querySelector('.mP3x-q_rightbarCol').append(panel); });
      await page.waitForFunction(() => document.querySelector('[data-sunlit-background]').getBoundingClientRect().right === 923);
      await page.evaluate(() => { document.querySelector('.mP3x-q_frame').style.gridTemplateColumns = '220px minmax(0px,1fr) 0px'; document.querySelector('#panorama-right-fixture').style.cssText = 'position:absolute;right:0;top:0;width:320px;height:100%;background:#292536'; });
      await page.waitForFunction(() => document.querySelector('[data-sunlit-background]').getBoundingClientRect().right === document.querySelector('#panorama-right-fixture').getBoundingClientRect().left);
      await page.evaluate(() => document.querySelector('#panorama-right-fixture').remove());
      await page.waitForFunction(() => document.querySelector('[data-sunlit-background]').getBoundingClientRect().width === 1283);
    });
    await check('layout control applies to both modes and persists independently of all old settings', async () => {
      await chooseLayout('separate');
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dsh.sunlit-tides.palette.v1')));
      assert.equal(saved.layout, 'separate'); assert.equal(saved.readingWidth, 812); assert.deepEqual(saved.scenes, { light: 'orchard', dark: 'night' });
      await page.evaluate(() => { window.disposeSkin = mountDshSunlitClient(window.fixtureOptions); });
      assert.equal(await page.locator('[data-sunlit-setting=layout]').inputValue(), 'separate');
      assert.deepEqual(await page.locator('[data-sunlit-background]').boundingBox(), await page.locator('.mP3x-q_centerCol').boundingBox());
    });
    await check('main-area wallpaper and separate sidebar retain continuous native surfaces', async () => {
      assert.equal(await page.locator('[data-sunlit-background]').count(), 1);
      assert.equal(await page.locator('[data-sunlit-scene-choice]').count(), 16);
      const geometry = await page.locator('[data-sunlit-background]').boundingBox();
      assert.deepEqual(geometry, await page.locator('.mP3x-q_centerCol').boundingBox());
      assert.deepEqual(await page.locator('[data-sunlit-sidebar-art]').boundingBox(), await page.locator('.mP3x-q_sidebarCol').boundingBox());
      assert.deepEqual(await page.evaluate(() => ['#root', '.mP3x-q_frame', '.mP3x-q_centerCol', '.an3WzG_root', '.an3WzG_viewArea', '.mP3x-q_sidebarCol'].map(sel => getComputedStyle(document.querySelector(sel)).backgroundColor)), Array(6).fill('rgba(0, 0, 0, 0)'));
      assert.equal(await page.locator('.layout').count(), 0);
      assert.deepEqual(await page.locator('.mP3x-q_frame').evaluate(el => Array.from(el.children).slice(0, 3).map(child => child.className)), ['mP3x-q_sidebarCol', 'mP3x-q_centerCol', 'mP3x-q_rightbarCol']);
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-sunlit-background]')).backgroundPosition), '50% 32%');
      await page.locator('#native-new').click();
      assert.equal(await page.evaluate(() => nativeClicks), 1);
      await page.locator('textarea').fill('可交互的合成输入');
      assert.equal(await page.locator('textarea').inputValue(), '可交互的合成输入');
    });
    await check('late native dark theme cannot repaint the full-height conversation surface', async () => {
      await page.evaluate(() => {
        // Native theme modules can finish loading after the external skin.
        const theme = document.createElement('style'); theme.id = 'late-native-theme';
        theme.textContent = 'body[data-ds-dark-theme]{--dsw-alias-bg-base:#1b1c1f;--dsw-specific-sidebar-fill:#1d1e22}';
        document.head.append(theme); document.body.setAttribute('data-ds-dark-theme', '');
      });
      await page.waitForFunction(() => document.body.dataset.sunlitMode === 'dark');
      const nativeBackground = await page.locator('.an3WzG_root').evaluate(el => getComputedStyle(el).backgroundColor);
      if (nativeBackground !== 'rgba(0, 0, 0, 0)') await page.screenshot({ path: path.join(project, 'test-results/late-theme-before-fix.png') });
      assert.equal(nativeBackground, 'rgba(0, 0, 0, 0)', 'The real Conversation root must not paint an opaque native background over the artwork');
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim()), 'transparent');
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--dsw-specific-sidebar-fill').trim()), 'transparent');
      await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
      await page.waitForFunction(() => document.body.dataset.sunlitMode === 'light');
    });
    await check('new opaque conversation surfaces clear while native popovers keep their backing', async () => {
      await page.evaluate(() => {
        const old = document.querySelector('.an3WzG_root'), next = old.cloneNode(true);
        // Reproduce the observed opaque native paint independently of inherited
        // theme tokens, guarding the missing Conversation-root adaptation too.
        next.style.background = 'rgb(27, 28, 31)'; old.replaceWith(next);
        const menu = document.createElement('div'); menu.className = 'native-portal';
        menu.id = 'native-popover-fixture'; menu.style.background = 'rgb(48, 49, 54)';
        menu.textContent = '合成原生弹窗'; document.body.append(menu);
      });
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.an3WzG_root')).backgroundColor === 'rgba(0, 0, 0, 0)');
      assert.equal(await page.locator('#native-popover-fixture').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(48, 49, 54)');
      await page.evaluate(() => { document.querySelector('.an3WzG_root').style.removeProperty('background'); document.querySelector('#native-popover-fixture').remove(); });
    });
    await check('negative control: an unmarked opaque AppFrame hides artwork across the full window', async () => {
      const painted = await page.evaluate(() => {
        const frame = document.querySelector('.mP3x-q_frame');
        window.savedFrameMarkers = ['data-sunlit-frame', 'data-sunlit-surface'].map(name => [name, frame.getAttribute(name)]);
        // Keep the real native frame paint rule, giving it the resolved opaque
        // sidebar token observed on the unadapted dark host. This isolates frame
        // clearing from the independent inherited-token override regression.
        frame.style.setProperty('--dsw-specific-sidebar-fill', 'rgb(29, 30, 34)');
        const protectedColor = getComputedStyle(frame).backgroundColor;
        frame.removeAttribute('data-sunlit-frame'); frame.removeAttribute('data-sunlit-surface');
        const rect = frame.getBoundingClientRect();
        return { protectedColor, exposedColor: getComputedStyle(frame).backgroundColor, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
      assert.deepEqual(painted, { protectedColor: 'rgba(0, 0, 0, 0)', exposedColor: 'rgb(29, 30, 34)', x: 0, y: 0, width: 1283, height: 823 });
      await page.screenshot({ path: path.join(project, 'test-results/frame-occlusion-negative.png') });
      await page.evaluate(() => {
        const frame = document.querySelector('.mP3x-q_frame');
        for (const [name, value] of window.savedFrameMarkers) { if (value !== null) frame.setAttribute(name, value); }
        frame.style.removeProperty('--dsw-specific-sidebar-fill'); delete window.savedFrameMarkers;
      });
      assert.equal(await page.locator('.mP3x-q_frame').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    });
    await check('green leaves retain an elongated outline under the DSH global corner rule', async () => {
      const shapes = await page.locator('[data-sunlit-bubbles] i').evaluateAll(elements => elements.map(el => {
        const style = getComputedStyle(el);
        return { shape: style.getPropertyValue('corner-shape'), radius: style.borderRadius, width: style.width, height: style.height };
      }));
      assert.equal(shapes.length, 18);
      for (const shape of shapes) {
        // Chromium serializes the round keyword as its equivalent superellipse(1).
        assert.match(shape.shape, /^(round|superellipse\(1\))$/, 'Leaf corners must resist the DSH global superellipse rule');
        assert.notEqual(shape.radius, '50%');
        assert.ok(parseFloat(shape.width) > parseFloat(shape.height) * 1.5);
      }
      assert.equal(await page.locator('#native-new').evaluate(el => getComputedStyle(el).getPropertyValue('corner-shape')), 'superellipse(1.5)');
    });
    // Capture only synthetic, newly created page contents.
    await page.waitForFunction(() => window.__DSH_SUNLIT_SCENE_RENDERER__?.getState().ready, {}, { timeout: 30000 });
    await page.locator('textarea').fill('');
    await page.screenshot({ path: path.join(project, 'test-results/separate-light.png') });
    await check('DSH mode following and independent gallery choices', async () => {
      await page.locator('[data-sunlit-toggle]').click();
      await page.locator('[data-sunlit-mode-choice=dark]').click();
      await page.locator('[data-sunlit-scene-choice=night-tears]').click();
      assert.equal(await page.locator('[data-sunlit-background]').getAttribute('data-sunlit-scene'), 'orchard');
      assert.equal(await page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme')), false);
      await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
      await page.waitForFunction(() => document.querySelector('[data-sunlit-background]').dataset.sunlitScene === 'night-tears');
      await page.waitForFunction(() => window.__DSH_SUNLIT_SCENE_RENDERER__?.getState().ready && window.__DSH_SUNLIT_SCENE_RENDERER__.getState().tearEnabled, {}, { timeout: 30000 });
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-sunlit-background]')).backgroundPosition), '55% 0%');
      assert.ok(await page.locator('[data-sunlit-background]').evaluate(el => el.style.backgroundImage.startsWith('url(')));
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-sunlit-panel]').isVisible(), false);
      assert.equal(await page.locator('[data-sunlit-toggle]').getAttribute('aria-expanded'), 'false');
    });
    await page.screenshot({ path: path.join(project, 'test-results/separate-dark.png') });
    await check('user-sized windows keep portraits and GIFs in main-area corridors', async () => {
      for (const [width, height] of [[1283, 823], [1575, 839], [920, 823], [760, 760]]) {
        await page.setViewportSize({ width, height });
        await page.waitForFunction(() => Math.abs(document.querySelector('[data-sunlit-background]').getBoundingClientRect().width - document.querySelector('.mP3x-q_centerCol').getBoundingClientRect().width) < 1);
        const state = await page.evaluate(() => {
          const box = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
          return { main: box(document.querySelector('.mP3x-q_centerCol')), paper: box(document.querySelector('.an3WzG_viewArea')), input: box(document.querySelector('[data-composer-seat]')),
            portraits: [...document.querySelectorAll('[data-sunlit-companion]')].filter(el => !el.hidden).map(el => ({ side: el.dataset.sunlitCompanion, ...box(el) })),
            gifs: [...document.querySelectorAll('[data-sunlit-emote]')].filter(el => !el.hidden).map(el => ({ side: el.dataset.sunlitEmote, ...box(el) })),
            decorativeOrder: document.querySelector('[data-sunlit-reading-wash]').compareDocumentPosition(document.querySelector('[data-sunlit-decorations]')) & Node.DOCUMENT_POSITION_FOLLOWING };
        });
        assert.ok(Math.abs(state.paper.width - state.input.width) < 1);
        assert.ok(Math.abs(state.paper.x - state.input.x) < 1);
        assert.ok(state.decorativeOrder, 'Full-color decorations must be above the reading wash');
        if (width >= 1283) { assert.equal(state.portraits.length, 2); for (const portrait of state.portraits) assert.ok(Math.abs(portrait.height - 230) <= 1); }
        if (width === 920) { assert.equal(state.portraits.length, 2); assert.ok(state.portraits.every(p => p.height < 230)); }
        if (width === 760) assert.equal(state.portraits.length, 0);
        assert.equal(await page.locator('[data-sunlit-companion=right]').evaluate(el => getComputedStyle(el).transform), 'none', 'Separate sidebar keeps the original standee orientation');
        for (const portrait of state.portraits) {
          assert.ok(portrait.x >= state.main.x && portrait.right <= state.main.right + 1);
          assert.ok(portrait.right <= state.paper.x + 1 || portrait.x >= state.paper.right - 1);
        }
        for (const gif of state.gifs) {
          const portrait = state.portraits.find(p => p.side === gif.side);
          assert.ok(portrait && gif.bottom < portrait.y);
          assert.ok(gif.width >= 72 && gif.width <= 96);
        }
        await page.screenshot({ path: path.join(project, `test-results/layout-${width}x${height}.png`) });
      }
      await page.setViewportSize({ width: 1283, height: 823 });
    });
    await check('sidebar collapse and tracked or floating right panels recompute the scene', async () => {
      await page.evaluate(() => { document.querySelector('.mP3x-q_frame').style.gridTemplateColumns = '0px minmax(0px,1fr) 0px'; });
      await page.waitForFunction(() => document.querySelector('[data-sunlit-background]').getBoundingClientRect().left === 0);
      assert.equal(await page.locator('[data-sunlit-sidebar-art]').isVisible(), false);
      await page.evaluate(() => { document.querySelector('.mP3x-q_frame').style.gridTemplateColumns = '220px minmax(0px,1fr) 360px'; const panel = document.createElement('div'); panel.id = 'native-right-fixture'; panel.style.cssText = 'width:360px;height:100%;background:#292536'; document.querySelector('.mP3x-q_rightbarCol').append(panel); });
      await page.waitForFunction(() => Math.abs(document.querySelector('[data-sunlit-background]').getBoundingClientRect().width - 703) < 1);
      assert.equal(await page.locator('[data-sunlit-sidebar-art]').isVisible(), true);
      await page.evaluate(() => { document.querySelector('.mP3x-q_frame').style.gridTemplateColumns = '220px minmax(0px,1fr) 0px'; document.querySelector('#native-right-fixture').style.cssText = 'position:absolute;right:0;top:0;width:320px;height:100%;background:#292536'; });
      await page.waitForFunction(() => Math.abs(document.querySelector('[data-sunlit-background]').getBoundingClientRect().right - document.querySelector('#native-right-fixture').getBoundingClientRect().left) < 1);
      await page.screenshot({ path: path.join(project, 'test-results/floating-right-panel.png') });
      await page.evaluate(() => document.querySelector('#native-right-fixture').remove());
      await page.waitForFunction(() => Math.abs(document.querySelector('[data-sunlit-background]').getBoundingClientRect().width - 1063) < 1);
    });
    await check('portrait and GIF switches retain independent meanings', async () => {
      const countVisible = kind => page.locator(`[data-sunlit-${kind}]`).evaluateAll(elements => elements.filter(el => !el.hidden).length);
      await page.locator('[data-sunlit-toggle]').click(); await revealControl('companions'); await page.locator('[data-sunlit-setting=companions]').uncheck(); await page.keyboard.press('Escape');
      await page.waitForFunction(() => [...document.querySelectorAll('[data-sunlit-emote]')].filter(el => !el.hidden).length === 2);
      assert.equal(await countVisible('companion'), 0); assert.equal(await countVisible('emote'), 2);
      await page.locator('[data-sunlit-toggle]').click(); await revealControl('emotes'); await page.locator('[data-sunlit-setting=emotes]').uncheck(); await page.keyboard.press('Escape');
      assert.equal(await countVisible('companion'), 0); assert.equal(await countVisible('emote'), 0);
      await page.locator('[data-sunlit-toggle]').click(); await revealControl('companions'); await page.locator('[data-sunlit-setting=companions]').check(); await page.keyboard.press('Escape');
      await page.waitForFunction(() => [...document.querySelectorAll('[data-sunlit-companion]')].filter(el => !el.hidden).length === 2);
      assert.equal(await countVisible('companion'), 2); assert.equal(await countVisible('emote'), 0);
      await page.locator('[data-sunlit-toggle]').click(); await revealControl('emotes'); await page.locator('[data-sunlit-setting=emotes]').check(); await page.keyboard.press('Escape');
      await page.waitForFunction(() => [...document.querySelectorAll('[data-sunlit-emote]')].filter(el => !el.hidden).length === 2);
      assert.equal(await countVisible('companion'), 2); assert.equal(await countVisible('emote'), 2);
    });
    await check('switches update real renderer and stop GIFs', async () => {
      await page.locator('[data-sunlit-toggle]').click();
      await revealControl('lighting'); await page.locator('[data-sunlit-setting=lighting]').uncheck();
      await revealControl('blink'); await page.locator('[data-sunlit-setting=blink]').uncheck();
      let state = await page.evaluate(() => window.__DSH_SUNLIT_SCENE_RENDERER__.getStateAsync());
      assert.equal(state.lightingEnabled, false); assert.equal(state.blinkEnabled, false);
      await revealControl('motion'); await page.locator('[data-sunlit-setting=motion]').uncheck();
      assert.equal(await page.locator('[data-sunlit-background] canvas').count(), 0);
      assert.equal(await page.locator('[data-sunlit-emote][src]').count(), 0);
      assert.ok(await page.locator('[data-sunlit-background]').evaluate(el => el.style.backgroundImage.startsWith('url(')));
      await revealControl('companions'); await page.locator('[data-sunlit-setting=companions]').uncheck();
      await revealControl('bubbles'); await page.locator('[data-sunlit-setting=bubbles]').uncheck();
      assert.equal(await page.locator('[data-sunlit-companion=left]').isVisible(), false);
      assert.equal(await page.locator('[data-sunlit-bubbles]').isVisible(), false);
    });
    await check('reading settings preserve native scroll and account preferences', async () => {
      await revealControl('readingWidth'); await page.locator('[data-sunlit-setting=readingWidth]').fill('1040');
      await page.locator('[data-sunlit-setting=readingWidth]').dispatchEvent('input');
      await revealControl('backgroundOpacity'); await page.locator('[data-sunlit-setting=backgroundOpacity]').fill('38');
      await page.locator('[data-sunlit-setting=backgroundOpacity]').dispatchEvent('input');
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-sunlit-background]')).opacity), '0.38');
      await page.keyboard.press('Escape');
      await page.evaluate(() => {
        document.querySelector('.hero').hidden = true;
        document.querySelector('.an3WzG_root').dataset.phase = 'active'; document.querySelector('[data-conversation-content]').dataset.contentPhase = 'active';
        const messages = document.querySelector('#messages'); messages.hidden = false;
        for (let i = 0; i < 15; i++) { const el = document.createElement('section'); el.dataset.chatFlowKind = 'assistant-step'; el.className = 'message'; el.innerHTML = '<div class="fixture_markdown_content"><h2>合成阅读标题 '+i+'</h2><p>'+`合成测试段落 ${i}。仅用于检查滚动与阅读宽度。`.repeat(8)+'</p></div>'; messages.append(el); }
      });
      await page.locator('.an3WzG_scrollBody').evaluate(el => { el.scrollTop = 500; });
      assert.equal(await page.locator('.an3WzG_scrollBody').evaluate(el => el.scrollTop), 500);
      assert.equal(await page.locator('[data-sunlit-background]').evaluate(el => el.getBoundingClientRect().top), 40);
      const appliedWidth = await page.evaluate(() => window.__dshSunlitTidesClient.getLayoutState().readingWidth);
      assert.ok(appliedWidth <= 1040);
      assert.ok(Math.abs((await page.locator('.an3WzG_viewArea').boundingBox()).width - appliedWidth) <= 1);
      assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).sort()), ['dsh.sunlit-tides.palette.v1', 'native.account.fixture']);
      assert.equal(await page.evaluate(() => localStorage.getItem('native.account.fixture')), 'unchanged');
    });
    await check('sticky input remains clickable and transcript pixels stop above its deck', async () => {
      await page.waitForFunction(() => Number.parseFloat(getComputedStyle(document.querySelector('[data-conversation-scroll]')).scrollPaddingBottom) > 0);
      const sample = await page.evaluate(() => {
        const input = document.querySelector('[data-composer-seat]'), view = document.querySelector('.an3WzG_viewArea'), r = input.getBoundingClientRect();
        const target = document.elementFromPoint(r.left + r.width / 2, r.top + 28);
        return { clipped: getComputedStyle(view).clipPath, messageBehindInput: !!target?.closest('[data-chat-flow-kind]'), position: getComputedStyle(input).position };
      });
      assert.equal(sample.position, 'sticky'); assert.equal(sample.messageBehindInput, false); assert.match(sample.clipped, /^inset\(/);
      await page.locator('textarea').fill('输入仍可使用'); assert.equal(await page.locator('textarea').inputValue(), '输入仍可使用');
      await page.locator('#native-send').click();
      await page.locator('[data-conversation-scroll]').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.waitForFunction(() => { const last = document.querySelector('#messages').lastElementChild.getBoundingClientRect(), input = document.querySelector('[data-composer-seat]').getBoundingClientRect(); return last.bottom <= input.top - 10; });
      await page.screenshot({ path: path.join(project, 'test-results/transcript-bottom.png') });
    });
    await check('native overlay input keeps absolute placement and independent scrolling', async () => {
      await page.evaluate(() => document.querySelector('#messages').setAttribute('data-conversation-composer-overlay', ''));
      await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-composer-seat]')).position === 'absolute');
      await page.locator('[data-conversation-scroll]').evaluate(el => { el.scrollTop = 0; });
      await page.locator('textarea').fill('原生浮层输入'); assert.equal(await page.locator('textarea').inputValue(), '原生浮层输入');
      assert.equal(await page.locator('[data-conversation-scroll]').evaluate(el => getComputedStyle(el).overflowY), 'auto');
      assert.equal(await page.locator('[data-composer-seat]').evaluate(el => getComputedStyle(el).clipPath), 'none');
      await page.screenshot({ path: path.join(project, 'test-results/native-composer-overlay.png') });
      await page.evaluate(() => document.querySelector('#messages').removeAttribute('data-conversation-composer-overlay'));
      await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-composer-seat]')).position === 'sticky');
    });
    await check('persistence, malicious values, cross-tab normalization, and reentry', async () => {
      await page.evaluate(() => { window.disposeSkin = mountDshSunlitClient(window.fixtureOptions); });
      assert.equal(await page.locator('[data-sunlit-background]').count(), 1);
      assert.equal(await page.locator('[data-sunlit-panel]').count(), 1);
      assert.equal(await page.locator('[data-sunlit-setting=readingWidth]').inputValue(), '1040');
      await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'dsh.sunlit-tides.palette.v1', newValue: JSON.stringify({ layout: 'invalid-layout', bubbleCount:999, bubbleSpeed:0, scenes: { light: 'javascript:bad', dark: 'night' }, readingWidth: 99999, backgroundOpacity: -500, contentOpacity: 'bad', motion: 'yes', companions: false }) })));
      assert.equal(await page.locator('[data-sunlit-setting=readingWidth]').inputValue(), '1440');
      assert.equal(await page.locator('[data-sunlit-setting=layout]').inputValue(), 'panorama');
      assert.equal(await page.locator('[data-sunlit-setting=bubbleCount]').inputValue(), '40');
      assert.equal(await page.locator('[data-sunlit-setting=bubbleSpeed]').inputValue(), '30');
      assert.equal(await page.locator('[data-sunlit-setting=backgroundOpacity]').inputValue(), '0');
      assert.equal(await page.locator('[data-sunlit-setting=contentOpacity]').inputValue(), '60');
      assert.equal(await page.locator('[data-sunlit-setting=motion]').isChecked(), true);
      await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
      await page.waitForFunction(() => document.querySelector('[data-sunlit-background]').dataset.sunlitScene === 'orchard');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => document.body.dataset.sunlitMotion === 'off');
      assert.equal(await page.locator('[data-sunlit-background] canvas').count(), 0);
    });
    await check('new native DOM is adapted without reading conversation text', async () => {
      await page.evaluate(() => {
        const old = document.querySelector('.mP3x-q_frame'); const next = old.cloneNode(true); old.replaceWith(next);
      });
      await page.waitForFunction(() => document.querySelector('.mP3x-q_frame').hasAttribute('data-sunlit-frame'));
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.mP3x-q_frame')).backgroundColor), 'rgba(0, 0, 0, 0)');
    });
    await check('complete idempotent cleanup and storage-denied fallback', async () => {
      await page.evaluate(() => { disposeSkin(); disposeSkin(); });
      assert.equal(await page.locator('[data-sunlit-owner]').count(), 0);
      assert.equal(await page.locator('[data-sunlit-surface],[data-sunlit-host],[data-sunlit-frame]').count(), 0);
      assert.equal(await page.evaluate(() => Object.keys(document.body.dataset).length), 0);
      assert.equal(await page.evaluate(() => document.querySelector('#native-style').textContent === nativeSnapshot.style), true);
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#root')).backgroundColor), 'rgb(255, 255, 255)');
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('[style]')].some(el => [...el.style].some(name => name.startsWith('--sunlit-')))), false);
      await page.evaluate(() => {
        const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
        Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('Storage denied'); } });
        window.disposeSkin = mountDshSunlitClient(window.fixtureOptions);
        document.querySelector('[data-sunlit-toggle]').click(); document.querySelector('[data-sunlit-reset]').click();
        window.storageDeniedStatus = document.querySelector('[data-sunlit-status]').textContent;
        disposeSkin(); Object.defineProperty(window, 'localStorage', original);
      });
      assert.match(await page.evaluate(() => storageDeniedStatus), /阻止了本机保存/);
      assert.equal(await page.evaluate(() => Boolean(window.__dshSunlitTidesClient || window.__DSH_SUNLIT_SCENE_RENDERER__)), false);
    });
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    const report = { passed: true, checks, browserErrors: errors, externalRequests: requests, syntheticOnly: true, previews: ['preview/light.png', 'preview/dark.png'] };
    fs.writeFileSync(path.join(project, 'test-results/client.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
