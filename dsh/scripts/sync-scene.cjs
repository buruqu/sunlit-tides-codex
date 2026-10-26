/* Derive the audited GPU renderer without changing its shaders or motion math. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const target=path.resolve(__dirname,'..'),source=process.argv[2]?path.resolve(process.argv[2]):path.join(target,'vendor/layered-scene-upstream.js');
let text=fs.readFileSync(source,'utf8').replace(/\r\n/g,'\n');
const hash=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
function replace(old,next){if(!text.includes(old))throw Error('Source contract changed: '+old.slice(0,90));text=text.replace(old,next);}
const coordinatorStart=text.indexOf('/* The coordinator preserves');
const rendererStart=text.indexOf('/* Authored RGBA orchard layers');
if(coordinatorStart<0 || rendererStart<coordinatorStart)throw Error('Renderer boundaries changed');
text=text.slice(0,coordinatorStart)+text.slice(rendererStart);
replace('const html=doc.documentElement, key="__SUNLIT_LAYERED_SCENE_RENDERER__"','const html=context.root, key="__DSH_SUNLIT_SCENE_RENDERER__"');
replace('let blinkEnabled=html.dataset.fusionLivingScene!=="false",lightingEnabled=html.dataset.fusionSceneEffects!=="false";','let blinkEnabled=context.settings.blink!==false,lightingEnabled=context.settings.lighting!==false;');
const mainStart=text.indexOf('  function currentMain(){'),mainEnd=text.indexOf('  function stopDiscovery()',mainStart);
text=text.slice(0,mainStart)+'  function currentMain(){return context.root.isConnected?context.root:null;}\n'+text.slice(mainEnd);
replace('discoveryObserver.observe(doc.body || html,{childList:true,subtree:true});','discoveryObserver.observe(context.root.parentNode || context.root,{childList:true});');
replace('win.getComputedStyle(main,"::before")','win.getComputedStyle(main)');
replace('main.prepend(canvas);','canvas.style.cssText="position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;user-select:none;z-index:0;";main.prepend(canvas);');
replace('canvas.dataset.fusionUi="layered-scene";','canvas.dataset.dshSunlitUi="layered-scene";');
replace('replacement.dataset.fusionUi="layered-scene";','replacement.dataset.dshSunlitUi="layered-scene";replacement.style.cssText=canvas.style.cssText;');
// Hidden canvas must stay hidden despite the explicit display:block style.
replace('if(canvas)canvas.hidden=!value;','if(canvas){canvas.hidden=!value;canvas.style.display=value?"block":"none";}');
const compatibilityStart=text.indexOf('  function nativeCompatibility(mode){'),refreshStart=text.indexOf('  function refresh(){',compatibilityStart);
text=text.slice(0,compatibilityStart)+text.slice(refreshStart);
const stateStart=text.indexOf('    const blinkChanged=blinkEnabled!=='),stateEnd=text.indexOf('    if(guard){',stateStart);
text=text.slice(0,stateStart)+`    const blinkChanged=blinkEnabled!==(context.settings.blink!==false);blinkEnabled=context.settings.blink!==false;lightingEnabled=context.settings.lighting!==false;
    const requested=options.enabled===true && options.sceneAllowed!==false && context.settings.motion!==false;
    if(!requested){active=false;setAttr(attrs[0],null);paused=true;reason="inactive";if(canvas)release();else stopDiscovery();return;}
    active=true;setAttr(attrs[0],"true");
    const guard=failed?"error":doc.hidden?"hidden":media.matches?"reduced-motion":null;
`+text.slice(stateEnd);
replace('framing();const opacity=win.getComputedStyle(main,"::before").opacity;if(canvas.style.opacity!==opacity)canvas.style.opacity=opacity;','framing();');
const observerStart=text.indexOf('  const observer=new win.MutationObserver(refresh);',text.indexOf('function mountSunlitLayeredSceneRenderer'));
const listenerStart=text.indexOf('  win.addEventListener("sunlit-tides:main-surface-change",refresh);',observerStart);
text=text.slice(0,observerStart)+'  const observer=new win.MutationObserver(refresh);\n  observer.observe(html,{attributes:true,attributeFilter:["style"]});\n'+text.slice(listenerStart);
text=text.replaceAll('sunlit-tides:main-surface-change','dsh-sunlit:surface-change');
text+=`
/* DSH owns only this supplied background root. No host DOM markers are used. */
function mountDshSunlitScene({window:win,document:doc,root,config,assets,settings={}}){
  if(!root || root.ownerDocument!==doc)throw new Error("scene-root-required");
  const key="__DSH_SUNLIT_SCENE_RENDERER__",base=config?.layeredScene || {};
  let current={scene:"orchard",motion:true,lighting:true,blink:true,...settings},selected=null,cleanup=null,disposed=false;
  const context={window:win,document:doc,root,config,assets,settings:current,assetDataUrl:id=>assets[id],addCleanup(){}};
  function refresh(next={}){
    if(disposed)return;current={...current,...next};context.settings=current;
    const id=current.scene || "orchard";
    if(id!==selected){
      cleanup?.();selected=id;
      const sceneConfig=id==="orchard"?{...base,...base.scenes?.orchard}:{...base.scenes?.[id]};
      const options={...sceneConfig,scene:id,enabled:base.enabled!==false,sceneAllowed:id==="orchard" || ["night","night-tears"].includes(id) && !!base.scenes?.[id],forceMainThread:base.forceMainThread===true || sceneConfig.forceMainThread===true};
      cleanup=mountSunlitLayeredSceneRenderer({...context,config:{...config,layeredScene:options}});
    }else { const renderer=win[key];if(renderer){renderer.updateSettings?.(current);renderer.refresh();} }
  }
  function dispose(){if(disposed)return;disposed=true;cleanup?.();cleanup=null;}
  const api={refresh,dispose,getStateAsync:()=>disposed?Promise.resolve({scene:selected,disposed:true,reason:"disposed"}):win[key]?.getStateAsync() || Promise.resolve({scene:selected,reason:"inactive"}),getState:()=>win[key]?.getState() || {scene:selected,disposed}};
  refresh();return api;
}
`;
// Keep settings live without rebuilding a GPU context for each toggle.
replace('const api={getState,getStateAsync,refresh,dispose,capturePixels,','const api={getState,getStateAsync,refresh,dispose,updateSettings(value){context.settings=value;},capturePixels,');
if(/tessalume|resolveFusionLayout|doc\.documentElement|dataset\.fusion/i.test(text))throw Error('Host-specific dependency remains');
fs.mkdirSync(path.join(target,'src'),{recursive:true});
fs.writeFileSync(path.join(target,'src/scene-runtime.js'),'/* Generated from Sunlit Tides 1.2.7 layered-scene.js. Source SHA-256: '+hash+'\n * Preserve upstream attribution in NOTICE and licenses. Run scripts/sync-scene.cjs to regenerate. */\n'+text);
console.log('Generated src/scene-runtime.js from '+hash);
