/* Blink-only artwork. No body, hair, shoulder, or background coordinates move;
   the original image remains authoritative outside the two eye masks. */
function mountSunlitLivingScene(context) {
  const { document: doc, window: win } = context;
  const html = doc.documentElement, key = "__SUNLIT_LIVING_SCENE__";
  win[key]?.dispose?.();
  const options = context.config?.livingScene || {};
  const media = win.matchMedia("(prefers-reduced-motion: reduce)");
  const attributes = ["data-sunlit-living-active", "data-sunlit-living-ready"];
  const previous = new Map(attributes.map(name => [name, html.getAttribute(name)]));
  const defaultEyes = [
    { center: [806/1280,315/1280], radius: [35/1280,23/1280], angle: -.55 },
    { center: [750/1280,374/1280], radius: [27/1280,21/1280], angle: -.72 }
  ];
  const finite = (value, fallback, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const pair = (value, fallback, min, max) => [0,1].map(i => finite(value?.[i], fallback[i], min, max));
  // Whole-image UV deformation was removed after visible shoulder/armpit distortion.
  // Older config.regions is intentionally ignored. Only authored eye keyframes animate.
  const eyes = (options.blink === false ? [] : Array.isArray(options.eyes) ? options.eyes : defaultEyes).slice(0,2).map(eye => ({
    center: pair(eye?.center, [.63,.25], 0, 1), radius: pair(eye?.radius, [.02,.012], .002, .05),
    angle: finite(eye?.angle, 0, -Math.PI, Math.PI)
  }));
  let disposed = false, canvas = null, main = null, gl = null, program = null, buffer = null, texture = null, blinkTexture = null;
  let image = null, blinkImage = null, generation = 0, failed = false, loaded = false, blinkReady = false, blinkError = null, frame = 0, frames = 0;
  let width = 0, height = 0, imageWidth = 1280, imageHeight = 1280, lastFrame = -Infinity;
  let elapsed = 0, clockStart = null, frozen = null, renderer = null, uniforms = null;
  let interactionDeadline = 0, interactionTimer = 0;
  let paused = true, ready = false, reason = "inactive", error = null, active = false;
  const cover = new Float32Array(4);
  let lastBlinkAmount = null, blinkTimer = 0;
  const eyeData = new Float32Array(2*4), eyeAngles = new Float32Array(2);
  const setAttr = (name, value) => { if (value === null) { if (html.hasAttribute(name)) html.removeAttribute(name); } else if (html.getAttribute(name) !== value) html.setAttribute(name, value); };
  function setReady(value) {
    ready = value;
    setAttr(attributes[1], value ? "true" : null);
    if (canvas && canvas.hidden === value) canvas.hidden = !value;
  }
  function stop() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    if(blinkTimer)win.clearTimeout(blinkTimer);blinkTimer=0;
    if (clockStart !== null) { elapsed += Math.max(0, win.performance.now() - clockStart)/1000; clockStart = null; }
    lastFrame = -Infinity;
  }
  function clearInteraction() {
    if(interactionTimer)win.clearTimeout(interactionTimer);
    interactionTimer=0;interactionDeadline=0;
  }
  function resumeAfterInteraction() {
    interactionTimer=0;
    if(disposed)return;
    const remaining=interactionDeadline-win.performance.now();
    if(remaining>0) { interactionTimer=win.setTimeout(resumeAfterInteraction,remaining);return; }
    interactionDeadline=0;refresh();
  }
  function interaction() {
    if(disposed || !active || !ready)return;
    interactionDeadline=win.performance.now()+220;
    if(reason!=="interaction") { stop();paused=true;reason="interaction"; }
    if(interactionTimer)win.clearTimeout(interactionTimer);
    interactionTimer=win.setTimeout(resumeAfterInteraction,220);
  }
  function release() {
    stop();clearInteraction();generation++;
    if (image) { image.onload = null; image.onerror = null; image.removeAttribute("src"); image = null; }
    if (blinkImage) { blinkImage.onload = null; blinkImage.onerror = null; blinkImage.removeAttribute("src"); blinkImage = null; }
    resize.disconnect();
    if (gl) {
      if (texture) gl.deleteTexture(texture);
      if (blinkTexture) gl.deleteTexture(blinkTexture);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      // Explicitly relinquish the drawing buffer when this scene leaves.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
    if (canvas) { canvas.removeEventListener("webglcontextlost", lost); canvas.remove(); }
    canvas = main = gl = program = buffer = texture = blinkTexture = uniforms = null;
    loaded = blinkReady = false;lastBlinkAmount=null;width = height = 0; setReady(false);
  }
  function fail(message) {
    error = String(message); failed = true; paused = true; reason = "error"; release();
  }
  function lost(event) {
    event.preventDefault();
    fail("webgl-context-lost"); // Permanent fallback for this mount; no retry loop.
  }
  const vertexSource = "attribute vec2 aPosition; varying vec2 vUv; void main(){vUv=vec2((aPosition.x+1.0)*0.5,(1.0-aPosition.y)*0.5);gl_Position=vec4(aPosition,0.0,1.0);}";
  const fragmentSource = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uImage;
    uniform sampler2D uBlinkImage;
    uniform float uBlinkReady;
    uniform vec4 uCover;
    uniform vec2 uImageSize;
    uniform float uTime;
    uniform int uEyeCount;
    uniform vec4 uEyes[2];
    uniform float uEyeAngles[2];
    float blink(float t){
      float p=mod(t+1.3,5.6);
      return smoothstep(0.0,0.10,p)*(1.0-smoothstep(0.18,0.30,p));
    }
    void main(){
      vec2 p=vUv*uCover.xy+uCover.zw;
      vec2 uv=p; // Every non-eye source coordinate remains exactly fixed.
      float eyeMask=0.0;
      for(int i=0;i<2;i++){
        if(i>=uEyeCount)break;
        vec4 e=uEyes[i];float a=uEyeAngles[i];
        vec2 delta=(p-e.xy)*uImageSize;
        vec2 q=vec2(cos(a)*delta.x+sin(a)*delta.y,-sin(a)*delta.x+cos(a)*delta.y);
        vec2 radius=e.zw*uImageSize;
        eyeMask=max(eyeMask,1.0-smoothstep(.72,1.0,length(q/radius)));
      }
      vec2 halfPixel=.5/uImageSize;
      uv=clamp(uv,halfPixel,vec2(1.0)-halfPixel);
      vec4 original=texture2D(uImage,uv);
      vec4 closedEyes=texture2D(uBlinkImage,uv);
      gl_FragColor=mix(original,closedEyes,eyeMask*blink(uTime)*uBlinkReady);
    }`;
  function shader(type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result, source); gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) { const message = gl.getShaderInfoLog(result); gl.deleteShader(result); throw new Error(message || "shader-compile"); }
    return result;
  }
  function createRenderer() {
    let vertex = null, fragment = null;
    try {
      // GLSL 1.00 also runs on WebGL 1 for machines without WebGL 2.
      gl = canvas.getContext("webgl2", { alpha:false, antialias:false, depth:false, stencil:false, preserveDrawingBuffer:false });
      renderer = gl ? "webgl2" : "webgl";
      if (!gl) gl = canvas.getContext("webgl", { alpha:false, antialias:false, depth:false, stencil:false, preserveDrawingBuffer:false });
      if (!gl) throw new Error("webgl-unavailable");
      const is2 = renderer === "webgl2";
      const vs = is2 ? "#version 300 es\n" + vertexSource.replace("attribute", "in").replace("varying", "out") : vertexSource;
      const fs = is2 ? "#version 300 es\n" + fragmentSource.replace("varying vec2 vUv;", "in vec2 vUv; out vec4 outColor;").replace("gl_FragColor", "outColor").replaceAll("texture2D", "texture") : fragmentSource;
      vertex = shader(gl.VERTEX_SHADER, vs); fragment = shader(gl.FRAGMENT_SHADER, fs);
      program = gl.createProgram(); gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "shader-link");
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "aPosition");
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      uniforms = Object.fromEntries(["uImage","uBlinkImage","uBlinkReady","uCover","uImageSize","uTime","uEyeCount","uEyes[0]","uEyeAngles[0]"].map(name => [name, gl.getUniformLocation(program,name)]));
      texture = createTexture(gl.TEXTURE0); blinkTexture = createTexture(gl.TEXTURE1);
      // A complete one-pixel placeholder keeps the optional sampler valid on
      // WebGL 1 too. No secondary image means zero contribution, never UV warp.
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
      gl.uniform1i(uniforms.uImage,0); gl.uniform1i(uniforms.uBlinkImage,1); gl.uniform1f(uniforms.uBlinkReady,0);
      return true;
    } catch (exception) { fail(exception.message); return false; }
    finally { if (gl && vertex) gl.deleteShader(vertex); if (gl && fragment) gl.deleteShader(fragment); }
  }
  function createTexture(unit) {
    const result=gl.createTexture();gl.activeTexture(unit);gl.bindTexture(gl.TEXTURE_2D,result);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    return result;
  }
  function loadBlink(token) {
    if(!eyes.length)return;
    let source="";
    try { source=context.assetDataUrl?.("orchard-blink") || context.assets?.["orchard-blink"] || ""; }
    catch { blinkError="blink-artwork-unavailable";return; }
    if(!source)return;
    blinkImage=new win.Image();blinkImage.decoding="async";
    blinkImage.onload=()=>{
      if(disposed || token!==generation || !gl)return;
      if(blinkImage.naturalWidth!==imageWidth || blinkImage.naturalHeight!==imageHeight){blinkError="blink-dimensions-mismatch";return;}
      try {
        gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,blinkTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,blinkImage);
        blinkReady=true;gl.uniform1f(uniforms.uBlinkReady,1);
        if(frozen!==null && ready)draw(frozen);
        refresh();
      } catch { blinkError="blink-upload-failed"; }
    };
    blinkImage.onerror=()=>{if(token===generation)blinkError="blink-artwork-load-failed";};
    blinkImage.src=source;
  }
  function upload() {
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    imageWidth = image.naturalWidth; imageHeight = image.naturalHeight;
    eyes.forEach((eye,i) => { eyeData.set([...eye.center,...eye.radius],i*4); eyeAngles[i]=eye.angle; });
    gl.uniform1i(uniforms.uEyeCount,eyes.length); gl.uniform4fv(uniforms["uEyes[0]"],eyeData); gl.uniform1fv(uniforms["uEyeAngles[0]"],eyeAngles);
    gl.uniform2f(uniforms.uImageSize,imageWidth,imageHeight);
    loaded = true; measure(); refresh();
  }
  function measure(entry) {
    if (!canvas || !main) return;
    if(!main.isConnected){reason="unmounted";paused=true;active=false;setAttr(attributes[0],null);release();return;}
    const box = entry?.contentRect || main.getBoundingClientRect();
    width = Math.max(0,box.width); height = Math.max(0,box.height);
    if (!width || !height) { stop(); paused=true; reason="zero-size"; setReady(false); return; }
    const dpr = Math.min(1,win.devicePixelRatio || 1) * finite(options.resolutionScale,1,.25,1);
    const ratio = Math.min(dpr,Math.sqrt((1920*1080)/(width*height)));
    const w = Math.max(1,Math.floor(width*ratio)), h = Math.max(1,Math.floor(height*ratio));
    if (canvas.width!==w || canvas.height!==h) { canvas.width=w; canvas.height=h; gl?.viewport(0,0,w,h);lastBlinkAmount=null; }
    const scale = Math.max(width/imageWidth,height/imageHeight);
    cover[0]=width/(imageWidth*scale); cover[1]=height/(imageHeight*scale);
    cover[2]=(1-cover[0])*.5; cover[3]=(1-cover[1])*.32;
    if (loaded) {gl.uniform4fv(uniforms.uCover,cover);draw(frozen===null?sceneTime():frozen);}
  }
  const resize = new win.ResizeObserver(entries => {
    const entry=entries.find(item => item.target===main);
    if (entry) { measure(entry); if(reason!=="unmounted")refresh(); }
  });
  function mount(mainNode) {
    main=mainNode;
    blinkReady=false;blinkError=null;
    canvas=doc.createElement("canvas"); canvas.className="sunlit-living-scene";
    canvas.dataset.fusionUi="living-scene"; canvas.setAttribute("aria-hidden","true"); canvas.hidden=true;
    main.prepend(canvas); canvas.addEventListener("webglcontextlost",lost);
    if (!createRenderer()) return;
    resize.observe(main); measure();
    let source="";
    try { source=context.assetDataUrl?.("duo-orchard") || context.assets?.["duo-orchard"] || ""; } catch { /* Fall back to original CSS image. */ }
    if (!source) { fail("artwork-unavailable"); return; }
    const token=++generation;
    image=new win.Image(); image.decoding="async";
    image.onload=()=>{ if(disposed || token!==generation || !gl)return; try { upload();loadBlink(token); } catch(exception) { fail(exception.message); } };
    image.onerror=()=>{ if(token===generation)fail("artwork-load-failed"); };
    image.src=source;
  }
  function nativeCompatibility(mode) {
    const style=win.getComputedStyle(html), prefix=`--tessalume-visual-chat-${mode}-`;
    const value=name=>style.getPropertyValue(prefix+name).trim();
    const geometry=value("geometry-transform"), scale=value("scale"), translate=value("translate");
    const backgroundSize=value("background-size"), repeat=value("background-repeat");
    if (geometry && geometry!=="none") return "native-geometry";
    if (scale && Number(scale)!==1) return "native-scale";
    if (translate && !/^(?:0(?:px)?\s+){0,2}0(?:px)?$/.test(translate)) return "native-translate";
    if (backgroundSize && backgroundSize!=="cover") return "native-background-size";
    if (repeat && repeat!=="no-repeat") return "native-background-repeat";
    if (html.dataset.sunlitWallpaperOwner==="workbench" || doc.getElementById("tessalume-artwork-motion-style")?.textContent.includes(`tessalume-artwork-chat-${mode}-full`)) return "native-animation";
    const position=style.getPropertyValue("--sgk-scene-position").trim();
    if (position && position!=="50% 32%") return "scene-position";
    return null;
  }
  function sceneTime(timestamp=win.performance.now()){return elapsed+(clockStart===null?0:Math.max(0,timestamp-clockStart)/1000);}
  function scheduleTick(timestamp=win.performance.now()){
    if(disposed || paused || frozen!==null || !blinkReady || !eyes.length || frame || blinkTimer)return;
    const phase=(sceneTime(timestamp)+1.3)%5.6;
    if(phase>=.30 && lastBlinkAmount===0){
      blinkTimer=win.setTimeout(()=>{blinkTimer=0;tick(win.performance.now());},(5.6-phase)*1000+4);
    }else frame=win.requestAnimationFrame(tick);
  }
  function blinkAmount(time) {
    if(!blinkReady || !eyes.length)return 0;
    const phase=(time+1.3)%5.6;
    const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
    return smooth(0,.10,phase)*(1-smooth(.18,.30,phase));
  }
  function draw(time) {
    if (!loaded || !gl || !width || !height) return false;
    gl.uniform1f(uniforms.uTime,time); gl.drawArrays(gl.TRIANGLES,0,6); frames++;
    lastBlinkAmount=blinkAmount(time);
    return true;
  }
  function tick(timestamp) {
    frame=0;
    if (disposed || paused || frozen!==null) return;
    if (!main?.isConnected) { reason="unmounted"; paused=true; active=false; setAttr(attributes[0],null); release(); return; }
    if (timestamp-lastFrame>=1000/24) {
      lastFrame=timestamp;
      const time=sceneTime(timestamp);
      // Between blinks preserve the existing GPU surface instead of redrawing it.
      if(blinkAmount(time)!==lastBlinkAmount)draw(time);
    }
    scheduleTick(timestamp);
  }
  function refresh() {
    if(disposed)return;
    const enabled=html.dataset.fusionLivingScene===undefined?options.enabled===true:html.dataset.fusionLivingScene==="true";
    const task=html.classList.contains("tessalume-is-task") && html.classList.contains("tessalume-theme-active") && html.classList.contains("sgk-theme");
    const requested=enabled && task && html.dataset.sgkScene==="orchard" && html.dataset.sunlitLayeredReady!=="true";
    if (!requested) { active=false;setAttr(attributes[0],null);paused=true;reason="inactive";clearInteraction();if(canvas)release();return; }
    const mode=html.dataset.theme==="dark" || (!html.hasAttribute("data-theme") && html.classList.contains("electron-dark"))?"dark":"light";
    const incompatible=nativeCompatibility(mode);
    // Only claim the artwork layer after checking native ownership. Otherwise
    // the CSS takeover guard itself would suppress an authored native loop.
    active=!incompatible;
    setAttr(attributes[0],active?"true":null);
    const pauseReason=failed?"error":incompatible || (doc.hidden?"hidden":media.matches?"reduced-motion":
      html.dataset.fusionFocus==="true" || context.root?.getAttribute("data-fusion-focus")==="true"?"focus":
      html.dataset.fusionReducedMotion==="true" || ["off","reduced"].includes(html.dataset.tessalumeMotion)?"reduced-motion":null);
    if(pauseReason) { clearInteraction();paused=true;reason=pauseReason;stop();setReady(false);if(incompatible && canvas)release();return; }
    const next=main?.isConnected?main:doc.querySelector('main[data-tessalume-surface="main"]');
    if(!next) { paused=true; reason="no-main"; if(canvas)release(); return; }
    if(next!==main) { if(canvas)release(); mount(next); }
    if(failed)return;
    if(!loaded || !width || !height) { paused=true; reason=loaded?"zero-size":"loading"; return; }
    // Settings refreshes during interaction retain the current composited
    // frame too. Higher-priority lifecycle guards above still restore static.
    if(ready && interactionDeadline>win.performance.now()) { paused=true;reason="interaction";stop();return; }
    // Copy effective opacity only on settings/mode changes, never per frame.
    const opacity=win.getComputedStyle(main,"::before").opacity;
    if(canvas.style.opacity!==opacity)canvas.style.opacity=opacity;
    paused=false; reason=frozen===null?"running":"frozen";
    if(!ready) { draw(frozen===null?elapsed:frozen); setReady(true); }
    if(frozen===null && !frame && !blinkTimer) { if(clockStart===null)clockStart=win.performance.now();scheduleTick(); }
  }
  const observer=new win.MutationObserver(refresh);
  observer.observe(html,{attributes:true,attributeFilter:["class","style","data-theme","data-sgk-scene","data-fusion-living-scene","data-sunlit-layered-ready","data-fusion-focus","data-fusion-reduced-motion","data-tessalume-motion","data-tessalume-visual-placement","data-sunlit-wallpaper-owner"]});
  if(context.root && context.root!==html)observer.observe(context.root,{attributes:true,attributeFilter:["data-fusion-focus"]});
  doc.addEventListener("visibilitychange",refresh); media.addEventListener("change",refresh);
  for(const type of ["input","wheel","scroll"])doc.addEventListener(type,interaction,{capture:true,passive:true});
  function dispose() {
    if(disposed)return;
    disposed=true; paused=true; reason="disposed"; observer.disconnect();
    doc.removeEventListener("visibilitychange",refresh); media.removeEventListener("change",refresh);
    for(const type of ["input","wheel","scroll"])doc.removeEventListener(type,interaction,true);
    release();
    for(const [name,value] of previous) { if(value===null)html.removeAttribute(name);else html.setAttribute(name,value); }
    if(win[key]===api)delete win[key];
  }
  function getState() { return { renderer,frames,paused,ready,active,reason,error,disposed,loaded,blinkReady,blinkError,regions:0,motionKind:"blink-only",eyes:eyes.length,
    width:canvas?.width||0,height:canvas?.height||0,loopScheduled:!!frame||!!blinkTimer,rafScheduled:!!frame,blinkScheduled:!!blinkTimer,time:frozen===null?sceneTime():frozen }; }
  const api={getState,refresh,dispose,freezeTime(value) {
    stop(); frozen=Number.isFinite(value)?Math.max(0,value):null;
    if(frozen!==null && ready)draw(frozen);
    refresh();return getState();
  }};
  win[key]=api;context.addCleanup?.(dispose);refresh();return dispose;
}
