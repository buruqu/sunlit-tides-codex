// Exercise the distributable payload and its remover against synthetic native DOM.
// Requires Playwright and an installed Edge, or PLAYWRIGHT_EXECUTABLE_PATH.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist/theme');
const output = path.join(root, 'test-results/browser');
const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
const results = [], evidence = {}, errors = [];
async function check(name, fn) { try { await fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
function gifInfo(bytes) {
  assert.match(bytes.toString('ascii', 0, 6), /^GIF8[79]a$/);
  let offset = 13 + ((bytes[10] & 128) ? 3 * (1 << ((bytes[10] & 7) + 1)) : 0), frames = 0;
  const skipBlocks = () => { let size; while ((size = bytes[offset++]) > 0) offset += size; };
  while (offset < bytes.length) {
    const marker = bytes[offset++];
    if (marker === 0x3b) break;
    if (marker === 0x21) { offset++; skipBlocks(); }
    else if (marker === 0x2c) {
      const packed = bytes[offset + 8]; offset += 9;
      if (packed & 128) offset += 3 * (1 << ((packed & 7) + 1));
      offset++; skipBlocks(); frames++;
    } else throw new Error('Invalid GIF block at ' + (offset - 1));
  }
  return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8), frames };
}
const fixture = `<!doctype html><html lang="zh-CN" data-theme="light" class="native-app"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>晴光与泡影 · 合成预览</title><style id="native-style" data-native-style="keep">
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;font:14px/1.65 'Segoe UI','Microsoft YaHei',sans-serif;color:#282b34;background:#fff}[hidden]{display:none!important}button,textarea{font:inherit}button{cursor:pointer;color:inherit}button:focus-visible,textarea:focus-visible{outline:3px solid #8764a5;outline-offset:2px}
.fixture-toolbar{height:44px;display:flex;align-items:center;gap:16px;padding:0 18px;background:#f6f3f8;border-bottom:1px solid #ddd;font-size:12px}.fixture-toolbar small{margin-left:auto;color:#776b80}
.shell{height:calc(100% - 44px);display:flex;min-height:0}.app-shell-left-panel{width:240px;flex:none;padding:20px 14px;background:#f3f3f6}.sidebar-brand{font-size:19px;font-weight:650;padding:0 12px 24px}.sidebar-row{display:block;width:100%;padding:10px 12px;border:0;background:transparent;text-align:left;border-radius:10px}.sidebar-row[aria-current=page]{background:#e6e2ee}.sidebar-heading{color:#8b8297;font-size:11px;padding:24px 12px 8px}
.workspace{position:relative;flex:1;min-width:0;min-height:0}.main-surface{position:relative;min-width:0;width:100%;height:100%;overflow-y:auto;background:#fff}#home-view{height:100%;display:flex;align-items:center;justify-content:center}.home-layout{display:flex;flex-direction:column;align-items:center;width:100%;padding:30px 32px;gap:26px}.home-hero-region{width:100%;display:flex;align-items:center;justify-content:center;min-height:260px}.home-banner{width:100%;text-align:center}.home-native-title{height:80px;display:grid;place-items:center}.home-composer-carrier{width:min(760px,100%);position:relative;z-index:20}.composer-surface-chrome{position:relative;display:flex;flex-direction:column;border:1px solid #ccc;border-radius:17px;padding:12px 15px;background:#fff}.composer-surface-chrome textarea{width:100%;height:60px;min-height:0;line-height:24px;border:0;background:transparent;color:inherit;resize:none;overflow-y:auto}.composer-tools{display:flex;align-items:center;gap:12px;font-size:12px}.composer-tools button{background:transparent;border:0;padding:5px 8px}.composer-tools .send{margin-left:auto;background:#49355d;color:#fff;border-radius:50%}
#chat-view{height:100%;display:flex;flex-direction:column}.chat-header{height:48px;flex:none;padding:10px 26px}.thread-scroll-container{position:relative;flex:1;min-height:0;overflow-y:auto;padding:22px 25px 150px}.thread-content-max-width{width:100%;max-width:800px;margin:0 auto}.message{margin-bottom:24px}.user-message{margin-left:auto;padding:12px 18px;border-radius:14px;background:#eee;max-width:80%}.assistant-text p{margin:0 0 16px}.assistant-text h2{font-size:20px}.assistant-text pre{overflow:auto;padding:16px;background:#fafafa;border:1px solid #ddd;border-radius:10px}.assistant-text code{font-family:Consolas,monospace}.chat-composer-carrier{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);width:min(800px,calc(100% - 48px));z-index:20}#shell-overflow{position:absolute;top:100%;height:16px;width:1px;pointer-events:none}
.native-menu{position:absolute;left:0;bottom:calc(100% + 6px);width:min(300px,100%);height:280px;overflow:auto;z-index:50;border:1px solid #aaa;border-radius:12px;background:#fff;box-shadow:0 10px 30px #0003}.native-menu.portal-menu{position:fixed;left:calc(50% - 140px);top:280px;bottom:auto;width:280px}.native-menu button{display:block;width:100%;height:44px;padding:8px 14px;background:transparent;border:0;text-align:left}.native-menu button:hover{background:#eee}
html[data-theme=dark],html[data-theme=dark] body{color:#f0e8f5;background:#151322}html[data-theme=dark] .fixture-toolbar{background:#211c2e;border-color:#494052}html[data-theme=dark] .native-menu{background:#272133;color:#eee;border-color:#786780}html[data-theme=dark] .native-menu button:hover{background:#40344c}
@media(max-width:800px){.app-shell-left-panel{display:none}.home-layout{padding:18px}.fixture-toolbar{gap:5px;font-size:11px}.fixture-toolbar small{display:none}.native-menu.portal-menu{top:160px}}
</style></head><body data-native-setting="keep"><header class="fixture-toolbar"><b>晴光与泡影</b><span>Codex Windows 独立主题</span><small>合成界面 · 不含真实对话</small></header><div class="shell"><aside class="app-shell-left-panel" aria-label="导航"><div class="sidebar-brand">Codex</div><button class="sidebar-row">＋ 新建聊天</button><div class="sidebar-heading">置顶</div><button class="sidebar-row" data-app-action-sidebar-thread-row aria-current="page">把灵感写进今天</button><div class="sidebar-heading">项目</div><button class="sidebar-row" data-app-action-sidebar-project-row>晴光工作室</button><button class="sidebar-row" data-app-action-sidebar-thread-row>独立主题效果预览</button></aside><div class="workspace" data-app-shell-main-content-layout><main class="main-surface" data-app-shell-main-surface="default"><section id="home-view" role="main"><div class="home-layout"><div class="home-hero-region"><div class="home-banner"><div><div class="home-native-title"><span><svg data-testid="home-icon" aria-hidden="true" width="34" height="34"><path d="M4 17L17 4 30 17V30H20V20H14V30H4Z" fill="none" stroke="currentColor"/></svg></span></div></div></div></div><div class="home-composer-carrier z-20 pb-4"><form class="composer-surface-chrome" data-composer-surface-variant="home"><textarea data-codex-composer="true" aria-label="新聊天输入" placeholder="今天，想一起做些什么？"></textarea><div class="composer-tools"><button type="button" id="project-trigger" aria-haspopup="menu" aria-expanded="false">选择项目 ▾</button><button type="button">默认模式</button><button type="button" class="send" aria-label="发送示例">↑</button></div><div class="native-menu" id="project-menu" role="menu" hidden>${['晴光工作室','个人工具箱','阅读清单','旅行笔记','主题预览','离线测试'].map(name => '<button type="button" role="menuitem">' + name + '</button>').join('')}</div></form></div></div></section><section id="chat-view" hidden><header class="chat-header" data-testid="app-shell-header-context-menu-surface"><span data-app-shell-titlebar-content="true">把灵感写进今天</span></header><div class="thread-scroll-container"><div class="thread-content-max-width"><article class="message" data-content-search-unit-key="fixture:user"><div class="user-message" data-user-message-bubble="true">一起把今天的灵感整理成清晰的小计划。</div></article><article class="message" data-content-search-unit-key="fixture:msg_answer"><div class="_MarkdownRoot_fixture assistant-text"><h2>让灵感落到具体的事情上</h2><p>这是一份合成的阅读示例，只用于验证独立主题。场景留在文字身后，输入与操作保持自然。</p><p>亮色是果园午后，暗色是夜色相依。跟随 Codex 的外观切换，也可在调色板中选择背景。</p><pre><code>const today = { focus: '先完成最重要的一件事', rhythm: '观察 → 整理 → 验证' };</code></pre>${Array.from({ length: 30 }, (_, i) => '<p>合成阅读段落 ' + (i + 1) + '：保持正文清晰，给人物与场景留一点空间。</p>').join('')}<button type="button" id="final-action" onclick="this.dataset.clicked='true'">最后一条附件操作</button></div></article></div></div><div class="chat-composer-carrier" data-pip-obstacle="thread-footer"><form class="composer-surface-chrome" data-composer-surface-variant="default"><textarea data-codex-composer="true" aria-label="聊天输入" placeholder="继续记录你的想法…"></textarea><div class="composer-tools"><button type="button">＋ 添加附件</button><button type="button">默认模式</button><button type="button" class="send">↑</button></div></form></div><div id="shell-overflow" aria-hidden="true"></div></section></main></div></div><section id="retained-native" role="main" hidden><div id="native-empty-wrapper"><div class="home-banners"></div></div></section><div id="unrelated-empty-node" data-native-empty="keep"></div><script>
window.fixture={setMode(mode){document.documentElement.dataset.theme=mode},setView(view){document.getElementById('home-view').hidden=view!=='home';document.getElementById('chat-view').hidden=view!=='chat';window.dispatchEvent(new Event('resize'))}};
const menu=document.getElementById('project-menu'),trigger=document.getElementById('project-trigger');
trigger.onclick=()=>{menu.hidden=!menu.hidden;trigger.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)menu.firstElementChild.focus()};
menu.onclick=e=>{if(e.target.matches('[role=menuitem]')){menu.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus()}};
menu.onkeydown=e=>{const nodes=[...menu.querySelectorAll('button')],i=nodes.indexOf(document.activeElement);if(e.key==='ArrowDown'){e.preventDefault();nodes[(i+1)%nodes.length].focus()}if(e.key==='Escape'){menu.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus()}};
</script></body></html>`;

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const payload = fs.readFileSync(path.join(dist, 'payload.js'), 'utf8'), remove = fs.readFileSync(path.join(dist, 'remove.js'), 'utf8');
  const server = http.createServer((req, res) => { res.setHeader('cache-control', 'no-store'); if (req.url === '/payload.js' || req.url === '/remove.js') { res.setHeader('content-type', 'application/javascript'); res.end(req.url === '/payload.js' ? payload : remove); } else { res.setHeader('content-type', 'text/html;charset=utf-8'); res.end(fixture); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const launch = { headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] };
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) launch.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH; else launch.channel = 'msedge';
  const browser = await chromium.launch(launch);
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => {
      localStorage.setItem('codex.native.settings', JSON.stringify({ editor: 'native', language: 'zh-CN' }));
      localStorage.setItem('other.theme.preference', 'untouched');
      window.nativeNodes = [...document.querySelectorAll('*')];
      const attrs = node => Object.fromEntries([...node.attributes].filter(attr => /^(?:data-(?:sgk|fusion|sunlit|tessalume)-|class$|style$)/.test(attr.name)).filter(attr => attr.value !== '').map(attr => [attr.name, attr.value]));
      window.nativeAttributes = new Map(nativeNodes.map(node => [node, attrs(node)]));
      window.inspectRestore = () => {
        const changed = nativeNodes.filter(node => !node.isConnected || JSON.stringify(attrs(node)) !== JSON.stringify(nativeAttributes.get(node))).map(node => ({ tag: node.tagName, id: node.id, connected: node.isConnected, before: nativeAttributes.get(node), after: attrs(node) }));
        const added = [...document.querySelectorAll('*')].filter(node => !nativeNodes.includes(node)).map(node => ({ tag: node.tagName, id: node.id, class: node.className }));
        return { changed, added, globals: Object.keys(window).filter(name => /^__(?:TESSALUME|SIGRIKA|SUNLIT)/.test(name)) };
      };
    });
    const evaluateFile = route => page.evaluate(async route => (0, eval)(await (await fetch(route)).text()), route);
    const apply = async () => { const result = await evaluateFile('/payload.js'); await page.waitForFunction(() => !!window.__SIGRIKA_DENIA_FUSION__ && !!window.__SUNLIT_GALLERY__); await page.waitForTimeout(350); return result; };
    const state = () => page.evaluate(() => ({ scene: __SUNLIT_GALLERY__.getState(), fusion: __SIGRIKA_DENIA_FUSION__.getSettings(), runtime: { id: __TESSALUME_RUNTIME__.themeId, fingerprint: __TESSALUME_RUNTIME__.fingerprint } }));
    await check('actual distributable mounts once and primary defaults follow Codex mode with no permanent strip', async () => {
      evidence.apply = await apply(); assert.equal(evidence.apply.installed, true);
      for (const [mode, scene] of [['light', 'orchard'], ['dark', 'night'], ['light', 'orchard']]) {
        await page.evaluate(mode => fixture.setMode(mode), mode);
        await page.waitForFunction(scene => document.documentElement.dataset.sgkScene === scene, scene);
        const actual = await state(); assert.equal(actual.scene.scene, scene); assert.equal(actual.scene.count, manifest.config.gallery.scenes.length); assert.equal(actual.scene.fixed, false);
        assert.equal(actual.runtime.id, manifest.id); assert.equal(actual.runtime.fingerprint, manifest.fingerprint);
        assert.equal(await page.locator('[data-sgk-gallery],.sgk-gallery-strip,.sgk-gallery-dialog').count(), 0);
      }
      assert.equal(await page.locator('#tessalume-theme-root').count(), 1);
      const unchanged = await apply(); assert.equal(unchanged.unchanged, true);
      assert.equal(await page.locator('#tessalume-theme-root').count(), 1);
    });
    await check('actual packaged scenes paint orchard/light and night/dark and produce synthetic previews', async () => {
      evidence.paint = [];
      await page.evaluate(() => fixture.setView('chat'));
      for (const [mode, asset] of [['light', 'duo-orchard'], ['dark', 'duo-night']]) {
        await page.evaluate(mode => fixture.setMode(mode), mode); await page.waitForTimeout(600);
        const file = manifest.assets[asset], mime = file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
        const expectedData = 'data:' + mime + ';base64,' + fs.readFileSync(path.join(root, 'theme', file)).toString('base64');
        const painted = await page.evaluate(async ({asset, expectedData}) => {
          const main = document.querySelector('main'), probe = document.createElement('div'); probe.style.backgroundImage = 'var(--tessalume-asset-' + asset + ')'; document.body.append(probe);
          const expected = getComputedStyle(probe).backgroundImage, actual = getComputedStyle(main, '::before').backgroundImage; probe.remove();
          const url = actual.match(/^url\("(.*)"\)$/)?.[1], blob = await (await fetch(url)).blob();
          const bytes = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
          const image = new Image(); image.src = url; await image.decode();
          return { mode: document.documentElement.dataset.theme, asset, matches: expected === actual, imagePresent: actual !== 'none', sourceMatches: bytes === expectedData,
            dimensions: [image.naturalWidth, image.naturalHeight], scene: document.documentElement.dataset.sgkScene };
        }, {asset, expectedData});
        assert.equal(painted.matches, true); assert.equal(painted.imagePresent, true); assert.equal(painted.sourceMatches, true);
        if (mode === 'dark') assert.deepEqual(painted.dimensions, [1272, 847]);
        evidence.paint.push(painted);
        await page.screenshot({ path: path.join(output, 'preview-' + mode + '.png') });
      }
    });
    await check('packaged Xixi portrait and original animated sticker follow light-dark-light without changing preferences or covering native content', async () => {
      const source = key => fs.readFileSync(path.join(root, 'theme', manifest.assets[key]));
      const dataUrl = key => 'data:' + (manifest.assets[key].endsWith('.gif') ? 'image/gif' : 'image/png') + ';base64,' + source(key).toString('base64');
      assert.deepEqual(gifInfo(source('sigrika-emote-dark')), { width: 300, height: 300, frames: 27 });
      assert.notDeepEqual(source('task-left'), source('task-left-dark'));
      const settings = await page.evaluate(() => __SIGRIKA_DENIA_FUSION__.getSettings());
      evidence.xixiModes = [];
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.evaluate(() => fixture.setView('chat'));
      for (const mode of ['light', 'dark', 'light']) {
        await page.evaluate(mode => fixture.setMode(mode), mode); await page.waitForTimeout(450);
        const expected = { portrait: dataUrl(mode === 'dark' ? 'task-left-dark' : 'task-left'), right: 'data:image/webp;base64,' + source(mode === 'dark' ? 'task-right-primary-dark' : 'task-right-primary').toString('base64'), emote: dataUrl(mode === 'dark' ? 'sigrika-emote-dark' : 'sigrika-emote') };
        const actual = await page.evaluate(async expected => {
          const card = document.querySelector('[data-fusion-card="left"]'), art = card.querySelector('[data-theme-part="task-card-art"]');
          const emote = document.querySelector('[data-sunlit-companion="xixi-emote"]'), image = emote.querySelector('img');
          const r = card.getBoundingClientRect(), e = emote.getBoundingClientRect();
          const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          const obstacles = [...document.querySelectorAll('.thread-content-max-width,.composer-surface-chrome,.app-shell-right-panel')].filter(node => !node.closest('[hidden]')).map(node => node.getBoundingClientRect());
          const url = getComputedStyle(art).backgroundImage.match(/^url\("(.*)"\)$/)?.[1];
          const blob = await (await fetch(url)).blob();
          const portrait = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
          const rightArt = document.querySelector('[data-fusion-card="primary"] [data-theme-part="task-card-art"]');
          const rightUrl = getComputedStyle(rightArt).backgroundImage.match(/^url\("(.*)"\)$/)?.[1];
          const rightBlob = await (await fetch(rightUrl)).blob();
          const rightPortrait = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(rightBlob); });
          return { mode: document.documentElement.dataset.theme, portraitMatches: portrait === expected.portrait,
            rightPortraitMatches: rightPortrait === expected.right,
            emoteBackground: getComputedStyle(image).backgroundColor,
            emoteMatches: image.getAttribute('src') === expected.emote, emoteLoaded: image.complete && image.naturalWidth > 0,
            visible: getComputedStyle(card).display !== 'none' && !emote.hidden, contain: getComputedStyle(art).backgroundSize,
            overlaps: obstacles.some(box => intersects(r, box) || intersects(e, box)), card: { x: r.x, y: r.y, width: r.width, height: r.height },
            sticker: { x: e.x, y: e.y, width: e.width, height: e.height } };
        }, expected);
        evidence.xixiModes.push(actual);
        assert.equal(actual.portraitMatches, true, JSON.stringify(actual)); assert.equal(actual.emoteMatches, true, JSON.stringify(actual)); assert.equal(actual.emoteLoaded, true, JSON.stringify(actual));
        assert.equal(actual.rightPortraitMatches, true);
        assert.equal(actual.emoteBackground, 'rgba(0, 0, 0, 0)');
        assert.equal(actual.visible, true); assert.equal(actual.contain, 'contain'); assert.equal(actual.overlaps, false);
        if (mode === 'dark') await page.screenshot({ path: path.join(output, 'preview-dark-xixi.png') });
      }
      assert.deepEqual(await page.evaluate(() => __SIGRIKA_DENIA_FUSION__.getSettings()), settings);
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.evaluate(() => {
        fixture.setMode('dark');
        const panel = document.createElement('aside'); panel.className = 'app-shell-right-panel'; panel.id = 'xixi-test-panel';
        panel.style.cssText = 'position:fixed;right:0;top:44px;bottom:0;width:240px;background:#201d30;z-index:30';
        document.body.append(panel);
      });
      await page.waitForTimeout(450);
      evidence.xixiPanel = await page.evaluate(() => {
        const panel = document.getElementById('xixi-test-panel').getBoundingClientRect();
        const nodes = [...document.querySelectorAll('[data-fusion-card],[data-sunlit-companion]')].filter(node =>
          !node.hidden && node.dataset.fusionHidden !== 'true' && getComputedStyle(node).display !== 'none');
        return { panelWidth: panel.width, overlaps: nodes.filter(node => { const r = node.getBoundingClientRect(); return r.left < panel.right && r.right > panel.left && r.top < panel.bottom && r.bottom > panel.top; }).map(node => node.dataset.fusionCard || node.dataset.sunlitCompanion) };
      });
      assert.equal(evidence.xixiPanel.panelWidth, 240); assert.deepEqual(evidence.xixiPanel.overlaps, []);
      await page.screenshot({ path: path.join(output, 'preview-dark-xixi-panel.png') });
      await page.evaluate(() => { document.getElementById('xixi-test-panel').remove(); fixture.setMode('light'); });
    });
    await check('new night photograph keeps both faces and full main coverage at 1280, 1600 and 1920 with or without a right dock', async () => {
      evidence.nightFraming = [];
      await page.evaluate(() => { fixture.setView('chat'); fixture.setMode('dark'); });
      for (const width of [1280, 1600, 1920]) for (const dock of [false, true]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(dock => {
          document.getElementById('framing-panel')?.remove();
          if (dock) { const panel = document.createElement('aside'); panel.id = 'framing-panel'; panel.className = 'app-shell-right-panel'; panel.style.cssText = 'position:fixed;right:0;top:44px;bottom:0;width:240px;background:#201d30;z-index:30'; document.body.append(panel); }
        }, dock);
        await page.waitForTimeout(300);
        const framing = await page.evaluate(() => {
          const main = document.querySelector('main'), area = main.getBoundingClientRect(), css = getComputedStyle(main, '::before');
          const canvasWidth = parseFloat(css.width), imageWidth = parseFloat(css.backgroundSize), imageHeight = imageWidth * 847 / 1272;
          const offset = parseFloat(css.backgroundPositionX);
          const panel = document.getElementById('framing-panel')?.getBoundingClientRect(), availableWidth = panel ? panel.left - area.left : area.width;
          const scale = imageWidth / 1272, pairX = offset + imageWidth * .55;
          // Source-pixel bounds surround each face, including forehead and chin.
          // The right character's hair already touches y=0 in the original.
          const faces = [[480, 208, 650, 325], [755, 105, 938, 235]].map(([left, top, right, bottom]) =>
            ({ left: offset + left * scale, top: top * scale, right: offset + right * scale, bottom: bottom * scale }));
          return { canvasWidth, imageWidth, imageHeight, offset, positionY: css.backgroundPositionY,
            mainWidth: area.width, mainHeight: area.height, availableWidth, center: pairX / availableWidth, faces };
        });
        assert.ok(Math.abs(framing.canvasWidth - (width - 240)) <= 1, JSON.stringify(framing));
        assert.ok(framing.imageWidth >= framing.canvasWidth && framing.imageHeight >= framing.mainHeight - 1, JSON.stringify(framing));
        assert.ok(framing.offset <= 0 && framing.offset + framing.imageWidth >= framing.canvasWidth - 1, JSON.stringify(framing));
        assert.ok(framing.center >= .49 && framing.center <= (dock ? .66 : .56), JSON.stringify(framing));
        assert.equal(framing.positionY, '0%');
        assert.ok(Math.abs(framing.imageWidth - Math.max(framing.mainWidth, framing.mainHeight * 1272 / 847)) <= 1, JSON.stringify(framing));
        for (const face of framing.faces) assert.ok(face.left >= 0 && face.right <= framing.availableWidth && face.top >= 0 && face.bottom <= framing.mainHeight, JSON.stringify(framing));
        evidence.nightFraming.push({ width, dock, ...framing });
        await page.screenshot({ path: path.join(output, `preview-night-centered-${width}${dock ? '-panel' : ''}.png`) });
      }
      await page.evaluate(() => { document.getElementById('framing-panel')?.remove(); fixture.setMode('light'); });
      await page.setViewportSize({ width: 1600, height: 1000 });
    });
    await check('night framing ignores streamed message nodes, stays idle in light mode and disposes layout observers', async () => {
      const probe = await context.newPage();
      try {
        await probe.goto(`http://127.0.0.1:${server.address().port}`);
        await probe.evaluate(source => {
          window.framingReads = 0;
          window.resolveFusionLayout = () => { framingReads++; return { main: document.querySelector('main'), panels: [...document.querySelectorAll('.app-shell-right-panel')] }; };
          (0, eval)(source);
          mountSunlitGallery({ window, document, addCleanup() {} });
        }, fs.readFileSync(path.join(root, 'theme/design/fixed-scenes.js'), 'utf8'));
        await probe.waitForTimeout(120);
        assert.equal(await probe.evaluate(() => framingReads), 0);
        await probe.evaluate(() => fixture.setMode('dark')); await probe.waitForTimeout(150);
        const before = await probe.evaluate(() => framingReads); assert.ok(before > 0);
        await probe.evaluate(() => { for (let i = 0; i < 40; i++) { const p = document.createElement('p'); p.textContent = 'streamed text ' + i; document.querySelector('.assistant-text').append(p); } });
        await probe.waitForTimeout(150); assert.equal(await probe.evaluate(() => framingReads), before);
        await probe.evaluate(() => { const panel = document.createElement('aside'); panel.className = 'app-shell-right-panel'; panel.style.cssText = 'position:fixed;right:0;top:44px;bottom:0;width:240px'; document.body.append(panel); });
        await probe.waitForTimeout(150); assert.ok(await probe.evaluate(() => framingReads) > before);
        await probe.evaluate(() => fixture.setMode('light')); await probe.waitForTimeout(80);
        const light = await probe.evaluate(() => framingReads);
        await probe.setViewportSize({ width: 1400, height: 900 }); await probe.waitForTimeout(100);
        assert.equal(await probe.evaluate(() => framingReads), light);
        await probe.evaluate(() => { __SUNLIT_GALLERY__.dispose(); fixture.setMode('dark'); document.querySelector('.app-shell-right-panel').remove(); });
        await probe.setViewportSize({ width: 1500, height: 950 }); await probe.waitForTimeout(100);
        assert.equal(await probe.evaluate(() => framingReads), light);
      } finally { await probe.close(); }
    });
    await check('gallery thumbnails switch actual art, persist modes independently, reset separately and return focus', async () => {
      await page.evaluate(() => { fixture.setMode('light'); fixture.setView('home'); });
      const preferences = await page.evaluate(() => __SIGRIKA_DENIA_FUSION__.getSettings());
      await page.getByRole('button', { name: '调色板', exact: true }).click();
      await page.getByText('背景', { exact: true }).click();
      const opener = page.getByRole('button', { name: '选择背景', exact: true });
      await opener.click();
      const dialog = page.locator('dialog[data-sgk-gallery]');
      await dialog.waitFor({ state: 'visible' });
      const choices = manifest.config.gallery.scenes;
      assert.equal(await dialog.locator('button[data-scene]').count(), choices.length);
      for (const scene of choices) {
        const choice = dialog.getByRole('button', { name: '选择背景：' + scene.label, exact: true });
        await choice.scrollIntoViewIfNeeded();
        await choice.locator('img').evaluate(img => img.decode());
        assert.ok(await choice.locator('img').evaluate(img => img.naturalWidth > 0));
      }
      await page.screenshot({ path: path.join(output, 'gallery-light.png') });
      const legacy = choices.find(scene => !['orchard', 'night', 'night-tears', 'night-original'].includes(scene.id));
      assert.ok(legacy);
      await dialog.getByRole('button', { name: '选择背景：' + legacy.label, exact: true }).click();
      assert.equal((await state()).scene.scene, legacy.id);
      assert.equal(await dialog.locator(`[data-scene="${legacy.id}"]`).getAttribute('aria-pressed'), 'true');
      await page.keyboard.press('Escape');
      assert.equal(await dialog.isVisible(), false);
      assert.equal(await opener.evaluate(node => node.getRootNode().activeElement === node), true);
      await page.evaluate(() => fixture.setMode('dark'));
      await page.waitForFunction(() => __SUNLIT_GALLERY__.getState().mode === 'dark');
      assert.equal((await state()).scene.scene, 'night');
      await opener.click();
      await page.screenshot({ path: path.join(output, 'gallery-dark.png') });
      await dialog.getByRole('button', { name: '选择背景：昭日遇见暗潮', exact: true }).click();
      const expected = { light: legacy.id, dark: 'night-original' };
      assert.deepEqual((await state()).scene.selected, expected);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '调色板', exact: true }).click();
      // Full payload removal/reapplication proves storage survives runtime replacement.
      await evaluateFile('/remove.js'); await apply();
      assert.deepEqual((await state()).scene.selected, expected);
      assert.equal((await state()).scene.scene, 'night-original');
      const settingsAfter = await page.evaluate(() => __SIGRIKA_DENIA_FUSION__.getSettings());
      assert.deepEqual(settingsAfter, preferences);
      await page.evaluate(() => { __SUNLIT_GALLERY__.resetCurrent(); fixture.setMode('light'); });
      await page.waitForFunction(() => __SUNLIT_GALLERY__.getState().mode === 'light');
      assert.equal((await state()).scene.scene, legacy.id);
      assert.equal(await page.evaluate(() => __SUNLIT_GALLERY__.selectScene('missing-scene')), false);
      assert.equal((await state()).scene.scene, legacy.id);
      await page.evaluate(() => __SUNLIT_GALLERY__.resetCurrent());
      assert.deepEqual((await state()).scene.selected, { light: 'orchard', dark: 'night' });
      for (const width of [420, 720, 1600]) {
        await page.setViewportSize({ width, height: 850 });
        await page.evaluate(() => __SUNLIT_GALLERY__.open());
        const fit = await dialog.evaluate(node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && node.scrollWidth <= node.clientWidth; });
        assert.equal(fit, true, `Gallery overflow at ${width}`);
        await page.keyboard.press('Escape');
        assert.equal(await dialog.isVisible(), false);
      }
      await page.setViewportSize({ width: 1600, height: 1000 });
      evidence.gallery = { choices: choices.length, saved: expected, defaults: (await state()).scene.selected, viewportWidths: [420, 720, 1600] };
    });
    await check('each retained scene paints its configured art in both modes and leaves no obsolete orchard canvas', async () => {
      await page.evaluate(() => fixture.setView('chat'));
      for (const mode of ['light', 'dark']) {
        await page.evaluate(mode => fixture.setMode(mode), mode);
        await page.waitForFunction(mode => __SUNLIT_GALLERY__.getState().mode === mode, mode);
        for (const scene of manifest.config.gallery.scenes) {
          await page.evaluate(id => __SUNLIT_GALLERY__.selectScene(id), scene.id);
          await page.waitForTimeout(100);
          const paint = await page.evaluate(asset => {
            const probe = document.createElement('div'); probe.style.backgroundImage = `var(--tessalume-asset-${asset})`; document.body.append(probe);
            const expected = getComputedStyle(probe).backgroundImage; probe.remove();
            const actual = getComputedStyle(document.querySelector('main'), '::before').backgroundImage;
            return { matches: actual === expected && expected !== 'none', layered: __SUNLIT_LAYERED_SCENE__?.getState().active };
          }, scene.asset);
          assert.equal(paint.matches, true, `Incorrect art: ${mode}/${scene.id}`);
          if (!['orchard', 'night', 'night-tears'].includes(scene.id)) assert.equal(paint.layered, false, `Primary motion canvas active for ${scene.id}`);
        }
        await page.evaluate(() => __SUNLIT_GALLERY__.resetCurrent());
      }
      await page.evaluate(() => { fixture.setMode('light'); fixture.setView('home'); });
    });
    await check('invalid stored scenes fall back per mode and open-gallery disposal leaves no modal or inert page', async () => {
      const isolated = await browser.newContext(), probe = await isolated.newPage();
      try {
        await probe.goto(`http://127.0.0.1:${server.address().port}`);
        for (const value of ['{invalid-json', JSON.stringify({ light: 'does-not-exist', dark: 'night-original' })]) {
          await probe.evaluate(value => localStorage.setItem('sunlit-tides.gallery.v2:sunlit-tides.codex', value), value);
          await probe.evaluate(payload => (0, eval)(payload), payload);
          const actual = await probe.evaluate(() => __SUNLIT_GALLERY__.getState());
          assert.equal(actual.selected.light, 'orchard');
          assert.equal(actual.selected.dark, value === '{invalid-json' ? 'night' : 'night-original');
          await probe.evaluate(() => __SUNLIT_GALLERY__.open());
          await probe.evaluate(remove => (0, eval)(remove), remove);
          assert.equal(await probe.locator('dialog[data-sgk-gallery]').count(), 0);
          await probe.getByRole('button', { name: '选择项目 ▾', exact: true }).click();
          await probe.getByRole('menuitem', { name: '个人工具箱', exact: true }).click();
        }
      } finally { await isolated.close(); }
    });
    await check('native upward project menus remain hit-accessible and preserve keyboard focus at desktop and narrow widths', async () => {
      evidence.menus = [];
      await page.evaluate(() => fixture.setView('home')); await page.waitForTimeout(250);
      for (const width of [1600, 720, 420]) for (const mode of ['light', 'dark']) for (const portal of [false, true]) {
        await page.setViewportSize({ width, height: width < 800 ? 850 : 1000 });
        await page.evaluate(({ mode, portal }) => { fixture.setMode(mode); const menu = document.getElementById('project-menu'); menu.classList.toggle('portal-menu', portal); (portal ? document.body : document.querySelector('#home-view .composer-surface-chrome')).append(menu); }, { mode, portal });
        await page.waitForTimeout(180);
        await page.getByRole('button', { name: '选择项目 ▾', exact: true }).click(); await page.waitForTimeout(80);
        assert.equal(await page.locator('[data-theme-role="hero"]').isVisible(), false);
        await page.keyboard.press('ArrowDown');
        assert.equal(await page.getByRole('menuitem', { name: '个人工具箱', exact: true }).evaluate(node => node === document.activeElement), true);
        const hit = await page.getByRole('menuitem', { name: '主题预览', exact: true }).evaluate(node => { const r = node.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === node; });
        assert.equal(hit, true, `native menu covered at ${width}/${mode}/${portal}`);
        await page.getByRole('menuitem', { name: '主题预览', exact: true }).click(); await page.waitForTimeout(80);
        assert.equal(await page.locator('#project-trigger').evaluate(node => node === document.activeElement), true);
        evidence.menus.push({ width, mode, portal, hit });
      }
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.evaluate(() => { const menu = document.getElementById('project-menu'); menu.classList.remove('portal-menu'); document.querySelector('#home-view .composer-surface-chrome').append(menu); });
    });
    await check('single transcript scroller remains while wheel, final actions and multiline editor scrolling work', async () => {
      await page.evaluate(() => { fixture.setView('chat'); fixture.setMode('light'); }); await page.waitForTimeout(350);
      evidence.scroll = [];
      for (const width of [1600, 720, 420]) {
        await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(200);
        const owners = await page.evaluate(() => [...document.querySelectorAll('main,.thread-scroll-container')].filter(node => /auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight).map(node => node.tagName === 'MAIN' ? 'outer-main' : 'transcript'));
        assert.deepEqual(owners, ['transcript']); evidence.scroll.push({ width, owners });
      }
      await page.mouse.move(200, 300); await page.mouse.wheel(0, 350); await page.waitForTimeout(120);
      assert.ok(await page.locator('.thread-scroll-container').evaluate(node => node.scrollTop > 0));
      await page.locator('.thread-scroll-container').evaluate(node => node.scrollTop = node.scrollHeight); await page.waitForTimeout(100);
      await page.getByRole('button', { name: '最后一条附件操作' }).click(); assert.equal(await page.locator('#final-action').getAttribute('data-clicked'), 'true');
      await page.getByRole('textbox', { name: '聊天输入', exact: true }).fill(Array.from({ length: 20 }, (_, i) => '合成输入第 ' + i + ' 行').join('\n'));
      assert.ok(await page.getByRole('textbox', { name: '聊天输入', exact: true }).evaluate(node => { node.scrollTop = 140; return node.scrollTop; }) > 0);
      await page.getByRole('textbox', { name: '聊天输入', exact: true }).fill('');
      await page.locator('#final-action').evaluate(node => node.removeAttribute('data-clicked'));
      await page.setViewportSize({ width: 1600, height: 1000 });
    });
    let saved;
    await check('independent light/dark theme preferences persist without changing native settings', async () => {
      await page.evaluate(() => { const api = __SIGRIKA_DENIA_FUSION__, next = api.getSettings(); next.modes.light.messageOpacity = 67; next.modes.dark.messageOpacity = 73; next.common.bubbleCount = 11; api.setSettings(next); });
      await page.waitForTimeout(400); saved = await page.evaluate(id => localStorage.getItem('tessalume.fusion.settings.v1:' + id), manifest.id);
      assert.equal(JSON.parse(saved).modes.light.messageOpacity, 67); assert.equal(JSON.parse(saved).modes.dark.messageOpacity, 73);
      assert.equal(await page.evaluate(() => localStorage.getItem('codex.native.settings')), '{"editor":"native","language":"zh-CN"}');
      assert.equal(await page.evaluate(() => localStorage.getItem('other.theme.preference')), 'untouched');
    });
    await check('remover retracts all theme nodes/attributes/globals and retains every native node', async () => {
      await page.evaluate(() => { fixture.setMode('light'); fixture.setView('home'); }); await page.waitForTimeout(160);
      evidence.remove = await evaluateFile('/remove.js'); assert.equal(evidence.remove.removed, true); await page.waitForTimeout(500);
      evidence.restore = await page.evaluate(() => inspectRestore());
      assert.deepEqual(evidence.restore.changed, []); assert.deepEqual(evidence.restore.added, []); assert.deepEqual(evidence.restore.globals, []);
      assert.equal(await page.locator('#native-empty-wrapper').count(), 1);
      assert.equal(await page.evaluate(id => localStorage.getItem('tessalume.fusion.settings.v1:' + id), manifest.id), saved);
    });
    await check('reapply restores saved preferences, repeat apply stays singular and second removal remains clean', async () => {
      await apply(); const actual = await state(); assert.equal(actual.fusion.modes.light.messageOpacity, 67); assert.equal(actual.fusion.modes.dark.messageOpacity, 73); assert.equal(actual.fusion.common.bubbleCount, 11);
      assert.equal((await apply()).unchanged, true);
      assert.equal(await page.locator('#tessalume-theme-style').count(), 1); assert.equal(await page.locator('[data-fusion-ui="palette"]').count(), 1);
      assert.equal((await evaluateFile('/remove.js')).removed, true); await page.waitForTimeout(500);
      const restored = await page.evaluate(() => inspectRestore()); assert.deepEqual(restored.changed, []); assert.deepEqual(restored.added, []); assert.deepEqual(restored.globals, []);
      assert.equal((await evaluateFile('/remove.js')).removed, false);
      assert.equal(await page.evaluate(() => localStorage.getItem('other.theme.preference')), 'untouched');
    });
    await check('native startup preference supports absent/late bridge, changes, reset isolation and listener cleanup', async () => {
      const startupContext = await browser.newContext();
      const startupPage = await startupContext.newPage();
      startupPage.on('pageerror', error => errors.push(error.message));
      try {
        await startupPage.goto(`http://127.0.0.1:${server.address().port}`);
        await startupPage.evaluate(() => {
          window.startupChanges = [];
          window.addEventListener('sunlit-tides:startup-change', event => startupChanges.push(event.detail));
          // A theme must emit the event only; the native host owns calling this binding.
          window.sunlitTidesStartupChanged = () => { throw new Error('Palette directly called native binding'); };
        });
        await startupPage.evaluate(payload => (0, eval)(payload), payload);
        const input = startupPage.getByRole('checkbox', { name: '以后启动 Codex 时播放龙娘动画', exact: true });
        await startupPage.getByRole('button', { name: '调色板', exact: true }).click();
        await startupPage.getByText('启动动画', { exact: true }).click();
        assert.equal(await input.isDisabled(), true);
        assert.equal(await startupPage.getByText('需要通过晴光与泡影启动器连接 Codex 后设置启动动画。', { exact: true }).isVisible(), true);
        await startupPage.evaluate(() => {
          window.__sunlitTidesStartup = { enabled: true, available: true };
          window.dispatchEvent(new CustomEvent('sunlit-tides:startup-state', { detail: __sunlitTidesStartup }));
        });
        assert.equal(await input.isEnabled(), true); assert.equal(await input.isChecked(), true);
        assert.equal(await startupPage.getByText('需要通过晴光与泡影启动器连接 Codex 后设置启动动画。', { exact: true }).isVisible(), false);
        await input.uncheck();
        assert.equal(await startupPage.evaluate(() => localStorage.getItem('sunlit-tides.startup.enabled')), 'false');
        await input.check();
        assert.equal(await startupPage.evaluate(() => localStorage.getItem('sunlit-tides.startup.enabled')), 'true');
        assert.deepEqual(await startupPage.evaluate(() => startupChanges), [{ enabled: false }, { enabled: true }]);
        await startupPage.getByRole('button', { name: '恢复默认', exact: true }).click();
        assert.equal(await input.isChecked(), true);
        assert.equal(await startupPage.evaluate(() => localStorage.getItem('sunlit-tides.startup.enabled')), 'true');
        await startupPage.evaluate(() => {
          window.retainedStartupInput = [...document.querySelector('[data-fusion-ui="palette"]').shadowRoot.querySelectorAll('label')].find(node => node.textContent === '以后启动 Codex 时播放龙娘动画').querySelector('input');
          window.__sunlitTidesStartup = { enabled: false, available: true };
        });
        await startupPage.evaluate(remove => (0, eval)(remove), remove);
        await startupPage.evaluate(() => {
          window.dispatchEvent(new CustomEvent('sunlit-tides:startup-state', { detail: __sunlitTidesStartup }));
        });
        assert.equal(await startupPage.evaluate(() => retainedStartupInput.checked), true);
        await startupPage.evaluate(() => {
          retainedStartupInput.checked = false;
          retainedStartupInput.dispatchEvent(new Event('change', { bubbles: true }));
        });
        assert.equal(await startupPage.evaluate(() => startupChanges.length), 2);
        assert.equal(await startupPage.evaluate(() => localStorage.getItem('sunlit-tides.startup.enabled')), 'true');
        // Native state on a fresh attach overrides the stale browser mirror.
        await startupPage.evaluate(payload => (0, eval)(payload), payload);
        await startupPage.getByRole('button', { name: '调色板', exact: true }).click();
        await startupPage.getByText('启动动画', { exact: true }).click();
        assert.equal(await input.isChecked(), false); assert.equal(await input.isEnabled(), true);
        assert.equal(await startupPage.evaluate(() => localStorage.getItem('sunlit-tides.startup.enabled')), 'false');
      } finally { await startupContext.close(); }
    });
    await check('browser reports no uncaught script errors', async () => assert.deepEqual(errors, []));
    await context.close();
  } finally {
    await browser.close(); await new Promise(resolve => server.close(resolve));
    const report = { theme: { id: manifest.id, version: manifest.version, fingerprint: manifest.fingerprint }, results, passed: results.filter(row => row.passed).length, total: results.length, evidence, errors };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
    if (results.some(row => !row.passed)) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
