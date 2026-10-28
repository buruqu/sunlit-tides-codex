/* A background attaches beneath native controls without moving or hiding them. */
function createSunlitSurfaceBackground({window:win,document:doc}) {
  const entries=new Map();
  function render(items){
    const keep=new Set();
    for(const {layer,node} of items){
      if(!node||layer.enabled===false||!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(layer.source||''))continue;
      keep.add(layer.id);let e=entries.get(layer.id);
      if(e&&e.parent!==node){e.host.remove();entries.delete(layer.id);e=null;}
      if(!e){const host=doc.createElement('div'),image=doc.createElement('img');host.dataset.sunlitDiyOwned='';host.dataset.sunlitRegionBackground=layer.id;host.setAttribute('aria-hidden','true');host.style.cssText='position:absolute;inset:0;overflow:hidden;border-radius:inherit;pointer-events:none;z-index:-1;';image.alt='';image.draggable=false;image.style.cssText='position:absolute;pointer-events:none;max-width:none;max-height:none;';host.append(image);node.prepend(host);e={host,image,parent:node};entries.set(layer.id,e);}
      const r=node.getBoundingClientRect(),l=layer.followRegion?{...layer,x:r.left/win.innerWidth*100,y:r.top/win.innerHeight*100,width:r.width/win.innerWidth*100,height:r.height/win.innerHeight*100}:layer;e.image.src=l.source;
      Object.assign(e.image.style,{left:(l.x*win.innerWidth/100-r.left)+'px',top:(l.y*win.innerHeight/100-r.top)+'px',width:(l.width*win.innerWidth/100)+'px',height:(l.height*win.innerHeight/100)+'px',objectFit:l.fit==='contain'?'contain':'cover',opacity:String(l.opacity/100),filter:`blur(${l.blur||0}px)`,transform:`rotate(${l.rotation||0}deg) scaleX(${l.flipX?-1:1})`});
    }
    for(const [id,e]of entries)if(!keep.has(id)){e.host.remove();entries.delete(id);}
  }
  return {render,dispose(){for(const e of entries.values())e.host.remove();entries.clear();}};
}
