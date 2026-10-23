/* Two authored scenes follow Codex appearance; night framing uses native layout bounds. */
function mountSunlitGallery(context) {
  const {window:win,document:doc}=context,html=doc.documentElement,key='__SUNLIT_GALLERY__';
  win[key]?.dispose?.();
  const variables=new Map(),attributes=new Map();let disposed=false,mode='',reading={},frame=0;
  const selected={light:'orchard',dark:'night'};
  const style=(name,value)=>{if(!variables.has(name))variables.set(name,[html.style.getPropertyValue(name),html.style.getPropertyPriority(name)]);if(html.style.getPropertyValue(name)!==value)html.style.setProperty(name,value);};
  const attr=(name,value)=>{if(!attributes.has(name))attributes.set(name,html.getAttribute(name));if(html.getAttribute(name)!==value)html.setAttribute(name,value);};
  const tint=(hex,base)=>'#'+hex.slice(1).match(/../g).map((s,i)=>Math.round(parseInt(s,16)*.2+parseInt(base.slice(1+i*2,3+i*2),16)*.8).toString(16).padStart(2,'0')).join('');
  // Reframe the authored night image inside the usable main area. Right docks
  // may overlay main rather than resize it, so viewport breakpoints alone drift.
  const resize=new win.ResizeObserver(scheduleComposition);
  let observed=[];
  function composeNight(){
    frame=0;if(disposed||mode!=='dark')return;
    const layout=typeof resolveFusionLayout==='function'?resolveFusionLayout(doc,win):null;
    const main=layout?.main;if(!main)return;
    const next=[main,...(layout.panels||[])];
    for(const node of observed)if(!next.includes(node))resize.unobserve(node);
    for(const node of next)if(!observed.includes(node))resize.observe(node);
    observed=next;
    const area=main.getBoundingClientRect();let right=area.right;
    for(const panel of layout.panels||[]){const r=panel.getBoundingClientRect();if(r.left>area.left+area.width*.45&&r.left<right)right=r.left;}
    const width=Math.max(1,area.width),availableWidth=Math.max(1,right-area.left),height=Math.max(1,area.height);
    // 1672 x 941: keep its aspect and cover every visible pixel. The two faces
    // occupy the right two thirds; modest zoom plus right alignment centers them.
    const imageWidth=Math.max(width*1.3,height*1672/941,(width-availableWidth*.65)/.34);
    style('--sgk-night-image-size',imageWidth+'px auto');
    style('--sgk-night-image-position',Math.max(width-imageWidth,Math.min(0,availableWidth*.5-imageWidth*.66))+'px 0%');
  }
  function scheduleComposition(){if(!disposed&&mode==='dark'&&!frame)frame=win.requestAnimationFrame(composeNight);}
  function refresh(){
    if(disposed)return;
    const next=html.getAttribute('data-theme')==='dark'||(!html.hasAttribute('data-theme')&&html.classList.contains('electron-dark'))?'dark':'light';
    if(mode===next)return;mode=next;const dark=mode==='dark',scene=selected[mode];
    if(dark)scheduleComposition();else{win.cancelAnimationFrame(frame);frame=0;resize.disconnect();observed=[];}
    reading={ink:dark?'#fff0fb':'#20112b',muted:dark?'#f5e3f1':'#2b1d35',link:dark?'#f0e3ff':'#301b43',accent:tint(dark?'#c9b8ef':'#4d6650',dark?'#fff8ff':'#20112b'),
      'surface-rgb':dark?'25 24 43':'250 251 241','surface-alpha':'.97','strong-rgb':dark?'25 24 43':'250 251 241',
      success:dark?'#d4f1dc':'#142a1d',danger:dark?'#ffdae8':'#3d1228',warning:dark?'#f9e7bb':'#382509',
      'veil-rgb':dark?'13 8 32':'247 239 249','veil-min':dark?'.64':'.60',veil:'clamp(var(--sgk-reading-veil-min), var(--fusion-message-opacity, var(--sgk-reading-veil-min)), .82)'};
    for(const [name,value]of Object.entries(reading))style('--sgk-reading-'+name,value);
    style('--sgk-scene-image',`var(--tessalume-asset-${dark?'duo-night':'duo-orchard'})`);
    style('--sgk-scene-position',dark?'70% 45%':'50% 32%');
    attr('data-sgk-scene',scene);attr('data-sgk-reading-scene',scene);attr('data-sgk-reading-mode',mode);
  }
  const observer=new MutationObserver(refresh);observer.observe(html,{attributes:true,attributeFilter:['data-theme','class']});
  const layoutSelector='main,.thread-scroll-container,.app-shell-right-panel,[data-app-shell-right-panel],[data-summary-panel-variant="summary"],[data-tessalume-surface="output-panel"]';
  const layoutObserver=new win.MutationObserver(records=>{
    if(mode!=='dark')return;
    if(records.some(record=>record.type==='childList'
      ? [...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&(node.matches(layoutSelector)||node.querySelector(layoutSelector)))
      : record.target.matches?.(layoutSelector)))scheduleComposition();
  });
  layoutObserver.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden']});
  win.addEventListener('resize',scheduleComposition,{passive:true});
  function dispose(){if(disposed)return;disposed=true;observer.disconnect();layoutObserver.disconnect();resize.disconnect();win.cancelAnimationFrame(frame);win.removeEventListener('resize',scheduleComposition);for(const [name,[value,priority]]of variables){if(value)html.style.setProperty(name,value,priority);else html.style.removeProperty(name);}for(const [name,value]of attributes){if(value===null)html.removeAttribute(name);else html.setAttribute(name,value);}if(win[key]===api)delete win[key];}
  const api={getState:()=>({mode,scene:selected[mode],selected:{...selected},count:2,open:false,fixed:true,disposed,reading:{...reading}}),refresh,dispose};
  win[key]=api;refresh();context.addCleanup(dispose);return api;
}
