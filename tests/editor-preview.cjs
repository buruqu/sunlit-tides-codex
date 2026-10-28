// Read-only synthetic hosts for browser-tool acceptance; never serves repository files.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const codexSource=fs.readFileSync(path.join(root,'tests/theme-browser.cjs'),'utf8').match(/const fixture = (`[\s\S]+?`);\r?\n\r?\nasync function main/);
const dshSource=fs.readFileSync(path.join(root,'dsh/tests/client.cjs'),'utf8').match(/const fixture = (`[\s\S]+?`);\r?\nconst checks/);
const codex=vm.runInNewContext(codexSource[1]).replace('</body>','<script>fixture.setMode("dark");fixture.setView("chat");</script><script src="/codex.js"></script></body>');
const dsh=vm.runInNewContext(dshSource[1]).replace('</body>','<script>window.__ModuleLoader__={load(e){window.theme=e.factory()}};</script><script src="/dsh.js"></script><script>theme.apply({effect(fn){window.cleanup=fn()}})</script></body>');
const server=http.createServer((req,res)=>{
  const key=new URL(req.url,'http://127.0.0.1').pathname;
  if(key==='/codex'||key==='/dsh'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(key==='/codex'?codex:dsh);}
  else if(key==='/codex.js'||key==='/dsh.js'){res.setHeader('Content-Type','application/javascript');fs.createReadStream(path.join(root,key==='/codex.js'?'dist/theme/payload.js':'dsh/lib/client.js')).pipe(res);}
  else{res.statusCode=404;res.end();}
});server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({codex:`http://127.0.0.1:${server.address().port}/codex`,dsh:`http://127.0.0.1:${server.address().port}/dsh`})));
