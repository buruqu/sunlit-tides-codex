/* Two authored scenes follow Codex appearance; no gallery overlay or DOM scanning. */
function mountSunlitGallery(context) {
  const {window:win,document:doc}=context,html=doc.documentElement,key='__SUNLIT_GALLERY__';
  win[key]?.dispose?.();
  const variables=new Map(),attributes=new Map();let disposed=false,mode='',reading={};
  const selected={light:'orchard',dark:'night'};
  const style=(name,value)=>{if(!variables.has(name))variables.set(name,[html.style.getPropertyValue(name),html.style.getPropertyPriority(name)]);if(html.style.getPropertyValue(name)!==value)html.style.setProperty(name,value);};
  const attr=(name,value)=>{if(!attributes.has(name))attributes.set(name,html.getAttribute(name));if(html.getAttribute(name)!==value)html.setAttribute(name,value);};
  const tint=(hex,base)=>'#'+hex.slice(1).match(/../g).map((s,i)=>Math.round(parseInt(s,16)*.2+parseInt(base.slice(1+i*2,3+i*2),16)*.8).toString(16).padStart(2,'0')).join('');
  function refresh(){
    if(disposed)return;
    const next=html.getAttribute('data-theme')==='dark'||(!html.hasAttribute('data-theme')&&html.classList.contains('electron-dark'))?'dark':'light';
    if(mode===next)return;mode=next;const dark=mode==='dark',scene=selected[mode];
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
  function dispose(){if(disposed)return;disposed=true;observer.disconnect();for(const [name,[value,priority]]of variables){if(value)html.style.setProperty(name,value,priority);else html.style.removeProperty(name);}for(const [name,value]of attributes){if(value===null)html.removeAttribute(name);else html.setAttribute(name,value);}if(win[key]===api)delete win[key];}
  const api={getState:()=>({mode,scene:selected[mode],selected:{...selected},count:2,open:false,fixed:true,disposed,reading:{...reading}}),refresh,dispose};
  win[key]=api;refresh();context.addCleanup(dispose);return api;
}
