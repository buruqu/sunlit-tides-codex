/* Authored RGBA layers only. Vertex displacement never samples or moves the
   clean background; transparent pixels reveal that fixed background. */
function mountSunlitLayeredScene(context) {
  const { document: doc, window: win } = context;
  const html=doc.documentElement, key="__SUNLIT_LAYERED_SCENE__", options=context.config?.layeredScene || {};
  win[key]?.dispose?.();
  const media=win.matchMedia("(prefers-reduced-motion: reduce)");
  const attrs=["data-sunlit-layered-active","data-sunlit-layered-ready"];
  const previous=new Map(attrs.map(name=>[name,html.getAttribute(name)]));
  const finite=(n,f,a,b)=>Number.isFinite(n)?Math.max(a,Math.min(b,n)):f;
  const pair=(p,f,a,b)=>[0,1].map(i=>finite(p?.[i],f[i],a,b));
  const layers=(Array.isArray(options.layers)?options.layers:[]).slice(0,24).map(layer=>({
    asset:layer.asset, parent:typeof layer.parent==="string"?layer.parent:null, kind:["hair","cloth","body","rigid"].includes(layer.kind)?layer.kind:"rigid",
    pivot:pair(layer.pivot,[640,640],0,1280), radius:finite(layer.radius,500,20,1800),
    rotation:finite(layer.rotation,["hair","cloth"].includes(layer.kind)?.3:0,-.5,.5)*Math.PI/180,
    translation:pair(layer.translation,[0,0],-1,1), period:finite(layer.period,6,2,60), phase:finite(layer.phase,0,-100,100),
    blink:layer.blink===true || layer.asset===options.blinkLayer,
    bounds:Array.isArray(layer.bounds) && layer.bounds.length===4 && layer.bounds.every(Number.isFinite) && layer.bounds[2]>0 && layer.bounds[3]>0?layer.bounds.slice():[0,0,1280,1280]
  }));
  const blinkAsset=options.blinkAsset || (layers.some(layer=>layer.blink)?"orchard-blink":null);
  for(const layer of layers)layer.parentBody=layer.kind!=="body" && layer.parent?layers.find(parent=>parent.asset===layer.parent && parent.kind==="body") || null:null;
  const eyes=(options.eyes || [
    {center:[806/1280,315/1280],radius:[35/1280,23/1280],angle:-.55},
    {center:[750/1280,374/1280],radius:[27/1280,21/1280],angle:-.72}
  ]).slice(0,2).map(eye=>({center:pair(eye.center,[.63,.25],0,1),radius:pair(eye.radius,[.02,.012],.002,.05),angle:finite(eye.angle,0,-Math.PI,Math.PI)}));
  let canvas=null, main=null, gl=null, program=null, buffer=null, uniforms=null, renderer=null;
  let images=[], textures=new Map(), generation=0, disposed=false, failed=false, loaded=false, ready=false, active=false, paused=true;
  let reason="inactive", error=null, frame=0, timer=0, frames=0, width=0, height=0;
  let elapsed=0, clockStart=null, frozen=null, lastFrame=-Infinity, interactionDeadline=0, interactionTimer=0;
  let blinkEnabled=html.dataset.fusionLivingScene!=="false";
  const cover=new Float32Array(4), positions=[];
  function appendMesh(bounds,pivot,flex){
    // One source pixel of padding preserves LINEAR filtering at the alpha edge.
    // Coordinates remain in the full 1280px artwork coordinate system.
    const left=Math.max(0,Math.min(1280,bounds[0]-1)),top=Math.max(0,Math.min(1280,bounds[1]-1));
    const right=Math.max(left,Math.min(1280,bounds[0]+bounds[2]+1)),bottom=Math.max(top,Math.min(1280,bounds[1]+bounds[3]+1));
    const axis=(a,b,p)=>[...new Set([a,b,...(flex?[...Array.from({length:19},(_,i)=>(i+1)*64),p].filter(n=>n>a && n<b):[])])].sort((a,b)=>a-b);
    // Include the authored root exactly when it lies inside this layer's bbox.
    const xs=axis(left,right,pivot[0]),ys=axis(top,bottom,pivot[1]),first=positions.length/2;
    for(let y=0;y<ys.length-1;y++)for(let x=0;x<xs.length-1;x++)positions.push(xs[x],ys[y],xs[x+1],ys[y],xs[x],ys[y+1],xs[x],ys[y+1],xs[x+1],ys[y],xs[x+1],ys[y+1]);
    return {first,count:positions.length/2-first,bounds:[left,top,right-left,bottom-top]};
  }
  const baseMesh=appendMesh([0,0,1280,1280],[0,0],false);
  for(const layer of layers)layer.mesh=appendMesh(layer.bounds,layer.pivot,["hair","cloth"].includes(layer.kind));
  const setAttr=(name,value)=>{if(value===null){if(html.hasAttribute(name))html.removeAttribute(name);}else if(html.getAttribute(name)!==value)html.setAttribute(name,value);};
  function setReady(value){ready=value;setAttr(attrs[1],value?"true":null);if(canvas)canvas.hidden=!value;}
  function sceneTime(timestamp=win.performance.now()){return elapsed+(clockStart===null?0:Math.max(0,timestamp-clockStart)/1000);}
  function stop(){
    if(frame)win.cancelAnimationFrame(frame);if(timer)win.clearTimeout(timer);frame=timer=0;
    if(clockStart!==null){elapsed=sceneTime();clockStart=null;}lastFrame=-Infinity;
  }
  function clearInteraction(){if(interactionTimer)win.clearTimeout(interactionTimer);interactionTimer=0;interactionDeadline=0;}
  function resumeInteraction(){interactionTimer=0;if(disposed)return;const wait=interactionDeadline-win.performance.now();if(wait>0){interactionTimer=win.setTimeout(resumeInteraction,wait);return;}interactionDeadline=0;refresh();}
  function interaction(){if(disposed || !active || !ready)return;interactionDeadline=win.performance.now()+220;stop();paused=true;reason="interaction";if(interactionTimer)win.clearTimeout(interactionTimer);interactionTimer=win.setTimeout(resumeInteraction,220);}
  const resize=new win.ResizeObserver(entries=>{const entry=entries.find(item=>item.target===main);if(entry){measure(entry);refresh();}});
  const parentObserver=new win.MutationObserver(()=>{if(main && !main.isConnected)refresh();});
  let discoveringMain=false;
  const discoveryObserver=new win.MutationObserver(()=>{
    if(disposed || !discoveringMain)return;
    if(doc.querySelector('main[data-tessalume-surface="main"]')){stopDiscovery();refresh();}
  });
  function stopDiscovery(){discoveryObserver.disconnect();discoveringMain=false;}
  function discoverMain(){
    if(discoveringMain || disposed)return;
    // Route transitions may insert the replacement main in a later task without
    // changing html attributes. Only watch the document subtree while absent.
    discoveringMain=true;discoveryObserver.observe(doc.body || html,{childList:true,subtree:true});
  }
  function release(){
    stop();clearInteraction();generation++;resize.disconnect();parentObserver.disconnect();stopDiscovery();
    for(const image of images){image.onload=image.onerror=null;image.removeAttribute("src");}images=[];
    if(canvas)canvas.removeEventListener("webglcontextlost",lost);
    if(gl){for(const texture of textures.values())gl.deleteTexture(texture);if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);gl.getExtension("WEBGL_lose_context")?.loseContext();}
    textures.clear();canvas?.remove();canvas=main=gl=program=buffer=uniforms=null;loaded=false;width=height=0;setReady(false);
  }
  function fail(message){error=String(message);failed=true;paused=true;reason="error";release();}
  function lost(event){event.preventDefault();fail("webgl-context-lost");}
  const vertexSource=`attribute vec2 aPosition; varying vec2 vUv;
    uniform vec4 uCover; uniform vec2 uPivot; uniform vec2 uTranslation;
    uniform float uAngle; uniform float uRadius; uniform int uKind;
    void main(){
      vUv=aPosition/1280.0;
      vec2 d=aPosition-uPivot;
      float weight=uKind==2?smoothstep(0.04,1.0,length(d)/uRadius):1.0;
      float angle=uAngle*weight;
      vec2 p=uPivot+vec2(cos(angle)*d.x-sin(angle)*d.y,sin(angle)*d.x+cos(angle)*d.y)+uTranslation;
      vec2 viewport=(p/1280.0-uCover.zw)/uCover.xy;
      gl_Position=vec4(viewport.x*2.0-1.0,1.0-viewport.y*2.0,0.0,1.0);
    }`;
  const fragmentSource=`precision highp float; varying vec2 vUv;
    uniform sampler2D uImage; uniform sampler2D uBlink; uniform float uBlinkAmount;
    uniform vec4 uEyes[2]; uniform vec2 uEyeAngles; uniform int uEyeCount;
    void main(){
      vec4 original=texture2D(uImage,vUv); if(original.a<0.001)discard;
      if(uBlinkAmount<=0.0){gl_FragColor=original;return;}
      float mask=0.0;
      for(int i=0;i<2;i++){if(i>=uEyeCount)break;vec4 e=uEyes[i];float a=uEyeAngles[i];vec2 d=(vUv-e.xy)*1280.0;
        vec2 q=vec2(cos(a)*d.x+sin(a)*d.y,-sin(a)*d.x+cos(a)*d.y);mask=max(mask,1.0-smoothstep(.72,1.0,length(q/(e.zw*1280.0))));}
      vec4 closed=texture2D(uBlink,vUv);
      gl_FragColor=vec4(mix(original.rgb,closed.rgb*original.a,mask*uBlinkAmount),original.a);
    }`;
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(message || "shader-compile");}return s;}
  function createRenderer(){
    let vertex=null,fragment=null;
    try{
      const settings={alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false};
      gl=canvas.getContext("webgl2",settings);renderer=gl?"webgl2":"webgl";if(!gl)gl=canvas.getContext("webgl",settings);if(!gl)throw new Error("webgl-unavailable");
      const is2=renderer==="webgl2";
      vertex=shader(gl.VERTEX_SHADER,is2?"#version 300 es\n"+vertexSource.replace("attribute","in").replace("varying","out"):vertexSource);
      fragment=shader(gl.FRAGMENT_SHADER,is2?"#version 300 es\n"+fragmentSource.replace("varying vec2 vUv;","in vec2 vUv; out vec4 outColor;").replaceAll("gl_FragColor","outColor").replaceAll("texture2D","texture"):fragmentSource);
      program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program) || "shader-link");
      gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(positions),gl.STATIC_DRAW);
      const attribute=gl.getAttribLocation(program,"aPosition");gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
      uniforms=Object.fromEntries(["uCover","uPivot","uTranslation","uAngle","uRadius","uKind","uImage","uBlink","uBlinkAmount","uEyes[0]","uEyeAngles","uEyeCount"].map(name=>[name,gl.getUniformLocation(program,name)]));
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.uniform1i(uniforms.uImage,0);gl.uniform1i(uniforms.uBlink,1);
      gl.uniform4fv(uniforms["uEyes[0]"],new Float32Array([...eyes.flatMap(e=>[...e.center,...e.radius]),...Array((2-eyes.length)*4).fill(0)]));
      gl.uniform2fv(uniforms.uEyeAngles,new Float32Array([eyes[0]?.angle || 0,eyes[1]?.angle || 0]));gl.uniform1i(uniforms.uEyeCount,eyes.length);
      return true;
    }catch(exception){fail(exception.message);return false;}
    finally{if(gl && vertex)gl.deleteShader(vertex);if(gl && fragment)gl.deleteShader(fragment);}
  }
  function upload(asset,image){
    const texture=gl.createTexture();textures.set(asset,texture);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
  }
  function loadAssets(){
    const assets=[...new Set([options.baseAsset || "orchard-clean-plate",...layers.map(layer=>layer.asset),...(blinkAsset?[blinkAsset]:[])])],token=++generation;
    if(!layers.length || assets.some(asset=>typeof asset!=="string" || !asset)){fail("layer-config-invalid");return;}
    let complete=0;
    for(const asset of assets){
      if(token!==generation)return;
      let source="";try{source=context.assetDataUrl?.(asset) || context.assets?.[asset] || "";}catch{}
      if(!source){fail("artwork-unavailable:"+asset);return;}
      const image=new win.Image();image.decoding="async";images.push(image);
      image.onload=()=>{
        if(disposed || token!==generation || !gl)return;
        if(image.naturalWidth!==1280 || image.naturalHeight!==1280){fail("artwork-dimensions-mismatch:"+asset);return;}
        try{upload(asset,image);complete++;if(complete===assets.length){loaded=true;measure();refresh();}}catch(exception){fail(exception.message);}
      };
      image.onerror=()=>{if(token===generation)fail("artwork-load-failed:"+asset);};image.src=source;
    }
  }
  function measure(entry){
    if(!canvas || !main)return;if(!main.isConnected){refresh();return;}
    const box=entry?.contentRect || main.getBoundingClientRect();width=Math.max(0,box.width);height=Math.max(0,box.height);
    if(!width || !height){stop();paused=true;reason="zero-size";setReady(false);return;}
    const ratio=Math.min(1,win.devicePixelRatio || 1,Math.sqrt(1920*1080/(width*height)))*finite(options.resolutionScale,1,.25,1);
    const w=Math.max(1,Math.floor(width*ratio)),h=Math.max(1,Math.floor(height*ratio));if(canvas.width!==w || canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
    const scale=Math.max(width/1280,height/1280);cover[0]=width/(1280*scale);cover[1]=height/(1280*scale);cover[2]=(1-cover[0])*.5;cover[3]=(1-cover[1])*.32;
    if(loaded)draw(frozen===null?sceneTime():frozen);
  }
  function mount(node){main=node;canvas=doc.createElement("canvas");canvas.className="sunlit-layered-scene";canvas.dataset.fusionUi="layered-scene";canvas.setAttribute("aria-hidden","true");canvas.hidden=true;main.prepend(canvas);canvas.addEventListener("webglcontextlost",lost);if(!createRenderer())return;resize.observe(main);if(main.parentNode)parentObserver.observe(main.parentNode,{childList:true});measure();loadAssets();}
  function blinkAmount(time){const p=(time+1.3)%5.6,s=(a,b,x)=>{const n=Math.max(0,Math.min(1,(x-a)/(b-a)));return n*n*(3-2*n);};return s(0,.10,p)*(1-s(.18,.30,p));}
  function drawLayer(layer,time,base=false){
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures.get(layer.asset));
    const wave=base?0:Math.sin(time*2*Math.PI/layer.period+layer.phase),flex=layer.kind==="hair" || layer.kind==="cloth";
    gl.uniform2fv(uniforms.uPivot,layer.pivot || [0,0]);gl.uniform1f(uniforms.uRadius,layer.radius || 500);gl.uniform1i(uniforms.uKind,flex?2:1);
    gl.uniform1f(uniforms.uAngle,base || layer.kind==="body"?0:layer.rotation*wave);
    // One-level parent body translation is shared exactly with its children.
    // Flex is still evaluated in artwork coordinates before that shared shift.
    const parent=layer.parentBody;
    const parentWave=parent?Math.sin(time*2*Math.PI/parent.period+parent.phase):0;
    gl.uniform2f(uniforms.uTranslation,(base || flex?0:layer.translation[0]*wave)+(parent?parent.translation[0]*parentWave:0),(base || flex?0:layer.translation[1]*wave)+(parent?parent.translation[1]*parentWave:0));
    gl.uniform1f(uniforms.uBlinkAmount,!base && layer.blink && blinkAsset && blinkEnabled?blinkAmount(time):0);
    const mesh=base?baseMesh:layer.mesh;gl.drawArrays(gl.TRIANGLES,mesh.first,mesh.count);
  }
  function draw(time){
    if(!loaded || !gl || !width || !height)return false;
    gl.uniform4fv(uniforms.uCover,cover);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,textures.get(blinkAsset) || textures.get(options.baseAsset || "orchard-clean-plate"));
    gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);drawLayer({asset:options.baseAsset || "orchard-clean-plate"},time,true);for(const layer of layers)drawLayer(layer,time);frames++;return true;
  }
  const hasMotion=()=>layers.some(layer=>layer.rotation!==0 && layer.kind!=="body" || !["hair","cloth"].includes(layer.kind) && layer.translation.some(n=>n!==0) || layer.blink && blinkAsset && blinkEnabled);
  function schedule(){if(disposed || paused || frozen!==null || frame || timer || !hasMotion())return;timer=win.setTimeout(()=>{timer=0;frame=win.requestAnimationFrame(tick);},Math.max(0,1000/24-(win.performance.now()-lastFrame)));}
  function tick(timestamp){frame=0;if(disposed || paused || frozen!==null)return;if(!main?.isConnected){refresh();return;}if(timestamp-lastFrame>=1000/24){lastFrame=timestamp;draw(sceneTime(timestamp));}schedule();}
  function nativeCompatibility(mode){
    const style=win.getComputedStyle(html),prefix=`--tessalume-visual-chat-${mode}-`,value=name=>style.getPropertyValue(prefix+name).trim();
    const geometry=value("geometry-transform"),scale=value("scale"),translate=value("translate"),size=value("background-size"),repeat=value("background-repeat");
    if(geometry && geometry!=="none")return "native-geometry";if(scale && Number(scale)!==1)return "native-scale";if(translate && !/^(?:0(?:px)?\s+){0,2}0(?:px)?$/.test(translate))return "native-translate";if(size && size!=="cover")return "native-background-size";if(repeat && repeat!=="no-repeat")return "native-background-repeat";
    if(html.dataset.sunlitWallpaperOwner==="workbench" || doc.getElementById("tessalume-artwork-motion-style")?.textContent.includes(`tessalume-artwork-chat-${mode}-full`))return "native-animation";
    const position=style.getPropertyValue("--sgk-scene-position").trim();return position && position!=="50% 32%"?"scene-position":null;
  }
  function refresh(){
    if(disposed)return;
    const blinkChanged=blinkEnabled!==(html.dataset.fusionLivingScene!=="false");blinkEnabled=html.dataset.fusionLivingScene!=="false";
    const enabled=html.dataset.fusionLayeredScene===undefined?options.enabled===true:html.dataset.fusionLayeredScene==="true";
    const requested=enabled && ["sgk-theme","tessalume-theme-active","tessalume-is-task"].every(name=>html.classList.contains(name)) && html.dataset.sgkScene==="orchard";
    if(!requested){active=false;setAttr(attrs[0],null);paused=true;reason="inactive";if(canvas)release();else stopDiscovery();return;}
    const mode=html.dataset.theme==="dark" || !html.hasAttribute("data-theme") && html.classList.contains("electron-dark")?"dark":"light",incompatible=nativeCompatibility(mode);
    active=!incompatible;setAttr(attrs[0],active?"true":null);
    const guard=failed?"error":incompatible || (doc.hidden?"hidden":media.matches?"reduced-motion":html.dataset.fusionFocus==="true" || context.root?.getAttribute("data-fusion-focus")==="true"?"focus":html.dataset.fusionReducedMotion==="true" || ["off","reduced"].includes(html.dataset.tessalumeMotion)?"reduced-motion":null);
    if(guard){paused=true;reason=guard;release();return;}
    const next=main?.isConnected?main:doc.querySelector('main[data-tessalume-surface="main"]');if(!next){paused=true;reason="no-main";if(canvas)release();discoverMain();return;}
    stopDiscovery();
    if(next!==main){if(canvas)release();mount(next);}if(failed)return;
    if(!loaded || !width || !height){paused=true;reason=loaded?"zero-size":"loading";return;}
    if(ready && interactionDeadline>win.performance.now()){if(blinkChanged)draw(frozen===null?sceneTime():frozen);paused=true;reason="interaction";stop();return;}
    const opacity=win.getComputedStyle(main,"::before").opacity;if(canvas.style.opacity!==opacity)canvas.style.opacity=opacity;
    paused=false;reason=frozen===null?"running":"frozen";if(!ready || blinkChanged){draw(frozen===null?sceneTime():frozen);setReady(true);}if(!hasMotion())stop();else if(frozen===null){if(clockStart===null)clockStart=win.performance.now();schedule();}
  }
  const observer=new win.MutationObserver(refresh);
  observer.observe(html,{attributes:true,attributeFilter:["class","style","data-theme","data-sgk-scene","data-fusion-layered-scene","data-fusion-living-scene","data-fusion-focus","data-fusion-reduced-motion","data-tessalume-motion","data-tessalume-visual-placement","data-sunlit-wallpaper-owner"]});
  if(context.root && context.root!==html)observer.observe(context.root,{attributes:true,attributeFilter:["data-fusion-focus"]});
  doc.addEventListener("visibilitychange",refresh);media.addEventListener("change",refresh);for(const type of ["input","wheel","scroll"])doc.addEventListener(type,interaction,{capture:true,passive:true});
  function dispose(){if(disposed)return;disposed=true;paused=true;reason="disposed";observer.disconnect();doc.removeEventListener("visibilitychange",refresh);media.removeEventListener("change",refresh);for(const type of ["input","wheel","scroll"])doc.removeEventListener(type,interaction,true);release();for(const [name,value]of previous){if(value===null)html.removeAttribute(name);else html.setAttribute(name,value);}if(win[key]===api)delete win[key];}
  function getState(){return {renderer,frames,paused,ready,active,reason,error,disposed,loaded,layers:layers.length,blinkReady:loaded && !!blinkAsset,blinkEnabled,layerMeshes:layers.map(layer=>({asset:layer.asset,vertices:layer.mesh.count,bounds:layer.mesh.bounds.slice()})),motionKind:"alpha-layers",width:canvas?.width || 0,height:canvas?.height || 0,loopScheduled:!!frame || !!timer,rafScheduled:!!frame,timerScheduled:!!timer,interactionScheduled:!!interactionTimer,discoveringMain,time:frozen===null?sceneTime():frozen};}
  const api={getState,refresh,dispose,freezeTime(value){stop();frozen=Number.isFinite(value)?Math.max(0,value):null;if(frozen!==null && ready)draw(frozen);refresh();return getState();}};
  win[key]=api;context.addCleanup?.(dispose);refresh();return dispose;
}
