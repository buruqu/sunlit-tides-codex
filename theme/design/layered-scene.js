/* Pure, allocation-free RAF gate shared by production and cadence checks.
   Its deadline advances on the ideal target-rate grid instead of the last callback,
   so tiny timestamp errors cannot accidentally halve the display cadence. */
function sunlitSceneFrameDue(clock,timestamp,interval=1000/120,tolerance=1.25){
  if(!Number.isFinite(clock.nextDue))clock.nextDue=timestamp;
  if(timestamp+tolerance<clock.nextDue)return false;
  const slots=Math.max(1,Math.floor((timestamp+tolerance-clock.nextDue)/interval)+1);
  clock.nextDue+=slots*interval;clock.missedFrameSlots=(clock.missedFrameSlots || 0)+slots-1;return true;
}
/* Stateless 2D response, shared by diagnostics and the worker GPU uniforms.
   This is a bounded phase/return approximation, not a spring integrator. */
function sunlitSceneWindAt(time){
  return Math.sin(time*2*Math.PI/5.35+.23*Math.sin(time*2*Math.PI/11.7)+.09*Math.sin(time*2*Math.PI/3.7));
}
function sunlitSceneResponseAt(layer,time,station){
  const r=layer.motionResponse,period=r?.localPeriod || layer.period || 6,phase=layer.phase || 0;
  if(!r?.enabled)return (r?.waveScale ?? 1)*Math.sin(time*2*Math.PI/period+phase);
  const delay=r.groupDelay+r.lagSeconds*station,t=time-delay,localMix=r.localMix,returnMix=r.returnMix;
  const direct=(1-localMix)*sunlitSceneWindAt(t)+localMix*Math.sin(t*2*Math.PI/period+phase);
  const past=t-r.returnDelay,returned=(1-localMix)*sunlitSceneWindAt(past)+localMix*Math.sin(past*2*Math.PI/period+phase);
  // Activation always uses the global, unshifted time: every station is zero at t0.
  const activation=time<=0?0:1-Math.exp(-time*time/.64);
  return r.waveScale*r.windSign*activation*((1-returnMix)*direct+returnMix*returned);
}
function sunlitSceneMotionCoefficients(layer,time,out){
  out[0]=Math.fround(sunlitSceneResponseAt(layer,time,0));out[1]=Math.fround(sunlitSceneResponseAt(layer,time,.5));out[2]=Math.fround(sunlitSceneResponseAt(layer,time,1));return out;
}
function sunlitSceneMotionWave(layer,time,progress=0){
  const a=Math.fround(sunlitSceneResponseAt(layer,time,0)),b=Math.fround(sunlitSceneResponseAt(layer,time,.5)),c=Math.fround(sunlitSceneResponseAt(layer,time,1));
  const p=Math.max(0,Math.min(1,progress)),u=p<=.5?p*2:(p-.5)*2,k=u*u*(3-2*u);return p<=.5?a+(b-a)*k:b+(c-b)*k;
}
function sunlitSceneVertexAt(layer,time,x,y,out){
  const pivot=layer.pivot || [0,0],dx=x-pivot[0],dy=y-pivot[1],flex=layer.kind==='hair' || layer.kind==='cloth' || layer.kind==='foliage';
  const smooth=(a,b,v)=>{const n=Math.max(0,Math.min(1,(v-a)/(b-a)));return n*n*(3-2*n);};
  const progress=flex?smooth(.04,1,Math.hypot(dx,dy)/(layer.radius || 500)):0;let weight=flex?progress:1;
  for(const root of layer.rootSegments || []){const ax=root[0][0],ay=root[0][1],vx=root[1][0]-ax,vy=root[1][1]-ay,f=Math.max(0,Math.min(1,((x-ax)*vx+(y-ay)*vy)/Math.max(vx*vx+vy*vy,.001)));weight*=smooth(layer.anchorLock || 0,(layer.anchorLock || 0)+(layer.anchorFade || 8),Math.hypot(x-ax-f*vx,y-ay-f*vy));}
  const wave=sunlitSceneMotionWave(layer,time,progress),rotation=Number.isFinite(layer.rotationRadians)?layer.rotationRadians:(layer.rotation || 0)*Math.PI/180,angle=layer.kind==='body'?0:rotation*wave*weight;
  const translation=layer.translation || [0,0],baseWave=sunlitSceneMotionWave(layer,time,0),parent=layer.parentBody,parentWave=parent?Math.sin(time*2*Math.PI/parent.period+parent.phase):0;
  const tx=(flex?0:translation[0]*baseWave)+(parent?parent.translation[0]*parentWave:0),ty=(flex?0:translation[1]*baseWave)+(parent?parent.translation[1]*parentWave:0);
  out[0]=pivot[0]+Math.cos(angle)*dx-Math.sin(angle)*dy+tx;out[1]=pivot[1]+Math.sin(angle)*dx+Math.cos(angle)*dy+ty;out[2]=angle;out[3]=wave;return out;
}
/* The two cheek streams are source-space water shading only. Their timing is
   shared by the GPU backend and diagnostics; no face vertex ever moves. */
function sunlitNormalizeSceneTears(options,canonicalArtworkScene){
  const raw=options.tearEffects || {},finite=(n,f,a,b)=>Number.isFinite(n)?Math.max(a,Math.min(b,n)):f;
  if(canonicalArtworkScene!=="night" || raw.enabled!==true)return {enabled:false,opacity:0,refraction:0,bounds:[530,250,76,52],streams:[]};
  const defaults=[{id:"xixi-left",start:[540,254],control1:[537.5,262],control2:[541,278],end:[537.5,285.5],period:5.8,delay:.8,travelSeconds:2.5,dropSeconds:.65,dropDistance:12,width:1.05,poolRadius:[3.4,1.05],dropRadius:1.45},{id:"xixi-right",start:[598,256],control1:[600,264],control2:[592,277],end:[588,282.8],period:6.4,delay:2.5,travelSeconds:2.8,dropSeconds:.7,dropDistance:11,width:1,poolRadius:[3.2,1],dropRadius:1.35}];
  const point=(value,fallback)=>[finite(value?.[0],fallback[0],512,620),finite(value?.[1],fallback[1],249,298)];
  const streams=(Array.isArray(raw.streams)?raw.streams:defaults).slice(0,2).map((stream,index)=>{const fallback=defaults[index];return {id:String(stream.id || fallback.id),start:point(stream.start,fallback.start),control1:point(stream.control1,fallback.control1),control2:point(stream.control2,fallback.control2),end:point(stream.end,fallback.end),period:finite(stream.period,fallback.period,4,7),delay:finite(stream.delay,fallback.delay,.2,7),travelSeconds:finite(stream.travelSeconds,fallback.travelSeconds,1.5,3.5),dropSeconds:finite(stream.dropSeconds,fallback.dropSeconds,.4,1),dropDistance:finite(stream.dropDistance,fallback.dropDistance,0,16),width:finite(stream.width,fallback.width,.45,1.6),poolRadius:[finite(stream.poolRadius?.[0],fallback.poolRadius[0],2,5),finite(stream.poolRadius?.[1],fallback.poolRadius[1],.6,1.6)],dropRadius:finite(stream.dropRadius,fallback.dropRadius,.7,1.8)};});
  const bounds=[finite(raw.bounds?.[0],530,510,615),finite(raw.bounds?.[1],250,248,295),finite(raw.bounds?.[2],76,1,112),finite(raw.bounds?.[3],52,1,57)];bounds[2]=Math.min(bounds[2],623-bounds[0]);bounds[3]=Math.min(bounds[3],305-bounds[1]);
  return {enabled:streams.length>0,opacity:finite(raw.opacity,.55,0,.8),refraction:finite(raw.refraction,.22,0,.35),bounds,streams};
}
function sunlitSceneTearEase(a,b,x){const n=Math.max(0,Math.min(1,(x-a)/(b-a)));return n*n*(3-2*n);}
function sunlitSceneTearAmounts(stream,time,out){
  if(time<stream.delay){out[0]=out[1]=out[2]=out[4]=out[5]=0;out[3]=-1;return out;}
  const age=(time-stream.delay)%stream.period,depart=.35+stream.travelSeconds,building=sunlitSceneTearEase(0,.4,age),progress=Math.pow(Math.max(0,Math.min(1,(age-.35)/stream.travelSeconds)),1.18);
  out[0]=building*(.4+.6*(1-progress))*(1-sunlitSceneTearEase(depart,depart+.7,age));
  out[1]=building*(1-sunlitSceneTearEase(depart+.4,depart+1.15,age));out[2]=progress;
  out[3]=age>=depart?Math.min(1,(age-depart)/stream.dropSeconds):-1;
  out[4]=building*(1-sunlitSceneTearEase(depart,depart+.12,age));out[5]=out[3]<0?0:1-sunlitSceneTearEase(.65,1,out[3]);return out;
}
/* One GPU implementation is used unchanged in both the dedicated worker and
   the main-thread compatibility path. It owns no DOM, timers, or input state. */
function sunlitCreateSceneGpuBackend(config){
  const {canvas,options,scene,sourceWidth,sourceHeight,sourceAsset,blinkAsset,layers,eyes,positions,baseMesh}=config;
  const cover=new Float32Array(4),lightStrength=config.lightStrength,lightHighlights=config.lightHighlights,noLight=[0,0,0],noRoots=new Float32Array(16),emptyRoots=[],origin=[0,0],baseLayer={asset:options.baseAsset || "orchard-clean-plate",motionUniform:new Float32Array(3)};
  let gl=null,program=null,buffer=null,uniforms=null,renderer=null,frames=0,loaded=true,width=canvas.width,height=canvas.height,blinkEnabled=true,lightingEnabled=true;
  const tears=config.tears || {enabled:false,opacity:0,refraction:0,bounds:[530,250,76,52],streams:[]},tearA=new Float32Array(8),tearB=new Float32Array(8),tearShape=new Float32Array(8),tearMotion=new Float32Array(8),tearDrop=new Float32Array(8),tearState=[new Float32Array(6),new Float32Array(6)];
  for(let i=0;i<tears.streams.length;i++){const t=tears.streams[i],n=i*4;tearA.set([...t.start,...t.control1],n);tearB.set([...t.control2,...t.end],n);tearShape.set([t.width,t.dropRadius,...t.poolRadius],n);tearDrop[n]=t.dropDistance;}
  const textures=new Map();const finite=(n,f,a,b)=>Number.isFinite(n)?Math.max(a,Math.min(b,n)):f;
  const vertexSource=`attribute vec2 aPosition; varying vec2 vUv;
    uniform vec4 uCover; uniform vec2 uSourceSize; uniform vec2 uPivot; uniform vec2 uTranslation;
    uniform float uAngle; uniform vec3 uMotionWave; uniform float uRadius; uniform int uKind; uniform vec4 uRoots[4];uniform int uRootCount;uniform float uAnchorFade;uniform float uAnchorLock;
    void main(){
      vUv=aPosition/uSourceSize;
      vec2 d=aPosition-uPivot;
      float progress=uKind==2?smoothstep(0.04,1.0,length(d)/uRadius):0.0;float weight=uKind==2?progress:1.0;
      for(int i=0;i<4;i++){if(i>=uRootCount)break;vec4 root=uRoots[i];vec2 segment=root.zw-root.xy;float t=clamp(dot(aPosition-root.xy,segment)/max(dot(segment,segment),.001),0.0,1.0);weight*=smoothstep(uAnchorLock,uAnchorLock+uAnchorFade,length(aPosition-root.xy-t*segment));}
      float station=progress<=.5?smoothstep(0.0,.5,progress):smoothstep(.5,1.0,progress);float response=progress<=.5?mix(uMotionWave.x,uMotionWave.y,station):mix(uMotionWave.y,uMotionWave.z,station);float angle=uAngle*weight*response;
      vec2 p=uPivot+vec2(cos(angle)*d.x-sin(angle)*d.y,sin(angle)*d.x+cos(angle)*d.y)+uTranslation;
      vec2 viewport=(p/uSourceSize-uCover.zw)/uCover.xy;
      gl_Position=vec4(viewport.x*2.0-1.0,1.0-viewport.y*2.0,0.0,1.0);
    }`;
  const fragmentSource=`precision highp float; varying vec2 vUv;
    uniform sampler2D uImage; uniform sampler2D uBlink; uniform sampler2D uMask; uniform sampler2D uSource; uniform sampler2D uLight;
    uniform vec2 uSourceSize; uniform vec2 uBlinkAmount; uniform vec2 uEyeSamples[4]; uniform vec4 uEyes[4]; uniform vec4 uEyeAngles; uniform vec4 uEyeGroups;
    uniform int uTearEnabled;uniform int uTearCount;uniform vec4 uTearBounds;uniform vec2 uTearStyle;uniform vec4 uTearA[2];uniform vec4 uTearB[2];uniform vec4 uTearShape[2];uniform vec4 uTearMotion[2];uniform vec4 uTearDrop[2];
    uniform int uEyeCount; uniform int uComposite; uniform vec3 uLightAmount;uniform vec3 uLightHighlights; uniform float uTime;
    vec2 tearCurve(vec4 a,vec4 b,float t){float u=1.0-t;return u*u*u*a.xy+3.0*u*u*t*a.zw+3.0*u*t*t*b.xy+t*t*t*b.zw;}
    void tearBead(inout vec3 rgb,vec2 pixel,vec2 center,float radius,float amount,float elongation){
      if(amount<=0.0)return;vec2 q=(pixel-center)/vec2(radius,radius*elongation);float r=length(q);if(r>1.4)return;
      float water=1.0-smoothstep(.58,1.3,r),rim=smoothstep(.55,.87,r)*(1.0-smoothstep(.9,1.25,r));
      vec2 g=q-vec2(-.27,-.38);float glint=exp(-dot(g,g)*10.0);
      vec3 refracted=texture2D(uSource,vUv+q*uTearStyle.y*.6/uSourceSize).rgb;
      rgb=mix(rgb,refracted,water*amount*uTearStyle.x*.16);
      rgb+=amount*uTearStyle.x*(vec3(.035,.038,.04)*water+vec3(.34,.36,.37)*glint+vec3(.10,.11,.115)*rim);
    }
    void shadeTears(inout vec3 rgb,vec2 pixel){
      for(int i=0;i<2;i++){if(i>=uTearCount)break;vec4 a=uTearA[i],b=uTearB[i],shape=uTearShape[i],motion=uTearMotion[i],drop=uTearDrop[i];
        if(motion.x+motion.y+motion.w+drop.z<=0.0)continue;
        vec2 poolQ=(pixel-a.xy)/shape.zw;float poolR=length(poolQ);
        float poolRim=smoothstep(.42,.7,poolR)*(1.0-smoothstep(.9,1.3,poolR));
        float poolGlint=exp(-dot(poolQ-vec2(-.25,-.28),poolQ-vec2(-.25,-.28))*7.0);
        rgb+=uTearStyle.x*motion.x*(vec3(.20,.215,.22)*poolRim+vec3(.15,.16,.165)*poolGlint);
        float best=10000.0,side=0.0;vec2 normal=vec2(0.0);
        if(motion.y>0.0 && motion.z>0.0){
          for(int j=0;j<12;j++){float t0=float(j)/12.0,t1=min(float(j+1)/12.0,motion.z);if(t0>=motion.z)break;
            vec2 from=tearCurve(a,b,t0),to=tearCurve(a,b,t1),delta=to-from;float f=clamp(dot(pixel-from,delta)/max(dot(delta,delta),.0001),0.0,1.0);vec2 d=pixel-from-f*delta;
            float distance=length(d);if(distance<best){best=distance;normal=vec2(-delta.y,delta.x)/max(length(delta),.001);side=dot(d,normal);}}
          float water=1.0-smoothstep(shape.x*.45,shape.x*1.45,best);
          float ridge=exp(-pow((side+shape.x*.35)/(shape.x*.28+.1),2.0))*water;
          float shadow=exp(-pow((side-shape.x*.6)/(shape.x*.32+.1),2.0))*water;
          float eyeSafe=smoothstep(a.y+2.0,a.y+6.0,pixel.y);vec3 refracted=texture2D(uSource,vUv+normal*uTearStyle.y*water/uSourceSize).rgb;
          rgb=mix(rgb,refracted,water*motion.y*uTearStyle.x*.18*eyeSafe);
          rgb+=motion.y*uTearStyle.x*(vec3(.025,.028,.03)*water+vec3(.32,.34,.35)*ridge-vec3(.035)*shadow);
        }
        tearBead(rgb,pixel,tearCurve(a,b,motion.z),shape.y,motion.w,1.42);
        if(drop.y>=0.0 && drop.z>0.0){float fall=drop.y;vec2 center=b.zw+vec2((i==0?-.25:.25)*fall,drop.x*(.15*fall+.85*fall*fall));tearBead(rgb,pixel,center,shape.y*(1.0-.18*fall),drop.z,1.42+.48*fall);}
      }
    }
    void main(){
      vec4 original=texture2D(uImage,vUv);
      if(uComposite==1)original=mix(texture2D(uSource,vUv),original,texture2D(uMask,vUv).r);
      if(uComposite==2){original=texture2D(uSource,vUv);original*=texture2D(uMask,vUv).r;}
      if(original.a<0.001)discard;
      vec3 blinkRGB=vec3(0.0);float blink=0.0;
      if(uBlinkAmount.x>0.0 || uBlinkAmount.y>0.0)for(int i=0;i<4;i++){if(i>=uEyeCount)break;vec4 e=uEyes[i];float a=uEyeAngles[i];vec2 d=(vUv-e.xy)*uSourceSize;
        vec2 q=vec2(cos(a)*d.x+sin(a)*d.y,-sin(a)*d.x+cos(a)*d.y);
        float amount=uEyeGroups[i]<0.5?uBlinkAmount.x:uBlinkAmount.y;
        float influence=(1.0-smoothstep(.72,1.0,length(q/(e.zw*uSourceSize))))*amount;if(influence>blink){blink=influence;blinkRGB=texture2D(uBlink,vUv+uEyeSamples[i]-e.xy).rgb;}}
      if(blink>0.0)original.rgb=mix(original.rgb,blinkRGB*original.a,blink);
      vec3 light=texture2D(uLight,vUv).rgb;if(dot(light,uLightAmount)>.00001){float luminance=dot(original.rgb/max(original.a,.001),vec3(.2126,.7152,.0722));light*=mix(vec3(1.0),vec3(smoothstep(.62,.90,luminance)),uLightHighlights);
      float drift=sin(uTime*.70+vUv.x*9.0+vUv.y*4.0)-sin(vUv.x*9.0+vUv.y*4.0);
      float glow=sin(uTime*.75+vUv.x*2.0)-sin(vUv.x*2.0);
      original.rgb+=original.a*(light.r*drift*uLightAmount.x*vec3(1.0,.88,.48)+light.g*glow*uLightAmount.y*vec3(.48,.64,1.0)+light.b*glow*uLightAmount.z*vec3(1.0,.66,.27));}
      vec2 tearPixel=vUv*uSourceSize;if(uTearEnabled==1 && tearPixel.x>=uTearBounds.x && tearPixel.y>=uTearBounds.y && tearPixel.x<=uTearBounds.x+uTearBounds.z && tearPixel.y<=uTearBounds.y+uTearBounds.w)shadeTears(original.rgb,tearPixel);
      gl_FragColor=original;
    }`;
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(message || "shader-compile");}return s;}
  function createRenderer(){
    let vertex=null,fragment=null;
    try{
      const settings={alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false};
      gl=canvas.getContext("webgl2",settings);renderer=gl?"webgl2":"webgl";if(!gl)gl=canvas.getContext("webgl",settings);if(!gl)throw new Error("webgl-unavailable");
      const is2=renderer==="webgl2";
      vertex=shader(gl.VERTEX_SHADER,is2?"#version 300 es\n"+vertexSource.replace("attribute","in").replace("varying","out"):vertexSource);
      fragment=shader(gl.FRAGMENT_SHADER,is2?"#version 300 es\n"+fragmentSource.replace("varying vec2 vUv;","in vec2 vUv; out vec4 outColor;").replaceAll("gl_FragColor","outColor").replaceAll("texture2D","texture"):fragmentSource);
      program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program) || "shader-link");
      gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(positions),gl.STATIC_DRAW);
      const attribute=gl.getAttribLocation(program,"aPosition");gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
      uniforms=Object.fromEntries(["uCover","uSourceSize","uPivot","uTranslation","uAngle","uMotionWave","uRadius","uKind","uRoots[0]","uRootCount","uAnchorFade","uAnchorLock","uImage","uBlink","uMask","uSource","uLight","uComposite","uBlinkAmount","uEyes[0]","uEyeSamples[0]","uEyeAngles","uEyeGroups","uEyeCount","uLightAmount","uLightHighlights","uTime","uTearEnabled","uTearCount","uTearBounds","uTearStyle","uTearA[0]","uTearB[0]","uTearShape[0]","uTearMotion[0]","uTearDrop[0]"].map(name=>[name,gl.getUniformLocation(program,name)]));
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.uniform1i(uniforms.uImage,0);gl.uniform1i(uniforms.uBlink,1);gl.uniform1i(uniforms.uMask,2);gl.uniform1i(uniforms.uSource,3);gl.uniform1i(uniforms.uLight,4);gl.uniform2f(uniforms.uSourceSize,sourceWidth,sourceHeight);
      gl.uniform4fv(uniforms["uEyes[0]"],new Float32Array([...eyes.flatMap(e=>[...e.center,...e.radius]),...Array((4-eyes.length)*4).fill(0)]));
      gl.uniform2fv(uniforms["uEyeSamples[0]"],new Float32Array([...eyes.flatMap(e=>e.sampleCenter),...Array((4-eyes.length)*2).fill(0)]));
      gl.uniform4fv(uniforms.uEyeAngles,new Float32Array(Array.from({length:4},(_,i)=>eyes[i]?.angle || 0)));gl.uniform4fv(uniforms.uEyeGroups,new Float32Array(Array.from({length:4},(_,i)=>eyes[i]?.group || 0)));gl.uniform1i(uniforms.uEyeCount,eyes.length);gl.uniform1i(uniforms.uTearCount,tears.streams.length);gl.uniform4fv(uniforms.uTearBounds,tears.bounds);gl.uniform2f(uniforms.uTearStyle,tears.opacity,tears.refraction);gl.uniform4fv(uniforms["uTearA[0]"],tearA);gl.uniform4fv(uniforms["uTearB[0]"],tearB);gl.uniform4fv(uniforms["uTearShape[0]"],tearShape);
      return true;
    }catch(exception){dispose();throw exception;}
    finally{if(gl && vertex)gl.deleteShader(vertex);if(gl && fragment)gl.deleteShader(fragment);}
  }
  function upload(asset,image,nearest=false){
    if(textures.has(asset))gl.deleteTexture(textures.get(asset));const texture=gl.createTexture();textures.set(asset,texture);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,nearest?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,nearest?gl.NEAREST:gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
  }
  const blinkProfiles=[options.blinkGroups?.find(item=>item.group===0),options.blinkGroups?.find(item=>item.group===1)];
  function smoothStep(a,b,x){const n=Math.max(0,Math.min(1,(x-a)/(b-a)));return n*n*(3-2*n);}
  function blinkAmount(time,group=0){
    const profile=blinkProfiles[group];
    if(profile){const period=finite(profile.period,6,3,30),phase=finite(profile.phaseSeconds,0,0,30),transition=finite(profile.transitionSeconds,.065,.04,.15),closed=finite(profile.closedSeconds,.12,.06,.2),p=(time+phase)%period;return smoothStep(0,transition,p)*(1-smoothStep(transition+closed,2*transition+closed,p));}
    const p=(time+1.3+group*2.37)%(group?6.7:5.6);return smoothStep(0,.10,p)*(1-smoothStep(.18,.30,p));
  }
  function waveAt(layer,time){return sunlitSceneMotionWave(layer,time,0);}
  function drawLayer(layer,time,base=false){
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures.get(layer.asset));gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,textures.get(sourceAsset?(base?"mask:union":layer.mask):"mask:none"));gl.uniform1i(uniforms.uComposite,sourceAsset?(base?1:2):0);
    const wave=base?0:waveAt(layer,time),flex=layer.kind==="hair" || layer.kind==="cloth" || layer.kind==="foliage";
    gl.uniform2fv(uniforms.uPivot,layer.pivot || origin);gl.uniform1f(uniforms.uRadius,layer.radius || 500);gl.uniform1i(uniforms.uKind,flex?2:1);
    if(!base)sunlitSceneMotionCoefficients(layer,time,layer.motionUniform);gl.uniform3fv(uniforms.uMotionWave,layer.motionUniform);gl.uniform1f(uniforms.uAngle,base || layer.kind==="body"?0:layer.rotation);const roots=base?emptyRoots:layer.rootSegments || emptyRoots;gl.uniform4fv(uniforms["uRoots[0]"],base?noRoots:layer.rootUniform);gl.uniform1i(uniforms.uRootCount,roots.length);gl.uniform1f(uniforms.uAnchorFade,layer.anchorFade || 8);gl.uniform1f(uniforms.uAnchorLock,layer.anchorLock || 0);
    // One-level parent body translation is shared exactly with its children.
    // Flex is still evaluated in artwork coordinates before that shared shift.
    const parent=layer.parentBody;
    const parentWave=parent?Math.sin(time*2*Math.PI/parent.period+parent.phase):0;
    gl.uniform2f(uniforms.uTranslation,(base || flex?0:layer.translation[0]*wave)+(parent?parent.translation[0]*parentWave:0),(base || flex?0:layer.translation[1]*wave)+(parent?parent.translation[1]*parentWave:0));
    gl.uniform1i(uniforms.uTearEnabled,base && sourceAsset && tears.enabled?1:0);
    const blinking=blinkAsset && blinkEnabled && (sourceAsset?base:!base && layer.blink);gl.uniform2f(uniforms.uBlinkAmount,blinking?blinkAmount(time):0,blinking?blinkAmount(time,1):0);
    const mesh=base?baseMesh:layer.mesh;gl.drawArrays(gl.TRIANGLES,mesh.first,mesh.count);
  }
  function draw(time){
    if(!loaded || !gl || !width || !height)return false;
    if(tears.enabled){for(let i=0;i<tears.streams.length;i++){const values=sunlitSceneTearAmounts(tears.streams[i],time,tearState[i]),n=i*4;tearMotion[n]=values[0];tearMotion[n+1]=values[1];tearMotion[n+2]=values[2];tearMotion[n+3]=values[4];tearDrop[n+1]=values[3];tearDrop[n+2]=values[5];}gl.uniform4fv(uniforms["uTearMotion[0]"],tearMotion);gl.uniform4fv(uniforms["uTearDrop[0]"],tearDrop);}
    gl.uniform4fv(uniforms.uCover,cover);gl.uniform1f(uniforms.uTime,time);gl.uniform3fv(uniforms.uLightAmount,lightingEnabled?lightStrength:noLight);gl.uniform3fv(uniforms.uLightHighlights,lightHighlights);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,textures.get(sourceAsset || options.baseAsset || "orchard-clean-plate"));gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,textures.get("light:semantic"));gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,textures.get(blinkAsset) || textures.get(options.baseAsset || "orchard-clean-plate"));
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);drawLayer(baseLayer,time,true);for(const layer of layers)drawLayer(layer,time);frames++;return true;
  }

  function dispose(){if(!gl)return;for(const texture of textures.values())gl.deleteTexture(texture);textures.clear();if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);gl.getExtension("WEBGL_lose_context")?.loseContext();gl=null;}
  createRenderer();
  return {gl,renderer,upload,dispose,finish(){gl.finish();},resize(w,h){width=w;height=h;if(canvas.width!==w || canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}},draw(time,state){cover.set(state.cover);blinkEnabled=state.blinkEnabled;lightingEnabled=state.lightingEnabled;return draw(time);},capture(){const data=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);return {width,height,data,frameId:frames};},get frames(){return frames;}};
}
/* Runs entirely in the dedicated Worker. The transferred canvas is presented
   directly by the compositor; no per-frame bitmap/message crosses the UI. */
function sunlitSceneRenderWorker(){
  let gpu=null,state=null,frame=0,paused=true,disposed=false,elapsed=0,start=null,frozen=null,lastReport=-Infinity;
  const interval=1000/120,clock={nextDue:-Infinity,missedFrameSlots:0};
  let rafCallbacks=0,renderedFrames=0,intervals=0,duration=0,last=null,lastFrameMs=0,maxFrameMs=0,lastDrawMs=0,drawTotal=0,maxDrawMs=0,windowStart=null,windowFrames=0,windowFps=0,lastRafTimestamp=null,lastRenderTimestamp=null,observedRafLast=null,observedRafDuration=0,observedRafIntervals=0;
  const sceneTime=()=>elapsed+(start===null?0:(performance.now()-start)/1000);
  function stop(){if(frame)cancelAnimationFrame(frame);frame=0;clock.nextDue=-Infinity;last=null;observedRafLast=null;windowStart=null;windowFrames=0;}
  function stats(){return {renderThread:"worker",renderer:gpu?.renderer,frames:gpu?.frames || 0,frameId:gpu?.frames || 0,paused,time:frozen===null?sceneTime():frozen,workerTimestamp:performance.now(),sentAt:Date.now(),cadence:{running:!paused,targetFps:120,observedRafHz:observedRafDuration?observedRafIntervals*1000/observedRafDuration:0,rafCallbacks,renderedFrames,measuredFps:duration?intervals*1000/duration:0,windowFps,lastFrameMs,maxFrameMs,lastDrawMs,averageDrawMs:renderedFrames?drawTotal/renderedFrames:0,maxDrawMs,missedFrameSlots:clock.missedFrameSlots,deadlineSlotsSkipped:clock.missedFrameSlots,missedFrameSlotsMeaning:"target-deadlines-without-a-native-RAF",skippedRafs:rafCallbacks-renderedFrames,scheduler:"worker-raf-deadline",frameIntervalMs:interval,lastRafTimestamp,lastRenderTimestamp}};}
  function report(type="stats"){postMessage({type,state:stats()});}
  function drawAt(time){if(gpu)gpu.draw(time,state);}
  function schedule(){if(!disposed && !paused && !frame)frame=requestAnimationFrame(tick);}
  function tick(timestamp){
    frame=0;if(disposed || paused)return;rafCallbacks++;lastRafTimestamp=timestamp;if(observedRafLast!==null){observedRafDuration+=timestamp-observedRafLast;observedRafIntervals++;}observedRafLast=timestamp;
    if(sunlitSceneFrameDue(clock,timestamp,interval,1.25)){
      const began=performance.now();drawAt(sceneTime());lastRenderTimestamp=timestamp;lastDrawMs=performance.now()-began;drawTotal+=lastDrawMs;maxDrawMs=Math.max(maxDrawMs,lastDrawMs);renderedFrames++;
      if(last!==null){lastFrameMs=timestamp-last;duration+=lastFrameMs;intervals++;maxFrameMs=Math.max(maxFrameMs,lastFrameMs);}last=timestamp;
      if(windowStart===null){windowStart=timestamp;windowFrames=0;}windowFrames++;if(timestamp-windowStart>=1000-.5){windowFps=(windowFrames-1)*1000/(timestamp-windowStart);windowStart=timestamp;windowFrames=1;}
      if(timestamp-lastReport>=500){lastReport=timestamp;report();}
    }
    schedule();
  }
  onmessage=event=>{const message=event.data;try{
    if(message.type==="init"){
      if(typeof requestAnimationFrame!=="function")throw new Error("worker-raf-unavailable");
      state=message.state;elapsed=message.time || 0;frozen=Number.isFinite(message.frozen)?message.frozen:null;gpu=sunlitCreateSceneGpuBackend({...message.config,canvas:message.canvas});
      message.canvas.addEventListener("webglcontextlost",event=>{event.preventDefault();paused=true;stop();postMessage({type:"error",error:"worker-webgl-context-lost"});});
      for(const asset of message.assets){gpu.upload(asset.id,asset.bitmap,asset.nearest);asset.bitmap.close();}
      gpu.resize(message.width,message.height);drawAt(frozen===null?elapsed:frozen);gpu.finish();report("ready");
    }else if(message.type==="configure"){
      state=message.state;if(message.width && message.height)gpu.resize(message.width,message.height);
      if(Number.isFinite(message.seek)){frozen=message.seek;drawAt(frozen);}else drawAt(frozen===null?sceneTime():frozen);
    }else if(message.type==="pause"){
      if(!paused){elapsed=sceneTime();start=null;paused=true;}stop();report();
    }else if(message.type==="resume"){
      frozen=null;if(paused){start=performance.now();paused=false;}schedule();report();
    }else if(message.type==="stats-request"){postMessage({type:"snapshot",requestId:message.requestId,state:stats()});
    }else if(message.type==="capture"){
      const time=Number.isFinite(message.time)?message.time:frozen===null?sceneTime():frozen;drawAt(time);const capture=gpu.capture(),snapshot=stats();snapshot.time=time;
      postMessage({type:"capture",requestId:message.requestId,captureSequence:message.captureSequence,time,workerTimestamp:performance.now(),...capture,state:snapshot},[capture.data.buffer]);
    }else if(message.type==="dispose"){
      disposed=true;paused=true;stop();gpu?.dispose();gpu=null;close();
    }
  }catch(error){paused=true;stop();postMessage({type:"error",error:String(error?.message || error)});}};
}
/* The coordinator preserves one public API while scene switches destroy all
   old images, textures, timers and observers before mounting the next scene. */
function mountSunlitLayeredScene(context){
  const {window:win,document:doc}=context,key="__SUNLIT_LAYERED_SCENE__",internal="__SUNLIT_LAYERED_SCENE_RENDERER__",base=context.config?.layeredScene || {};
  win[key]?.dispose?.();let cleanup=null,selected=null,disposed=false,frozen=null;
  function refresh(){
    if(disposed)return;const id=doc.documentElement.dataset.sgkScene || "orchard";
    if(id!==selected){cleanup?.();cleanup=null;selected=id;
      const options=id==="orchard"?{...base,...base.scenes?.orchard,scene:id,forceMainThread:base.forceMainThread===true || base.scenes?.orchard?.forceMainThread===true,sceneAllowed:true}:{...base.scenes?.[id],scene:id,enabled:base.enabled,forceMainThread:base.forceMainThread===true || base.scenes?.[id]?.forceMainThread===true,sceneAllowed:["night","night-tears"].includes(id) && !!base.scenes?.[id]};
      cleanup=mountSunlitLayeredSceneRenderer({...context,config:{...context.config,layeredScene:options},addCleanup(){}});
      if(frozen!==null)win[internal]?.freezeTime(frozen);
    }else win[internal]?.refresh();
  }
  const observer=new win.MutationObserver(refresh);observer.observe(doc.documentElement,{attributes:true,attributeFilter:["data-sgk-scene"]});
  function dispose(){if(disposed)return;disposed=true;observer.disconnect();cleanup?.();cleanup=null;if(win[key]===api)delete win[key];}
  const api={getState:()=>win[internal]?.getState() || {scene:selected,disposed},refresh,dispose,getStateAsync(){return win[internal]?.getStateAsync() || Promise.reject(new Error("renderer-disposed"));},capturePixels(value){return win[internal]?.capturePixels(value) || Promise.reject(new Error("renderer-disposed"));},freezeTime(value){frozen=Number.isFinite(value)?Math.max(0,value):null;return win[internal]?.freezeTime(frozen);}};
  win[key]=api;context.addCleanup?.(dispose);refresh();return dispose;
}
/* Authored RGBA orchard layers and source-pixel night pieces. Only the moving
   ownership regions reveal the fixed clean background; the body stays still. */
function mountSunlitLayeredSceneRenderer(context) {
  const { document: doc, window: win } = context;
  const html=doc.documentElement, key="__SUNLIT_LAYERED_SCENE_RENDERER__", options=context.config?.layeredScene || {};
  const scene=options.scene || "orchard",canonicalArtworkScene=options.canonicalArtworkScene || (scene==="night-tears"?"night":scene),sourceWidth=options.width || 1280,sourceHeight=options.height || 1280,sourceAsset=canonicalArtworkScene==="night"?options.sourceAsset || "duo-night":null;
  win[key]?.dispose?.();
  const media=win.matchMedia("(prefers-reduced-motion: reduce)");
  const attrs=["data-sunlit-layered-active","data-sunlit-layered-ready"];
  const previous=new Map(attrs.map(name=>[name,html.getAttribute(name)]));
  const finite=(n,f,a,b)=>Number.isFinite(n)?Math.max(a,Math.min(b,n)):f;
  const pair=(p,f,a,b)=>[0,1].map(i=>finite(p?.[i],f[i],a,b));
  const tearSettings=sunlitNormalizeSceneTears(options,canonicalArtworkScene);
  const layers=(Array.isArray(options.layers)?options.layers:[]).slice(0,40).map((layer,index)=>({
    asset:sourceAsset || layer.asset, id:layer.id || layer.asset, path:layer.path,colorFamily:["orange","pink","foliage"].includes(layer.colorFamily)?layer.colorFamily:null,extractFromAsset:typeof layer.extractFromAsset==="string"?layer.extractFromAsset:null,cutFromAssets:Array.isArray(layer.cutFromAssets)?layer.cutFromAssets.slice(0,6):[],underfillTargetAsset:typeof layer.underfillTargetAsset==="string"?layer.underfillTargetAsset:null,meshStep:Math.round(finite(layer.meshStep,sourceAsset?8:12,2,12)),coveragePadding:finite(layer.coveragePadding,0,0,3),fixedHoles:Array.isArray(layer.fixedHoles)?layer.fixedHoles.slice(0,4):[],underfillExclusionPadding:finite(layer.underfillExclusionPadding,0,0,6),underfillMode:layer.underfillMode || options.underfillMode,underfillPixels:Math.floor(finite(layer.underfillPixels ?? options.underfillPixels,40,1,40)),motionTip:Array.isArray(layer.motionTip)?layer.motionTip.slice(0,2):null, rootSegments:(layer.rootSegments || []).slice(0,4),anchorFade:finite(layer.anchorFade,8,1,64),anchorLock:Math.max(finite(layer.anchorLock,0,0,48),["hair","cloth","foliage"].includes(layer.kind)?Math.ceil(Math.SQRT2*finite(layer.meshStep,sourceAsset?8:12,2,12)+2):0),mask:sourceAsset || layer.extractFromAsset?"mask:"+index:null, parent:typeof layer.parent==="string"?layer.parent:null, kind:["hair","cloth","foliage","body","rigid"].includes(layer.kind)?layer.kind:"rigid",
    pivot:pair(layer.pivot,[640,640],0,1280), radius:finite(layer.radius,500,20,1800),
    rotation:finite(layer.rotation,["hair","cloth","foliage"].includes(layer.kind)?.3:0,-40,40)*Math.PI/180,rotationRadians:finite(layer.rotation,["hair","cloth","foliage"].includes(layer.kind)?.3:0,-40,40)*Math.PI/180,motionUniform:new Float32Array(3),motionResponse:{enabled:layer.motionResponse?.enabled===true,localMix:finite(layer.motionResponse?.localMix,0,0,.25),lagSeconds:finite(layer.motionResponse?.lagSeconds,0,0,.4),groupDelay:finite(layer.motionResponse?.groupDelay,0,0,1),returnMix:finite(layer.motionResponse?.returnMix,0,0,.3),returnDelay:finite(layer.motionResponse?.returnDelay,.25,0,.6),windSign:layer.motionResponse?.windSign===-1?-1:1,waveScale:sourceAsset?.5:1,localPeriod:finite(layer.motionResponse?.localPeriod,layer.period || 6,2,30)},
    translation:pair(layer.translation,[0,0],-1,1), period:finite(layer.period,6,2,60), phase:finite(layer.phase,0,-100,100),
    blink:layer.blink===true || layer.asset===options.blinkLayer,
    bounds:Array.isArray(layer.bounds) && layer.bounds.length===4 && layer.bounds.every(Number.isFinite) && layer.bounds[2]>0 && layer.bounds[3]>0?layer.bounds.slice():[0,0,1280,1280]
  }));
  const blinkAsset=options.blinkAsset || (layers.some(layer=>layer.blink)?"orchard-blink":null);
  for(const layer of layers){layer.parentBody=layer.kind!=="body" && layer.parent?layers.find(parent=>parent.asset===layer.parent && parent.kind==="body") || null:null;layer.rootUniform=new Float32Array([...layer.rootSegments.flat(2),...Array((4-layer.rootSegments.length)*4).fill(0)]);}
  const eyes=(options.eyes || [
    {center:[806/1280,315/1280],radius:[35/1280,23/1280],angle:-.55},
    {center:[750/1280,374/1280],radius:[27/1280,21/1280],angle:-.72}
  ]).slice(0,4).map(eye=>({group:[1,"yaya"].includes(eye.group)?1:0,center:pair(eye.center,[.63,.25],0,1),radius:pair(eye.radius,[.02,.012],.002,.05),angle:finite(eye.angle,0,-Math.PI,Math.PI),sampleCenter:Array.isArray(eye.sampleCenter)?pair(eye.sampleCenter,eye.center,0,4096).map((n,i)=>n/(i?sourceHeight:sourceWidth)):pair(eye.center,[.63,.25],0,1)}));
  let canvas=null,main=null,gl=null,renderer=null,backend=null,worker=null,workerUrl=null,workerReady=false,workerStarting=false,workerStartupTimer=0,workerStats=null,workerError=null,renderThread="main",renderWidth=0,renderHeight=0;
  const pendingUploads=new Map(),captures=new Map();let captureSequence=0,requestSequence=0;
  const gpuState={cover:null,blinkEnabled:true,lightingEnabled:true};
  let unionOwnership=null,underfillExclusions=null,boundaryExtendedPixels=0;const decodedSources=new Map();
  let pendingLoads=0,images=[], generation=0, disposed=false, failed=false, loaded=false, ready=false, active=false, paused=true;
  let reason="inactive", error=null, frame=0, frames=0, width=0, height=0;
  let elapsed=0, clockStart=null, frozen=null, lastFrame=-Infinity, interactionDeadline=0, interactionTimer=0,pointerDown=false,dragging=false;
  // RAF is the only render scheduler. An ideal 120Hz deadline plus a small
  // timestamp tolerance avoids a floating-point 120Hz -> 60Hz sawtooth while
  // retaining a 120fps ceiling while following slower native RAF cadences.
  const frameInterval=1000/120,frameTolerance=1.25,frameClock={nextDue:-Infinity,missedFrameSlots:0};
  let rafCallbacks=0,cadenceFrames=0,cadenceIntervals=0,cadenceElapsed=0,cadenceLast=null,lastFrameMs=0,maxFrameMs=0;
  let drawTotalMs=0,lastDrawMs=0,maxDrawMs=0,windowStart=null,windowFrames=0,windowFps=0,observedRafLast=null,observedRafDuration=0,observedRafIntervals=0;
  let blinkEnabled=html.dataset.fusionLivingScene!=="false",lightingEnabled=html.dataset.fusionSceneEffects!=="false";
  const cover=new Float32Array(4), positions=[];let maskPixels=0,lightMaskCount=0;const lightStrength=[canonicalArtworkScene==="orchard"?.065:.045,canonicalArtworkScene==="night"?.045:0,canonicalArtworkScene==="night"?.045:0],lightHighlights=[0,0,0],noLight=[0,0,0],noRoots=new Float32Array(16),emptyRoots=[],origin=[0,0],baseLayer={asset:options.baseAsset || "orchard-clean-plate"};
  function appendMesh(bounds,pivot,flex,meshStep=sourceAsset?8:12){
    // One source pixel of padding preserves LINEAR filtering at the alpha edge.
    // Coordinates remain in the full artwork coordinate system.
    const extension=flex?finite(options.edgeExtensionPixels,0,0,48):0;
    const left=bounds[0]<=0?-extension:Math.max(0,Math.min(sourceWidth,bounds[0]-1)),top=bounds[1]<=0?-extension:Math.max(0,Math.min(sourceHeight,bounds[1]-1));
    const right=bounds[0]+bounds[2]>=sourceWidth?sourceWidth+extension:Math.max(left,Math.min(sourceWidth,bounds[0]+bounds[2]+1)),bottom=bounds[1]+bounds[3]>=sourceHeight?sourceHeight+extension:Math.max(top,Math.min(sourceHeight,bounds[1]+bounds[3]+1));
    const step=meshStep;const axis=(a,b,p)=>[...new Set([a,b,...(flex?[...Array.from({length:Math.ceil(Math.max(sourceWidth,sourceHeight)/step)},(_,i)=>(i+1)*step),p].filter(n=>n>a && n<b):[])])].sort((a,b)=>a-b);
    // Include the authored root exactly when it lies inside this layer's bbox.
    const xs=axis(left,right,pivot[0]),ys=axis(top,bottom,pivot[1]),first=positions.length/2;
    for(let y=0;y<ys.length-1;y++)for(let x=0;x<xs.length-1;x++)positions.push(xs[x],ys[y],xs[x+1],ys[y],xs[x],ys[y+1],xs[x],ys[y+1],xs[x+1],ys[y],xs[x+1],ys[y+1]);
    return {first,count:positions.length/2-first,bounds:[left,top,right-left,bottom-top]};
  }
  const baseMesh=appendMesh([0,0,sourceWidth,sourceHeight],[0,0],false);
  for(const layer of layers)layer.mesh=appendMesh(layer.bounds,layer.pivot,["hair","cloth","foliage"].includes(layer.kind),layer.meshStep);
  const setAttr=(name,value)=>{if(value===null){if(html.hasAttribute(name))html.removeAttribute(name);}else if(html.getAttribute(name)!==value)html.setAttribute(name,value);};
  function setReady(value){ready=value;setAttr(attrs[1],value?"true":null);if(canvas)canvas.hidden=!value;}
  function sceneTime(timestamp=win.performance.now()){return elapsed+(clockStart===null?0:Math.max(0,timestamp-clockStart)/1000);}
  function stop(){
    if(frame)win.cancelAnimationFrame(frame);frame=0;
    if(clockStart!==null){elapsed=sceneTime();clockStart=null;}if(workerReady)postWorker({type:"pause"});lastFrame=-Infinity;frameClock.nextDue=-Infinity;cadenceLast=null;observedRafLast=null;windowStart=null;windowFrames=0;
  }
  function clearInteraction(){if(interactionTimer)win.clearTimeout(interactionTimer);interactionTimer=0;interactionDeadline=0;pointerDown=dragging=false;}
  function resumeInteraction(){interactionTimer=0;if(disposed || pointerDown || dragging)return;const wait=interactionDeadline-win.performance.now();if(wait>0){interactionTimer=win.setTimeout(resumeInteraction,wait);return;}interactionDeadline=0;refresh();}
  function interaction(event){
    if(disposed || !active || !ready)return;
    const type=event.type;
    // Hovering should never interrupt the scene. Held buttons and native drag
    // operations pause until release; typing/scrolling resume after a quiet gap.
    if(type==="pointermove" && !event.buttons){if(!pointerDown)return;pointerDown=false;}
    if(type==="pointerdown")pointerDown=true;
    if(type==="pointerup" || type==="pointercancel")pointerDown=false;
    if(type==="dragstart")dragging=true;if(type==="dragend")dragging=false;
    interactionDeadline=win.performance.now()+220;stop();paused=true;reason="interaction";if(interactionTimer)win.clearTimeout(interactionTimer);interactionTimer=win.setTimeout(resumeInteraction,220);
  }
  const resize=new win.ResizeObserver(entries=>{const entry=entries.find(item=>item.target===main);if(entry){measure(entry);refresh();}});
  const parentObserver=new win.MutationObserver(()=>{if(main && !main.isConnected)refresh();});
  let discoveringMain=false;
  const discoveryObserver=new win.MutationObserver(()=>{
    if(disposed || !discoveringMain)return;
    if(currentMain()){stopDiscovery();refresh();}
  });
  // Resolve only on layout/events. Retained chat mains can remain connected
  // under display:none while a different conversation owns the visible surface.
  function currentMain(){
    if(typeof resolveFusionLayout==="function")return resolveFusionLayout(doc,win)?.main || null;
    return [...doc.querySelectorAll('main[data-tessalume-surface="main"],main[data-app-shell-main-surface="default"],main')].find(node=>{
      if(!node.isConnected || node.closest('[hidden],[aria-hidden="true"],[inert]'))return false;
      const box=node.getBoundingClientRect();if(box.width<=2 || box.height<=2 || box.right<=0 || box.bottom<=0 || box.left>=win.innerWidth || box.top>=win.innerHeight)return false;
      const style=win.getComputedStyle(node);return style.display!=="none" && style.visibility!=="hidden" && Number(style.opacity)!==0;
    }) || null;
  }
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
    destroyWorker();backend?.dispose();backend=null;
    pendingLoads=0;boundaryExtendedPixels=0;unionOwnership=underfillExclusions=null;decodedSources.clear();for(const layer of layers)layer.ownership=null;pendingUploads.clear();canvas?.remove();canvas=main=gl=null;renderWidth=renderHeight=0;loaded=false;width=height=0;setReady(false);
  }
  function fail(message){error=String(message);failed=true;paused=true;reason="error";release();}
  function lost(event){event.preventDefault();fail("webgl-context-lost");}
  function backendConfig(){return {options,scene,canonicalArtworkScene,tears:tearSettings,sourceWidth,sourceHeight,sourceAsset,blinkAsset,layers,eyes,positions:new Float32Array(positions),baseMesh,lightStrength,lightHighlights};}
  function renderState(){gpuState.cover=cover;gpuState.blinkEnabled=blinkEnabled;gpuState.lightingEnabled=lightingEnabled;return gpuState;}
  function upload(asset,image,nearest=false){pendingUploads.set(asset,{image,nearest});if(backend)backend.upload(asset,image,nearest);}
  function createRenderer(){
    if(options.forceMainThread!==true && typeof win.Worker==="function" && typeof canvas.transferControlToOffscreen==="function" && typeof win.createImageBitmap==="function"){renderThread="worker";renderer="pending";return true;}
    renderThread="main";try{backend=sunlitCreateSceneGpuBackend({...backendConfig(),canvas});gl=backend.gl;renderer=backend.renderer;return true;}catch(error){fail(error.message);return false;}
  }
  function postWorker(message){if(!worker)return;try{worker.postMessage(message);}catch(error){fallbackWorker(error.message);}}
  function destroyWorker(){
    if(workerStartupTimer)win.clearTimeout(workerStartupTimer);workerStartupTimer=0;
    if(worker){worker.onmessage=worker.onerror=null;worker.terminate();worker=null;}
    if(workerUrl){win.URL.revokeObjectURL(workerUrl);workerUrl=null;}workerReady=workerStarting=false;workerStats=null;
    for(const capture of captures.values()){if(capture.timeout)win.clearTimeout(capture.timeout);capture.reject(new Error("renderer-released"));}captures.clear();
  }
  function fallbackWorker(message){
    if(disposed || renderThread!=="worker")return;workerError=String(message);setReady(false);destroyWorker();
    // A transferred canvas cannot regain a main-thread context. Replace only
    // this private artwork node; the native original stays visible meanwhile.
    const replacement=doc.createElement("canvas");replacement.className=canvas.className;replacement.dataset.fusionUi="layered-scene";replacement.setAttribute("aria-hidden","true");replacement.hidden=true;replacement.style.opacity=canvas.style.opacity;canvas.removeEventListener("webglcontextlost",lost);canvas.replaceWith(replacement);canvas=replacement;canvas.addEventListener("webglcontextlost",lost);
    renderThread="main";try{backend=sunlitCreateSceneGpuBackend({...backendConfig(),canvas});gl=backend.gl;renderer=backend.renderer;for(const [asset,value]of pendingUploads)backend.upload(asset,value.image,value.nearest);measure();refresh();}catch(error){fail(error.message);}
  }
  async function startWorker(token){
    if(disposed || token!==generation || workerStarting || workerReady)return;workerStarting=true;
    const bitmaps=[];
    try{
      for(const [id,value]of pendingUploads){const bitmap=await win.createImageBitmap(value.image,{premultiplyAlpha:"premultiply"});bitmaps.push({id,bitmap,nearest:value.nearest});if(disposed || token!==generation){for(const item of bitmaps)item.bitmap.close();return;}}
      const source=sunlitSceneFrameDue.toString()+"\n"+sunlitSceneWindAt.toString()+"\n"+sunlitSceneResponseAt.toString()+"\n"+sunlitSceneMotionCoefficients.toString()+"\n"+sunlitSceneMotionWave.toString()+"\n"+sunlitSceneVertexAt.toString()+"\n"+sunlitSceneTearEase.toString()+"\n"+sunlitSceneTearAmounts.toString()+"\n"+sunlitCreateSceneGpuBackend.toString()+"\n("+sunlitSceneRenderWorker.toString()+")();";
      workerUrl=win.URL.createObjectURL(new win.Blob([source],{type:"text/javascript"}));worker=new win.Worker(workerUrl,{name:"sunlit-scene-"+scene});
      worker.onmessage=event=>{
        if(disposed || token!==generation)return;const message=event.data;
        if(message.type==="error"){fallbackWorker(message.error);return;}
        if(message.state){workerStats=message.state;frames=workerStats.frames;renderer=workerStats.renderer;}
        if(message.type==="ready"){workerReady=true;workerStarting=false;if(workerStartupTimer)win.clearTimeout(workerStartupTimer);workerStartupTimer=0;if(workerUrl){win.URL.revokeObjectURL(workerUrl);workerUrl=null;}refresh();}
        if(message.type==="capture"){const request=captures.get(message.requestId);if(request){captures.delete(message.requestId);if(request.timeout)win.clearTimeout(request.timeout);request.resolve({...message,data:message.data instanceof Uint8Array?message.data:new Uint8Array(message.data)});}}
        if(message.type==="snapshot"){const request=captures.get(message.requestId);if(request){captures.delete(message.requestId);if(request.timeout)win.clearTimeout(request.timeout);request.resolve(getState());}}
      };
      worker.onerror=event=>{event.preventDefault();if(token===generation)fallbackWorker(event.message || "worker-error");};
      const offscreen=canvas.transferControlToOffscreen();worker.postMessage({type:"init",canvas:offscreen,config:backendConfig(),assets:bitmaps,width:renderWidth,height:renderHeight,state:renderState(),time:sceneTime(),frozen},[offscreen,...bitmaps.map(item=>item.bitmap)]);
      workerStartupTimer=win.setTimeout(()=>{if(token===generation && !workerReady)fallbackWorker("worker-start-timeout");},8000);
    }catch(error){for(const item of bitmaps){try{item.bitmap.close();}catch{}}if(token===generation)fallbackWorker(error.message);}
  }
  function requestWorker(type,extra={}){const requestId=++requestSequence;return new Promise((resolve,reject)=>{const timeout=win.setTimeout(()=>{captures.delete(requestId);reject(new Error("worker-request-timeout"));},5000);captures.set(requestId,{resolve,reject,timeout});postWorker({type,requestId,...extra});});}
  async function getStateAsync(){if(disposed)throw new Error("renderer-disposed");return renderThread==="worker" && workerReady?requestWorker("stats-request"):getState();}
  async function capturePixels(time){
    if(disposed || !ready)throw new Error("renderer-not-ready");if(Number.isFinite(time))api.freezeTime(time);
    if(renderThread==="main"){draw(Number.isFinite(time)?time:frozen===null?sceneTime():frozen);const value=backend.capture();return {...value,time:Number.isFinite(time)?time:frozen===null?sceneTime():frozen,workerTimestamp:null,captureSequence:++captureSequence,state:getState()};}
    return requestWorker("capture",{captureSequence:++captureSequence,time:Number.isFinite(time)?time:undefined});
  }
  function surface(){const c=doc.createElement("canvas");c.width=sourceWidth;c.height=sourceHeight;return c;}
  function createMasks(){
    maskPixels=lightMaskCount=boundaryExtendedPixels=0;underfillExclusions=null;
    // Binary ownership is sampled separately with NEAREST; RGB remains LINEAR.
    // At rest static and moving ownership are exact complements, without the
    // underpaint leakage caused by compositing two feathered alpha edges.
    const empty=doc.createElement("canvas");empty.width=empty.height=1;upload("mask:none",empty,true);
    const pathLayers=sourceAsset?layers:layers.filter(layer=>layer.extractFromAsset);
    if(pathLayers.length){
      if(!win.Path2D || pathLayers.some(layer=>typeof layer.path!=="string" || !layer.path))throw new Error("motion-mask-invalid");
      const union=surface(),unionCtx=union.getContext("2d"),ownership=new Uint8Array(sourceWidth*sourceHeight);
      for(const layer of pathLayers){
        if(layer.underfillMode==="boundary-extend")layer.ownership=new Uint8Array(sourceWidth*sourceHeight);
        const mask=surface(),ctx=mask.getContext("2d",{willReadFrequently:true});ctx.fillStyle="#fff";const contour=new win.Path2D(layer.path);ctx.fill(contour);if(layer.coveragePadding){ctx.strokeStyle="#fff";ctx.lineWidth=layer.coveragePadding*2;ctx.lineJoin="round";ctx.stroke(contour);}if(layer.fixedHoles.length){ctx.globalCompositeOperation="destination-out";for(const hole of layer.fixedHoles)ctx.fill(new win.Path2D(hole));ctx.globalCompositeOperation="source-over";}
        if(layer.underfillExclusionPadding){
          // Seed-only exclusion keeps hair antialiasing and tiny matte-hole
          // outlines out of the repair field; compositor ownership is unchanged.
          const guard=surface(),guardCtx=guard.getContext("2d",{willReadFrequently:true});guardCtx.fillStyle=guardCtx.strokeStyle="#fff";guardCtx.lineWidth=2*(layer.coveragePadding+layer.underfillExclusionPadding);guardCtx.lineJoin="round";guardCtx.fill(contour);guardCtx.stroke(contour);const data=guardCtx.getImageData(0,0,sourceWidth,sourceHeight).data;if(!underfillExclusions)underfillExclusions=new Uint8Array(sourceWidth*sourceHeight);for(let index=0;index<underfillExclusions.length;index++)if(data[index*4+3]>=128)underfillExclusions[index]=255;
        }
        const pixels=ctx.getImageData(0,0,sourceWidth,sourceHeight);
        for(let i=0;i<pixels.data.length;i+=4){const index=i/4,own=pixels.data[i+3]>=128 && !ownership[index]?255:0;if(own){ownership[index]=255;if(layer.ownership)layer.ownership[index]=255;maskPixels++;}pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=own;pixels.data[i+3]=255;}
        ctx.putImageData(pixels,0,0);upload(layer.mask,mask,true);
      }
      const pixels=unionCtx.createImageData(sourceWidth,sourceHeight);
      for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=ownership[i/4];pixels.data[i+3]=255;}unionCtx.putImageData(pixels,0,0);upload("mask:union",union,true);if(layers.some(layer=>layer.underfillMode==="boundary-extend"))unionOwnership=ownership;
    }
    const light=surface(),ctx=light.getContext("2d"),masks=Array.isArray(options.lightMasks)?options.lightMasks:[];
    for(const mask of masks){if(typeof mask.path!=="string" || !win.Path2D)continue;const channel=Math.round(finite(mask.channel,0,0,2));if(Number.isFinite(mask.maxLuminanceDelta))lightStrength[channel]=finite(mask.maxLuminanceDelta,.10,0,.20)*.5;if(mask.highlightOnly)lightHighlights[channel]=1;ctx.filter="blur(5px)";ctx.fillStyle=["#ff0000","#00ff00","#0000ff"][channel];ctx.fill(new win.Path2D(mask.path));lightMaskCount++;}
    if(scene==="orchard" && !masks.length){
      // Conservative source-space foliage clips keep the new light off skin,
      // clothes, and hair. Gradients inside the clip keep the dapple gentle.
      if(win.Path2D){ctx.save();ctx.clip(new win.Path2D("M0 0 H488 L476 80 L430 155 L330 203 L240 207 L232 171 L203 126 L160 92 L103 102 L80 131 L0 127 Z M0 225 L48 210 L60 290 L86 340 L110 399 L72 455 L52 514 L47 572 L0 620 Z M1007 0 H1280 V178 L1254 184 L1217 150 L1170 161 L1118 126 L1049 85 Z"));
        for(const [x,y,rx,ry]of [[.12,.10,.30,.19],[.035,.34,.12,.24],[.94,.055,.18,.16]]){
          ctx.save();ctx.translate(x*sourceWidth,y*sourceHeight);ctx.scale(rx*sourceWidth,ry*sourceHeight);const gradient=ctx.createRadialGradient(0,0,0,0,0,1);gradient.addColorStop(0,"rgba(255,0,0,.9)");gradient.addColorStop(1,"rgba(255,0,0,0)");ctx.fillStyle=gradient;ctx.fillRect(-1,-1,2,2);ctx.restore();lightMaskCount++;}ctx.restore();}
    }
    ctx.filter="none";if(scene==="orchard" && !masks.length){const soft=surface(),softCtx=soft.getContext("2d");softCtx.filter="blur(5px)";softCtx.drawImage(light,0,0);upload("light:semantic",soft);}else upload("light:semantic",light);
  }
  function createExtractedPieces(){
    if(sourceAsset)return;
    const originals=new Map(),cuts=new Map();
    for(const layer of layers){
      if(!layer.extractFromAsset)continue;
      if(!originals.has(layer.extractFromAsset)){const original=surface(),ctx=original.getContext("2d",{willReadFrequently:true}),image=pendingUploads.get(layer.extractFromAsset)?.image;if(!image)throw new Error("piece-source-missing:"+layer.extractFromAsset);ctx.drawImage(image,0,0);originals.set(layer.extractFromAsset,ctx.getImageData(0,0,sourceWidth,sourceHeight));}
      const mask=pendingUploads.get(layer.mask)?.image;if(!mask)throw new Error("piece-mask-missing:"+layer.id);const maskCtx=mask.getContext("2d",{willReadFrequently:true}),ownership=maskCtx.getImageData(0,0,sourceWidth,sourceHeight).data;
      const piece=surface(),ctx=piece.getContext("2d"),pixels=ctx.createImageData(sourceWidth,sourceHeight),original=originals.get(layer.extractFromAsset).data;
      for(const asset of layer.cutFromAssets)if(!cuts.has(asset)){const image=pendingUploads.get(asset)?.image;if(!image)throw new Error("piece-cut-source-missing:"+asset);const cut=surface(),cutCtx=cut.getContext("2d",{willReadFrequently:true});cutCtx.drawImage(image,0,0);cuts.set(asset,{canvas:cut,ctx:cutCtx,pixels:cutCtx.getImageData(0,0,sourceWidth,sourceHeight)});}
      for(let i=0;i<pixels.data.length;i+=4){if(!ownership[i])continue;const r=original[i],g=original[i+1],b=original[i+2];if(layer.colorFamily==="orange" && !(r>b*1.12 && g>b*1.04) || layer.colorFamily==="pink" && !(r>=g*1.03 && r>=b*.94) || layer.colorFamily==="foliage" && !(g>=r*.97 || b>r*1.05))continue;pixels.data[i]=original[i];pixels.data[i+1]=original[i+1];pixels.data[i+2]=original[i+2];pixels.data[i+3]=original[i+3];for(const asset of layer.cutFromAssets){const target=cuts.get(asset).pixels.data;target[i]=target[i+1]=target[i+2]=target[i+3]=0;}}
      ctx.putImageData(pixels,0,0);upload(layer.asset,piece);
    }
    for(const [asset,cut]of cuts){cut.ctx.putImageData(cut.pixels,0,0);upload(asset,cut.canvas);}
  }
  function createBoundaryUnderfill(){
    if(!sourceAsset && options.underfillMode==="boundary-extend"){
      unionOwnership=new Uint8Array(sourceWidth*sourceHeight);const mask=surface(),ctx=mask.getContext("2d",{willReadFrequently:true});
      for(const layer of layers){
        if(!["hair","cloth","foliage"].includes(layer.kind) || !layer.parentBody && !layer.underfillTargetAsset)continue;
        ctx.clearRect(0,0,sourceWidth,sourceHeight);ctx.drawImage(pendingUploads.get(layer.asset).image,0,0);const pixels=ctx.getImageData(0,0,sourceWidth,sourceHeight).data;layer.ownership=new Uint8Array(sourceWidth*sourceHeight);
        for(let index=0;index<unionOwnership.length;index++)if(pixels[index*4+3]>=128 && !unionOwnership[index]){layer.ownership[index]=255;unionOwnership[index]=255;}
      }
    }
    if(!unionOwnership)return;
    const source=pendingUploads.get(sourceAsset || options.underfillSourceAsset)?.image;if(!source)throw new Error("boundary-underfill-source-missing");
    const original=surface(),originalCtx=original.getContext("2d",{willReadFrequently:true});originalCtx.drawImage(source,0,0,sourceWidth,sourceHeight);const sourcePixels=originalCtx.getImageData(0,0,sourceWidth,sourceHeight).data;
    // Exact squared Euclidean nearest-fixed-pixel field. The separable transform
    // is linear in source pixels, so a wider reveal strip does not require a
    // radius-squared search at every covered pixel during scene initialization.
    if(underfillExclusions)for(let i=0;i<unionOwnership.length;i++)if(unionOwnership[i])underfillExclusions[i]=255;
    const seedOwnership=underfillExclusions || unionOwnership;
    const size=sourceWidth*sourceHeight,vertical=new Uint32Array(size),nearest=new Int32Array(size),infinity=0x3fffffff;
    for(let x=0;x<sourceWidth;x++){
      let above=-sourceHeight;
      for(let y=0;y<sourceHeight;y++){const i=y*sourceWidth+x;if(!seedOwnership[i])above=y;vertical[i]=above>=0?(y-above)*(y-above):infinity;nearest[i]=above>=0?above*sourceWidth+x:-1;}
      let below=sourceHeight*2;
      for(let y=sourceHeight-1;y>=0;y--){const i=y*sourceWidth+x;if(!seedOwnership[i])below=y;const distance=(below-y)*(below-y);if(below<sourceHeight && distance<vertical[i]){vertical[i]=distance;nearest[i]=below*sourceWidth+x;}}
    }
    const envelope=new Int32Array(sourceWidth),breaks=new Float64Array(sourceWidth+1),rowDistance=new Uint32Array(sourceWidth),rowSource=new Int32Array(sourceWidth);
    for(let y=0;y<sourceHeight;y++){
      const row=y*sourceWidth;let last=0;envelope[0]=0;breaks[0]=-Infinity;breaks[1]=Infinity;
      for(let x=1;x<sourceWidth;x++){let split;do{const p=envelope[last];split=((vertical[row+x]+x*x)-(vertical[row+p]+p*p))/(2*(x-p));if(split<=breaks[last])last--;else break;}while(last>=0);last++;envelope[last]=x;breaks[last]=split;breaks[last+1]=Infinity;}
      let segment=0;for(let x=0;x<sourceWidth;x++){while(breaks[segment+1]<x)segment++;const from=envelope[segment];rowDistance[x]=vertical[row+from]+(x-from)*(x-from);rowSource[x]=nearest[row+from];}
      vertical.set(rowDistance,row);nearest.set(rowSource,row);
    }
    const outputs=new Map();boundaryExtendedPixels=0;
    for(const layer of layers){
      if(!layer.ownership)continue;const radius=layer.underfillPixels,targetAsset=sourceAsset?options.baseAsset:layer.underfillTargetAsset || layer.parentBody?.asset;if(!targetAsset){layer.ownership=null;continue;}
      if(!outputs.has(targetAsset)){const canvas=surface(),ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.drawImage(pendingUploads.get(targetAsset).image,0,0,sourceWidth,sourceHeight);outputs.set(targetAsset,{canvas,ctx,pixels:ctx.getImageData(0,0,sourceWidth,sourceHeight)});}
      const output=outputs.get(targetAsset),pixels=output.pixels,left=Math.max(0,Math.floor(layer.bounds[0])),top=Math.max(0,Math.floor(layer.bounds[1])),right=Math.min(sourceWidth,Math.ceil(layer.bounds[0]+layer.bounds[2])),bottom=Math.min(sourceHeight,Math.ceil(layer.bounds[1]+layer.bounds[3]));
      for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
        const target=y*sourceWidth+x,from=nearest[target];if(!layer.ownership[target] || from<0 || vertical[target]>radius*radius)continue;
        // The seed is always outside the union of every moving ownership.
        // Deep holes keep the supplied plate or parent underpaint unchanged.
        const a=target*4,b=from*4;pixels.data[a]=sourcePixels[b];pixels.data[a+1]=sourcePixels[b+1];pixels.data[a+2]=sourcePixels[b+2];pixels.data[a+3]=sourcePixels[b+3];boundaryExtendedPixels++;
      }
      layer.ownership=null;
    }
    for(const [asset,output]of outputs){output.ctx.putImageData(output.pixels,0,0);upload(asset,output.canvas);}unionOwnership=null;decodedSources.clear();
  }
  function loadAssets(){
    const assets=[...new Set([options.baseAsset || "orchard-clean-plate",...layers.filter(layer=>!layer.extractFromAsset).map(layer=>layer.asset),...layers.filter(layer=>layer.extractFromAsset).map(layer=>layer.extractFromAsset),...(options.underfillSourceAsset?[options.underfillSourceAsset]:[]),...(blinkAsset?[blinkAsset]:[])])],token=++generation;
    if(!layers.length || assets.some(asset=>typeof asset!=="string" || !asset)){fail("layer-config-invalid");return;}
    let complete=0;pendingLoads=assets.length;try{createMasks();}catch(exception){fail(exception.message);return;}
    for(const asset of assets){
      if(token!==generation)return;
      let source="";try{source=context.assetDataUrl?.(asset) || context.assets?.[asset] || "";}catch{}
      if(!source){fail("artwork-unavailable:"+asset);return;}
      const image=new win.Image();image.decoding="async";images.push(image);
      image.onload=()=>{
        if(disposed || token!==generation || !canvas)return;
        if(image.naturalWidth!==sourceWidth || image.naturalHeight!==sourceHeight){if(!sourceAsset || ![options.baseAsset,blinkAsset].includes(asset) || Math.abs(image.naturalWidth/image.naturalHeight-sourceWidth/sourceHeight)>.01){fail("artwork-dimensions-mismatch:"+asset);return;}}
        try{let pixels=image;if(image.naturalWidth!==sourceWidth || image.naturalHeight!==sourceHeight || /^data:image\/svg\+xml[;,]/i.test(source)){pixels=surface();pixels.getContext("2d").drawImage(image,0,0,sourceWidth,sourceHeight);}upload(asset,pixels);if(unionOwnership && [sourceAsset,options.baseAsset].includes(asset))decodedSources.set(asset,pixels);complete++;pendingLoads=assets.length-complete;if(complete===assets.length){createExtractedPieces();createBoundaryUnderfill();loaded=true;measure();if(renderThread==="worker")startWorker(token);refresh();}}catch(exception){fail(exception.message);}
      };
      image.onerror=()=>{if(token===generation)fail("artwork-load-failed:"+asset);};image.src=source;
    }
  }
  function framing(){
    if(canonicalArtworkScene==="night"){
      // Use the gallery's actual CSS framing (right-dock offset included).
      // Reads occur on layout/mutation only, never in the animation tick.
      const style=win.getComputedStyle(main,"::before"),size=style.backgroundSize.split(/\s+/),position=style.backgroundPosition.split(/\s+/);
      const imageWidth=size[0]?.endsWith("px")?parseFloat(size[0]):Math.max(width,height*sourceWidth/sourceHeight),imageHeight=imageWidth*sourceHeight/sourceWidth;
      const offset=(value,space,fallback)=>value?.endsWith("px")?parseFloat(value):value?.endsWith("%")?space*parseFloat(value)/100:fallback;
      const x=offset(position[0],width-imageWidth,(width-imageWidth)*.55),y=offset(position[1],height-imageHeight,0);
      cover[0]=width/imageWidth;cover[1]=height/imageHeight;cover[2]=-x/imageWidth;cover[3]=-y/imageHeight;
    }else{const scale=Math.max(width/sourceWidth,height/sourceHeight);cover[0]=width/(sourceWidth*scale);cover[1]=height/(sourceHeight*scale);cover[2]=(1-cover[0])*.5;cover[3]=(1-cover[1])*.32;}
  }
  function measure(entry){
    if(!canvas || !main)return;if(!main.isConnected){refresh();return;}
    const box=entry?.contentRect || main.getBoundingClientRect();width=Math.max(0,box.width);height=Math.max(0,box.height);
    if(!width || !height){stop();paused=true;reason="zero-size";setReady(false);return;}
    const ratio=Math.min(1,win.devicePixelRatio || 1,Math.sqrt(1920*1080/(width*height)))*finite(options.resolutionScale,1,.25,1);
    const w=Math.max(1,Math.floor(width*ratio)),h=Math.max(1,Math.floor(height*ratio));renderWidth=w;renderHeight=h;if(renderThread==="main")backend?.resize(w,h);else if(!workerStarting && !workerReady){canvas.width=w;canvas.height=h;}
    framing();
    if(loaded)draw(frozen===null?sceneTime():frozen);
  }
  function mount(node){main=node;canvas=doc.createElement("canvas");canvas.className="sunlit-layered-scene";canvas.dataset.fusionUi="layered-scene";canvas.setAttribute("aria-hidden","true");canvas.hidden=true;main.prepend(canvas);canvas.addEventListener("webglcontextlost",lost);if(!createRenderer())return;resize.observe(main);if(main.parentNode)parentObserver.observe(main.parentNode,{childList:true});measure();loadAssets();}
  const blinkProfiles=[options.blinkGroups?.find(item=>item.group===0),options.blinkGroups?.find(item=>item.group===1)];
  function smoothStep(a,b,x){const n=Math.max(0,Math.min(1,(x-a)/(b-a)));return n*n*(3-2*n);}
  function blinkAmount(time,group=0){
    const profile=blinkProfiles[group];
    if(profile){const period=finite(profile.period,6,3,30),phase=finite(profile.phaseSeconds,0,0,30),transition=finite(profile.transitionSeconds,.065,.04,.15),closed=finite(profile.closedSeconds,.12,.06,.2),p=(time+phase)%period;return smoothStep(0,transition,p)*(1-smoothStep(transition+closed,2*transition+closed,p));}
    const p=(time+1.3+group*2.37)%(group?6.7:5.6);return smoothStep(0,.10,p)*(1-smoothStep(.18,.30,p));
  }
  function waveAt(layer,time){return sourceAsset?(Math.sin(time*2*Math.PI/layer.period+layer.phase)-Math.sin(layer.phase))*.5:Math.sin(time*2*Math.PI/layer.period+layer.phase);}
  function describeLayerMotion(layer,time){
    const [x,y,w,h]=layer.bounds,[px,py]=layer.pivot,tip=layer.motionTip || [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].sort((a,b)=>Math.hypot(b[0]-px,b[1]-py)-Math.hypot(a[0]-px,a[1]-py))[0];
    const point=sunlitSceneVertexAt(layer,time,tip[0],tip[1],new Float64Array(4)),coefficients=sunlitSceneMotionCoefficients(layer,time,new Float32Array(3)),ox=point[0]-tip[0],oy=point[1]-tip[1],r=layer.motionResponse;
    return {id:layer.id,kind:layer.kind,rotationDegrees:(layer.kind==='body'?0:layer.rotation*coefficients[0])*180/Math.PI,tipRotationDegrees:point[2]*180/Math.PI,tipSource:tip.slice(),tipOffset:[ox,oy],tipDisplacementSourcePixels:Math.hypot(ox,oy),translation:[0,0],sampleKind:layer.motionTip?'authored-tip':'bbox-corner',motionWave:point[3],motionCoefficients:Array.from(coefficients),motionResponse:r,windSample:sunlitSceneWindAt(time)};
  }
  function draw(time){
    if(!loaded || !canvas || !width || !height)return false;
    if(renderThread==="worker"){if(workerReady)postWorker({type:"configure",state:renderState(),width:renderWidth,height:renderHeight,seek:frozen});return workerReady;}
    if(!backend)return false;const result=backend.draw(time,renderState());frames=backend.frames;return result;
  }
  const hasMotion=()=>tearSettings.enabled || lightingEnabled && lightMaskCount>0 || !!sourceAsset && !!blinkAsset && blinkEnabled || layers.some(layer=>layer.rotation!==0 && layer.kind!=="body" || !["hair","cloth","foliage"].includes(layer.kind) && layer.translation.some(n=>n!==0) || layer.blink && blinkAsset && blinkEnabled);
  function schedule(){if(disposed || paused || frozen!==null || !hasMotion())return;if(renderThread==="worker"){if(workerReady)postWorker({type:"resume"});return;}if(!frame)frame=win.requestAnimationFrame(tick);}
  function tick(timestamp){
    frame=0;if(disposed || paused || frozen!==null)return;if(!main?.isConnected){refresh();return;}rafCallbacks++;if(observedRafLast!==null){observedRafDuration+=timestamp-observedRafLast;observedRafIntervals++;}observedRafLast=timestamp;
    if(sunlitSceneFrameDue(frameClock,timestamp,frameInterval,frameTolerance)){
      lastFrame=timestamp;
      const started=win.performance.now();
      if(draw(sceneTime(timestamp))){
        lastDrawMs=Math.max(0,win.performance.now()-started);drawTotalMs+=lastDrawMs;maxDrawMs=Math.max(maxDrawMs,lastDrawMs);cadenceFrames++;
        if(cadenceLast!==null){lastFrameMs=timestamp-cadenceLast;cadenceElapsed+=lastFrameMs;cadenceIntervals++;maxFrameMs=Math.max(maxFrameMs,lastFrameMs);}cadenceLast=timestamp;
        if(windowStart===null){windowStart=timestamp;windowFrames=0;}windowFrames++;
        if(timestamp-windowStart>=1000-frameTolerance){windowFps=(windowFrames-1)*1000/(timestamp-windowStart);windowStart=timestamp;windowFrames=1;}
      }
    }
    schedule();
  }
  function nativeCompatibility(mode){
    const style=win.getComputedStyle(html),prefix=`--tessalume-visual-chat-${mode}-`,value=name=>style.getPropertyValue(prefix+name).trim();
    const geometry=value("geometry-transform"),scale=value("scale"),translate=value("translate"),size=value("background-size"),repeat=value("background-repeat");
    if(geometry && geometry!=="none")return "native-geometry";if(scale && Number(scale)!==1)return "native-scale";if(translate && !/^(?:0(?:px)?\s+){0,2}0(?:px)?$/.test(translate))return "native-translate";if(size && size!=="cover")return "native-background-size";if(repeat && repeat!=="no-repeat")return "native-background-repeat";
    if(html.dataset.sunlitWallpaperOwner==="workbench" || doc.getElementById("tessalume-artwork-motion-style")?.textContent.includes(`tessalume-artwork-chat-${mode}-full`))return "native-animation";
    const position=style.getPropertyValue("--sgk-scene-position").trim();return scene==="orchard" && position && position!=="50% 32%"?"scene-position":null;
  }
  function refresh(){
    if(disposed)return;
    const blinkChanged=blinkEnabled!==(html.dataset.fusionLivingScene!=="false");blinkEnabled=html.dataset.fusionLivingScene!=="false";lightingEnabled=html.dataset.fusionSceneEffects!=="false";
    const enabled=html.dataset.fusionLayeredScene===undefined?options.enabled===true:html.dataset.fusionLayeredScene==="true";
    const requested=enabled && options.sceneAllowed!==false && html.dataset.fusionWallpaperMotion!=="false" && ["sgk-theme","tessalume-theme-active","tessalume-is-task"].every(name=>html.classList.contains(name)) && html.dataset.sgkScene===scene;
    if(!requested){active=false;setAttr(attrs[0],null);paused=true;reason="inactive";if(canvas)release();else stopDiscovery();return;}
    const mode=html.dataset.theme==="dark" || !html.hasAttribute("data-theme") && html.classList.contains("electron-dark")?"dark":"light",incompatible=nativeCompatibility(mode);
    active=!incompatible;setAttr(attrs[0],active?"true":null);
    const guard=failed?"error":incompatible || (doc.hidden?"hidden":media.matches?"reduced-motion":html.dataset.fusionFocus==="true" || context.root?.getAttribute("data-fusion-focus")==="true"?"focus":html.dataset.fusionReducedMotion==="true" || ["off","reduced"].includes(html.dataset.tessalumeMotion)?"reduced-motion":null);
    if(guard){paused=true;reason=guard;release();return;}
    const next=currentMain();if(!next){paused=true;reason="no-main";if(canvas)release();discoverMain();return;}
    stopDiscovery();
    if(next!==main){if(canvas)release();mount(next);}if(failed)return;
    if(!loaded || !width || !height || renderThread==="worker" && !workerReady){paused=true;reason=loaded && (!width || !height)?"zero-size":"loading";return;}
    if(ready && (pointerDown || dragging || interactionDeadline>win.performance.now())){if(blinkChanged)draw(frozen===null?sceneTime():frozen);paused=true;reason="interaction";stop();return;}
    framing();const opacity=win.getComputedStyle(main,"::before").opacity;if(canvas.style.opacity!==opacity)canvas.style.opacity=opacity;
    paused=false;reason=frozen===null?"running":"frozen";draw(frozen===null?sceneTime():frozen);if(!ready)setReady(true);if(!hasMotion())stop();else if(frozen===null){if(clockStart===null)clockStart=win.performance.now();schedule();}
  }
  const observer=new win.MutationObserver(refresh);
  observer.observe(html,{attributes:true,attributeFilter:["class","style","data-theme","data-sgk-scene","data-fusion-scene-effects","data-fusion-wallpaper-motion","data-fusion-layered-scene","data-fusion-living-scene","data-fusion-focus","data-fusion-reduced-motion","data-tessalume-motion","data-tessalume-visual-placement","data-sunlit-wallpaper-owner"]});
  if(context.root && context.root!==html)observer.observe(context.root,{attributes:true,attributeFilter:["data-fusion-focus"]});
  win.addEventListener("sunlit-tides:main-surface-change",refresh);doc.addEventListener("visibilitychange",refresh);media.addEventListener("change",refresh);for(const type of ["input","wheel","scroll","pointerdown","pointermove","pointerup","pointercancel","dragstart","dragend","keydown"])doc.addEventListener(type,interaction,{capture:true,passive:true});
  function dispose(){if(disposed)return;disposed=true;paused=true;reason="disposed";observer.disconnect();win.removeEventListener("sunlit-tides:main-surface-change",refresh);doc.removeEventListener("visibilitychange",refresh);media.removeEventListener("change",refresh);for(const type of ["input","wheel","scroll","pointerdown","pointermove","pointerup","pointercancel","dragstart","dragend","keydown"])doc.removeEventListener(type,interaction,true);release();for(const [name,value]of previous){if(value===null)html.removeAttribute(name);else html.setAttribute(name,value);}if(win[key]===api)delete win[key];}
  function getState(){const time=renderThread==="worker" && workerStats && Number.isFinite(workerStats.time)?workerStats.time:frozen===null?sceneTime():frozen;return {scene,canonicalArtworkScene,mainOwnerId:main?.id || null,tearEnabled:tearSettings.enabled,tearAmounts:tearSettings.streams.map(stream=>{const a=sunlitSceneTearAmounts(stream,time,new Float32Array(6));return {id:stream.id,pool:a[0],trail:a[1],progress:a[2],dropProgress:a[3],bead:a[4],drop:a[5]};}),tearBounds:tearSettings.bounds.slice(),renderThread,workerReady,workerError,workerTimestamp:workerStats?.workerTimestamp || null,sourceWidth,sourceHeight,cover:Array.from(cover),maxFps:120,cadence:renderThread==="worker" && workerStats?workerStats.cadence:{running:!paused && frozen===null,targetFps:120,observedRafHz:observedRafDuration?observedRafIntervals*1000/observedRafDuration:0,rafCallbacks,renderedFrames:cadenceFrames,measuredFps:cadenceElapsed>0?cadenceIntervals*1000/cadenceElapsed:0,windowFps,lastFrameMs,maxFrameMs,lastDrawMs,averageDrawMs:cadenceFrames?drawTotalMs/cadenceFrames:0,maxDrawMs,missedFrameSlots:frameClock.missedFrameSlots,deadlineSlotsSkipped:frameClock.missedFrameSlots,missedFrameSlotsMeaning:"target-deadlines-without-a-native-RAF",skippedRafs:rafCallbacks-cadenceFrames,scheduler:"raf-deadline",frameIntervalMs:frameInterval},pendingLoads,maskPixels,boundaryUnderfill:{layers:layers.filter(layer=>layer.underfillMode==="boundary-extend" && ["hair","cloth","foliage"].includes(layer.kind)).length,filledPixels:boundaryExtendedPixels,maxDepthSourcePixels:Math.max(0,...layers.map(layer=>layer.underfillPixels))},lightMasks:lightMaskCount,lightingEnabled,lightDeltas:lightStrength.map(n=>n*2),lightHighlights:lightHighlights.slice(),eyeGroups:eyes.map(eye=>eye.group),blinkAmounts:(eyes.some(eye=>eye.group===1)?[0,1]:[0]).map(group=>blinkEnabled?blinkAmount(time,group):0),renderer,frames,paused,ready,active,reason,error,disposed,loaded,layers:layers.length,blinkReady:loaded && !!blinkAsset,blinkEnabled,layerMotion:layers.map(layer=>describeLayerMotion(layer,time)),layerMeshes:layers.map(layer=>({asset:layer.asset,id:layer.id,vertices:layer.mesh.count,meshStep:layer.meshStep,bounds:layer.mesh.bounds.slice()})),motionKind:sourceAsset?"source-pieces":"alpha-layers",width:canvas?renderWidth:0,height:canvas?renderHeight:0,loopScheduled:renderThread==="worker"?workerReady && !paused && frozen===null && hasMotion():!!frame,rafScheduled:renderThread==="worker"?workerReady && !paused && frozen===null && hasMotion():!!frame,timerScheduled:false,interactionScheduled:!!interactionTimer,discoveringMain,time};}
  const api={getState,getStateAsync,refresh,dispose,capturePixels,freezeTime(value){stop();frozen=Number.isFinite(value)?Math.max(0,value):null;if(frozen!==null && ready)draw(frozen);refresh();return getState();}};
  win[key]=api;context.addCleanup?.(dispose);refresh();return dispose;
}
