const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'theme.json'),'utf8'));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const mime={'.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml'};
const assets=Object.fromEntries(Object.entries(manifest.assets).map(([id,file])=>{
  const target=path.resolve(root,file);
  if(!target.startsWith(path.join(root,'assets')+path.sep))throw Error('Asset outside assets directory');
  if(!mime[path.extname(file)])throw Error('Unsupported asset type');
  return [id,`data:${mime[path.extname(file)]};base64,${fs.readFileSync(target).toString('base64')}`];
}));
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
// Standalone source ZIPs carry this generated copy; Git keeps one canonical source.
const sharedRoot=fs.existsSync(path.join(root,'../shared/diy-editor.js'))?path.join(root,'../shared'):path.join(root,'shared');
const sharedFiles=['diy-art.js','diy-editor.js'];
const shared=sharedFiles.map(file=>fs.readFileSync(path.join(sharedRoot,file),'utf8')).join('\n');
if(path.resolve(sharedRoot)!==path.join(root,'shared')){fs.mkdirSync(path.join(root,'shared'),{recursive:true});for(const file of sharedFiles)fs.copyFileSync(path.join(sharedRoot,file),path.join(root,'shared',file));}
const source=shared+'\n'+read('src/scene-runtime.js')+'\n'+read('src/diy-adapter.js')+'\n'+read('src/client.js');
const style=read('src/style.css')+'\n'+read('src/typography.css')+'\n'+read('src/diy-adapter.css');
const fingerprint=crypto.createHash('sha256').update(source+style+JSON.stringify(manifest.config)+JSON.stringify(assets)).digest('hex');
const script=`window.__ModuleLoader__.load({id:${JSON.stringify(pkg.name)},factory:()=>{'use strict';\n${source}\nconst config=${JSON.stringify(manifest.config)};\nconst assets=${JSON.stringify(assets)};\nconst cssText=${JSON.stringify(style)};\nfunction apply(ctx){ctx.effect(()=>mountDshSunlitClient({window,document,config,assets,cssText}),'sunlit-tides: dynamic skin');}\nreturn {apply,version:${JSON.stringify(pkg.version)},fingerprint:${JSON.stringify(fingerprint)}};}});\n`;
new vm.Script(script,{filename:'lib/client.js'});
fs.mkdirSync(path.join(root,'lib'),{recursive:true});
fs.writeFileSync(path.join(root,'lib/client.js'),script);
fs.writeFileSync(path.join(root,'lib/build.json'),JSON.stringify({name:pkg.name,version:pkg.version,sourceThemeVersion:manifest.version,assets:Object.keys(assets).length,fingerprint,clientBytes:Buffer.byteLength(script)},null,2)+'\n');
console.log(fs.readFileSync(path.join(root,'lib/build.json'),'utf8'));
