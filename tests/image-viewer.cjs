const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),html=require('./image-viewer-fixture.cjs');
const payload=fs.readFileSync(path.join(root,'dist/theme/payload.js'),'utf8');
const remove=fs.readFileSync(path.join(root,'dist/theme/remove.js'),'utf8');
const output=path.join(root,'test-results/image-viewer');fs.mkdirSync(output,{recursive:true});
const serve=process.argv.includes('--serve');
const server=http.createServer((req,res)=>{
 res.setHeader('cache-control','no-store');
 if(req.url==='/scene.jpg'){res.setHeader('content-type','image/jpeg');return fs.createReadStream(path.join(root,'theme/assets/duo-orchard.jpg')).pipe(res)}
 if(req.url==='/payload.js'){res.setHeader('content-type','application/javascript');return res.end(payload)}
 if(req.url==='/favicon.ico'){res.writeHead(204);return res.end()}
 res.setHeader('content-type','text/html;charset=utf-8');res.end(serve?html.replace('</body>','<script src="/payload.js"></script></body>'):html);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/';
 if(serve){console.log(JSON.stringify({url,pid:process.pid,syntheticOnly:true}));return}
 const {chromium}=require('playwright');const browser=await chromium.launch({headless:true,channel:'msedge'});
 const errors=[],results=[];const page=await browser.newPage({viewport:{width:1280,height:850}});page.on('pageerror',e=>errors.push(e.message));
 const box=s=>page.locator(s).boundingBox();
 const overlaps=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
 const close='[aria-label="关闭图片预览"]',native='#native-window-close';
 async function separated(){const a=await box(close),b=await box(native);assert.ok(a&&b);assert.ok(!overlaps(a,b),'Image close overlaps window close');assert.ok(a.y>=b.y+b.height+4,'Image toolbar must be below caption row');return{image:a,window:b}}
 async function check(name,fn){await fn();results.push({name,passed:true})}
 try{
  await page.goto(url);
  await check('unpatched fixture reproduces the reported collision',async()=>{await page.getByRole('button',{name:'打开图片',exact:true}).click();assert.ok(overlaps(await box(close),await box(native)));await page.evaluate(()=>fixture.closeImage())});
  await page.evaluate(payload=>eval(payload),payload);
  await page.getByRole('button',{name:'调色板',exact:true}).waitFor();
  await check('new and classic image toolbars avoid caption controls across light/dark, viewport and app zoom',async()=>{
   for(const kind of ['overlay','classic'])for(const mode of ['light','dark'])for(const [width,height,zoom] of [[1580,860,1],[1000,700,.8],[800,650,1.5],[1280,850,.5]]){
    await page.setViewportSize({width,height});await page.evaluate(({kind,mode,zoom})=>{fixture.setMode(mode);fixture.setZoom(zoom);fixture.openImage(kind)},{kind,mode,zoom});
    const geometry=await separated();assert.equal(await page.getByRole('button',{name:'调色板',exact:true}).isVisible(),false);
    await page.locator(close).click();assert.equal(await page.getByRole('dialog',{name:'图片预览',exact:true}).count(),0);assert.equal(await page.evaluate(()=>fixtureWindowCloseClicks),0);
    await page.getByRole('button',{name:'调色板',exact:true}).waitFor();results.push({name:kind+' '+mode+' '+width+'x'+height+' zoom '+zoom,passed:true,geometry});
   }
  });
  await check('zoom, download, Escape and reopening preserve preview controls and palette',async()=>{
   await page.evaluate(()=>{fixture.setZoom(1);fixture.openImage('overlay')});await page.getByLabel('图片缩放',{exact:true}).selectOption('150%');await page.getByRole('button',{name:'下载图片',exact:true}).click();assert.equal(await page.getByRole('dialog',{name:'图片预览'}).getAttribute('data-download-clicked'),'true');await page.locator(close).press('Escape');await page.getByRole('button',{name:'调色板',exact:true}).waitFor();
   await page.getByRole('button',{name:'打开图片',exact:true}).click();await separated();await page.screenshot({path:path.join(output,'image-toolbar-separated.png')});await page.locator(close).click();
  });
  await check('non-image viewer dialogs keep native geometry and palette; full removal restores image geometry',async()=>{
   await page.evaluate(()=>{const d=document.createElement('div');d.role='dialog';d.id='ordinary';d.innerHTML='<header data-testid="viewer-header" data-viewer-density="surface">文档预览</header>';document.body.append(d)});
   assert.equal(await page.locator('#ordinary header').evaluate(n=>getComputedStyle(n).marginTop),'0px');assert.equal(await page.getByRole('button',{name:'调色板',exact:true}).isVisible(),true);
   await page.evaluate(()=>document.getElementById('ordinary').remove());await page.evaluate(()=>fixture.openImage('overlay'));await page.evaluate(remove=>eval(remove),remove);
   assert.ok(overlaps(await box(close),await box(native)),'Theme removal did not restore native geometry');assert.equal(await page.locator('[data-fusion-ui=palette]').count(),0);
  });
  assert.deepEqual(errors,[]);results.push({name:'no uncaught browser errors',passed:true});
 }finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({passed:results.length,errors,report:path.join(output,'report.json')}))}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
