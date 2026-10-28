/* Host geometry and rendering only. The shared editor owns documents and assets. */
function mountDshDiy({ window, document, assets, getScene, getSettings }) {
  const names = { background: '背景', sidebar: '侧栏背景', 'portrait-left': '左侧立绘', 'portrait-right': '右侧立绘', 'emote-left': '左侧表情', 'emote-right': '右侧表情', 'effect-default': '场景粒子', 'sidebar-region': '侧栏功能区', 'chat-region': '聊天功能区', 'composer-region': '输入功能区' };
  const selectors = { background: '[data-sunlit-background]', sidebar: '[data-sunlit-sidebar-art]', 'portrait-left': '[data-sunlit-companion=left]', 'portrait-right': '[data-sunlit-companion=right]', 'emote-left': '[data-sunlit-emote=left]', 'emote-right': '[data-sunlit-emote=right]', 'effect-default': '[data-sunlit-bubbles]', 'sidebar-region': ':is([data-pane=sidebar],[class*="_sidebarCol"])', 'chat-region': '[data-conversation-scroll]', 'composer-region': '[data-composer-seat]' };
  Object.assign(names,{background:'主背景','chat-background':'聊天区背景','composer-background':'输入框背景','toolbar-background':'顶部功能栏背景'});
  Object.assign(selectors,{'chat-background':selectors['chat-region'],'composer-background':selectors['composer-region'],'toolbar-background':'[class*="_crumbBar"],[class*="_tabHostHeader"],[data-app-titlebar],[data-pane="header"]'});
  const backgroundSlots=new Set(['chat-background','composer-background','toolbar-background']);
  const regionArt=createSunlitSurfaceBackground({window,document});
  let layers = [], typography = null, disposed = false, tick = 0, core = null, lastMode = null;
  const style = document.createElement('style'), stage = document.createElement('div');
  style.dataset.sunlitOwner = stage.dataset.sunlitOwner = 'diy'; stage.dataset.sunlitDiyStage = '';
  document.head.append(style); (document.querySelector('[data-sunlit-viewport]') || document.body).append(stage);
  const art = createSunlitDiyArt({window,document,parent:stage});
  const underStage=document.createElement('div');underStage.dataset.sunlitOwner='diy';underStage.dataset.sunlitDiyStage='';underStage.style.zIndex='0';
  (document.querySelector('[data-sunlit-artwork]') || stage).append(underStage);
  const underArt=createSunlitDiyArt({window,document,parent:underStage});
  const touched = new Set();
  let lastSignature = '', lastNative = [];
  const mode = () => document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light';
  const find = id => document.querySelector(selectors[id] || ':not(*)');
  const bounds = el => { const r = el?.getBoundingClientRect(); return r && r.width && r.height ? {x:r.x,y:r.y,width:r.width,height:r.height} : null; };
  function source(id, m) {
    const map = { sidebar: m === 'dark' ? 'sidebar-dark' : 'sidebar-light', 'portrait-left': m === 'dark' ? 'task-left-dark' : 'task-left', 'portrait-right': m === 'dark' ? 'task-right-primary-dark' : 'task-right-primary', 'emote-left': m === 'dark' ? 'sigrika-emote-dark' : 'sigrika-emote', 'emote-right': m === 'dark' ? 'denia-chibi-dark' : 'denia-chibi' };
    return id === 'background' ? assets[getScene(m)?.asset] || '' : assets[map[id]] || '';
  }
  function getBuiltins(m = mode()) {
    return Object.keys(selectors).map(id => {
      const el = find(id), region = id.endsWith('-region');
      const kind = region ? 'region' : backgroundSlots.has(id)?'background' : id.startsWith('portrait') ? 'portrait' : id.startsWith('emote') ? 'emote' : id === 'effect-default' ? 'effect' : id;
      const rect = bounds(el) || (id === 'sidebar' ? bounds(find('sidebar-region')) : null) || {x:0,y:0,width:window.innerWidth,height:window.innerHeight};
      let alpha=1, visible=!!el;
      for(let p=el;p&&p!==document.body;p=p.parentElement){const cs=window.getComputedStyle(p);alpha*=Number(cs.opacity);if(p.hidden||cs.display==='none'||cs.visibility==='hidden')visible=false;}
      const enabled = region || visible && alpha > 0;
      return {id,name:names[id],kind,source:source(id,m),rect,opacity:region?100:Math.round(alpha*100),enabled,fit:kind==='background'||kind==='sidebar'?'cover':'contain',flipX:id === 'portrait-right' && getSettings().layout === 'panorama',effect: id === 'effect-default' ? {preset:getScene(m)?.id === 'orchard' ? 'leaf':'bubble',count:getSettings().bubbleCount,size:18,speed:getSettings().bubbleSpeed/100,direction:getScene(m)?.id === 'orchard' ? 'down':'up',sway:30} : undefined};
    });
  }
  const number = (v,d=0) => Number.isFinite(Number(v)) ? Number(v) : d;
  function constrainLayer(layer) {
    if(layer?.followRegion&&['background','sidebar',...backgroundSlots].includes(layer.id)){
      const r=bounds(find(layer.id==='sidebar'?'sidebar-region':layer.id));
      if(r)return {...layer,x:r.x/window.innerWidth*100,y:r.y/window.innerHeight*100,width:r.width/window.innerWidth*100,height:r.height/window.innerHeight*100};
    }
    if(!layer || layer.kind!=='region') return layer;
    const viewportHeight=Math.max(1,window.innerHeight), title=Math.min(44,viewportHeight-1)/viewportHeight*100, available=Math.max(.1,100-title);
    const width=Math.min(100,Math.max(10,number(layer.width,100)));
    const height=Math.min(available,Math.max(Math.min(8,available),number(layer.height,available)));
    return {...layer,width,height,x:Math.min(100-width,Math.max(0,number(layer.x))),y:Math.min(100-height,Math.max(title,number(layer.y,title)))};
  }
  function box(layer) {
    const l=layer.kind==='region'?constrainLayer(layer):{...layer,x:Math.min(200,Math.max(-100,number(layer.x))),y:Math.min(200,Math.max(-100,number(layer.y))),width:Math.min(200,Math.max(.1,number(layer.width,100))),height:Math.min(200,Math.max(.1,number(layer.height,100)))};
    return `left:${l.x}vw!important;top:${l.y}vh!important;width:${l.width}vw!important;height:${l.height}vh!important;`;
  }
  function render() {
    if (disposed) return;
    tick = 0;
    const natives=layers.map(l=>l.builtin?find(l.id):null);
    const signature=JSON.stringify([layers,typography,mode(),window.innerWidth,window.innerHeight,getSettings()]);
    if(signature===lastSignature && natives.every((el,i)=>el===lastNative[i])) return;
    lastSignature=signature;lastNative=natives;
    for(const el of touched) el.removeAttribute('data-sunlit-diy-native');
    touched.clear();
    const rules = [], artLayers = [], underLayers=[],regionBackgrounds=[];
    let slotIndex=0;
    for(const layer of layers) {
      const native = layer.builtin && find(layer.id), id = `diy-${slotIndex++}`, opacity = Math.min(100,Math.max(0,number(layer.opacity,100))) / 100;
      if(native) { native.setAttribute('data-sunlit-diy-native',touched.has(native)?native.getAttribute('data-sunlit-diy-native')+' '+id:id); touched.add(native); }
      const target = `[data-sunlit-diy-native~="${id}"][data-sunlit-diy-native][data-sunlit-diy-native]`;
      if(backgroundSlots.has(layer.id)){
        if(native&&layer.enabled!==false){const moved=layers.some(p=>p.kind==='region'&&find(p.id)===native);rules.push(`${target}{isolation:isolate!important;${!moved&&window.getComputedStyle(native).position==='static'?'position:relative!important;':''}background-color:transparent!important;background-image:none!important;}`);regionBackgrounds.push({layer,node:native});}
        continue;
      }
      if(layer.kind === 'region') {
        if(!native) continue;
        rules.push(`${target}{position:fixed!important;${box(layer)}margin:0!important;max-width:none!important;min-width:0!important;min-height:0!important;flex:none!important;translate:none!important;transform:none!important;overflow:auto!important;z-index:2!important;opacity:1!important;visibility:visible!important;}`);
        // Fixed sidebar leaves grid auto-placement. Keep untouched host columns
        // in their native slots so the center does not fall into the 220px rail.
        if(layer.id==='sidebar-region') rules.push(`[class*='_centerCol']{grid-column:2!important}[data-rightbar-col],[class*='_rightbarCol']{grid-column:3!important}`);
        continue;
      }
      // Same native wallpaper keeps its worker/canvas; only imported replacement hides it.
      if(native && layer.id === 'background' && layer.source === source('background',mode()) && layer.fit!=='contain' && !number(layer.rotation) && !layer.flipX) {
        const parentAlpha = (()=>{ let a=1;for(let p=native.parentElement;p && p!==document.body;p=p.parentElement)a*=number(window.getComputedStyle(p).opacity,1);return a; })();
        rules.push(`${target}{${box(layer)}position:fixed!important;right:auto!important;bottom:auto!important;opacity:${layer.enabled === false ? 0 : opacity / Math.max(.001,parentAlpha)}!important;filter:blur(${Math.max(0,number(layer.blur))}px)!important;}`);
        continue;
      }
      if(native) rules.push(`${target}{visibility:hidden!important;}`);
      if(layer.enabled === false) continue;
      const rendered={...layer,source:layer.source || source(layer.id,mode())};
      // Imported wallpapers stay beneath the reading wash; decorations use their
      // captured effective alpha once in the independent viewport stage.
      if(layer.kind==='background') {
        let parentAlpha=1;for(let p=underStage.parentElement;p&&p!==document.body;p=p.parentElement)parentAlpha*=Number(window.getComputedStyle(p).opacity);
        rendered.opacity=Math.min(100,number(layer.opacity,100)/Math.max(.001,parentAlpha));underLayers.push(rendered);
      } else artLayers.push(rendered);
    }
    art.render(artLayers);
    underArt.render(underLayers);
    if(typography) {
      const declarations=[];
      if(typography.family) declarations.push(`font-family:${JSON.stringify(String(typography.family)).replace(/</g,'')}!important`);
      if(typography.fontSize) declarations.push(`font-size:${Math.min(48,Math.max(10,number(typography.fontSize,16)))}px!important`);
      if(typography.lineHeight) declarations.push(`line-height:${Math.max(1,Math.min(3,number(typography.lineHeight,1.6)))}!important`);
      if(typography.color && window.CSS.supports('color',typography.color)) declarations.push(`color:${typography.color}!important;-webkit-text-fill-color:currentColor!important;background-image:none!important`);
      if(typeof typography.gradientEnabled === 'boolean') declarations.push('background-image:none!important;-webkit-text-fill-color:currentColor!important');
      const scope='body[data-dsh-sunlit][data-sunlit-mode][data-sunlit-layout] [data-sunlit-host]';
      const prose=":is([data-sunlit-reading-column] :is(p,h1,h2,h3,h4,h5,h6,li,blockquote,strong,b,em),[class*='_plainRun_'],[class*='_crumbCurrent'],[class*='_tabLabel'],[class*='_sidebarCol'] :is([class*='_brandName'],[class*='_title'],[class*='_projectText'])):not(:where(pre,pre *,code,code *,kbd,kbd *,samp,samp *,a,a *,button,button *,input,textarea,[role=status],[role=status] *,[data-status],[data-status] *,[data-tool-call],[data-tool-call] *,[class*='_composerSeat'] *)):not(:has(:is(a,code,pre,kbd,samp,[role=status],[data-status],[data-tool-call])))";
      rules.push(`${scope} ${prose}{${declarations.join(';')}}`);
      // Markers and semantic descendants need solid ink. Only paint isolated
      // text-bearing elements; a list item's ::marker inherits its text fill.
      if(typography.gradientEnabled && window.CSS.supports('color',typography.gradientStart) && window.CSS.supports('color',typography.gradientEnd)) rules.push(`${scope} ${prose}:not(li):not(:has(:is(ul,ol,li,a,pre,code,kbd,samp,button,input,textarea,select,svg,[role=img],[role=status],[data-status],[data-tool-call]))){background-image:linear-gradient(110deg,${typography.gradientStart},${typography.gradientEnd})!important;background-clip:text!important;-webkit-background-clip:text!important;-webkit-text-fill-color:transparent!important}`);
    }
    const css=rules.join('\n'); if(style.textContent!==css) style.textContent=css;
    regionArt.render(regionBackgrounds);
  }
  const refresh=()=>{if(disposed)return;if(lastMode!==mode()){lastMode=mode();core?.refresh?.();}if(!tick)tick=window.requestAnimationFrame(render);};
  const adapter={getMode:mode,getBuiltins,constrainLayer,apply(next,text){layers=next || [];typography=text;render();}};
  lastMode=mode();core = typeof mountSunlitDiy === 'function' ? mountSunlitDiy({window,document,platform:'dsh',adapter}) : null;
  window.addEventListener('resize',refresh);
  return {open:()=>core?.open(),startEditing:()=>core?.startEditing(),refresh,dispose(){disposed=true;window.removeEventListener('resize',refresh);if(tick)window.cancelAnimationFrame(tick);core?.dispose();art.dispose();underArt.dispose();regionArt.dispose();underStage.remove();for(const el of touched)el.removeAttribute('data-sunlit-diy-native');stage.remove();style.remove();}};
}
