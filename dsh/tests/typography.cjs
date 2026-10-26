/* Native DSH text slots on an isolated browser page; no profile or chat data. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),css=fs.readFileSync(path.join(root,'src/typography.css'),'utf8');
const fixture=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
body{margin:0;padding:30px;font:16px/1.85 'Segoe UI','Microsoft YaHei',sans-serif;background:#f9f3f4;color:#3d354b}body[data-sunlit-mode=dark]{background:#1c1d2e;color:#eee6ee}
#root{display:grid;grid-template-columns:230px minmax(0,1fr);gap:32px}.mP3x-q_sidebarCol{padding:20px;border:1px solid #a590ac50;border-radius:16px}main{max-width:740px}h1{font-size:30px}h2{font-size:22px}p{margin:14px 0}.an3WzG_crumbCurrent{font-size:18px}a{color:#69a8df}pre,code{background:#333244;color:#f6ce8a}pre{padding:15px}button,textarea{font:inherit;color:inherit;background:transparent;border:1px solid #a590ac60;border-radius:8px;padding:8px}table{border-collapse:collapse}th,td{border:1px solid #a590ac60;padding:8px 18px}.tools{display:flex;gap:10px;margin-bottom:20px}.status{color:#df7070}
</style></head><body data-dsh-sunlit data-sunlit-gradient="on" data-sunlit-mode="light"><div class="tools"><button id="mode">切换明暗</button><button id="gradient">切换渐变</button></div>
<div id="root" data-sunlit-host><aside class="mP3x-q_sidebarCol"><div class="wtg9ga_brandName" id="brand">晴光与泡影</div><button><span class="wtg9ga_newSessionLabel" id="nav">新会话</span></button><div class="wnFoaW_title" id="side-title">今天的灵感</div></aside><main><div class="an3WzG_crumbCurrent" id="title">西西与娅娅 · 夜色相依</div>
<div data-chat-flow-kind="user"><div class="LOmM4q_bubble" id="user-bubble" style="background:rgba(150,125,175,.13);padding:14px;border-radius:12px"><span class="_2STzOG_root"><span id="user-text" class="_plainRun_fbulu_6">用户消息也沿用相同的文字渐变。</span><a href="#reference" id="user-reference"><span class="_plainRun_fbulu_6" id="reference-text">引用文件</span></a><button><span class="_plainRun_fbulu_6" id="reference-button">文件操作</span></button></span></div></div>
<section data-chat-flow-kind="assistant-step"><div class="xMeOpW_body"><div class="_markdown_1ypvv_5">
<h1 id="heading">让文字也带上晴光与泡影</h1><p id="prose">果园的风吹过发梢，星光落在身旁。紫色、粉色与暖金色沿着文字缓缓铺开。</p><p id="stream"><span>这是一段流式生成的文字，</span><span>完整段落保持自然连续的渐变。</span></p>
<ul><li id="bare-list">列表符号与正文始终清晰。</li><li><p id="list-prose">列表中的完整段落也可以呈现渐变。</p></li></ul>
<table><tr><th id="th">场景</th><th>心情</th></tr><tr><td id="td">果园午后</td><td>轻柔与明亮</td></tr></table>
<p id="mixed-link">链接仍保留原生颜色：<a id="link" href="#test"><strong id="link-strong">阅读说明</strong></a></p>
<p id="mixed-code">行内代码 <code id="code">const scene = 'night';</code> 不采用渐变。</p>
<pre id="pre"><code><strong id="code-strong">console.log('Sunlit Tides');</strong></code></pre>
<p id="painted" style="background:#d0bfd050">原生有底色的文本不裁切底色。</p><p id="optout" data-sunlit-gradient="false">单独禁用渐变的文字。</p>
<div role="status" class="status"><p id="status">状态和错误提示保持语义颜色。</p></div>
</div><div data-tool-call><p id="tool">工具执行状态</p></div></div></section>
<div class="an3WzG_composerSeat"><textarea id="input">输入内容保持纯色</textarea><button id="send">发送测试</button></div></main></div>
<script>document.querySelector('#mode').onclick=()=>document.body.dataset.sunlitMode=document.body.dataset.sunlitMode==='dark'?'light':'dark';document.querySelector('#gradient').onclick=()=>document.body.dataset.sunlitGradient=document.body.dataset.sunlitGradient==='on'?'off':'on';</script></body></html>`;
const checks=[];
function lum(rgb){return rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);}
function minContrast(hexes,veil,alpha,source){const rgb=hexes.map(h=>h.match(/../g).map(c=>parseInt(c,16))),bg=lum(veil.map((v,i)=>v*alpha+source[i]*(1-alpha)));let min=Infinity;for(let p=0;p<2;p++)for(let i=0;i<=100;i++){const l=lum(rgb[p].map((v,c)=>v+(rgb[p+1][c]-v)*i/100));min=Math.min(min,(Math.max(l,bg)+.05)/(Math.min(l,bg)+.05));}return min;}
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];try{
 const page=await browser.newPage({viewport:{width:1200,height:1100}});page.on('pageerror',e=>errors.push(e.message));await page.setContent(fixture);const style=await page.addStyleTag({content:css});
 const appearance=id=>page.locator('#'+id).evaluate(el=>{const s=getComputedStyle(el);return {image:s.backgroundImage,clip:s.backgroundClip,fill:s.webkitTextFillColor,color:s.color};});
 for(const id of ['heading','prose','stream','list-prose','th','td','title','brand','nav','side-title','user-text']){const s=await appearance(id);assert.match(s.image,/linear-gradient/,'gradient missing: '+id);assert.equal(s.clip,'text');assert.equal(s.fill,'rgba(0, 0, 0, 0)');}checks.push('real Markdown, user plain runs, streaming spans, table and native title/sidebar slots use gradients');
 for(const id of ['bare-list','mixed-link','link','link-strong','mixed-code','code','pre','code-strong','painted','optout','status','tool','input','send','user-bubble','user-reference','reference-text','reference-button']){const s=await appearance(id);assert.equal(s.image,'none','semantic or painted surface must stay solid: '+id);assert.notEqual(s.fill,'rgba(0, 0, 0, 0)','invisible protected text: '+id);}checks.push('links, code, controls, status, painted blocks and list markers remain solid');
 await page.screenshot({path:path.join(root,'test-results/typography-light.png')});await page.locator('#mode').click();assert.match((await appearance('prose')).image,/237, 219, 251/);await page.screenshot({path:path.join(root,'test-results/typography-dark.png')});checks.push('light/dark palettes switch through an actual control');
 await page.locator('#gradient').click();assert.equal((await appearance('prose')).image,'none');assert.notEqual((await appearance('prose')).fill,'rgba(0, 0, 0, 0)');await page.locator('#gradient').click();checks.push('gradient-off restores solid native text');
 await style.evaluate(el=>el.disabled=true);let rejected=false;try{assert.match((await appearance('prose')).image,/linear-gradient/);}catch{rejected=true;}assert.equal(rejected,true);await style.evaluate(el=>el.disabled=false);checks.push('negative control detects missing gradient stylesheet');
 await page.emulateMedia({forcedColors:'active'});assert.equal((await appearance('prose')).image,'none');assert.notEqual((await appearance('prose')).fill,'rgba(0, 0, 0, 0)');await page.emulateMedia({forcedColors:'none'});checks.push('forced-colors mode keeps readable solid glyphs');
 const lightContrast=minContrast(['291737','3d1830','102b29'],[251,247,248],.6,[0,0,0]),darkContrast=minContrast(['eddbfb','ffd6e7','f8e4c7'],[20,23,38],.68,[255,255,255]);assert.ok(lightContrast>=4.5);assert.ok(darkContrast>=4.5);checks.push('gradient interpolation clears 4.5:1 at the effective light/dark veil floors');
 assert.deepEqual(errors,[]);const result={passed:true,checks,browserErrors:errors,lightContrast,darkContrast,syntheticOnly:true};fs.writeFileSync(path.join(root,'test-results/typography.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
