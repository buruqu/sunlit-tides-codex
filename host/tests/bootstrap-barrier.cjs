// Exercises the actual embedded production templates with an offline async runtime stub.
// Does not connect to a browser, Codex, authentication, or any user profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const fingerprint = 'a'.repeat(64);
const read = file => fs.readFileSync(path.join(__dirname, '..', 'Scripts', file), 'utf8').trim();
const payload = `(async()=>{window.calls++;if(window.waitForCommit)await window.waitForCommit;window.__TESSALUME_RUNTIME__={themeId:'sunlit-tides.codex',fingerprint:${JSON.stringify(fingerprint)}};return {installed:true,themeId:'sunlit-tides.codex'};})()`;
const removal = `(async()=>{if(window.__TESSALUME_RUNTIME__?.themeId==='sunlit-tides.codex'){delete window.__TESSALUME_RUNTIME__;window.removals++;}return true;})()`;
const expand = source => source.replaceAll('%%FINGERPRINT%%', JSON.stringify(fingerprint)).replaceAll('%%ALLOWED%%', read('allowed.js'));
const install = expand(read('install.js')).replaceAll('%%PAYLOAD%%', payload).replaceAll('%%REMOVAL%%', removal);
const scripts = Object.fromEntries(['apply','bootstrap','remove','probe'].map(name => [name, expand(read(name + '.js')).replaceAll('%%INSTALL%%',install).replaceAll('%%REMOVAL%%',removal)]));
for (const source of Object.values(scripts)) assert(!source.includes('%%'));
function fixture(readyState='complete', search='') {
  const context = {calls:0,removals:0,URLSearchParams,location:{protocol:'app:',hostname:'-',pathname:'/index.html',search},listeners:[]};
  context.window = context;
  context.top = context;
  context.document = {readyState,addEventListener(type,fn){assert.equal(type,'DOMContentLoaded');context.listeners.push(fn);}};
  vm.createContext(context);
  return {context,run:name=>vm.runInContext(scripts[name],context),ready:()=>context.listeners.splice(0).forEach(fn=>fn())};
}
const tick = () => new Promise(resolve=>setImmediate(resolve));
(async()=>{
  let f = fixture('loading');
  f.run('bootstrap');
  assert.equal(f.context.listeners.length,1);
  await f.run('remove');
  f.ready();
  await tick();
  assert.equal(f.context.calls,0,'restore cancels DOM readiness callback');
  assert.equal(f.context.__SUNLIT_TIDES_HOST_GATE__.enabled,false);

  f = fixture();
  let release;
  f.context.waitForCommit = new Promise(resolve=>{release=resolve;});
  f.run('bootstrap');
  await tick();
  assert.equal(f.context.calls,1);
  assert.equal(f.context.__TESSALUME_RUNTIME__,undefined,'runtime not published until image/settings await completes');
  let completed = false;
  const restoring = f.run('remove').then(()=>{completed=true;});
  await tick();
  assert.equal(completed,false,'restoration waits for pending runtime commit');
  release();
  await restoring;
  assert.equal(f.context.__TESSALUME_RUNTIME__,undefined,'late commit is disposed before restore succeeds');
  assert.equal(f.context.__SUNLIT_TIDES_HOST_MARKER__,undefined);
  assert.equal(f.context.__SUNLIT_TIDES_HOST_GATE__.enabled,false);
  assert(f.context.removals>=1);
  assert.equal(f.run('probe'),false);
  f.context.waitForCommit = null;
  await f.run('apply');
  assert.equal(f.run('probe'),true,'explicit enable can install after restoration');

  f = fixture();
  const both = await Promise.all([f.run('apply'),f.run('apply')]);
  assert(both.every(result=>result.installed));
  assert.equal(f.context.calls,1,'same document has a single in-flight install');
  f.context.__TESSALUME_RUNTIME__.themeId = 'another-manager';
  assert.equal(f.run('probe'),false,'host marker does not conceal runtime replacement');
  f.context.__TESSALUME_RUNTIME__.themeId = 'sunlit-tides.codex';
  f.context.__TESSALUME_RUNTIME__.fingerprint = 'wrong';
  assert.equal(f.run('probe'),false,'probe verifies actual runtime fingerprint');

  f = fixture('loading');
  f.run('bootstrap');
  await f.run('remove');
  await f.run('apply');
  f.ready();
  await tick();
  assert.equal(f.context.calls,1,'old callback stays cancelled after a later explicit enable');

  f = fixture('complete','?initialRoute=%2Favatar-overlay');
  f.run('bootstrap');
  await tick();
  assert.equal(f.context.calls,0,'pet overlay does not receive the heavy payload');
  assert.equal(f.context.__SUNLIT_TIDES_HOST_GATE__,undefined);
  console.log(JSON.stringify({ok:true,suite:'production-bootstrap-offline',cases:6}));
})().catch(error=>{console.error(error);process.exitCode=1;});
