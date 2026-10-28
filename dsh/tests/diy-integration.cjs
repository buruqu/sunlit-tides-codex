/* Complete built DSH client + real shared editor, synthetic host only. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');
const fixtureSource=fs.readFileSync(path.join(root,'tests/client.cjs'),'utf8').match(/const fixture = (`[\s\S]+?`);\r?\nconst checks/);
if(!fixtureSource)throw Error('DSH fixture changed');
const fixture=vm.runInNewContext(fixtureSource[1]).replace('</body>',`<script>window.__ModuleLoader__={load(e){window.theme=e.factory();}};document.querySelector('#native-send').onclick=()=>{document.body.dataset.sent=document.querySelector('textarea').value};document.querySelector('#native-new').onclick=()=>{document.body.dataset.page='new';document.querySelector('.chat-header').textContent='新页面'};</script><script src="/client.js"></script><script>theme.apply({effect(fn){window.cleanup=fn()}})</script></body>`);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
(async()=>{const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/client.js'?'application/javascript':'text/html;charset=utf-8');res.end(req.url==='/client.js'?fs.readFileSync(path.join(root,'lib/client.js')):fixture)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
try{const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.__SUNLIT_DIY__?.getState().ready);
 page.setDefaultTimeout(10000);
 await page.evaluate(()=>document.querySelector('.hero').insertAdjacentHTML('beforeend','<article data-chat-flow-kind="assistant-step"><div class="fixture_markdown_content"><p id="type-plain">可改色正文 <strong>加粗正文</strong></p><p><a id="type-link" href="#">保留链接</a></p><pre><code id="type-code">code</code></pre><p role="status" id="type-status">状态保留</p><ul><li id="type-list">列表标记保持可见</li></ul></div></article>'));
 const editor=page.locator('#sunlit-diy-editor'),panel=editor.getByRole('dialog');
 const open=async()=>{await page.locator('[data-sunlit-toggle]').click();await page.locator('[data-sunlit-diy-edit]').click();await panel.waitFor({state:'visible'});};
 const pick=async id=>{await panel.getByRole('button',{name:id.endsWith('-region')?'布局':'素材',exact:true}).click();await panel.locator(`.layer[data-layer-id="${id}"] .pick`).click();};
 const field=async(name,value)=>{await panel.getByRole('spinbutton',{name,exact:true}).fill(String(value));};
 await page.locator('textarea').fill('编辑前未发送草稿');await open();
 await pick('background');assert.equal(await panel.getByRole('combobox',{name:'图片适应',exact:true}).inputValue(),'cover');await panel.getByRole('combobox',{name:'图片适应',exact:true}).selectOption('contain');
 assert.equal(await page.locator('[data-sunlit-background]').evaluate(el=>getComputedStyle(el).visibility),'hidden');assert.equal(await page.locator('[data-sunlit-diy-art] [data-layer-id="background"] img').evaluate(el=>getComputedStyle(el).objectFit),'contain');
 fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/diy-background-contain.png')});
 await field('宽度 %',150);await field('横向位置 %',-25);await field('纵向位置 %',-10);assert.equal((await page.locator('[data-sunlit-diy-art] [data-layer-id="background"]').boundingBox()).width,1920);assert.equal((await editor.locator('.box[data-layer-id="background"]').boundingBox()).x,-320);
 await panel.getByRole('combobox',{name:'图片适应',exact:true}).selectOption('cover');assert.equal(await page.locator('[data-sunlit-background]').evaluate(el=>getComputedStyle(el).visibility),'visible');assert.equal((await page.locator('[data-sunlit-background]').boundingBox()).x,-320);assert.equal((await page.locator('[data-sunlit-background]').boundingBox()).width,1920);
 await panel.getByRole('button',{name:'此层恢复默认',exact:true}).click();
 await pick('composer-region');await field('宽度 %',1);await field('横向位置 %',200);await field('高度 %',200);await field('纵向位置 %',-20);
 const synced=async()=>{const state=await page.evaluate(()=>__SUNLIT_DIY__.getState().layers.find(x=>x.id==='composer-region'));const native=await page.locator('[data-composer-seat]').boundingBox(),box=await editor.locator('.box[data-layer-id="composer-region"]').boundingBox();assert.ok(Math.abs(native.x-box.x)<1&&Math.abs(native.y-box.y)<1&&Math.abs(native.width-box.width)<1&&Math.abs(native.height-box.height)<1);assert.ok(Math.abs(native.y-44)<1);assert.ok(Math.abs(Number(await panel.getByRole('spinbutton',{name:'横向位置 %',exact:true}).inputValue())-state.x)<.02);return state;};
 assert.equal((await synced()).width,10);assert.equal((await synced()).x,90);
 await field('横向位置 %',20);const bounded=await editor.locator('.box[data-layer-id="composer-region"]').boundingBox();await page.mouse.move(bounded.x+bounded.width/2,bounded.y+60);await page.mouse.down();await page.mouse.move(-100,-100,{steps:8});await page.mouse.up();assert.equal((await synced()).x,0);
 await page.setViewportSize({width:1000,height:600});await page.waitForFunction(()=>Math.abs(document.querySelector('[data-composer-seat]').getBoundingClientRect().y-44)<.1);await synced();assert.ok(Math.abs(Number(await panel.getByRole('spinbutton',{name:'纵向位置 %',exact:true}).inputValue())*600/100-44)<.1);
 await page.screenshot({path:path.join(root,'test-results/diy-region-boundary-1000x600.png')});
 await page.setViewportSize({width:1280,height:850});await page.waitForFunction(()=>Math.abs(document.querySelector('[data-composer-seat]').getBoundingClientRect().y-44)<.1);await panel.getByRole('button',{name:'此层恢复默认',exact:true}).click();
 await panel.getByRole('button',{name:'素材',exact:true}).click();await panel.getByRole('textbox',{name:'新素材名称',exact:true}).fill('导入立绘');await panel.getByRole('combobox',{name:'素材用途',exact:true}).selectOption('portrait-left');
 await panel.locator('input[aria-label="导入素材文件"]').setInputFiles({name:'tiny.png',mimeType:'image/png',buffer:png});
 await panel.getByRole('button',{name:'确认添加',exact:true}).waitFor();assert.equal(await panel.locator('.layer .pick').filter({hasText:'导入立绘'}).count(),0);
 await panel.getByRole('button',{name:'取消新增',exact:true}).click();assert.equal(await page.evaluate(()=>__SUNLIT_DIY__.getState().pending),null);
 await panel.locator('input[aria-label="导入素材文件"]').setInputFiles({name:'tiny.png',mimeType:'image/png',buffer:png});await panel.getByRole('button',{name:'确认添加',exact:true}).click();
 const id='portrait-left';
 await pick(id);await panel.getByRole('textbox',{name:'素材名称',exact:true}).fill('重命名立绘');await field('横向位置 %',25);await field('纵向位置 %',25);await field('宽度 %',15);await field('高度 %',20);
 const drag=editor.locator(`.box[data-layer-id="${id}"]`);const rect=await drag.boundingBox();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+64,rect.y+rect.height/2+42.5,{steps:8});await page.mouse.up();
 assert.ok(Number(await panel.getByRole('spinbutton',{name:'横向位置 %',exact:true}).inputValue())>25);await field('横向位置 %',30);
 for(const kind of ['background','sidebar','emote-right','image','effect']) {
  await panel.getByRole('textbox',{name:'新素材名称',exact:true}).fill(`素材-${kind}`);await panel.getByRole('combobox',{name:'素材用途',exact:true}).selectOption(kind);
  await panel.locator('input[aria-label="导入素材文件"]').setInputFiles({name:`${kind}.png`,mimeType:'image/png',buffer:png});await panel.getByRole('button',{name:'确认添加',exact:true}).click();
  assert.equal(await page.evaluate(k=>__SUNLIT_DIY__.getState().layers.find(x=>x.name===`素材-${k}`).kind,kind),kind==='emote-right'?'emote':kind);
  if(kind==='effect'){await field('粒子数量',7);await field('运动速度',2);await panel.getByRole('combobox',{name:'运动方向',exact:true}).selectOption('right');assert.equal(await page.locator('[data-sunlit-diy-art] .effect .particle').count(),7);}
  await panel.getByRole('checkbox',{name:'显示此层',exact:true}).uncheck();
 }
 const preserved=await page.evaluate(()=>['type-link','type-code','type-status'].map(id=>getComputedStyle(document.getElementById(id)).color));
 await panel.getByRole('button',{name:'字体',exact:true}).click();await panel.getByRole('textbox',{name:'文字颜色',exact:true}).fill('#123456');await panel.getByRole('textbox',{name:'渐变起点',exact:true}).fill('#ff0000');await panel.getByRole('textbox',{name:'渐变终点',exact:true}).fill('#0000ff');await panel.getByRole('checkbox',{name:'启用渐变文字',exact:true}).check();
 assert.equal(await page.locator('#type-plain').evaluate(el=>getComputedStyle(el).webkitTextFillColor),'rgba(0, 0, 0, 0)');assert.notEqual(await page.locator('#type-list').evaluate(el=>getComputedStyle(el,'::marker').webkitTextFillColor),'rgba(0, 0, 0, 0)');assert.equal(await page.locator('#type-list').evaluate(el=>getComputedStyle(el).backgroundImage),'none');
 await panel.getByRole('checkbox',{name:'启用渐变文字',exact:true}).uncheck();
 assert.equal(await page.locator('#type-plain').evaluate(el=>getComputedStyle(el).webkitTextFillColor),'rgb(18, 52, 86)');assert.equal(await page.locator('#type-plain').evaluate(el=>getComputedStyle(el).backgroundImage),'none');assert.deepEqual(await page.evaluate(()=>['type-link','type-code','type-status'].map(id=>getComputedStyle(document.getElementById(id)).color)),preserved);
 for(const [region,x,y,w,h] of [['sidebar-region',0,5,17,90],['chat-region',19,10,78,50],['composer-region',22,65,73,25]]){await pick(region);await field('横向位置 %',x);await field('纵向位置 %',y);await field('宽度 %',w);await field('高度 %',h);}

 // Apply a decorative background to each already moved native functional region.
 // The native nodes and their children must survive, and backgrounds must follow.
 await page.evaluate(()=>{window.originalDiyInput=document.querySelector('textarea[aria-label="聊天输入"],textarea');});
 for(const slot of ['chat-background','composer-background']){
  await panel.getByRole('button',{name:'素材',exact:true}).click();
  await panel.getByRole('textbox',{name:'新素材名称',exact:true}).fill('区域背景-'+slot);
  await panel.getByRole('combobox',{name:'素材用途',exact:true}).selectOption(slot);
  await panel.locator('input[aria-label="导入素材文件"]').setInputFiles({name:slot+'.png',mimeType:'image/png',buffer:png});
  await panel.getByRole('button',{name:'确认添加',exact:true}).click();await pick(slot);
  assert.equal(await panel.getByRole('checkbox',{name:'跟随区域尺寸',exact:true}).isChecked(),true,'New regional backgrounds follow their native region');
  assert.equal(await page.locator(`[data-sunlit-region-background="${slot}"]`).count(),1);
 }
 const assertBackgroundGeometry=async()=>{
  for(const slot of ['chat-background','composer-background']){
   try { await page.waitForFunction(slot=>{const host=document.querySelector(`[data-sunlit-region-background="${slot}"]`),image=host?.querySelector('img');if(!host||!image||!image.complete||!image.naturalWidth)return false;const parent=host.parentElement.getBoundingClientRect(),rect=image.getBoundingClientRect();return ['x','y','width','height'].every(k=>Math.abs(parent[k]-rect[k])<2);},slot); } catch(error) { await page.screenshot({path:path.join(root,'test-results/diy-background-follow-failure.png')});const actual=await page.evaluate(slot=>{const host=document.querySelector(`[data-sunlit-region-background="${slot}"]`),image=host?.querySelector('img');return {slot,layer:__SUNLIT_DIY__.getState().layers.find(x=>x.id===slot),parent:host?.parentElement.getBoundingClientRect().toJSON(),image:image?.getBoundingClientRect().toJSON(),loaded:image?.naturalWidth,styles:image?.getAttribute('style')};},slot);throw Error('Background follow geometry failed: '+JSON.stringify(actual),{cause:error}); }
   const paint=await page.locator(`[data-sunlit-region-background="${slot}"]`).evaluate(el=>({pointer:getComputedStyle(el).pointerEvents,visible:getComputedStyle(el).visibility,image:getComputedStyle(el.querySelector('img')).opacity}));
   assert.equal(paint.pointer,'none');assert.equal(paint.visible,'visible');assert.ok(Number(paint.image)>0);
  }
  assert.equal(await page.locator('textarea[aria-label="聊天输入"],textarea').first().evaluate(el=>el===window.originalDiyInput),true,'Backgrounds preserve the actual native input node');
 };
 await assertBackgroundGeometry();await pick('composer-region');await field('横向位置 %',23);await assertBackgroundGeometry();await field('横向位置 %',22);await assertBackgroundGeometry();
 await panel.getByRole('button',{name:'保存并退出',exact:true}).click();await panel.waitFor({state:'hidden'});
 assert.equal(await page.locator('textarea').inputValue(),'编辑前未发送草稿','Moving regions must preserve existing composer draft');
 assert.ok(Math.abs((await page.locator('[data-composer-seat]').boundingBox()).width-1280*.73)<2,'Native reading-width cap must not override DIY composer width');

 await page.setViewportSize({width:1000,height:600});await assertBackgroundGeometry();
 assert.equal(await page.locator('textarea').isVisible(),true);await page.locator('textarea').click();
 await page.screenshot({path:path.join(root,'test-results/diy-region-background-follow-1000x600.png')});
 await page.setViewportSize({width:1280,height:850});await assertBackgroundGeometry();
 await page.locator('textarea').fill('保存布局后仍可输入');await page.locator('#native-send').click();assert.equal(await page.locator('body').getAttribute('data-sent'),'保存布局后仍可输入');await page.locator('#native-new').click();assert.equal(await page.locator('body').getAttribute('data-page'),'new');
 fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/diy-integration-saved.png')});
 await page.reload();await page.waitForFunction(()=>window.__SUNLIT_DIY__?.getState().ready);assert.equal(await page.evaluate(()=>__SUNLIT_DIY__.getState().layers.find(x=>x.name==='重命名立绘').x),30);assert.equal(await page.locator('[data-composer-seat]').evaluate(el=>getComputedStyle(el).position),'fixed');await page.evaluate(()=>{window.originalDiyInput=document.querySelector('textarea[aria-label="聊天输入"],textarea');});await assertBackgroundGeometry();
 await page.locator('textarea').fill('刷新后仍可发送');await page.locator('#native-send').click();assert.equal(await page.locator('body').getAttribute('data-sent'),'刷新后仍可发送');
 await open();await panel.getByRole('button',{name:'恢复默认',exact:true}).click();await page.waitForTimeout(500);assert.equal(await page.locator('[data-composer-seat]').evaluate(el=>getComputedStyle(el).position),'static');await page.screenshot({path:path.join(root,'test-results/diy-integration-reset.png')});assert.deepEqual(errors,[]);fs.writeFileSync(path.join(root,'test-results/diy-integration.json'),JSON.stringify({passed:true,syntheticOnly:true,errors,checks:['semantic role imports','pending cancel/confirm','rename/numeric/real drag','typography semantic exclusions','three actual regions','regional backgrounds preserve same native input','background follows region movement/resize/reload','native input click/send','save/reload/reset']},null,2));console.log('DSH full integration passed: semantic role imports, pending cancel/confirm, rename, numeric→drag→numeric, three regions, regional backgrounds/native input preservation, move/resize/reload follow, send/switch and reset; console errors 0.');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
