import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lstatSync, realpathSync } from 'node:fs';
const name = '@dsh-external/dsh-client-ui-skin-sunlit-tides';
const inject = ['connection'];
const MAX_REQUEST = 4 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{16,100}$/;
const TYPES = new Set(['open', 'update', 'close', 'pick-file','file-ack']);
const EVENTS = new Set(['ready', 'event', 'dock', 'closed', 'error','file-start','file-chunk','file-end']);
const FIELDS = new Set(['type','session','revision','html','css','theme','width','height','screenX','screenY','offsetX','offsetY','viewport','dragging','nodeId','accept','multiple','transfer','index']);
function validateMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || !TYPES.has(message.type) || !ID.test(message.session || '') || !Number.isSafeInteger(message.revision) || message.revision < 0) throw Error('Invalid panel request');
  if (Buffer.byteLength(JSON.stringify(message)) > MAX_REQUEST) throw Error('Panel request too large');
  for (const key of Object.keys(message)) if (!FIELDS.has(key)) throw Error('Unknown panel request field');
  for (const key of ['html','css','theme','nodeId','accept']) if (message[key] !== undefined && typeof message[key] !== 'string') throw Error('Invalid panel text field');
  for (const key of ['width','height','screenX','screenY','offsetX','offsetY']) if (message[key] !== undefined && (!Number.isFinite(message[key]) || Math.abs(message[key]) > 100000)) throw Error('Invalid panel geometry');
  for (const key of ['dragging','multiple']) if (message[key] !== undefined && typeof message[key] !== 'boolean') throw Error('Invalid panel flag');
  if (message.viewport !== undefined && (!message.viewport || Object.keys(message.viewport).some(key => !['left','top','width','height'].includes(key)) || !['left','top','width','height'].every(key => Number.isFinite(message.viewport[key]) && Math.abs(message.viewport[key]) <= 100000))) throw Error('Invalid panel viewport');
  if (message.type === 'open' && (!message.html || !(message.width > 0) || !(message.height > 0))) throw Error('Incomplete panel open');
  if (message.type === 'file-ack' && (!ID.test(message.transfer || '') || !Number.isSafeInteger(message.index) || message.index < 0)) throw Error('Invalid file acknowledgement');
  return { ...message };
}
// Public authenticated Connection RPC; browser Peers are shared across tabs.
// A cryptographically random client token additionally isolates each tab.
function createPanelBackend({ spawnHost = spawn, platform = process.platform, ownerPid = process.pid, helperPath = fileURLToPath(new URL('../native/SunlitTidesCodex.exe', import.meta.url)), verifyHelper = true } = {}) {
  const clients = new Map(), sessions = new Map();
  let child, buffer = '', disposed = false;
  function notify(record, event) {
    const bytes = Buffer.byteLength(JSON.stringify(event));
    if (record.bytes + bytes > 6 * 1024 * 1024 || record.queue.length >= 256) {
      record.queue = []; record.bytes = 0;
      event = {type:'error',session:event.session,revision:event.revision,message:'Panel event queue overflow'};
    }
    record.queue.push(event); record.bytes += Buffer.byteLength(JSON.stringify(event)); record.wake?.();
  }
  function hostFailure() {
    child = undefined; buffer = '';
    for (const [session, record] of sessions) notify(record,{type:'error',session,revision:record.revisions.get(session)||0,message:'Native panel host disconnected'});
    sessions.clear();
  }
  function startHost() {
    if (child) return child;
    if (platform !== 'win32') throw Error('Native panels require Windows');
    if (verifyHelper && (!lstatSync(helperPath).isFile() || lstatSync(helperPath).isSymbolicLink() || realpathSync(helperPath).toLowerCase() !== helperPath.toLowerCase())) throw Error('Invalid managed panel helper');
    const host = spawnHost(helperPath,['--panel-stdio'],{shell:false,windowsHide:true,stdio:['pipe','pipe','ignore']});
    child = host; host.stdout.setEncoding('utf8');
    host.stdout.on('data',data => {
      if (child !== host) return;
      buffer += data;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0,end); buffer = buffer.slice(end+1);
        if (Buffer.byteLength(line) > 512 * 1024) { host.kill(); hostFailure(); return; }
        try {
          const event = JSON.parse(line), record = sessions.get(event.session);
          if (record && EVENTS.has(event.type) && Number.isSafeInteger(event.revision)) {
            notify(record,event);
            if (event.type === 'closed') { sessions.delete(event.session); record.revisions.delete(event.session); }
          }
        } catch { /* Never forward logs or malformed stdout. */ }
      }
      if (Buffer.byteLength(buffer) > 512 * 1024) { host.kill(); hostFailure(); }
    });
    host.on('error',() => { if (child === host) hostFailure(); });
    host.on('exit',() => { if (child === host) hostFailure(); });
    host.stdin.on('error',() => { if (child === host) { host.kill(); hostFailure(); } });
    return host;
  }
  function write(message) {
    const host = startHost();
    if (host.stdin.writableLength > MAX_REQUEST * 2) throw Error('Native panel is busy');
    host.stdin.write(JSON.stringify({...message,ownerPid})+'\n');
  }
  function remove(record) {
    for (const [session, owner] of sessions) if (owner === record) {
      if (child) { try { write({type:'close',session,revision:record.revisions.get(session)||0}); } catch { /* Disposal must continue if host exited. */ } }
      sessions.delete(session);
    }
    record.wake?.(); clients.delete(record.key);
  }
  const cleanup = setInterval(() => { for (const record of clients.values()) if (Date.now()-record.touched > 45000) remove(record); },15000);
  cleanup.unref?.();
  async function handle(endpoint,payload,signal,peer) {
    try {
      if (disposed || peer?.principal?.kind !== 'owner' || !ID.test(payload?.client || '')) throw Error('Panel caller is not authorized');
      const key = `${peer.id}:${payload.client}`;
      let record = clients.get(key);
      if (!record) {
        if (endpoint !== 'send' || payload.message?.type !== 'open' || clients.size >= 8) throw Error('Panel client is not active');
        validateMessage(payload.message);
        record = {key,queue:[],bytes:0,revisions:new Map(),touched:Date.now()}; clients.set(key,record);
      }
      record.touched = Date.now();
      if (endpoint === 'release') { remove(record); return {ok:true,value:null}; }
      if (endpoint === 'poll') {
        if (record.wake) throw Error('Panel poll already pending');
        if (!record.queue.length && !signal?.aborted) await new Promise(resolve => {
          const done = () => { clearTimeout(timer); signal?.removeEventListener('abort',done); record.wake=undefined; resolve(); };
          const timer = setTimeout(done,15000); record.wake=done; signal?.addEventListener('abort',done,{once:true});
        });
        const events = []; let bytes = 0;
        while (record.queue.length && bytes < 768 * 1024) { const event=record.queue.shift(); events.push(event); const size=Buffer.byteLength(JSON.stringify(event)); bytes+=size; record.bytes-=size; }
        return {ok:true,value:events};
      }
      if (endpoint !== 'send') throw Error('Unknown panel endpoint');
      const message=validateMessage(payload.message), owner=sessions.get(message.session);
      if ((owner && owner !== record) || (!owner && message.type !== 'open')) throw Error('Panel session belongs to another client or is closed');
      if (!owner && sessions.size >= 8) throw Error('Too many native panels');
      if (message.revision < (record.revisions.get(message.session)||0)) throw Error('Stale panel request');
      sessions.set(message.session,record); record.revisions.set(message.session,message.revision);
      try { write(message); } catch (error) { if (!owner) { sessions.delete(message.session); record.revisions.delete(message.session); } throw error; }
      return {ok:true,value:null};
    } catch (error) { return {ok:false,error:{code:'sunlit/panel',message:error.message,details:{}}}; }
  }
  function dispose() {
    disposed=true; clearInterval(cleanup);
    for (const record of clients.values()) record.wake?.();
    clients.clear(); sessions.clear();
    const host=child; child=undefined;
    if (host) { host.stdin.end(); host.kill(); }
  }
  return {handle,dispose};
}
function apply(ctx) {
  const backend=createPanelBackend();
  ctx.connection.rpc.handle('/sunlit-panel',backend.handle);
  ctx.effect(() => () => backend.dispose(),'sunlit-tides: native panel lifetime');
}
export {name,inject,apply,createPanelBackend,validateMessage};
