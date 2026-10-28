/* Refined DIY controls against the complete Codex build, no installed app access. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/diy-usability');
const source=fs.readFileSync(path.join(__dirname,'theme-browser.cjs'),'utf8').match(/const fixture = (`[\s\S]+?`);\r?\n\r?\nasync function main/);
const html=vm.runInNewContext(source[1]).replace('</body>','<script>fixture.setView("chat");fixture.setMode("dark");</script><script src="/payload.js"></script></body>');
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<.7,`${label}: ${a} vs ${b}`);
(async()=>{
 fs.mkdirSync(out,{recursive:true});const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/payload.js'?'application/javascript':'text/html;charset=utf-8');res.end(req.url==='/payload.js'?fs.readFileSync(process.env.DIY_TEST_PAYLOAD||path.join(root,'dist/theme/payload.js')):html)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});const checks=[],errors=[];let passed=false;
 try{
  const page=await browser.newPage({viewport:{width:1440,height:950}});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.__SUNLIT_DIY__?.getState().ready);
  const host=page.locator('#sunlit-diy-editor'),panel=host.getByRole('dialog'),pick=id=>panel.locator(`.layer[data-layer-id="${id}"] .pick`).click(),num=name=>panel.getByRole('spinbutton',{name,exact:true});
  const field=(name,value)=>num(name).fill(String(value)),box=id=>host.locator(`.box[data-layer-id="${id}"]`);
  const open=async()=>{await page.getByRole('button',{name:'调色板',exact:true}).click();await page.getByRole('button',{name:'开启 DIY 编辑',exact:true}).click();await panel.waitFor({state:'visible'});};
  await open();await pick('portrait-left');
  assert.equal(await panel.getByRole('combobox',{name:'图片适应',exact:true}).inputValue(),'contain','Selecting a builtin portrait must preserve full-image fit');
  await panel.getByRole('textbox',{name:'素材名称',exact:true}).fill('我的等比例立绘');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-fusion-card="left"]')).visibility==='hidden');
  assert.equal(await page.locator('[data-fusion-card="left"]').evaluate(n=>getComputedStyle(n).visibility),'hidden','Original standee must not remain behind the edited replacement');
  const portrait=page.locator('[data-sunlit-diy-art] [data-layer-id="portrait-left"]');
  assert.equal(await portrait.locator('img').evaluate(n=>getComputedStyle(n).objectFit),'contain');checks.push('builtin portrait rename preserves contain fit');
  assert.equal(await panel.getByRole('checkbox',{name:'保持比例',exact:true}).isChecked(),true);
  const before=await portrait.boundingBox(),ratio=before.width/before.height;
  await field('宽度 %',18);let painted=await portrait.boundingBox();near(painted.width/painted.height,ratio,'Pixel aspect retained after width input');
  await field('横向位置 %',24);await field('纵向位置 %',20);
  const initial=await box('portrait-left').boundingBox();await box('portrait-left').click({position:{x:25,y:45}});await page.keyboard.press('ArrowRight');let moved=await box('portrait-left').boundingBox();near(moved.x,initial.x+1,'Arrow nudge 1px');
  await box('portrait-left').press('Shift+ArrowDown');moved=await box('portrait-left').boundingBox();near(moved.y,initial.y+10,'Shift nudge 10px');
  await box('portrait-left').press('Control+z');near((await box('portrait-left').boundingBox()).y,initial.y,'Undo one nudge');await box('portrait-left').press('Control+Shift+z');near((await box('portrait-left').boundingBox()).y,initial.y+10,'Redo one nudge');
  const preInput=await box('portrait-left').boundingBox();await page.getByRole('textbox',{name:'聊天输入',exact:true}).press('ArrowRight');near((await box('portrait-left').boundingBox()).x,preInput.x,'Native input arrow must not move artwork');
  await panel.getByRole('button',{name:'水平居中',exact:true}).click();await panel.getByRole('button',{name:'垂直居中',exact:true}).click();painted=await portrait.boundingBox();near(painted.x+painted.width/2,720,'Horizontal center');near(painted.y+painted.height/2,475,'Vertical center');
  await field('横向位置 %',180);await field('纵向位置 %',180);await panel.getByRole('button',{name:'移回画布',exact:true}).click();painted=await portrait.boundingBox();assert.ok(painted.x>=-.5&&painted.y>=-.5&&painted.x+painted.width<=1440.5&&painted.y+painted.height<=950.5);checks.push('aspect, keyboard, native input exclusion, align and recover');
  await pick('background');await field('横向位置 %',-25);await field('宽度 %',150);await field('高度 %',120);
  await panel.getByRole('combobox',{name:'图片适应',exact:true}).selectOption('contain');
  const background=page.locator('[data-sunlit-diy-art] [data-layer-id="background"]');assert.equal(await background.locator('img').evaluate(n=>getComputedStyle(n).objectFit),'contain');const br=await background.boundingBox();near(br.x,-360,'Background negative position');near(br.width,2160,'Background oversize');near(br.height,1140,'Background height');
  assert.equal(await page.locator('main[data-tessalume-surface=main]').evaluate(n=>getComputedStyle(n,'::before').visibility),'hidden');
  await panel.getByRole('button',{name:'此层恢复默认',exact:true}).click();checks.push('background parameters and contain render match');
  await pick('composer-region');await field('宽度 %',150);await field('高度 %',150);await field('横向位置 %',-50);await field('纵向位置 %',-50);
  const compare=async(w,h)=>{const r=await page.locator('.chat-composer-carrier').boundingBox(),b=await box('composer-region').boundingBox();for(const k of ['x','y','width','height'])near(b[k],r[k],'Control frame matches actual '+k);near(r.y,44,'Title bar reserved');near(Number(await num('横向位置 %').inputValue())/100*w,r.x,'Panel X matches');near(Number(await num('纵向位置 %').inputValue())/100*h,r.y,'Panel Y matches');near(Number(await num('高度 %').inputValue())/100*h,r.height,'Panel height matches');assert.ok(r.x>=-.5&&r.y+r.height<=h+.5);};
  await compare(1440,950);const raw=await page.evaluate(()=>JSON.stringify(__SUNLIT_DIY__.getState().layers));await page.setViewportSize({width:1000,height:600});await page.waitForTimeout(150);await compare(1000,600);assert.equal(await page.evaluate(()=>JSON.stringify(__SUNLIT_DIY__.getState().layers)),raw,'Resize must not rewrite saved/draft geometry');checks.push('region parameters, frame and live DOM agree at viewport boundaries');
  await page.screenshot({path:path.join(out,'region-bounds.png')});await panel.getByRole('button',{name:'取消编辑',exact:true}).click();assert.equal(await page.locator('.chat-composer-carrier').evaluate(n=>getComputedStyle(n).position),'absolute');assert.deepEqual(errors,[]);
  passed=true;console.log(JSON.stringify({passed,checks,errors}));
 }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed,checks,errors},null,2));await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
