/* Local gallery: independent mode preferences, lazy modal, bounded night framing. */
function mountSunlitGallery(context) {
  const {window:win,document:doc}=context,html=doc.documentElement,key='__SUNLIT_GALLERY__';
  win[key]?.dispose?.();
  const options=context.config?.gallery||{},storageKey='sunlit-tides.gallery.v2:'+String(context.id||'sunlit-tides.codex');
  const variables=new Map(),attributes=new Map(),listeners=[],sources=new Map();
  let disposed=false,mode='',reading={},frame=0,dialog=null,dialogStyle=null,opener=null,status=null,observed=[];
  const fallback=[{id:'orchard',label:'果园午后',asset:'duo-orchard',position:'50% 32%'},{id:'night',label:'夜色相依',asset:'duo-night',position:'55% 0%'}];
  const scenes=[],ids=new Set();
  for(const scene of Array.isArray(options.scenes)?options.scenes:fallback){
    if(!scene||!/^[-\w]+$/.test(scene.id||'')||ids.has(scene.id)||!/^[-\w]+$/.test(scene.asset||''))continue;
    const position=String(scene.position||'50% 50%');
    scenes.push({...scene,label:String(scene.label||scene.id),description:String(scene.description||''),position:win.CSS?.supports('background-position',position)?position:'50% 50%'});ids.add(scene.id);
  }
  const defaults=Object.fromEntries(['light','dark'].map(name=>{const candidate=options.defaults?.[name]||options.fixed?.[name]||(name==='light'?'orchard':'night');return[name,ids.has(candidate)?candidate:scenes[0]?.id||''];}));
  const selected={...defaults},choices=new Map();
  try{
    const raw=win.localStorage.getItem(storageKey);
    if(raw&&raw.length<16384){const saved=JSON.parse(raw);for(const name of ['light','dark']){
      const id=saved?.[name];
      if(typeof id==='string'&&ids.has(id))selected[name]=id;
    }}
  }catch{}
  const style=(name,value)=>{if(!variables.has(name))variables.set(name,[html.style.getPropertyValue(name),html.style.getPropertyPriority(name)]);if(html.style.getPropertyValue(name)!==value)html.style.setProperty(name,value);};
  const attr=(name,value)=>{if(!attributes.has(name))attributes.set(name,html.getAttribute(name));if(html.getAttribute(name)!==value)html.setAttribute(name,value);};
  const listen=(node,event,handler,options)=>{node.addEventListener(event,handler,options);listeners.push(()=>node.removeEventListener(event,handler,options));};
  const sceneNow=()=>scenes.find(scene=>scene.id===selected[mode]);
  const framed=()=>['night','night-tears','night-original'].includes(selected[mode]);
  // Keep each retained album scene's existing reading colors.
  const palettes={
    sunset:['255 248 240','33 27 43','#755036','#e6bc8f'],
    night:['247 245 255','25 24 43','#625080','#c9b8ef'],
    heart:['255 245 249','38 25 42','#884761','#e4afca'],
    orchard:['250 251 241','29 33 35','#4d6650','#b9d5b2'],
    story:['255 247 242','36 27 39','#815147','#e3baa7'],
    evening:['255 246 241','36 26 39','#865044','#e6b9a6'],
    train:['251 248 255','29 27 43','#70537d','#d1b4e4'],
    dream:['254 246 249','34 25 40','#7d496e','#dfb0d1'],
    breeze:['246 252 250','25 34 39','#3b6c66','#abd6d0'],
    daydream:['247 252 250','25 34 38','#3e6861','#b1d6c6'],
    'sigrika-paws':['255 248 241','35 28 38','#82523e','#e6bf9b'],
    'denia-paws':['254 246 251','34 25 43','#7c4b7d','#d7b4e5']
  };
  palettes['night-original']=palettes.night;
  palettes['night-tears']=palettes.night;
  const tint=(hex,base)=>'#'+hex.slice(1).match(/../g).map((s,i)=>Math.round(parseInt(s,16)*.2+parseInt(base.slice(1+i*2,3+i*2),16)*.8).toString(16).padStart(2,'0')).join('');
  const resize=new win.ResizeObserver(scheduleComposition);
  function composeNight(){
    frame=0;if(disposed||!framed())return;
    const layout=typeof resolveFusionLayout==='function'?resolveFusionLayout(doc,win):null,main=layout?.main;if(!main)return;
    const next=[main,...(layout.panels||[])];
    for(const node of observed)if(!next.includes(node))resize.unobserve(node);
    for(const node of next)if(!observed.includes(node))resize.observe(node);
    observed=next;
    const area=main.getBoundingClientRect();let right=area.right;
    for(const panel of layout.panels||[]){const r=panel.getBoundingClientRect();if(r.left>area.left+area.width*.45&&r.left<right)right=r.left;}
    const width=Math.max(1,area.width),available=Math.max(1,right-area.left),height=Math.max(1,area.height),original=selected[mode]==='night-original';
    const anchor=original ? .66 : .55,imageWidth=original?Math.max(width*1.3,height*1672/941,(width-available*.65)/.34):Math.max(width,height*1272/847);
    style('--sgk-night-image-size',imageWidth+'px auto');
    style('--sgk-night-image-position',Math.max(width-imageWidth,Math.min(0,available*.5-imageWidth*anchor))+'px 0%');
  }
  function scheduleComposition(){if(!disposed&&framed()&&!frame)frame=win.requestAnimationFrame(composeNight);}
  function syncChoices(){
    if(!dialog)return;
    for(const [id,button]of choices){button.setAttribute('aria-pressed',String(id===selected[mode]));button.dataset.default=String(id===defaults[mode]);}
    status.textContent=(mode==='dark'?'暗色':'亮色')+'模式 · 当前背景：'+(sceneNow()?.label||'默认背景');
  }
  function refresh(force=false){
    if(disposed)return;
    const next=html.getAttribute('data-theme')==='dark'||(!html.hasAttribute('data-theme')&&html.classList.contains('electron-dark'))?'dark':'light';
    if(mode===next&&!force)return;mode=next;const dark=mode==='dark',scene=sceneNow();
    if(framed())scheduleComposition();else{win.cancelAnimationFrame(frame);frame=0;resize.disconnect();observed=[];}
    const palette=palettes[selected[mode]]||palettes[dark?'night':'sunset'];
    // The two primary defaults retain their current 1.1.3 reading treatment.
    const primary=selected[mode]===defaults[mode],surface=primary?(dark?'25 24 43':'250 251 241'):palette[dark?1:0];
    const accent=primary?(dark?'#c9b8ef':'#4d6650'):palette[dark?3:2];
    reading={ink:dark?'#fff0fb':'#20112b',muted:dark?'#f5e3f1':'#2b1d35',link:dark?'#f0e3ff':'#301b43',accent:tint(accent,dark?'#fff8ff':'#20112b'),
      'surface-rgb':surface,'surface-alpha':'.97','strong-rgb':surface,
      success:dark?'#d4f1dc':'#142a1d',danger:dark?'#ffdae8':'#3d1228',warning:dark?'#f9e7bb':'#382509',
      'veil-rgb':dark?'13 8 32':'247 239 249','veil-min':dark?'.64':'.60',veil:'clamp(var(--sgk-reading-veil-min), var(--fusion-message-opacity, var(--sgk-reading-veil-min)), .82)'};
    for(const [name,value]of Object.entries(reading))style('--sgk-reading-'+name,value);
    style('--sgk-scene-image',scene?`var(--tessalume-asset-${scene.asset})`:'none');
    style('--sgk-scene-position',scene?.position||'50% 50%');
    attr('data-sgk-scene',selected[mode]);attr('data-sgk-reading-scene',selected[mode]);attr('data-sgk-reading-mode',mode);syncChoices();
  }
  function selectScene(id,targetMode){
    if(disposed||!ids.has(id)||targetMode!==undefined&&!['light','dark'].includes(targetMode))return false;
    refresh();selected[targetMode||mode]=id;try{win.localStorage.setItem(storageKey,JSON.stringify(selected));}catch{}
    refresh(true);return true;
  }
  function resetCurrent(){if(disposed)return false;refresh();return selectScene(defaults[mode]);}
  function source(asset){
    if(!sources.has(asset)){let value='';try{value=context.assetDataUrl?.(asset)||context.assets?.[asset]||'';}catch{value=context.assets?.[asset]||'';}
      sources.set(asset,typeof value==='string'&&/^(?:data:image\/|blob:)/i.test(value)?value:'');}
    return sources.get(asset);
  }
  function element(tag,className,text){const node=doc.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function restoreFocus(){const target=opener;opener=null;if(target?.isConnected)target.focus({preventScroll:true});}
  function close(){if(!dialog?.open)return;dialog.close();restoreFocus();}
  function buildDialog(){
    dialogStyle=element('style');dialogStyle.dataset.sgkGalleryStyle='true';dialogStyle.textContent=`
dialog.sgk-gallery-dialog[data-sgk-gallery]{box-sizing:border-box;position:fixed;inset:0;margin:auto;width:min(860px,calc(100vw - 32px));max-width:none;max-height:calc(100dvh - 32px);padding:22px;border:1px solid var(--sgk-line-strong,#a995b1);border-radius:20px;box-shadow:0 24px 90px #0005;color:var(--sgk-reading-ink,#20112b);background:rgb(var(--sgk-reading-strong-rgb,250 251 241));font:13px/1.5 system-ui,"Microsoft YaHei",sans-serif;overflow:hidden;display:none;color-scheme:light}
dialog.sgk-gallery-dialog[data-sgk-gallery][open]{display:flex;flex-direction:column;gap:16px}html[data-sgk-reading-mode="dark"] dialog.sgk-gallery-dialog[data-sgk-gallery]{color-scheme:dark}
dialog.sgk-gallery-dialog::backdrop{background:#120f1980;backdrop-filter:blur(6px)}
dialog.sgk-gallery-dialog *{box-sizing:border-box}dialog.sgk-gallery-dialog button{font:inherit;color:inherit;cursor:pointer}dialog.sgk-gallery-dialog button:focus-visible{outline:3px solid var(--sgk-reading-accent,#715082);outline-offset:3px}
dialog.sgk-gallery-dialog .sgk-gallery-heading{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex:none;margin:0}dialog.sgk-gallery-dialog h2{font-size:21px;margin:0 0 4px;font-weight:600}dialog.sgk-gallery-dialog p{margin:0}dialog.sgk-gallery-dialog .sgk-gallery-heading p{color:var(--sgk-reading-muted,#2b1d35);font-size:12px}
dialog.sgk-gallery-dialog .sgk-gallery-close{width:34px;height:34px;flex:none;border:1px solid var(--sgk-line-strong,#a995b1);border-radius:50%;background:transparent;font-size:22px;line-height:1}
dialog.sgk-gallery-dialog .sgk-gallery-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;min-height:0;overflow:auto;overscroll-behavior:contain;padding:4px}
dialog.sgk-gallery-dialog .sgk-gallery-choice{display:flex;flex-direction:column;gap:3px;min-width:0;padding:5px;text-align:left;border:1px solid var(--sgk-line-strong,#a995b1);border-radius:12px;background:transparent;box-shadow:none}
dialog.sgk-gallery-dialog .sgk-gallery-choice[aria-pressed="true"]{border-color:var(--sgk-reading-accent,#715082);box-shadow:0 0 0 2px var(--sgk-reading-accent,#715082)}
dialog.sgk-gallery-dialog .sgk-gallery-thumb{display:block;width:100%;height:104px;border-radius:8px;object-fit:cover;background:rgb(var(--sgk-reading-surface-rgb,250 251 241));flex:none}
dialog.sgk-gallery-dialog .sgk-gallery-label{display:block;padding:3px 3px 0;font-weight:600;font-size:12px}dialog.sgk-gallery-dialog .sgk-gallery-badge{display:block;padding:0 3px;color:var(--sgk-reading-accent,#715082);font-size:10px;font-weight:600}dialog.sgk-gallery-dialog .sgk-gallery-description{display:block;padding:1px 3px 4px;font-size:11px;line-height:1.5;color:var(--sgk-reading-muted,#2b1d35)}
dialog.sgk-gallery-dialog .sgk-gallery-footer{display:flex;flex-wrap:wrap;align-items:center;gap:10px;flex:none}dialog.sgk-gallery-dialog .sgk-gallery-reset{padding:7px 10px;border:1px solid var(--sgk-line-strong,#a995b1);border-radius:8px;background:transparent}dialog.sgk-gallery-dialog .sgk-gallery-status{font-size:11px;color:var(--sgk-reading-muted,#2b1d35)}
@media(max-width:640px){dialog.sgk-gallery-dialog[data-sgk-gallery]{padding:16px;width:calc(100vw - 20px);max-height:calc(100dvh - 20px)}dialog.sgk-gallery-dialog .sgk-gallery-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}}
`;doc.head.append(dialogStyle);
    dialog=element('dialog','sgk-gallery-dialog');dialog.setAttribute('data-sgk-gallery','true');dialog.setAttribute('aria-labelledby','sgk-gallery-title');dialog.setAttribute('aria-describedby','sgk-gallery-help');
    dialog.id='sgk-background-gallery';
    dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
    const header=element('header','sgk-gallery-heading'),copy=element('div'),title=element('h2','','选择背景'),help=element('p','','亮暗模式分别记住选择，不改变 Codex 外观。');
    title.id='sgk-gallery-title';help.id='sgk-gallery-help';copy.append(title,help);
    const closeButton=element('button','sgk-gallery-close','×');closeButton.type='button';closeButton.setAttribute('aria-label','关闭背景相册');listen(closeButton,'click',close);header.append(copy,closeButton);
    const grid=element('div','sgk-gallery-grid');grid.setAttribute('role','group');grid.setAttribute('aria-label','背景图片');
    for(const scene of scenes){
      const button=element('button','sgk-gallery-choice');button.type='button';button.dataset.scene=scene.id;button.setAttribute('aria-label','选择背景：'+scene.label);
      const image=element('img','sgk-gallery-thumb');image.alt='';image.loading='lazy';image.decoding='async';image.style.objectPosition=scene.position;const url=source(scene.asset);if(url)image.src=url;
      const label=element('span','sgk-gallery-label',scene.label),description=element('span','sgk-gallery-description',scene.description);
      button.append(image,label);
      const primaryModes=['light','dark'].filter(name=>defaults[name]===scene.id);
      if(primaryModes.length)button.append(element('span','sgk-gallery-badge',primaryModes.map(name=>name==='light'?'亮色默认':'暗色默认').join(' · ')));
      button.append(description);listen(button,'click',()=>selectScene(scene.id));choices.set(scene.id,button);grid.append(button);
    }
    const footer=element('footer','sgk-gallery-footer'),reset=element('button','sgk-gallery-reset','恢复当前模式默认背景');reset.type='button';listen(reset,'click',resetCurrent);
    status=element('p','sgk-gallery-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');footer.append(reset,status);dialog.append(header,grid,footer);
    listen(dialog,'cancel',event=>{event.preventDefault();close();});listen(dialog,'close',()=>{if(!dialog.open)restoreFocus();});
    listen(dialog,'keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}});
    for(const event of ['keyup','keypress','click','dblclick','pointerdown','pointerup'])listen(dialog,event,e=>e.stopPropagation());
    doc.body.append(dialog);syncChoices();
  }
  function open(trigger){
    if(disposed)return false;refresh();if(dialog?.open)return true;
    let active=trigger?.focus?trigger:doc.activeElement;while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;opener=active;
    if(!dialog)buildDialog();syncChoices();dialog.showModal();choices.get(selected[mode])?.focus({preventScroll:true});return true;
  }
  const observer=new win.MutationObserver(()=>refresh());observer.observe(html,{attributes:true,attributeFilter:['data-theme','class']});
  const layoutSelector='main,.thread-scroll-container,.app-shell-right-panel,[data-app-shell-right-panel],[data-summary-panel-variant="summary"],[data-tessalume-surface="output-panel"]';
  const layoutObserver=new win.MutationObserver(records=>{
    if(!framed())return;
    if(records.some(record=>record.type==='childList'?[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&(node.matches(layoutSelector)||node.querySelector(layoutSelector))):record.target.matches?.(layoutSelector)))scheduleComposition();
  });
  layoutObserver.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden']});
  listen(win,'resize',scheduleComposition,{passive:true});
  listen(win,'sunlit-tides:main-surface-change',scheduleComposition);
  function dispose(){
    if(disposed)return;disposed=true;close();observer.disconnect();layoutObserver.disconnect();resize.disconnect();win.cancelAnimationFrame(frame);listeners.splice(0).forEach(off=>off());dialog?.remove();dialogStyle?.remove();choices.clear();sources.clear();observed=[];
    for(const [name,[value,priority]]of variables){if(value)html.style.setProperty(name,value,priority);else html.style.removeProperty(name);}
    for(const [name,value]of attributes){if(value===null)html.removeAttribute(name);else html.setAttribute(name,value);}if(win[key]===api)delete win[key];
  }
  const api={select:selectScene,selectScene,open,close,resetCurrent,getState:()=>({mode,scene:selected[mode],selected:{...selected},defaults:{...defaults},scenes:scenes.map(({id,label,asset})=>({id,label,asset})),count:scenes.length,open:!!dialog?.open,fixed:false,disposed,reading:{...reading}}),refresh,dispose};
  win[key]=api;refresh();context.addCleanup(dispose);return api;
}
