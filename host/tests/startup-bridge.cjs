// Executes the production bridge without a Codex instance or profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', 'Scripts', file), 'utf8');
const listeners = new Map(), storage = new Map(), calls = [], states = [];
const context = {
  localStorage:{setItem:(key,value)=>storage.set(key,value),getItem:key=>storage.get(key) ?? null},
  CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
  addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
  removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
  dispatchEvent(event){for(const fn of listeners.get(event.type) ?? [])fn(event);},
  sunlitTidesStartupChanged:json=>calls.push(JSON.parse(json))
};
context.window = context;
context.addEventListener('sunlit-tides:startup-state',event=>states.push(event.detail));
vm.createContext(context);
const publish = enabled => vm.runInContext(read('startup-state.js').replace('%%ENABLED%%',String(enabled)),context);
const change = detail => context.dispatchEvent(new context.CustomEvent('sunlit-tides:startup-change',{detail}));
storage.set('sunlit-tides.startup.enabled','true');
publish(false);
assert.equal(storage.get('sunlit-tides.startup.enabled'),'false','native persisted choice initializes browser');
assert.equal(context.__sunlitTidesStartup.available,true);
assert.equal(states.at(-1).enabled,false);
assert.equal(calls.length,0,'publication never feeds back as input');
publish(false);
assert.equal(listeners.get('sunlit-tides:startup-change').size,1,'no duplicate listeners after navigation/poll');
change({enabled:true});
assert.deepEqual(calls,[{enabled:true}],'toggle is forwarded immediately to native host');
change({enabled:'false'});
assert.equal(calls.length,1,'invalid input cannot persist a setting');
publish(true);
assert.equal(storage.get('sunlit-tides.startup.enabled'),'true');
assert.equal(calls.length,1,'multi-page native synchronization has no feedback loop');
vm.runInContext(read('startup-remove.js'),context);
assert.equal(context.__sunlitTidesStartup,undefined);
assert.equal(states.at(-1).available,false);
assert.equal(storage.get('sunlit-tides.startup.enabled'),'true','removal preserves preference');
change({enabled:false});
assert.equal(calls.length,1,'disposed helper listener cannot send input');
context.localStorage.setItem=()=>{throw new Error('storage unavailable');};
publish(false);
assert.equal(context.__sunlitTidesStartup.enabled,false,'native bridge remains usable when storage unavailable');
console.log(JSON.stringify({ok:true,suite:'startup-bridge-offline',cases:8}));
