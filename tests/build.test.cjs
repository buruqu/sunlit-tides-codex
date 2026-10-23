const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('self-contained payload has exactly the two requested scenes and valid assets',()=>{
 const m=JSON.parse(read('theme/manifest.json'));
 assert.equal(m.id,'sunlit-tides.codex');assert.deepEqual(m.config.gallery.fixed,{light:'orchard',dark:'night'});
 assert.deepEqual(m.config.gallery.scenes.map(s=>s.id).sort(),['night','orchard']);
 for(const p of Object.values(m.assets)){const resolved=path.resolve(root,'theme',p);assert.ok(resolved.startsWith(path.join(root,'theme')+path.sep));assert.ok(fs.statSync(resolved).size>0);}
 const payload=read('dist/theme/payload.js');new vm.Script(payload);new vm.Script(read('dist/theme/remove.js'));
 assert.ok(!payload.includes('__TESSALUME_PAYLOAD_'));assert.ok(!payload.includes('D:/Apps/'));assert.ok(!payload.includes('C:/Users/'));
 assert.ok(!payload.includes('className = "sgk-gallery-host"'));assert.ok(!payload.includes('wrapper.remove();'));
 assert.equal(JSON.parse(read('dist/theme/manifest.json')).version,JSON.parse(read('package.json')).version);
});
test('restore script leaves a foreign runtime untouched',async()=>{
 let disposed=0;const win={__TESSALUME_RUNTIME__:{themeId:'foreign',dispose(){disposed++;}}};
 const result=await vm.runInNewContext(read('dist/theme/remove.js'),{window:win});assert.equal(result.removed,false);assert.equal(disposed,0);
 win.__TESSALUME_RUNTIME__.themeId='sunlit-tides.codex';const own=await vm.runInNewContext(read('dist/theme/remove.js'),{window:win});assert.equal(own.removed,true);assert.equal(disposed,1);
});
