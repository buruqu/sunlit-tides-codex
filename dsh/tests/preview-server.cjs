/* Loopback-only interactive fixture. No real profile, chat or account data. */
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(__dirname,'client.cjs'),'utf8');
const literal=source.match(/const fixture = (`[\s\S]+?`);\r?\nconst checks/);
if(!literal)throw Error('Fixture contract changed');
let html=vm.runInNewContext(literal[1]);
html=html.replace('</head>',`<style>.fixture-tools{position:fixed;right:8px;top:4px;z-index:2000;display:flex;gap:6px}.fixture-tools button{font:11px/1.6 'Microsoft YaHei',sans-serif;border:1px solid #a59bb260;border-radius:6px;padding:3px 7px;background:#2a273c;color:#ece2f3}.hero[hidden]{display:none!important}.message{background:transparent!important}.message h2{font-size:21px}.message table{border-collapse:collapse;width:100%;font-size:13px}.message th,.message td{border-bottom:1px solid #a59bb245;padding:12px}.message p{line-height:1.85}</style></head>`);
html=html.replace('</body>',`<div class="fixture-tools"><button id="fixture-mode">切换明暗</button><button id="fixture-sidebar">收起侧栏</button><button id="fixture-rightbar">切换右栏</button></div><script>
window.__fixtureErrors=[];window.addEventListener('error',e=>__fixtureErrors.push(e.message));
window.__ModuleLoader__={load(entry){window.themeModule=entry.factory();window.themeModule.apply({effect(fn){window.themeDispose=fn();}});}};
const frame=document.querySelector('.mP3x-q_frame'), sidebar=document.querySelector('.mP3x-q_sidebarCol'), rightbar=document.querySelector('.mP3x-q_rightbarCol');
let showSide=true,showRight=false;
function columns(){frame.style.gridTemplateColumns=(showSide?'220px':'0px')+' minmax(0px,1fr) '+(showRight?'280px':'0px');sidebar.style.display=showSide?'':'none';rightbar.style.display=showRight?'':'none';frame.toggleAttribute('data-sidebar-collapsed',!showSide);frame.toggleAttribute('data-rightbar-collapsed',!showRight);}
document.querySelector('#fixture-mode').onclick=()=>{document.body.toggleAttribute('data-ds-dark-theme');localStorage.setItem('fixture.dark',String(document.body.hasAttribute('data-ds-dark-theme')));};
if(localStorage.getItem('fixture.dark')!=='false')document.body.setAttribute('data-ds-dark-theme','');
document.querySelector('#fixture-sidebar').onclick=()=>{showSide=!showSide;columns();document.querySelector('#fixture-sidebar').textContent=showSide?'收起侧栏':'展开侧栏';};
document.querySelector('#fixture-rightbar').onclick=()=>{showRight=!showRight;columns();};rightbar.innerHTML='<div style="height:100%;padding:22px;background:rgba(30,28,47,.95);color:#eee">合成右侧面板<br>打开时人物与正文自动避让</div>';columns();
document.querySelector('.an3WzG_root').dataset.phase='active';document.querySelector('[data-conversation-content]').dataset.contentPhase='active';
document.querySelector('.hero').hidden=true;const messages=document.querySelector('#messages');messages.hidden=false;
messages.innerHTML='<article class="message" data-chat-flow-kind="assistant-step"><div class="_markdown_1ypvv_5"><h2>晴光与泡影 · 会话阅读预览</h2><p>贯穿版的立绘和表情融入同一背景：西西在左下，娅娅在右下，字体延续紫、粉、暖金的渐变。</p><table><tr><th>场景</th><th>细节</th></tr><tr><td>果园午后</td><td>微风、绿叶与轻轻摆动的发梢。</td></tr><tr><td>夜色相依</td><td>水面光影、柔和呼吸与流动泪光。</td></tr></table><p>可切换背景贯穿与独立侧栏，亮暗模式均支持。缩小窗口、展开右栏时，背景装饰会柔和缩放；独立侧栏版仍保留主区走廊布局。</p><h2>让界面保持自然</h2><p>滚到输入区的文字会正确隐藏，壁纸仍然连续。贯穿版西西整组略向右移；娅娅立绘镜像，GIF改在她左侧，遇到输入区时自动上移避让。人物与壁纸共用透明度和阅读蒙层；独立侧栏版仍保留原排版。</p><p>这是隔离的合成预览，不含真实聊天或账号资料。</p></div></article>';
document.querySelector('.brand').classList.add('wtg9ga_brandName');document.querySelector('.chat-header').innerHTML='<span class="an3WzG_crumbCurrent">晴光与泡影 · 合成会话</span>';
</script><script src="/client.js"></script></body>`);
const server=http.createServer((req,res)=>{
 if(req.url==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);}
 else if(req.url==='/client.js'){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});fs.createReadStream(path.join(root,'lib/client.js')).pipe(res);}
 else {res.writeHead(404);res.end();}
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}/`,pid:process.pid,syntheticOnly:true})));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
