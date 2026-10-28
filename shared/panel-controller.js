/* A single editing session stays in its original page. Only its controls travel. */
(function(){
  'use strict';
  const groups=new Map(),ownedTransports=new WeakSet();
  function transport(win){
    if(win.__SUNLIT_PANEL_TRANSPORT__)return win.__SUNLIT_PANEL_TRANSPORT__;
    const listeners=new Set();
    const bridge=win.__SUNLIT_PANEL_TRANSPORT__={
      get available(){return typeof win.sunlitTidesPanelRequest==='function';},
      send(message){if(!this.available)throw Error('外部面板尚未连接');win.sunlitTidesPanelRequest(JSON.stringify(message));},
      receive(message){for(const fn of listeners)fn(message);},
      subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}
    };
    ownedTransports.add(bridge);return bridge;
  }
  function mountSunlitPanel(options){
    const {window:win,document:doc,panel,handle,key='theme'}=options;
    if(!panel||!handle)return {dispose(){}};
    let group=groups.get(key);
    if(!group){group=createGroup(win,doc,key);groups.set(key,group);}
    return group.add(options);
  }
  function createGroup(win,doc,key){
    const bridge=transport(win),members=new Set(),nodeIds=new WeakMap(),nodeMap=new Map(),files=new Map();
    let sequence=0,revision=0,active=null,detached=false,opening=false,disposed=false,drag=null,frame=0,timer=0,lastSnapshot='',placement=null,remoteAction=false;
    const session=win.crypto.randomUUID?.()||Array.from(win.crypto.getRandomValues(new Uint8Array(18)),n=>n.toString(16).padStart(2,'0')).join('');
    const idFor=node=>{let id=nodeIds.get(node);if(!id){id='node-'+(++sequence);nodeIds.set(node,id);}nodeMap.set(id,node);return id;};
    const visible=m=>!m.panel.hidden&&m.panel.isConnected&&!m.panel.closest('[hidden]')&&win.getComputedStyle(m.panel).display!=='none';
    const send=message=>{try{return Promise.resolve(bridge.send({session,revision,...message})).catch(()=>recover('外部面板连接中断，已放回应用内。'));}catch{recover('外部面板暂不可用，仍可在应用内编辑。');}};
    function notice(text){if(!active)return;let n=active.notice;if(!n){n=doc.createElement('p');n.dataset.panelNotice='';n.setAttribute('role','status');n.style.cssText='font-size:12px;line-height:1.5;margin:8px;';active.panel.append(n);active.notice=n;}n.textContent=text;}
    function hide(m,value){if(!m)return;m.panel.style.opacity=value?'0':m.original.opacity;m.panel.style.pointerEvents=value?'none':m.original.pointerEvents;m.panel.setAttribute('data-panel-detached',String(value));}
    function recover(text){const wasOutside=opening||detached;opening=false;detached=false;win.clearTimeout(timer);if(wasOutside)try{Promise.resolve(bridge.send({type:'close',session,revision})).catch(()=>{});}catch{}hide(active,false);files.clear();if(active){clamp(active);notice(text);}lastSnapshot='';}
    function clamp(m,x,y){const r=m.panel.getBoundingClientRect();const left=Math.max(8,Math.min(Number.isFinite(x)?x:r.left,win.innerWidth-Math.min(r.width,win.innerWidth)-8));const top=Math.max(8,Math.min(Number.isFinite(y)?y:r.top,win.innerHeight-Math.min(r.height,win.innerHeight)-8));const parent=m.panel.offsetParent?.getBoundingClientRect()||{left:0,top:0};m.panel.style.left=(left-parent.left)+'px';m.panel.style.top=(top-parent.top)+'px';m.panel.style.right='auto';m.panel.style.bottom='auto';placement={left,top};}
    function screenGeometry(m,event){const r=m.panel.getBoundingClientRect(), sx=event?event.screenX-event.clientX:win.screenX,sy=event?event.screenY-event.clientY:win.screenY+Math.max(0,win.outerHeight-win.innerHeight);m.screen={x:sx,y:sy};return {width:Math.round(r.width),height:Math.round(r.height),screenX:Math.round(sx+r.left),screenY:Math.round(sy+r.top),offsetX:Math.round(event?event.clientX-r.left:30),offsetY:Math.round(event?event.clientY-r.top:20),viewport:{left:sx,top:sy,width:win.innerWidth,height:win.innerHeight}};}
    function snapshot(m){
      nodeMap.clear();
      const copy=m.panel.cloneNode(true),originals=[m.panel,...m.panel.querySelectorAll('*')],copies=[copy,...copy.querySelectorAll('*')];
      for(let i=0;i<originals.length;i++){
        const source=originals[i],el=copies[i];el.setAttribute('data-panel-node',idFor(source));
        for(const a of [...el.attributes])if(/^on/i.test(a.name)||['srcdoc','href','srcset','action','formaction','target'].includes(a.name))el.removeAttribute(a.name);
        if(source===m.handle)el.setAttribute('data-panel-drag','');
        if(source.scrollTop)el.setAttribute('data-panel-scroll-top',String(source.scrollTop));
        if(source.scrollLeft)el.setAttribute('data-panel-scroll-left',String(source.scrollLeft));
        if(source.matches('input')){el.setAttribute('value',source.value);el.toggleAttribute('checked',source.checked);}
        if(source.matches('textarea'))el.textContent=source.value;
        if(source.matches('option'))el.toggleAttribute('selected',source.selected);
        if(source.matches('details'))el.toggleAttribute('open',source.open);
        if(source.matches('img')){
          const raw=source.currentSrc||source.src;
          if(/^data:image\/(png|jpeg|webp|gif);base64,/i.test(raw)&&raw.length<160000)el.src=raw;
          else if(source.complete&&source.naturalWidth){try{const canvas=doc.createElement('canvas');canvas.width=96;canvas.height=Math.max(1,Math.round(96*source.naturalHeight/source.naturalWidth));if(canvas.height>160){canvas.height=160;canvas.width=Math.max(1,Math.round(160*source.naturalWidth/source.naturalHeight));}canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);el.src=canvas.toDataURL('image/png');}catch{el.removeAttribute('src');}}
          else el.removeAttribute('src');
        }
      }
      copy.querySelectorAll('script,iframe,frame,object,embed,link,meta,base,form,video,audio,source').forEach(n=>n.remove());
      copy.hidden=false;copy.removeAttribute('data-panel-detached');copy.style.cssText+=';position:relative!important;inset:auto!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;width:100%!important;height:100vh!important;max-height:100vh!important;min-height:0!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important;margin:0!important;box-sizing:border-box!important;';
      const shell=doc.createElement('div');shell.dataset.panelShell='';shell.dataset.mode=optionsTheme(m);shell.setAttribute('data-theme',optionsTheme(m));
      const cs=win.getComputedStyle(m.panel);shell.style.cssText=`font:${cs.font};color:${cs.color};color-scheme:${optionsTheme(m)};height:100vh;`;
      for(const name of cs)if(name.startsWith('--'))shell.style.setProperty(name,cs.getPropertyValue(name));
      shell.append(copy);
      const raw=typeof m.styleText==='function'?m.styleText():m.styleText||'';
      const css=raw.replace(/:host\(([^)]+)\)/g,'[data-panel-shell]$1').replace(/:host\b/g,'[data-panel-shell]').replace(/body\[data-dsh-sunlit\](?:\[data-sunlit-mode[^\]]*\])?/g,'[data-panel-shell]')+'\nhtml,body{margin:0;width:100%;height:100%;overflow:hidden}*{box-sizing:border-box}[data-panel-drag]{cursor:grab;touch-action:none}[data-panel-shell]{height:100vh}[hidden]{display:none!important}';
      const result={html:shell.outerHTML,css,theme:optionsTheme(m)};
      if(result.html.length+css.length>4*1024*1024)throw Error('面板内容过大，请收起素材库后重试。');
      return result;
    }
    const optionsTheme=m=>m.theme?.()==='dark'?'dark':'light';
    function update(){
      frame=0;if(disposed||(!detached&&!opening))return;
      const next=[...members].find(m=>m!==active&&visible(m));
      if(active&&!visible(active)){
        if(next){hide(active,false);active=next;hide(active,detached);}
        else{win.clearTimeout(timer);timer=win.setTimeout(()=>{if(active&&!visible(active)&&![...members].some(visible)){send({type:'close'});detached=false;opening=false;hide(active,false);}},180);return;}
      }
      try{const s=snapshot(active),json=JSON.stringify(s);if(json===lastSnapshot)return;lastSnapshot=json;revision++;send({type:'update',...s,...screenGeometry(active)});}catch(error){recover(error.message);send({type:'close'});}
    }
    const schedule=()=>{if(!frame)frame=win.requestAnimationFrame(update);};
    function open(m,e){
      if(!bridge.available){notice('桌面面板未连接，当前可在应用内拖动。');return;}
      active=m;opening=true;lastSnapshot='';revision++;
      try{const s=snapshot(m);lastSnapshot=JSON.stringify(s);send({type:'open',...s,...screenGeometry(m,e),dragging:!!e});win.clearTimeout(timer);timer=win.setTimeout(()=>{if(opening){send({type:'close'});recover('外部面板未能打开，编辑内容已保留。');}},10000);}catch(error){recover(error.message);}
    }
    const unsubscribe=bridge.subscribe(message=>{
      if(disposed||message.session&&message.session!==session)return;
      if(message.type==='error'){recover('外部面板暂不可用，编辑内容已保留在应用内。');return;}
      if(message.type==='ready'){opening=false;detached=true;win.clearTimeout(timer);hide(active,true);schedule();return;}
      if(message.type==='dock'||message.type==='closed'){
        opening=false;detached=false;files.clear();hide(active,false);win.clearTimeout(timer);
        if(active){const x=Number.isFinite(message.ownerClientX)?message.ownerClientX:Number.isFinite(message.screenX)?message.screenX-(active.screen?.x||0):placement?.left,y=Number.isFinite(message.ownerClientY)?message.ownerClientY:Number.isFinite(message.screenY)?message.screenY-(active.screen?.y||0):placement?.top;clamp(active,x,y);if(message.type==='closed'&&visible(active))notice('面板已放回应用内，修改仍然保留。');}lastSnapshot='';return;
      }
      if(message.type!=='event'||!active||message.revision>revision)return;
      const node=nodeMap.get(message.nodeId);if(!node||!active.panel.contains(node)&&node!==active.panel)return;
      const kind=message.event;
      try{
        remoteAction=true;
        if(kind==='click'){
          // Checkboxes/selects already transmit their resulting values; do not toggle twice.
          if(node.matches('button,a,summary'))node.click();
        }else if(kind==='input'||kind==='change'){
          if(!node.matches('input:not([type=file]),select,textarea')||node.disabled)return;
          if(typeof message.value==='string'&&message.value.length<=1048576)node.value=message.value;
          if(node.type==='checkbox'||node.type==='radio')node.checked=!!message.checked;
          node.dispatchEvent(new win.Event(kind,{bubbles:true}));
        }else if(kind==='key'&&message.key==='Escape'){node.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,composed:true}));}
        else if(kind==='toggle'&&node.matches('details'))node.open=!!message.open;
        else if(kind==='scroll'){node.scrollTop=Number(message.scrollTop)||0;node.scrollLeft=Number(message.scrollLeft)||0;return;}
        else if(kind==='file-start'){
          const f=message.file,json=f&&(/\.json$/i.test(f.name)||f.type==='application/json');
          if(!node.matches('input[type=file]')||!f||!Number.isSafeInteger(f.size)||f.size<0||f.size>(json?85:12)*1024*1024||files.size>=1)throw Error('素材文件超出限制');
          files.set(message.transfer,{node,file:f,index:0,size:0,chunks:[]});
        }else if(kind==='file-chunk'){
          const transfer=files.get(message.transfer);if(!transfer||transfer.node!==node||message.index!==transfer.index||typeof message.data!=='string'||message.data.length>300000)throw Error('文件传输顺序错误');
          const data=win.atob(message.data),bytes=Uint8Array.from(data,c=>c.charCodeAt(0));transfer.size+=bytes.length;if(transfer.size>transfer.file.size)throw Error('文件长度不一致');transfer.chunks.push(bytes);transfer.index++;send({type:'file-ack',transfer:message.transfer,index:message.index});return;
        }else if(kind==='file-end'){
          const transfer=files.get(message.transfer);if(!transfer||transfer.size!==transfer.file.size||message.chunks!==transfer.index)throw Error('文件传输未完成');files.delete(message.transfer);
          const file=new win.File(transfer.chunks,transfer.file.name,{type:transfer.file.type}),dt=new win.DataTransfer();dt.items.add(file);node.files=dt.files;node.dispatchEvent(new win.Event('change',{bubbles:true}));
        }else if(kind==='file')throw Error('文件未能读取，请重新选择');
      }catch(error){files.clear();notice(error.message||'操作未完成');}
      finally{remoteAction=false;schedule();}
    });
    function add(options){
      const m={...options,original:{opacity:options.panel.style.opacity,pointerEvents:options.panel.style.pointerEvents},screen:null};members.add(m);
      const {panel,handle}=m;handle.setAttribute('data-panel-drag','');handle.style.cursor='grab';handle.style.touchAction='none';
      function down(e){if(e.button!==0||e.target.closest('button,input,select,textarea,a,summary'))return;active=m;const r=panel.getBoundingClientRect();drag={m,x:e.clientX-r.left,y:e.clientY-r.top};handle.setPointerCapture(e.pointerId);e.preventDefault();}
      function move(e){if(drag?.m!==m||opening||detached)return;const x=e.clientX-drag.x,y=e.clientY-drag.y;clamp(m,x,y);if(e.clientX<=3||e.clientX>=win.innerWidth-3||e.clientY<=3||e.clientY>=win.innerHeight-3)open(m,e);}
      function up(){drag=null;}
      function click(e){if(detached&&remoteAction&&e.target.matches('input[type=file]')){e.preventDefault();send({type:'pick-file',nodeId:idFor(e.target),accept:e.target.accept,multiple:false});}}
      function changed(){if(!detached&&!opening&&visible(m)&&placement&&active!==m){active=m;clamp(m,placement.left,placement.top);}schedule();}
      handle.addEventListener('pointerdown',down);handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up);panel.addEventListener('click',click,true);panel.addEventListener('input',schedule);panel.addEventListener('change',schedule);
      const observer=new win.MutationObserver(changed);observer.observe(panel,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','open','value','checked','class','disabled','aria-pressed','aria-selected']});
      return {dispose(){observer.disconnect();handle.removeEventListener('pointerdown',down);handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up);panel.removeEventListener('click',click,true);panel.removeEventListener('input',schedule);panel.removeEventListener('change',schedule);hide(m,false);members.delete(m);if(active===m){send({type:'close'});active=null;detached=opening=false;}if(!members.size){disposed=true;unsubscribe();win.clearTimeout(timer);win.cancelAnimationFrame(frame);files.clear();groups.delete(key);if(ownedTransports.has(bridge)&&win.__SUNLIT_PANEL_TRANSPORT__===bridge&&![...groups.values()].some(g=>g.bridge===bridge))delete win.__SUNLIT_PANEL_TRANSPORT__;}},refresh:schedule};
    }
    return {add,bridge};
  }
  window.mountSunlitPanel=mountSunlitPanel;
})();
