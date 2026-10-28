import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createPanelBackend, validateMessage } from '../lib/index.js';

// Real pipe subprocess tests transport boundaries, never substitutes for native
// WebView2 interaction acceptance. The fixture emits only protocol JSON lines.
let child, spawnOptions, executable, args;
const backend=createPanelBackend({platform:'win32',verifyHelper:false,ownerPid:1234,spawnHost:(file,argv,options) => {
  executable=file; args=argv; spawnOptions=options;
  child=spawn(process.execPath,['-e',`
    require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
      const m=JSON.parse(line);
      const event={type:m.type==='close'?'closed':'ready',session:m.session,revision:m.revision,ownerPid:m.ownerPid};
      process.stdout.write(JSON.stringify(event)+'\\n');
    });
  `],options);
  return child;
}});
const peer={id:'peer-a',principal:{kind:'owner'}};
const client='client_token_1234567890', session='panel_session_1234567890';
const message={type:'open',session,revision:1,html:'<p>Native panel</p>',width:500,height:600};
const call=(endpoint,payload={},caller=peer)=>backend.handle(endpoint,{client,...payload},undefined,caller);
let passed=0;
try {
  assert.equal((await call('send',{message})).ok,true); passed++;
  const events=(await call('poll')).value;
  assert.equal(events[0].session,session); assert.equal(events[0].ownerPid,1234); passed++;
  assert.equal(spawnOptions.shell,false); assert.equal(spawnOptions.windowsHide,true);
  assert.deepEqual(args,['--panel-stdio']); assert.match(executable,/native[/\\]SunlitTidesCodex\.exe$/); passed++;
  const foreign=await backend.handle('send',{client:'different_token_12345678',message},undefined,peer);
  assert.equal(foreign.ok,false); passed++;
  assert.equal((await call('send',{message:{...message,type:'update',revision:0}})).ok,false); passed++;
  assert.equal((await call('send',{message},{id:'untrusted',principal:{kind:'guest'}})).ok,false); passed++;
  assert.equal((await call('send',{message:{...message,ownerPid:9999}})).ok,false); passed++;
  assert.throws(()=>validateMessage({...message,html:'x'.repeat(4*1024*1024)}),/too large/); passed++;
  assert.throws(()=>validateMessage({...message,width:Infinity}),/geometry/); passed++;
  assert.throws(()=>validateMessage({...message,viewport:{left:0,top:0,width:1,height:1,command:'run'}}),/viewport/); passed++;
  assert.equal((await call('send',{message:{type:'file-ack',session,revision:1,transfer:'transfer_1234567890',index:0}})).ok,true); passed++;
  // Dispose ends actual child stdin and terminates its process, including a poll.
  const abort=new AbortController();
  await call('poll');
  const pending=backend.handle('poll',{client},abort.signal,peer);
  abort.abort(); assert.deepEqual((await pending).value,[]); passed++;
  const exited=once(child,'exit');
  backend.dispose(); await exited;
  assert.equal((await call('send',{message})).ok,false); passed++;
  console.log(JSON.stringify({passed,failed:0,realStdio:true,nativeWindowVerified:false}));
} finally { backend.dispose(); }
