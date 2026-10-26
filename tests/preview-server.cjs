// Interactive loopback preview of the real payload using the existing synthetic shell.
// No account, chat history, or installed application data is read.
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(__dirname, 'theme-browser.cjs'), 'utf8');
const match = source.match(/const fixture = (`[\s\S]+?`);\r?\n\r?\nasync function main/);
if (!match) throw Error('Synthetic fixture contract changed');
let html = vm.runInNewContext(match[1]);
html = html.replace('</head>', '<style>.preview-tools{position:fixed;left:240px;top:4px;z-index:2147483001;display:flex;gap:8px}.preview-tools button{font:12px/1.6 sans-serif;background:#292439;color:#eee;border:1px solid #9685a8;border-radius:6px;padding:3px 8px}</style></head>');
html = html.replace('</body>', `<div class="preview-tools"><button id="preview-mode">切换明暗</button><button id="preview-sidebar">收起侧栏</button><button id="preview-view">首页 / 聊天</button></div><script>
window.__previewErrors=[];window.addEventListener('error',e=>__previewErrors.push(e.message));window.addEventListener('unhandledrejection',e=>__previewErrors.push(String(e.reason)));
fixture.setMode(localStorage.getItem('preview.mode')||'dark');fixture.setView('chat');
document.getElementById('preview-mode').onclick=()=>{const mode=document.documentElement.dataset.theme==='dark'?'light':'dark';fixture.setMode(mode);localStorage.setItem('preview.mode',mode)};
document.getElementById('preview-sidebar').onclick=()=>{const side=document.querySelector('.app-shell-left-panel');side.hidden=!side.hidden;document.getElementById('preview-sidebar').textContent=side.hidden?'展开侧栏':'收起侧栏';window.dispatchEvent(new Event('resize'))};
document.getElementById('preview-view').onclick=()=>fixture.setView(document.getElementById('home-view').hidden?'home':'chat');
</script><script src="/payload.js"></script></body>`);
const server = http.createServer((req,res) => {
  res.setHeader('cache-control','no-store');
  if(req.url==='/') { res.setHeader('content-type','text/html;charset=utf-8');res.end(html); }
  else if(req.url==='/payload.js') { res.setHeader('content-type','application/javascript');fs.createReadStream(path.join(root,'dist/theme/payload.js')).pipe(res); }
  else { res.writeHead(404);res.end(); }
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}/`,pid:process.pid,syntheticOnly:true})));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
