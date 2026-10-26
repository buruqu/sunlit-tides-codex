const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('candidate versions agree with host acceptance, health and installation metadata',()=>{
 const version=JSON.parse(read('package.json')).version;
 const manifest=JSON.parse(read('theme/manifest.json'));
 assert.equal(manifest.version,version,'theme manifest version');
 assert.equal(manifest.config.designVersion,version,'theme design version');
 const capture=(file,pattern,label)=>{
  const match=read(file).match(pattern);assert.ok(match,'Missing '+label+' in '+file);
  assert.equal(match[1],version,label+' in '+file);
 };
 capture('host/SunlitTidesCodex.csproj',/<Version>([^<]+)<\/Version>/,'assembly version');
 capture('installer/Install.ps1',/^\$version\s*=\s*'([^']+)'/m,'installer version');
 capture('host/State.cs',/record Health\([^\n]*string Version\s*=\s*"([^"]+)"/,'health version');
 capture('host/Scripts/install.js',/__SUNLIT_TIDES_HOST_MARKER__\s*=\s*\{[^\n]*version:\s*'([^']+)'/,'installed host marker version');
 for(const field of ['version','designVersion']){
  const pattern=new RegExp('GetProperty\\("'+field+'"\\)\\.GetString\\(\\)\\s*!=\\s*"([^"]+)"');
  capture('host/ThemeHost.cs',pattern,'accepted '+field);
 }
});
test('self-contained payload retains primary defaults and selectable legacy scenes with valid assets',()=>{
 const m=JSON.parse(read('theme/manifest.json'));
 assert.equal(m.id,'sunlit-tides.codex');assert.deepEqual(m.config.gallery.defaults,{light:'orchard',dark:'night'});
 const scenes=m.config.gallery.scenes; assert.ok(scenes.length>=14);assert.equal(new Set(scenes.map(s=>s.id)).size,scenes.length);
 for(const id of ['orchard','night','night-original'])assert.ok(scenes.some(s=>s.id===id));
 for(const scene of scenes)assert.ok(m.assets[scene.asset],`Missing asset for ${scene.id}`);
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

test('layout preference migrates old settings, persists in exports and rejects invalid imports without losing mode preferences',()=>{
 const settings=vm.runInNewContext(read('theme/src/settings.js')+';FusionSettings',{TextEncoder});
 const legacy={schemaVersion:1,common:{chatWidth:777,bubbleCount:9},modes:{light:{messageOpacity:67,left:{size:123}},dark:{messageOpacity:73,primary:{x:24}}}};
 const migrated=settings.parse(JSON.stringify(legacy));
 assert.equal(migrated.common.layout,'panorama');assert.equal(migrated.common.chatWidth,777);assert.equal(migrated.common.bubbleCount,9);
 assert.equal(migrated.modes.light.left.size,123);assert.equal(migrated.modes.dark.primary.x,24);
 migrated.common.layout='sidebar';const saved=settings.parse(settings.serialize(migrated));
 assert.equal(saved.common.layout,'sidebar');assert.equal(saved.modes.light.messageOpacity,67);assert.equal(saved.modes.dark.messageOpacity,73);
 assert.throws(()=>settings.parse(JSON.stringify({...legacy,common:{layout:'unknown'}})),/common.layout/);
});
