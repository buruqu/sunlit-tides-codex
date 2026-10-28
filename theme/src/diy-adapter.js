/* Keep host React components mounted; the editor only owns layout/style overrides. */
function mountCodexDiy(context) {
  const {window:win,document:doc}=context, html=doc.documentElement;
  win.__SUNLIT_CODEX_DIY__?.dispose?.();
  const names={background:'主背景',sidebar:'侧栏背景','portrait-left':'左侧立绘','portrait-right':'右侧立绘','emote-left':'左侧表情包','emote-right':'右侧表情包','effect-default':'场景特效','sidebar-region':'侧栏功能区','chat-region':'聊天功能区','composer-region':'输入框功能区'};
  const selectors={background:'main[data-tessalume-surface="main"]',sidebar:'[data-sunlit-sidebar="true"]','portrait-left':'[data-fusion-card="left"]','portrait-right':'[data-fusion-card="primary"]','emote-left':'[data-sunlit-companion="xixi-emote"]','emote-right':'[data-sunlit-companion="denia"]','effect-default':'[data-fusion-bubbles]','sidebar-region':'aside.app-shell-left-panel,[data-tessalume-surface="sidebar"]','chat-region':'.thread-scroll-container','composer-region':'.composer-surface-chrome,[data-composer-surface-variant]'};
  let disposed=false, pending=0, core, layers=[], typography=null, lastSignature='', lastNodes=[], lastMode='';
  const touched=new Map(), roots=new Map(), style=doc.createElement('style');
  style.dataset.sunlitDiyOwned=''; doc.head.append(style);
  const mode=()=>html.getAttribute('data-theme')==='dark'||(!html.hasAttribute('data-theme')&&html.classList.contains('electron-dark'))?'dark':'light';
  const asset=id=>{try{return context.assetDataUrl?.(id)||context.assets?.[id]||'';}catch{return '';}};
  const visible=node=>node?.isConnected&&!node.closest('[hidden],[aria-hidden="true"],[inert]')&&win.getComputedStyle(node).display!=='none';
  function find(id){
    if(id==='composer-region'){
      const composer=resolveFusionLayout(doc,win).composer;
      return composer?.closest('[data-pip-obstacle="thread-footer"],[data-thread-find-composer="true"],.chat-composer-carrier,.home-composer-carrier')||composer;
    }
    return [...doc.querySelectorAll(selectors[id]||':not(*)')].find(n=>visible(n))||doc.querySelector(selectors[id]||':not(*)');
  }
  function scene(m){const state=win.__SUNLIT_GALLERY__?.getState?.();const id=state?.selected?.[m]||state?.scene||(m==='dark'?'night':'orchard');return context.config.gallery?.scenes?.find(s=>s.id===id)||{id,asset:m==='dark'?'hero-dark':'hero-light'};}
  function source(id,m){
    const keys={sidebar:m==='dark'?'sidebar-dark':'sidebar-light','portrait-left':m==='dark'?'task-left-dark':'task-left','portrait-right':m==='dark'?'task-right-primary-dark':'task-right-primary','emote-left':m==='dark'?'sigrika-emote-dark':'sigrika-emote','emote-right':m==='dark'?'denia-chibi-dark':'denia-chibi'};
    return asset(id==='background'?scene(m).asset:keys[id]);
  }
  const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const clamp=(v,a,b,d)=>Math.min(b,Math.max(a,num(v,d)));
  function rect(node,fallback){const r=node?.getBoundingClientRect();return r&&r.width>1&&r.height>1?{x:r.x,y:r.y,width:r.width,height:r.height}:fallback||{x:0,y:44,width:win.innerWidth,height:Math.max(1,win.innerHeight-44)};}
  function effectiveOpacity(el){let alpha=1;for(let p=el;p&&p!==doc.body;p=p.parentElement)alpha*=num(win.getComputedStyle(p).opacity,1);return Math.round(alpha*100);}
  function getBuiltins(m=mode()){
    const settings=win.__SIGRIKA_DENIA_FUSION__?.getSettings?.()||{};
    return Object.keys(selectors).map(id=>{
      const node=find(id), region=id.endsWith('-region'), kind=region?'region':id.startsWith('portrait')?'portrait':id.startsWith('emote')?'emote':id==='effect-default'?'effect':id;
      const shape=rect(node,id==='sidebar'?rect(find('sidebar-region')):null);
      return {id,name:names[id],kind,source:source(id,m),rect:shape,enabled:region||!!node&&!node.hidden,opacity:['portrait','emote'].includes(kind)?effectiveOpacity(node):100,flipX:id==='portrait-right'&&settings.common?.layout==='panorama',fit:['background','sidebar'].includes(kind)?'cover':'contain',effect:id==='effect-default'?{preset:scene(m).id==='orchard'?'leaf':'bubble',count:settings.common?.bubbleCount||16,size:28,speed:(settings.common?.bubbleSpeed||100)/100,direction:scene(m).id==='orchard'?'down':'up',sway:22}:undefined};
    });
  }
  function constrainLayer(layer){
    if(layer.kind!=='region')return {...layer};
    const viewportHeight=Math.max(1,win.innerHeight),top=Math.min(44,viewportHeight-1)/viewportHeight*100;
    const available=Math.max(.1,100-top),width=clamp(layer.width,10,100,50),height=clamp(layer.height,Math.min(8,available),available,50);
    return {...layer,width,height,x:clamp(layer.x,0,100-width,0),y:clamp(layer.y,top,100-height,top)};
  }
  function regionBox(layer){
    const l=constrainLayer(layer);
    return `left:${l.x}vw!important;top:${l.y}vh!important;width:${l.width}vw!important;height:${l.height}vh!important;`;
  }
  function artBox(l){return `left:${clamp(l.x,-100,200,0)}vw!important;top:${clamp(l.y,-100,200,0)}vh!important;width:${clamp(l.width,.1,200,100)}vw!important;height:${clamp(l.height,.1,200,100)}vh!important;`;}
  function mark(node,value){if(!node)return;if(!touched.has(node))touched.set(node,node.getAttribute('data-sunlit-diy-native'));if(node.getAttribute('data-sunlit-diy-native')!==value)node.setAttribute('data-sunlit-diy-native',value);}
  function clearMarks(){for(const [node,old]of touched){if(old===null)node.removeAttribute('data-sunlit-diy-native');else node.setAttribute('data-sunlit-diy-native',old);}touched.clear();}
  function surface(key,parent,z){
    let record=roots.get(key);
    if(record&&record.parent!==parent){record.art.dispose();record=null;}
    if(!record){const art=createSunlitDiyArt({window:win,document:doc,parent});art.host.dataset.sunlitDiyOwned='';art.host.dataset.fusionUi='diy-art';art.host.style.zIndex=String(z);record={parent,art};roots.set(key,record);}
    return record.art;
  }
  function render(){
    pending=0;if(disposed)return;
    const nativeNodes=layers.map(l=>l.builtin?find(l.id):null), main=find('background'), aside=find('sidebar-region');
    const signature=JSON.stringify([layers,typography,mode(),win.innerWidth,win.innerHeight,main?.className]);
    if(signature===lastSignature&&nativeNodes.length===lastNodes.length&&nativeNodes.every((node,i)=>node===lastNodes[i]))return;
    lastSignature=signature;lastNodes=nativeNodes;clearMarks();
    const rules=[],front=[],back=[],side=[];
    for(const l of layers){
      const native=l.builtin&&find(l.id), tag='n'+rules.length, target=`html.sgk-theme.tessalume-theme-active body [data-sunlit-diy-native="${tag}"]`;
      if(native)mark(native,tag);
      if(l.kind==='region'){
        if(!native)continue;
        // Regions remain functional, visible and above decoration. Do not rotate native text/input.
        rules.push(`${target}{position:fixed!important;inset:auto!important;${regionBox(l)}max-width:none!important;min-width:0!important;min-height:0!important;flex:none!important;margin:0!important;transform:none!important;translate:none!important;scale:1!important;z-index:${l.id==='composer-region'?60:30}!important;overflow:${l.id==='composer-region'?'visible':'auto'}!important;}`);
        if(l.id==='chat-region')rules.push(`${target} [data-fusion-split-paper]{width:100%!important;max-width:100%!important;translate:none!important;}`);
        continue;
      }
      if(l.builtin&&l.id==='background'&&native){
        const surfaces=`${target}::before,${target}>.sunlit-layered-scene,${target}>.sunlit-living-scene`;
        if(l.source===source('background',mode())&&l.fit!=='contain'){
          rules.push(`${surfaces}{position:fixed!important;inset:auto!important;${artBox(l)}opacity:${l.enabled===false?0:clamp(l.opacity,0,100,100)/100}!important;transform:rotate(${clamp(l.rotation,-360,360,0)}deg) scaleX(${l.flipX?-1:1})!important;filter:blur(${clamp(l.blur,0,40,0)}px)!important;}`);
          continue;
        }
        rules.push(`${surfaces}{visibility:hidden!important;}`);
      }else if(l.builtin&&l.id==='sidebar'&&native){
        rules.push(`${target}::after{display:none!important;}`);
      }else if(native){
        // The native standee rule includes the template root ID. Beat its
        // explicit visibility so moving one image never leaves a second copy.
        const templateTarget=`html.sgk-theme.tessalume-theme-active[data-fusion-active] #tessalume-theme-root [data-sunlit-diy-native="${tag}"]`;
        rules.push(`${target},${templateTarget}{visibility:hidden!important;}`);
      }
      if(l.enabled===false)continue;
      (l.kind==='background'?back:l.kind==='sidebar'?side:front).push(l);
    }
    if(typography){
      const t=typography,css=[];
      if(t.family)css.push(`font-family:${JSON.stringify(String(t.family))}!important`);
      if(t.fontSize)css.push(`font-size:${clamp(t.fontSize,10,48,16)}px!important`);
      if(t.lineHeight)css.push(`line-height:${clamp(t.lineHeight,1,3,1.6)}!important`);
      if(t.color&&win.CSS.supports('color',t.color))css.push(`color:${t.color}!important;-webkit-text-fill-color:currentColor!important;background-image:none!important`);
      if(t.gradientEnabled===false)css.push('background-image:none!important;-webkit-text-fill-color:currentColor!important');
      const scope='html.sgk-theme.tessalume-theme-active[data-fusion-active][data-sgk-reading-mode][data-fusion-gradient-text] body';
      const prose=':is([data-tessalume-surface="markdown"] :is(p,li,th,td,h1,h2,h3,h4,h5,h6,blockquote,strong,b,em),[data-tessalume-surface="sidebar"] :is([data-thread-title],[data-marquee-text],.sgk-nav-label,.sgk-project-heading,.sgk-section-label>span,.sidebar-brand>span),[data-app-shell-titlebar-content="true"]>:is(.truncate,small)):not(:where(pre,pre *,code,code *,a,a *,kbd,kbd *,samp,samp *,button,input,textarea,[contenteditable],[contenteditable] *,[role=status],[role=status] *,[data-status],[data-status] *,[data-tool-call],[data-tool-call] *,[class*="text-success"],[class*="text-danger"],[class*="text-warning"],[class*="text-codex-git-"]))';
      rules.push(`${scope} ${prose}{${css.join(';')}}`);
      if(t.gradientEnabled&&win.CSS.supports('color',t.gradientStart)&&win.CSS.supports('color',t.gradientEnd)){
        rules.push(`${scope} ${prose}:not(li):not(:has(:is(ul,ol,li,a,code,pre,kbd,samp,button,input,textarea,svg,[role=img],[role=status],[data-status],[data-tool-call]))){background-image:linear-gradient(110deg,${t.gradientStart},${t.gradientEnd})!important;background-clip:text!important;-webkit-background-clip:text!important;-webkit-text-fill-color:transparent!important;}`);
      }
    }
    const css=rules.join('\n');if(style.textContent!==css)style.textContent=css;
    if(main){surface('front',main,5).render(front);surface('back',main,-2).render(back);}
    if(aside)surface('sidebar',aside,-2).render(side);
    // Prevent detached stages retaining decoded assets after a native route change.
    for(const [key,record]of roots)if(!record.parent.isConnected){record.art.dispose();roots.delete(key);}
  }
  const refresh=()=>{if(disposed)return;if(lastMode!==mode()){lastMode=mode();core?.refresh();}if(!pending)pending=win.requestAnimationFrame(render);};
  const adapter={getMode:mode,getBuiltins,constrainLayer,apply(next,text){layers=next||[];typography=text;render();}};
  lastMode=mode();core=mountSunlitDiy({window:win,document:doc,platform:'codex',adapter});
  const observer=new win.MutationObserver(records=>{
    if(records.some(r=>!r.target.closest?.('[data-sunlit-diy-owned],[data-sunlit-diy-art],[data-sunlit-diy-editor]')&&(r.type==='childList'||r.attributeName==='data-theme'||r.target===html)))refresh();
  });
  observer.observe(doc.body,{subtree:true,childList:true});observer.observe(html,{attributes:true,attributeFilter:['data-theme','class']});
  win.addEventListener('resize',refresh,{passive:true});
  const api={open:()=>core.open(),startEditing:()=>core.startEditing(),refresh,dispose(){if(disposed)return;core.dispose();disposed=true;observer.disconnect();win.removeEventListener('resize',refresh);win.cancelAnimationFrame(pending);clearMarks();for(const record of roots.values())record.art.dispose();roots.clear();style.remove();if(win.__SUNLIT_CODEX_DIY__===api)delete win.__SUNLIT_CODEX_DIY__;}};
  win.__SUNLIT_CODEX_DIY__=api;context.addCleanup(api.dispose);return api;
}
