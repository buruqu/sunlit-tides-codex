/* Sunlit Tides DIY core. No host selectors, network requests or executable imports. */
(function (global) {
  'use strict';
  const SCHEMA = 'sunlit-tides-project', VERSION = 1;
  const MAX_ASSET = 12 * 1024 * 1024, MAX_TOTAL = 60 * 1024 * 1024, MAX_JSON = 85 * 1024 * 1024;
  const KINDS = ['background', 'sidebar', 'portrait', 'emote', 'image', 'effect', 'region'];
  const BUILTINS = Object.freeze({background:'background',sidebar:'sidebar','chat-background':'background','composer-background':'background','toolbar-background':'background','portrait-left':'portrait','portrait-right':'portrait','emote-left':'emote','emote-right':'emote','effect-default':'effect','sidebar-region':'region','chat-region':'region','composer-region':'region'});
  const USES = [['image','自由图片'],['background','主背景'],['sidebar','侧栏背景'],['chat-background','聊天区背景'],['composer-background','输入框背景'],['toolbar-background','顶部功能栏背景'],['portrait-left','左立绘'],['portrait-right','右立绘'],['emote-left','左表情'],['emote-right','右表情'],['effect','特效粒子纹理']];
  const MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  // Strings are immutable: share image strings between history entries instead of
  // repeatedly JSON-encoding/decoding many MiB of base64 on each keystroke.
  const copy = value => Array.isArray(value) ? value.map(copy) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key,item])=>[key,copy(item)])) : value;
  const number = (value, min, max, fallback) => Number.isFinite(+value) ? Math.max(min, Math.min(max, +value)) : fallback;
  const uid = () => 'diy-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  const baseCSS = `:host{all:initial;font:13px/1.5 system-ui,"Microsoft YaHei",sans-serif;color:#f5f0fa;position:fixed;inset:0;pointer-events:none;z-index:2147483600}*{box-sizing:border-box}[hidden]{display:none!important}button,input,select{font:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.45}button,input,select{border:1px solid #74647e;border-radius:7px;padding:7px;background:#322a40;color:inherit}input,select{width:100%;min-width:0}button:hover{background:#51405d}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #dbc1fa;outline-offset:2px}.panel{z-index:1000;pointer-events:auto;position:absolute;right:16px;top:56px;width:min(390px,calc(100vw - 24px));max-height:calc(100vh - 72px);overflow:auto;border:1px solid #a78cb3;border-radius:16px;background:#241d30f5;box-shadow:0 12px 60px #0007;padding:15px}.bar,.actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.bar h2{font-size:17px;margin:0;flex:1}.subtitle{color:#c4b4cf;font-size:12px}.actions{margin:10px 0}.actions button{flex:1;white-space:nowrap}.primary{background:#6e4f83}.list{display:grid;gap:5px;max-height:180px;overflow:auto;margin:10px 0}.layer{display:flex;gap:6px;align-items:center;border:1px solid #64536f;border-radius:8px;padding:4px}.layer[data-selected=true]{border-color:#ead0ff;background:#584365}.layer .pick{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;background:transparent}.layer .toggle{padding:4px 7px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}label{display:grid;gap:3px;color:#e1d7e8;font-size:12px}.wide{grid-column:1/-1}.check{display:flex;align-items:center;gap:6px}.check input{width:auto}.notice{white-space:pre-wrap;font-size:12px;min-height:20px;color:#d4c3e1}.notice[data-error=true]{color:#ffb5b5}.pending{padding:9px;border:1px solid #e7c18d;border-radius:9px;background:#59422c}.boxes{z-index:0;position:absolute;inset:0;pointer-events:none}.box{position:absolute;pointer-events:auto;border:1px dashed #e8c1ff;cursor:move;touch-action:none;transform-origin:center;background:#b975ff09}.box[data-selected=true]{border:2px solid #ffe0a4}.box-label{position:absolute;top:0;left:0;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;background:#30213fe8;color:#fff;padding:2px 6px;font-size:11px;pointer-events:none}.resize{position:absolute;right:-6px;bottom:-6px;width:14px;height:14px;border:2px solid white;border-radius:3px;background:#8860a1;cursor:nwse-resize}.assets{display:flex;gap:6px;overflow:auto;padding:4px 0}.asset{min-width:82px;max-width:100px;font-size:11px;overflow:hidden;text-overflow:ellipsis}.asset img{display:block;width:55px;height:42px;object-fit:contain;margin:auto}.section{border-top:1px solid #5b4965;margin-top:13px;padding-top:8px}summary{cursor:pointer;font-weight:600}small{font-size:11px;color:#c4b4cf}hr{border:0;border-top:1px solid #5b4965}.editing-indicator{z-index:1001;pointer-events:auto;position:absolute;top:8px;left:50%;transform:translateX(-50%);background:#30213ff5;border:1px solid #d5b6e5;border-radius:10px;padding:7px 12px;display:flex;gap:10px;align-items:center}.editing-indicator button{padding:4px 9px}@media(max-width:650px){.panel{right:6px;top:48px;max-height:calc(100vh - 54px);width:min(350px,calc(100vw - 12px))}.editing-indicator{left:6px;transform:none;font-size:11px}.editing-indicator span{display:none}}.panel{display:flex;flex-direction:column;overflow:hidden;padding:0}.panel>.bar{padding:12px 14px 6px;flex-shrink:0}.panel>.subtitle,.panel>.notice{padding:0 14px}.editor-tabs{display:flex;gap:5px;padding:8px 14px;border-bottom:1px solid #5b4965}.editor-tabs button{flex:1;min-width:40px}.editor-tabs button[aria-pressed=true]{background:#6e4f83;border-color:#dbc1fa}.panel-body{overflow:auto;padding:0 14px 10px;min-height:0}.panel-footer{flex-shrink:0;flex-wrap:nowrap;padding:10px 12px;margin:0;border-top:1px solid #5b4965;background:#241d30}.panel-footer button{min-width:40px;padding:7px 8px;white-space:nowrap}`;

  function mountSunlitDiy(options) {
    const win = options.window || global, doc = options.document || win.document, adapter = options.adapter;
    if (!adapter || !adapter.getMode || !adapter.getBuiltins || !adapter.apply) throw new Error('编辑器 adapter 接口不完整');
    const platform = options.platform === 'dsh' ? 'dsh' : 'codex';
    const previousAPI = win.__SUNLIT_DIY__;
    if (previousAPI && previousAPI.dispose) previousAPI.dispose();
    let panelTransport = null, activeTab='素材';
    let disposed = false, opened = false, editing = false, loading = true, saving = false, loadSerial = 0, operationEpoch = 0, db = null;
    let mode = adapter.getMode() === 'dark' ? 'dark' : 'light';
    let saved = empty(), draft = empty(), previous = null, selected = null, pending = null, assets = [], stagedModes = null;
    let undo = [], redo = [], storageQueue = Promise.resolve(), gesture = null, fieldNodes = {}, saveTimer = null;
    const sessionId=uid(),sessionKey='_session:'+sessionId,reservations=new Set();
    let releaseSessionLock=null,lockProtected=false,pinsQueue=Promise.resolve(),lastPins='';
    const locks=win.navigator&&win.navigator.locks;
    const sessionReady=locks&&locks.request?new Promise(resolve=>{
      locks.request('sunlit-diy-session:'+sessionId,lock=>{lockProtected=!!lock;if(disposed){resolve();return;}resolve();return new Promise(release=>{releaseSessionLock=release;});}).catch(()=>resolve());
    }):Promise.resolve();
    const listeners = [], host = doc.createElement('div');
    host.id = 'sunlit-diy-editor'; host.dataset.sunlitDiy = 'true'; host.dataset.sunlitDiyEditor = '';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style'); style.textContent = options.cssText || baseCSS; shadow.append(style);
    const boxes = element('div', { className: 'boxes', tabIndex:-1 });
    const panel = element('section', { className: 'panel', role: 'dialog', 'aria-label': '素材与布局编辑器', hidden: true });
    const indicator = element('div', { className: 'editing-indicator', hidden: true });
    indicator.append(element('b', {}, '画布编辑'), element('span', {}, '拖动图层或右下角缩放；Esc 取消本次编辑'));
    indicator.append(button('显示面板', () => { opened = true; renderVisibility(); }));
    shadow.append(boxes, indicator, panel); (doc.body || doc.documentElement).append(host);
    const heading = element('div', { className: 'bar', 'data-sunlit-panel-handle':'' }); heading.append(element('h2', {}, '素材与布局'));
    heading.append(button('关闭', close, { 'aria-label': '关闭编辑面板' })); panel.append(heading);
    const subtitle = element('div', { className: 'subtitle' }); panel.append(subtitle);
    const status = element('div', { className: 'notice', role: 'status', 'aria-live': 'polite' }); panel.append(status);
    const topActions = element('div', { className: 'actions' });
    const editButton = button('开启编辑', startEditing, { className: 'primary' });
    const saveButton = button('保存并退出', saveAndExit, { className: 'primary', hidden: true });
    const cancelButton = button('取消编辑', cancelEditing, { hidden: true });
    const collapseButton = button('收起面板',()=>{opened=false;renderVisibility();focusCanvas();},{hidden:true});
    topActions.append(editButton, saveButton, cancelButton, collapseButton); panel.append(topActions);
    const historyActions = element('div', { className: 'actions' });
    const undoButton = button('撤销', doUndo), redoButton = button('重做', doRedo);
    historyActions.append(undoButton, redoButton, button('恢复默认', reset), button('恢复上次保存', restorePrevious)); panel.append(historyActions);
    const layerList = element('div', { className: 'list', 'aria-label': '图层列表' }); panel.append(layerList);
    const pendingNotice = element('div', { className: 'pending', hidden: true });
    pendingNotice.append(element('b', {}, '素材预览 · 可先调整参数'));
    const pendingActions = element('div', { className: 'actions' });
    pendingActions.append(button('调整预览',()=>{if(pending){selected=pending.id;renderProperties();renderBoxes();}}),button('确认添加', confirmPending), button('取消新增', cancelPending)); pendingNotice.append(pendingActions); panel.append(pendingNotice);
    const properties = element('div', { 'aria-label': '素材参数' }); panel.append(properties);
    const addSection = element('details', { className: 'section', open: true }); addSection.append(element('summary', {}, '新增素材 / 特效'));
    const addGrid = element('div', { className: 'grid' });
    const newName = input('text', '新素材名称'); newName.placeholder = '先为素材命名';
    const newKind = select('素材用途', USES);
    addGrid.append(label('素材名称', newName), label('素材用途', newKind)); addSection.append(addGrid);
    const importImage = input('file', '导入素材文件'); importImage.accept = MIME.join(','); importImage.hidden = true;
    listen(importImage, 'change', () => { const file = importImage.files && importImage.files[0]; if (file) run(() => addFile(file)); importImage.value = ''; });
    const addActions = element('div', { className: 'actions' });
    addActions.append(button('导入图片 / GIF', () => importImage.click()), button('落叶预设', () => addEffect('leaf')), button('泡泡预设', () => addEffect('bubble')));
    addSection.append(element('small',{},'应用范围：当前平台、当前明暗方案。固定用途替换对应位置；自由图片可重复添加。'), addActions, importImage, element('small', {}, 'PNG / JPEG / WebP / GIF；单素材 ≤12 MiB，素材库合计 ≤60 MiB。不会导入脚本、SVG 或远程 URL。'));
    const library = element('div', { className: 'assets', 'aria-label': '素材库' }); addSection.append(library);
    addSection.append(button('清理未使用素材',cleanUnusedAssets),element('small',{},'仅清理完全无引用的素材；两平台亮暗方案、恢复槽、活动草稿和撤销历史均受保护。'));panel.append(addSection);
    const typographySection = element('details', { className: 'section' }); typographySection.append(element('summary', {}, '字体与文字颜色'));
    const typographyGrid = element('div', { className: 'grid' }); typographySection.append(typographyGrid); panel.append(typographySection);
    const typeNodes = {};
    [['family','字体','text'],['fontSize','字号 px','number'],['lineHeight','行高','number'],['color','文字颜色','text'],['gradientStart','渐变起点','text'],['gradientEnd','渐变终点','text']].forEach(([key,text,type]) => {
      const node = input(type, text); node.placeholder = key === 'family' ? '跟随默认' : key.includes('olor') || key.includes('gradient') ? '#RRGGBB / 留空默认' : '跟随默认';
      if (type === 'number') { node.min = key === 'fontSize' ? '10' : '1'; node.max = key === 'fontSize' ? '48' : '3'; node.step = key === 'fontSize' ? '1' : '0.1'; }
      listen(node, 'input', () => changeTypography(key, node.value)); typeNodes[key] = node; typographyGrid.append(label(text,node));
    });
    const gradient = input('checkbox', '启用渐变文字'); listen(gradient, 'change', () => changeTypography('gradientEnabled', gradient.checked)); typeNodes.gradientEnabled = gradient;
    typographyGrid.append(label('启用渐变文字', gradient, 'check wide'));
    typographySection.append(button('字体跟随默认', () => { checkpoint(); draft.typography = null; changed(); renderTypography(); }));
    const transfer = element('div', { className: 'actions section' });
    const importProject = input('file', '导入工程文件'); importProject.accept = 'application/json,.json'; importProject.hidden = true;
    listen(importProject, 'change', () => { const file = importProject.files && importProject.files[0]; if (file) run(() => importFile(file)); importProject.value = ''; });
    transfer.append(button('导出分享工程', exportProject), button('导入工程', () => importProject.click()), importProject); panel.append(transfer);

    const tabs=element('nav',{className:'editor-tabs','aria-label':'编辑分类'}),body=element('div',{className:'panel-body'});
    ['素材','布局','字体','特效'].forEach(name=>{const node=button(name,()=>{activeTab=name;renderTabs();if(name==='字体')typographySection.open=true;if(name==='布局'){const layer=allLayers().find(item=>item.kind==='region');if(layer){selected=layer.id;renderProperties();renderList();}}if(name==='特效'){newKind.value='effect';const layer=allLayers().find(item=>item.kind==='effect');if(layer){selected=layer.id;renderProperties();renderList();}}},{'aria-pressed':String(name===activeTab)});tabs.append(node);});
    body.append(historyActions,layerList,pendingNotice,properties,addSection,typographySection,transfer);
    topActions.classList.add('panel-footer');panel.replaceChildren(heading,subtitle,status,tabs,body,topActions);
    function renderTabs(){for(const node of tabs.children)node.setAttribute('aria-pressed',String(node.textContent===activeTab));layerList.hidden=activeTab==='字体';properties.hidden=activeTab==='字体';addSection.hidden=!['素材','特效'].includes(activeTab);typographySection.hidden=activeTab!=='字体';if(activeTab==='字体')typographySection.open=true;}

    function empty() { return { layers: [], typography: null, foreignLayouts: {} }; }
    function element(tag, attrs, text) {
      const node = doc.createElement(tag);
      Object.entries(attrs || {}).forEach(([key, value]) => { if (key in node && !key.startsWith('aria-') && key !== 'role') node[key] = value; else node.setAttribute(key, String(value)); });
      if (text != null) node.textContent = text; return node;
    }
    function listen(node, event, handler, options) { node.addEventListener(event, handler, options); if (node === win || node === doc) listeners.push(() => node.removeEventListener(event, handler, options)); }
    function button(text, action, attrs) { const node = element('button', Object.assign({ type: 'button' }, attrs), text); listen(node, 'click', () => run(action)); return node; }
    function input(type, name) { return element('input', { type, 'aria-label': name }); }
    function select(name, values) { const node = element('select', { 'aria-label': name }); values.forEach(([value,text]) => node.append(element('option', { value }, text))); return node; }
    function label(text, node, className) { const result = element('label', { className: className || '' }); result.append(element('span', {}, text), node); return result; }
    function notice(text, error) { if (disposed) return; status.textContent = text; status.dataset.error = String(!!error); }
    async function run(action) { try { if (disposed) return; await ready; if (disposed) return; await action(); } catch (error) { notice(error.message || String(error), true); } }
    function baseLayers() {
      const width = win.innerWidth || 1, height = win.innerHeight || 1;
      return (adapter.getBuiltins(mode) || []).map((item, index) => {
        const rect = item.rect || { x:0,y:0,width,height };
        return normalizeLayer({ id:item.id, name:item.name || item.id, kind:item.kind, builtin:true, source:item.source || '', enabled:item.enabled !== false, locked:false,
          x:rect.x/width*100,y:rect.y/height*100,width:rect.width/width*100,height:rect.height/height*100,rotation:0,flipX:!!item.flipX,opacity:item.opacity == null ? 100 : item.opacity,z:index,fit:item.fit==='contain'?'contain':'cover',blur:0,effect:item.effect }, false);
      });
    }
    function pixelRatio(layer) { return layer.width*(win.innerWidth||1)/(layer.height*(win.innerHeight||1)); }
    const aspectWarnings=new Set(),aspectWarningText='该极端比例无法在当前尺寸范围锁定，已关闭保持比例；完整显示仍保留原图比例。';
    function aspectFeasible(layer) {const ratio=layer.aspectRatio||pixelRatio(layer),vw=win.innerWidth||1,vh=win.innerHeight||1;return Math.max(vw*.001,vh*.001*ratio)<=Math.min(vw*2,vh*2*ratio);}
    function linkedSize(layer,key,value) {
      layer[key]=number(value,0.1,200,layer[key]);
      if(!layer.lockAspect||layer.kind==='region')return;
      const ratio=layer.aspectRatio||pixelRatio(layer),vw=win.innerWidth||1,vh=win.innerHeight||1;
      let width=key==='height'?layer.height*vh/100*ratio:layer.width*vw/100;
      const min=Math.max(vw*0.001,vh*0.001*ratio),max=Math.min(vw*2,vh*2*ratio);
      if(min>max){layer.lockAspect=false;layer.width=number(layer.width,.1,200,100);layer.height=number(layer.height,.1,200,100);const warningKey=layer.id+':'+vw+':'+vh+':'+ratio;if(!aspectWarnings.has(warningKey)){aspectWarnings.add(warningKey);notice(aspectWarningText);}return;}
      width=Math.min(max,Math.max(Math.min(min,max),width));
      layer.width=number(width/vw*100,.1,200,layer.width);layer.height=number(width/ratio/vh*100,.1,200,layer.height);layer.aspectRatio=ratio;
    }
    function viewLayer(value) {
      const layer=copy(value);
      if(layer.lockAspect&&layer.kind!=='region'&&Number.isFinite(layer.aspectRatio))linkedSize(layer,'width',layer.width);
      if((layer.kind==='region'||layer.followRegion)&&typeof adapter.constrainLayer==='function'){
        try{const result=adapter.constrainLayer(copy(layer));if(result&&typeof result==='object')Object.entries({x:[-100,200],y:[-100,200],width:[0.1,200],height:[0.1,200]}).forEach(([key,[min,max]])=>{if(typeof result[key]==='number'&&Number.isFinite(result[key]))layer[key]=number(result[key],min,max,layer[key]);});}catch(error){notice('布局约束失败：'+error.message,true);}
      }
      return layer;
    }
    function allLayers() {
      const defaults = baseLayers(), overrides = new Map(draft.layers.map(layer => [layer.id,layer]));
      const layers = defaults.map(layer => { if(!overrides.has(layer.id))return layer; const changed=overrides.get(layer.id);return Object.assign({},layer,changed,{source:changed.sourceRef?layer.source:changed.source}); });
      const ids = new Set(defaults.map(layer => layer.id)); draft.layers.forEach(layer => { if (!ids.has(layer.id)) layers.push(layer); });
      return layers.map(viewLayer);
    }
    function activeLayer() { return pending && selected === pending.id ? viewLayer(pending) : allLayers().find(layer => layer.id === selected); }
    function mutableLayer() {
      if (pending && selected === pending.id) {Object.assign(pending,viewLayer(pending));return pending;}
      let layer = draft.layers.find(item => item.id === selected);
      if (!layer) { const found = activeLayer(); if (!found) return null; layer = copy(found); draft.layers.push(layer); }
      else Object.assign(layer,viewLayer(layer));
      return layer;
    }
    function effectiveLayers() { const builtins = new Map(baseLayers().map(layer=>[layer.id,layer]));return draft.layers.filter(layer=>!pending||(layer.id!==pending.id&&layer.id!==pending._originId)).concat(pending ? [pending] : []).map(layer=>{const result=viewLayer(layer);if(result.sourceRef&&builtins.has(result.id))result.source=builtins.get(result.id).source;return result;}); }
    function syncGeometryInputs() { const layer=activeLayer();if(!layer)return;['x','y','width','height'].forEach(key=>{if(fieldNodes[key])fieldNodes[key].value=String(Math.round(layer[key]*10000)/10000);});if(fieldNodes.lockAspect)fieldNodes.lockAspect.checked=!!layer.lockAspect;if(fieldNodes.followRegion)fieldNodes.followRegion.checked=!!layer.followRegion;if(fieldNodes.aspectHint)fieldNodes.aspectHint.hidden=aspectFeasible(layer); }
    function constrainGeometry(layer) {const result=viewLayer(layer);Object.entries({x:[-100,200],y:[-100,200],width:[.1,200],height:[.1,200]}).forEach(([key,[min,max]])=>layer[key]=number(result[key],min,max,layer[key]));}
    function focusCanvas() {if(editing)boxes.focus({preventScroll:true});}
    function quickPosition(action) {
      const current=activeLayer();if(!current)return;checkpoint();const layer=mutableLayer();layer.followRegion=false;
      if(action==='horizontal')layer.x=(100-layer.width)/2;
      else if(action==='vertical')layer.y=(100-layer.height)/2;
      else{
        const vw=win.innerWidth||1,vh=win.innerHeight||1,angle=layer.rotation*Math.PI/180,c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
        let width=layer.width*vw/100,height=layer.height*vh/100;
        const scale=Math.min(1,vw/(width*c+height*s),vh/(width*s+height*c)),nextWidth=width*scale/vw*100,nextHeight=height*scale/vh*100;
        if(layer.lockAspect&&(nextWidth<.1-1e-10||nextHeight<.1-1e-10)){layer.lockAspect=false;notice('移回画布时无法同时保持该比例与最小尺寸，已关闭保持比例；完整显示仍保留原图比例。');}
        width=number(nextWidth,.1,200,layer.width)*vw/100;height=number(nextHeight,.1,200,layer.height)*vh/100;
        const extentX=(width*c+height*s)/2,extentY=(width*s+height*c)/2;
        const centerX=Math.max(extentX,Math.min(vw-extentX,layer.x*vw/100+width/2)),centerY=Math.max(extentY,Math.min(vh-extentY,layer.y*vh/100+height/2));
        layer.width=width/vw*100;layer.height=height/vh*100;layer.x=(centerX-width/2)/vw*100;layer.y=(centerY-height/2)/vh*100;
      }
      constrainGeometry(layer);changed({previewOnly:!!pending&&selected===pending.id});syncGeometryInputs();
    }
    function apply() { if (!disposed) adapter.apply(effectiveLayers(), draft.typography ? copy(draft.typography) : null, mode); }
    function snapshot() { return { draft:copy(draft), pending:copy(pending), stagedModes:copy(stagedModes), selected }; }
    function checkpoint() { undo.push(snapshot()); if (undo.length > 80) undo.shift(); redo = []; }
    function restoreSnapshot(value) { draft = value.draft; pending = value.pending; stagedModes = value.stagedModes; selected = value.selected; changed(); render(); }
    function doUndo() { if (!undo.length) return; redo.push(snapshot()); restoreSnapshot(undo.pop()); }
    function doRedo() { if (!redo.length) return; undo.push(snapshot()); restoreSnapshot(redo.pop()); }
    function changed(options) {
      apply(); renderBoxes(); renderList(); updateHistory(); syncPins();
      if (!editing && !(options && options.previewOnly)) scheduleSave();
    }
    function updateHistory() { undoButton.disabled = !undo.length; redoButton.disabled = !redo.length; }
    function scheduleSave() { persist(copy(draft)).catch(error=>notice(error.message,true)); }
    function compactState(value) { const result=copy(value);result.layers=result.layers.map(layer=>{if(layer.builtin&&!layer.assetId){layer.source='';layer.sourceRef=true;}else if(layer.assetId){layer.source='';delete layer.sourceRef;}return layer;});return result; }
    function key(forMode) { return platform + ':' + (forMode || mode); }
    function transaction(storeNames, operation, write) {
      return new Promise((resolve,reject) => {
        if (!db) return reject(new Error('本地存储不可用；当前预览仍保留，可导出工程备份。'));
        const tx = db.transaction(storeNames, write ? 'readwrite' : 'readonly'); let result;
        try { result = operation(tx); } catch(error) { tx.abort(); reject(new Error((error.name==='QuotaExceededError'?'存储空间不足':'本地存储读写失败')+'；未覆盖上次成功保存的工程，当前预览可导出备份。')); return; }
        tx.oncomplete = () => resolve(typeof result === 'function' ? result() : result);
        tx.onabort = tx.onerror = () => reject(new Error((tx.error && tx.error.name === 'QuotaExceededError' ? '存储空间不足' : '本地存储读写失败') + '；未覆盖上次成功保存的工程，当前预览可导出备份。'));
      });
    }
    function readRecord(recordKey) { let request; return transaction(['projects'], tx => { request = tx.objectStore('projects').get(recordKey); return () => request.result; }); }
    function collectAssetIds(value,result) {
      if(!value||typeof value!=='object')return result;
      if(Array.isArray(value)){value.forEach(item=>collectAssetIds(item,result));return result;}
      if(typeof value.assetId==='string')result.add(value.assetId);
      Object.values(value).forEach(item=>{if(item&&typeof item==='object')collectAssetIds(item,result);});return result;
    }
    function localAssetIds() { const result=new Set(reservations);[saved,previous,draft,pending,stagedModes,undo,redo].forEach(value=>collectAssetIds(value,result));return result; }
    function sessionRecord(ids) { return {key:sessionKey,session:true,lockProtected,pins:[...(ids||localAssetIds())]}; }
    function syncPins() {
      if(!db||disposed||loading)return;
      const ids=localAssetIds(),signature=[...ids].sort().join('|');if(signature===lastPins)return;lastPins=signature;
      pinsQueue=transaction(['projects'],tx=>tx.objectStore('projects').put(sessionRecord(ids)),true).catch(error=>{lastPins='';notice(error.message,true);});
    }
    async function pinAsset(id) {
      if(!id)return;reservations.add(id);let missing=false,writeError;
      try {await transaction(['assets','projects'],tx=>{const request=tx.objectStore('assets').get(id);request.onsuccess=()=>{if(!request.result){missing=true;return;}try{tx.objectStore('projects').put(sessionRecord());}catch(error){writeError=error;tx.abort();}};},true);}
      catch(error){reservations.delete(id);if(writeError&&writeError.name==='QuotaExceededError')throw new Error('存储空间不足；未开始新增预览。');throw error;}
      if(missing){reservations.delete(id);assets=assets.filter(asset=>asset.id!==id);renderLibrary();throw new Error('素材已被另一窗口清理，请重新导入。');}
    }
    async function cleanUnusedAssets() {
      notice('正在核对各平台方案、恢复槽和活动草稿的素材引用…');
      await storageQueue.catch(()=>{});await pinsQueue.catch(()=>{});if(disposed)return;
      let request;const records=await transaction(['projects'],tx=>{request=tx.objectStore('projects').getAll();return()=>request.result||[];});
      const stale=new Set();let conservative=false;
      for(const record of records.filter(value=>value.session&&value.key!==sessionKey)){
        if(record.lockProtected&&locks&&locks.request){const id=record.key.slice('_session:'.length);await locks.request('sunlit-diy-session:'+id,{ifAvailable:true},lock=>{if(lock)stale.add(record.key);});}
        else conservative=true;
      }
      if(disposed)return;let removed=0,freed=0,remaining=[];
      await transaction(['projects','assets'],tx=>{
        const projects=tx.objectStore('projects'),assetStore=tx.objectStore('assets'),projectsRequest=projects.getAll(),assetsRequest=assetStore.getAll();let projectRows,assetRows;
        const finish=()=>{if(!projectRows||!assetRows)return;const referenced=localAssetIds();projectRows.forEach(record=>{
          if(stale.has(record.key)){projects.delete(record.key);return;}
          if(record.session)(record.pins||[]).forEach(id=>referenced.add(id));else{collectAssetIds(record.value,referenced);collectAssetIds(record.previous,referenced);}
        });assetRows.forEach(asset=>{if(referenced.has(asset.id))remaining.push(asset);else{assetStore.delete(asset.id);removed++;freed+=asset.bytes||0;}});};
        projectsRequest.onsuccess=()=>{try{projectRows=projectsRequest.result||[];finish();}catch(_){tx.abort();}};assetsRequest.onsuccess=()=>{try{assetRows=assetsRequest.result||[];finish();}catch(_){tx.abort();}};
      },true);
      if(disposed)return;assets=remaining;renderLibrary();notice('已清理 '+removed+' 个未使用素材，释放 '+(freed/1024/1024).toFixed(2)+' MiB。保存方案、恢复槽、活动草稿和撤销历史引用均保留。'+(conservative?' 无法确认部分旧窗口状态，已保守保留其引用。':''));
    }
    async function persist(next) {
      const targetMode = mode, recordKey = key(targetMode), compact=compactState(next);let nextPrevious=empty();
      storageQueue = storageQueue.catch(() => {}).then(async () => {
        let writeError;
        try { await transaction(['projects'], tx => {const store=tx.objectStore('projects'),request=store.get(recordKey);request.onsuccess=()=>{try{nextPrevious=request.result?request.result.value:empty();store.put({key:recordKey,schema:VERSION,value:compact,previous:nextPrevious});}catch(error){writeError=error;tx.abort();}};}, true); }
        catch(error) { if(writeError&&writeError.name==='QuotaExceededError')throw new Error('存储空间不足；未覆盖上次成功保存的工程，当前预览可导出备份。');throw error; }
        if (!disposed && mode === targetMode) { previous = nextPrevious; saved = copy(next); notice(editing ? '工程已保存。' : '参数已自动保存。'); }
        return true;
      });
      return await storageQueue;
    }
    async function persistModes(values) {
      const next=copy(values);let prior={};
      storageQueue=storageQueue.catch(()=>{}).then(async()=>{
        let writeError;
        try { await transaction(['projects'],tx=>{
          const store=tx.objectStore('projects');['light','dark'].forEach(targetMode=>{const request=store.get(key(targetMode));request.onsuccess=()=>{try{prior[targetMode]=request.result?request.result.value:empty();store.put({key:key(targetMode),schema:VERSION,value:compactState(next[targetMode]),previous:prior[targetMode]});}catch(error){writeError=error;tx.abort();}};});
        },true); } catch(error) {if(writeError&&writeError.name==='QuotaExceededError')throw new Error('存储空间不足；亮暗方案均未覆盖，当前预览可导出备份。');throw error;}
        if(!disposed){previous=prior[mode];saved=copy(next[mode]);notice('亮暗工程已保存。');}return true;
      });return await storageQueue;
    }
    async function openDatabase() {
      return new Promise((resolve,reject) => {
        if (!win.indexedDB) return reject(new Error('当前环境不支持 IndexedDB；可预览与导出，但不能保存。'));
        const request = win.indexedDB.open('sunlit-tides-diy-v1', 1);
        request.onupgradeneeded = () => { const result = request.result; result.createObjectStore('projects', { keyPath:'key' }); result.createObjectStore('assets', { keyPath:'id' }); };
        request.onerror = () => reject(new Error('无法打开本地素材库；当前预览仍保留，请导出工程备份。'));
        request.onblocked = () => notice('素材库等待其他窗口释放；关闭旧版编辑窗口后重试。', true);
        request.onsuccess = () => { if (disposed) { request.result.close(); resolve(null); } else { request.result.onversionchange = () => request.result.close(); resolve(request.result); } };
      });
    }
    async function loadMode(nextMode) {
      const serial = ++loadSerial; ++operationEpoch; loading = true; mode = nextMode; pending = null; stagedModes = null; undo = []; redo = []; selected = null;
      try {
        const record = await readRecord(key(nextMode));
        if (disposed || serial !== loadSerial) return;
        const value = record ? await validateState(record.value, false) : empty();
        if (disposed || serial !== loadSerial) return;
        let prior = null; try { prior = record && record.previous ? await validateState(record.previous, false) : null; } catch (_) { /* A damaged recovery slot must not discard the valid current project. */ }
        saved = copy(value); draft = copy(value); previous = prior;
        if (disposed || serial !== loadSerial) return;
        loading = false; apply(); render(); notice(record ? '已载入此模式的保存方案。' : '跟随原预设；选择图层可调整参数。');
      } catch(error) { if (disposed || serial !== loadSerial) return; loading = false; saved = empty(); draft = empty(); previous = null; apply(); render(); notice(error.message, true); }
    }
    async function init() {
      try {
        await sessionReady;if(disposed)return;
        db = await openDatabase(); if (disposed) return;
        let request; assets = await transaction(['assets'], tx => { request = tx.objectStore('assets').getAll(); return () => request.result || []; });
        if (disposed) return;
        await loadMode(mode);
      } catch(error) { if (!disposed) { loading = false; render(); notice(error.message, true); } }
    }
    const ready = init();
    function renderVisibility() { panel.hidden = !opened; indicator.hidden = !editing; editButton.hidden = editing; saveButton.hidden = !editing; cancelButton.hidden = !editing;collapseButton.hidden=!editing; }
    function render() { if (disposed) return; renderVisibility();renderTabs(); subtitle.textContent = (mode === 'dark' ? '暗色方案' : '亮色方案') + ' · ' + platform.toUpperCase() + (editing ? ' · 草稿预览' : ' · 参数即时保存'); renderList(); renderProperties(); renderTypography(); renderLibrary(); renderBoxes(); updateHistory(); syncPins(); }
    function renderList() {
      layerList.replaceChildren();
      allLayers().forEach(layer => {
        const row = element('div', { className:'layer', 'data-selected': String(selected === layer.id), 'data-layer-id':layer.id });
        const pick = button(layer.name, () => { selected = layer.id; renderList(); renderProperties(); renderBoxes(); focusCanvas(); }, { className:'pick', title:layer.name });
        const visible = button(layer.enabled ? '◉' : '○', () => { checkpoint(); selected = layer.id; const target = mutableLayer(); target.enabled = !target.enabled; changed(); renderProperties(); }, { className:'toggle', 'aria-label':(layer.enabled ? '隐藏 ' : '显示 ') + layer.name });
        if(layer.kind!=='region')row.append(visible);row.append(pick); if (layer.locked) row.append(element('small',{},'锁定')); layerList.append(row);
      });
      pendingNotice.hidden = !pending;
    }
    function renderProperties() {
      properties.replaceChildren(); fieldNodes = {};
      const layer = activeLayer();
      if (!layer) { properties.append(element('small',{},loading ? '正在读取本地素材库…' : '选择一个图层，参数与画布同步。')); return; }
      const title = element('b',{},(pending && layer.id === pending.id ? '预览：' : '参数：') + layer.name); properties.append(title);
      if(layer.builtin&&layer.id==='background')properties.append(element('div',{className:'subtitle'},'完整显示使用原始图片；切回铺满恢复场景动态。'));
      const grid = element('div',{className:'grid'}); properties.append(grid);
      if(layer.kind!=='region'){const usage=select('当前素材用途',USES);usage.value=layer.builtin&&BUILTINS[layer.id]&&layer.kind!=='effect'?layer.id:layer.kind==='effect'?'effect':'image';listen(usage,'change',()=>run(()=>changeUse(usage.value)));properties.insertBefore(label('素材用途',usage),grid);}
      function field(key, text, type, min, max, step, values) {
        const node = values ? select(text, values) : input(type,text);
        if (type === 'checkbox') node.checked = !!layer[key]; else node.value = layer[key] == null ? '' : String(layer[key]);
        if (min != null) node.min = String(min); if (max != null) node.max = String(max); if (step != null) node.step = String(step);
        fieldNodes[key] = node;
        listen(node, type === 'checkbox' || values ? 'change' : 'input', () => {
          if(type==='number'&&(!node.value||!Number.isFinite(+node.value)))return;
          checkpoint(); const target = mutableLayer(); if (!target) return;
          if(['x','y','width','height'].includes(key))target.followRegion=false;
          if (key === 'name') target.name = node.value.slice(0,80);
          else if(key==='lockAspect'){target.lockAspect=node.checked;if(target.lockAspect)target.aspectRatio=pixelRatio(target);}
          else if (type === 'checkbox') target[key] = node.checked;
          else if (values) target[key] = node.value;
          else if(key==='width'||key==='height')linkedSize(target,key,number(node.value,min,max,layer[key]));
          else target[key] = number(node.value,min,max,layer[key]);
          if (target.kind === 'region') target.rotation = 0;
          constrainGeometry(target);
          title.textContent = (pending && target.id === pending.id ? '预览：' : '参数：') + target.name;
          changed({previewOnly:!!pending && target.id === pending.id});
          if(['x','y','width','height','lockAspect','followRegion'].includes(key))syncGeometryInputs();
        });
        grid.append(label(text,node,type === 'checkbox' ? 'check' : key === 'name' ? 'wide' : ''));
      }
      if(['background','sidebar','chat-background','composer-background','toolbar-background'].includes(layer.id))field('followRegion','跟随区域尺寸','checkbox');
      field('name','素材名称','text'); field('x','横向位置 %','number',-100,200,0.1); field('y','纵向位置 %','number',-100,200,0.1);
      field('width','宽度 %','number',0.1,200,0.1); field('height','高度 %','number',0.1,200,0.1);
      if(layer.kind!=='region'){field('lockAspect','保持比例','checkbox');const hint=element('div',{className:'subtitle wide',hidden:aspectFeasible(layer)},aspectWarningText);fieldNodes.aspectHint=hint;grid.append(hint);}
      if (layer.kind !== 'region') { field('rotation','旋转 °','number',-360,360,1); field('opacity','透明度 %','number',0,100,1); field('blur','模糊 px','number',0,40,0.5); field('z','图层顺序','number',-100,100,1); field('fit','图片适应','text',null,null,null,[['cover','铺满'],['contain','完整显示']]); field('flipX','水平翻转','checkbox');field('enabled','显示此层','checkbox'); }
      field('locked','锁定画布拖动','checkbox');
      if (layer.kind === 'effect') renderEffect(grid,layer);
      const actions = element('div',{className:'actions'});
      actions.append(button('水平居中',()=>quickPosition('horizontal')),button('垂直居中',()=>quickPosition('vertical')),button('移回画布',()=>quickPosition('inside')));
      if (layer.kind !== 'region') {
        const replacement = input('file','替换当前素材'); replacement.accept = MIME.join(','); replacement.hidden = true;
        listen(replacement,'change',() => { const file = replacement.files && replacement.files[0], id = selected; if(file) run(() => replaceFile(file,id)); replacement.value=''; });
        actions.append(button('替换图片 / 纹理',() => replacement.click()),replacement);
      }
      actions.append(button(layer.builtin ? '此层恢复默认' : '删除图层',() => {
        checkpoint(); if (pending && selected === pending.id) pending = null;
        else draft.layers = draft.layers.filter(item => item.id !== selected);
        selected = null; changed(); renderProperties();
      }));
      if (layer.builtin&&layer.kind!=='region') actions.append(button('移除此层',() => { checkpoint(); mutableLayer().enabled=false; changed(); renderProperties(); }));
      properties.append(actions);
    }
    function renderEffect(grid,layer) {
      const effect = layer.effect;
      [['preset','特效预设',null,null,null,[['leaf','落叶'],['bubble','泡泡'],['custom','自定义纹理']]],['count','粒子数量',1,64,1],['size','粒子大小 px',2,160,1],['speed','运动速度',0.05,8,0.05],['direction','运动方向',null,null,null,[['down','向下'],['up','向上'],['left','向左'],['right','向右']]],['sway','摆动幅度',0,100,1]].forEach(([key,text,min,max,step,values]) => {
        const node = values ? select(text,values) : input('number',text); node.value = effect[key]; if(min!=null){node.min=min;node.max=max;node.step=step;}
        listen(node,values?'change':'input',() => { if (!values && (!node.value || !Number.isFinite(+node.value))) return; checkpoint(); const target=mutableLayer(); if(key==='preset' && node.value==='custom' && !target.source){ notice('先替换图片，才可使用自定义粒子纹理。',true); node.value=target.effect.preset; return; } target.effect[key]=values?node.value:number(node.value,min,max,effect[key]); changed({previewOnly:!!pending && selected===pending.id}); });
        grid.append(label(text,node));
      });
    }
    function renderTypography() { const value = draft.typography || {}; Object.entries(typeNodes).forEach(([key,node]) => { if(key==='gradientEnabled')node.checked=!!value[key];else node.value=value[key]==null?'':value[key]; }); }
    function changeTypography(key,value) {
      if (['color','gradientStart','gradientEnd'].includes(key) && value && !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) { notice('颜色请使用 #RGB 或 #RRGGBB；完整输入后生效。',true); return; }
      checkpoint(); if (!draft.typography) draft.typography = {}; draft.typography[key] = key==='fontSize' ? (value===''?null:number(value,10,48,14)) : key==='lineHeight' ? (value===''?null:number(value,1,3,1.5)) : typeof value==='string'?value.slice(0,150):value; changed();
    }
    function renderLibrary() {
      library.replaceChildren(); assets.forEach(asset => { const node=button(asset.name,() => {
        return beginPending(makeUseLayer(newKind.value,newName.value.trim() || asset.name,asset));
      },{className:'asset',title:asset.name}); const img=element('img',{src:asset.source,alt:''}); node.prepend(img);library.append(node); });
    }
    function renderBoxes() {
      boxes.replaceChildren(); if (!editing || disposed) return;
      allLayers().filter(layer=>!pending||(layer.id!==pending.id&&layer.id!==pending._originId)).concat(pending?[viewLayer(pending)]:[]).filter(layer=>layer.enabled&&!layer.locked).forEach(layer=> {
        const box=element('div',{className:'box','data-layer-id':layer.id,'data-selected':String(selected===layer.id),'aria-label':'拖动 '+layer.name});
        box.style.cssText=`left:${layer.x}%;top:${layer.y}%;width:${layer.width}%;height:${layer.height}%;transform:rotate(${layer.rotation}deg);z-index:${layer.id===selected?500:Math.round(layer.z)+150}`;
        box.append(element('span',{className:'box-label'},layer.name)); const handle=element('span',{className:'resize','aria-label':'缩放 '+layer.name}); box.append(handle);
        // Events are delegated to boxes, so repeated frame updates create no listeners.
        boxes.append(box);
      });
    }
    listen(boxes,'pointerdown',event => {
      const box=event.target.closest('.box'); if(!box || event.button!==0 || loading) return;
      event.preventDefault(); selected=box.dataset.layerId; const layer=activeLayer(); if(!layer||layer.locked)return;
      checkpoint(); gesture={pointerId:event.pointerId,id:layer.id,startX:event.clientX,startY:event.clientY,layer:copy(layer),resize:event.target.classList.contains('resize')};
      renderList(); renderProperties(); renderBoxes();focusCanvas();
      if(boxes.setPointerCapture) boxes.setPointerCapture(event.pointerId);
    });
    listen(boxes,'pointermove',event => {
      if(!gesture||event.pointerId!==gesture.pointerId)return; event.preventDefault();
      selected=gesture.id;const layer=mutableLayer();layer.followRegion=false;const dx=(event.clientX-gesture.startX)/win.innerWidth*100,dy=(event.clientY-gesture.startY)/win.innerHeight*100;
      if(gesture.resize){
        if(layer.lockAspect){const key=Math.abs(dx/gesture.layer.width)>=Math.abs(dy/gesture.layer.height)?'width':'height';linkedSize(layer,key,gesture.layer[key]+(key==='width'?dx:dy));}
        else{layer.width=number(gesture.layer.width+dx,0.1,200,1);layer.height=number(gesture.layer.height+dy,0.1,200,1);}
      }else{layer.x=number(gesture.layer.x+dx,-100,200,0);layer.y=number(gesture.layer.y+dy,-100,200,0);}
      constrainGeometry(layer);syncGeometryInputs();
      apply();renderBoxes();
    });
    function endGesture(event) { if(!gesture || (event.pointerId!=null&&event.pointerId!==gesture.pointerId))return;gesture=null;changed({previewOnly:!!pending&&selected===pending.id}); }
    listen(boxes,'pointerup',endGesture);listen(boxes,'pointercancel',endGesture);
    listen(win,'resize',()=>{if(!disposed){apply();renderBoxes();syncGeometryInputs();}});
    listen(doc,'keydown',event=>{
      if((!opened&&!editing)||saving||event.isComposing)return;
      const path=event.composedPath(),within=path.includes(host)||doc.activeElement===host;
      if(!within)return;
      if(event.key==='Escape'){event.preventDefault();if(pending)cancelPending();else if(editing)cancelEditing();else close();}
      const textFocus=path.some(node=>node&&node.nodeType===1&&(node.matches('input,textarea,select,[role="textbox"],[role="spinbutton"]')||node.isContentEditable));
      if(!editing||textFocus)return;
      if((event.ctrlKey||event.metaKey)&&!event.altKey){const key=event.key.toLowerCase();if(key==='z'||key==='y'){event.preventDefault();key==='y'||event.shiftKey?doRedo():doUndo();focusCanvas();}return;}
      if(event.altKey)return;
      const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key],current=activeLayer();
      if(direction&&current&&!current.locked){event.preventDefault();checkpoint();const layer=mutableLayer();layer.followRegion=false;const step=event.shiftKey?10:1;layer.x=number(layer.x+direction[0]*step/(win.innerWidth||1)*100,-100,200,layer.x);layer.y=number(layer.y+direction[1]*step/(win.innerHeight||1)*100,-100,200,layer.y);constrainGeometry(layer);changed({previewOnly:!!pending&&selected===pending.id});syncGeometryInputs();focusCanvas();}
    });
    function makeLayer(kind,name,asset) { const effect=kind==='effect'; const width=asset?Math.min(40,asset.width/win.innerWidth*100):100; return normalizeLayer({id:uid(),name:name||'未命名素材',kind,builtin:false,source:asset?asset.source:'',assetId:asset?asset.id:undefined,enabled:true,locked:false,x:effect||kind==='background'?0:30,y:effect||kind==='background'?0:20,width:effect||kind==='background'?100:width,height:effect||kind==='background'?100:asset?width*win.innerWidth*asset.height/asset.width/win.innerHeight:40,aspectRatio:asset?asset.width/asset.height:undefined,rotation:0,flipX:false,opacity:100,z:allLayers().length+1,fit:'contain',blur:0,effect:{preset:asset?'custom':'bubble',count:30,size:22,speed:1,direction:'up',sway:30}},false); }
    function makeUseLayer(use,name,asset,sourceLayer) {
      const fixed=BUILTINS[use]&&use!=='effect-default';
      if(!fixed){const layer=makeLayer(use==='effect'?'effect':'image',name,asset);if(sourceLayer){Object.assign(layer,copy(sourceLayer),{id:uid(),builtin:false,kind:use==='effect'?'effect':'image'});delete layer.sourceRef;}return layer;}
      const descriptor=allLayers().find(layer=>layer.id===use);
      if(!descriptor)throw new Error('当前宿主暂不支持这个素材用途。');
      const layer=copy(descriptor);
      if(['background','sidebar','chat-background','composer-background','toolbar-background'].includes(use)&&!draft.layers.some(item=>item.id===use))layer.followRegion=true;
      layer.name=name||descriptor.name;layer.enabled=true;
      if(asset){layer.source=asset.source;layer.assetId=asset.id;delete layer.sourceRef;}
      else if(sourceLayer){layer.source=sourceLayer.source;layer.assetId=sourceLayer.assetId;delete layer.sourceRef;}
      return normalizeLayer(layer,false);
    }
    async function changeUse(use) {
      const current=activeLayer();if(!current||current.kind==='region')return;
      const currentUse=current.builtin&&current.kind!=='effect'?current.id:current.kind==='effect'?'effect':'image';if(use===currentUse)return;
      if(pending&&selected!==pending.id)throw new Error('请先确认或取消当前素材预览。');
      const asset=assets.find(item=>item.id===current.assetId);
      const next=makeUseLayer(use,current.name,asset,current);next._originId=pending?(pending._originId||null):current.id;
      if(pending){checkpoint();pending=next;selected=next.id;apply();render();}
      else await beginPending(next);
    }
    async function beginPending(layer) { if(pending)throw new Error('请先确认或取消当前新增预览。');const epoch=operationEpoch;try{if(layer.assetId)await pinAsset(layer.assetId);if(disposed||epoch!==operationEpoch)return;if(pending)throw new Error('请先确认或取消当前新增预览。');checkpoint();pending=layer;selected=layer.id;apply();render();notice('正在预览素材用途；可调整位置和尺寸，确认后替换对应位置。');}finally{if(layer.assetId)reservations.delete(layer.assetId);syncPins();} }
    async function addFile(file) { if(pending)throw new Error('请先确认或取消当前新增预览。');const epoch=operationEpoch,kind=newKind.value,name=newName.value.trim()||file.name.replace(/\.[^.]+$/,'');const asset=await ingestAsset(file);if(disposed||epoch!==operationEpoch){if(asset)reservations.delete(asset.id);syncPins();return;}await beginPending(makeUseLayer(kind,name,asset)); }
    function addEffect(preset) { const layer=makeLayer('effect',newName.value.trim()||(preset==='leaf'?'落叶':'泡泡'));layer.effect.preset=preset;layer.effect.direction=preset==='leaf'?'down':'up';return beginPending(layer); }
    async function replaceFile(file,id) { const epoch=operationEpoch,asset=await ingestAsset(file);try{if(disposed||epoch!==operationEpoch)return;const current=activeLayer();if(!current||current.id!==id)throw new Error('选择的图层已变化，请重新选择后替换。');checkpoint();const layer=mutableLayer();layer.source=asset.source;layer.assetId=asset.id;delete layer.sourceRef;if(layer.kind==='effect')layer.effect.preset='custom';changed({previewOnly:!!pending&&id===pending.id});renderProperties();}finally{if(asset)reservations.delete(asset.id);syncPins();} }
    function confirmPending() { if(!pending)return;checkpoint();draft.layers=draft.layers.filter(layer=>layer.id!==pending.id&&layer.id!==pending._originId);delete pending._originId;draft.layers.push(pending);pending=null;changed();render();notice(editing?'素材已加入草稿；保存后保留。':'素材已添加，正在保存。'); }
    function cancelPending() { if(!pending)return;checkpoint();pending=null;selected=null;apply();render();notice('已取消新增，导入文件仍可在素材库复用。'); }
    async function startEditing() { if(disposed)return;await ready;if(disposed)return;if(editing){opened=true;renderVisibility();focusCanvas();return;}const needsSave=!!saveTimer;win.clearTimeout(saveTimer);saveTimer=null;if(needsSave)await persist(copy(draft));await storageQueue.catch(()=>{});if(disposed)return;editing=true;opened=true;undo=[];redo=[];render();focusCanvas();notice('草稿实时预览；方向键微调1px，Shift为10px；保存后保留，取消可恢复。'); }
    async function saveAndExit() { if(pending)throw new Error('请先确认或取消新增预览。');if(saving)return;saving=true;panel.inert=true;notice('正在保存工程…');try{win.clearTimeout(saveTimer);saveTimer=null;const targetMode=mode;let okay;if(stagedModes){stagedModes[mode]=copy(draft);okay=await persistModes(stagedModes);}else okay=await persist(copy(draft));if(!okay||disposed||mode!==targetMode)return;stagedModes=null;editing=false;opened=false;undo=[];redo=[];render();}finally{saving=false;panel.inert=false;} }
    function cancelEditing() { ++operationEpoch;win.clearTimeout(saveTimer);saveTimer=null;draft=copy(saved);pending=null;stagedModes=null;selected=null;editing=false;opened=false;undo=[];redo=[];apply();render(); }
    function close() { if(editing){cancelEditing();return;}++operationEpoch;if(pending)cancelPending();opened=false;renderVisibility(); }
    function reset() { ++operationEpoch;checkpoint();draft=empty();pending=null;stagedModes=null;selected=null;changed();render();notice('已恢复原预设；导入素材库保留。可撤销或恢复上次保存。'); }
    async function restorePrevious() { if(!previous)throw new Error('还没有可恢复的上次保存方案。');const restored=await validateState(previous,false);if(disposed)return;checkpoint();draft=restored;pending=null;selected=null;changed();render();notice('已恢复上次保存方案。'); }
    async function ingestAsset(file) {
      if(!MIME.includes(file.type))throw new Error('只接受 PNG、JPEG、WebP、GIF；拒绝 SVG、脚本和其他文件。');
      if(file.size<=0||file.size>MAX_ASSET)throw new Error('素材为空或超过单文件 12 MiB 限额。');
      const source=await new Promise((resolve,reject)=>{const reader=new win.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('读取图片失败'));reader.readAsDataURL(file);});
      const metadata=await inspectImage(source);if(disposed)return null;
      const match=assets.find(item=>item.source===source);if(match){await pinAsset(match.id);return match;}
      if(assets.reduce((sum,item)=>sum+item.bytes,0)+metadata.bytes>MAX_TOTAL)throw new Error('素材库已超过 60 MiB 限额；请先导出备份。');
      const asset={id:uid(),name:file.name.slice(0,100),source,...metadata};
      reservations.add(asset.id);try{await transaction(['assets','projects'],tx=>{tx.objectStore('assets').put(asset);tx.objectStore('projects').put(sessionRecord());},true);}catch(error){reservations.delete(asset.id);throw error;}if(disposed)return null;assets.push(asset);renderLibrary();return asset;
    }
    async function inspectImage(source) {
      if(typeof source!=='string')throw new Error('图片数据格式错误。');
      const match=/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(source);
      if(!match)throw new Error('图片必须为允许格式的内嵌 base64 数据，不接受 URL 或 SVG。');
      const payload=match[2];if(payload.length>Math.ceil(MAX_ASSET/3)*4+4)throw new Error('单素材超过 12 MiB 限额。');
      let bytes;try{bytes=win.atob(payload);}catch(_){throw new Error('图片 base64 数据损坏。');}
      if(!bytes.length||bytes.length>MAX_ASSET)throw new Error('图片为空或超过 12 MiB。');
      const byte=index=>bytes.charCodeAt(index),mime=match[1];
      const signature=mime==='image/png'?bytes.slice(0,8)==='\x89PNG\r\n\x1a\n':mime==='image/jpeg'?byte(0)===255&&byte(1)===216&&byte(2)===255:mime==='image/gif'?/^GIF8[79]a/.test(bytes.slice(0,6)):bytes.slice(0,4)==='RIFF'&&bytes.slice(8,12)==='WEBP';
      if(!signature)throw new Error('图片 MIME 与实际文件不匹配。');
      const dimensions=await new Promise((resolve,reject)=>{const image=new win.Image();let timer=win.setTimeout(()=>{image.src='';reject(new Error('图片解码超时，请换一张图片。'));},15000);image.onload=()=>{win.clearTimeout(timer);resolve({width:image.naturalWidth,height:image.naturalHeight});};image.onerror=()=>{win.clearTimeout(timer);reject(new Error('图片无法解码，未修改当前工程。'));};image.src=source;});
      if(!dimensions.width||!dimensions.height||dimensions.width>16384||dimensions.height>16384||dimensions.width*dimensions.height>64*1024*1024)throw new Error('图片尺寸无效：最大边 16384 px，总像素不超过 6400 万。');
      return {mime,bytes:bytes.length,...dimensions};
    }
    function normalizeLayer(value,strict) {
      if(!value||typeof value!=='object'||!KINDS.includes(value.kind)||typeof value.id!=='string'||!value.id||value.id.length>150)throw new Error('工程包含无效图层。');
      if(Object.prototype.hasOwnProperty.call(BUILTINS,value.id)){if(value.builtin!==true||value.kind!==BUILTINS[value.id])throw new Error('内置图层 ID、类型与内置标记必须一致；自定义素材不能使用保留 ID。');}else if(value.builtin)throw new Error('未知内置素材引用。');
      const layer={id:value.id,name:typeof value.name==='string'?value.name.slice(0,80):value.id,kind:value.kind,builtin:!!value.builtin,source:typeof value.source==='string'?value.source:'',enabled:value.enabled!==false,locked:!!value.locked};
      const specs={x:[-100,200,0],y:[-100,200,0],width:[0.1,200,100],height:[0.1,200,100],rotation:[-360,360,0],opacity:[0,100,100],z:[-100,100,1],blur:[0,40,0]};
      Object.entries(specs).forEach(([key,[min,max,fallback]])=>{if(strict&&(!Number.isFinite(value[key])||value[key]<min||value[key]>max))throw new Error('图层参数越界：'+key);layer[key]=number(value[key],min,max,fallback);});
      layer.flipX=!!value.flipX;layer.fit=value.fit==='contain'?'contain':'cover';if(value.assetId)layer.assetId=String(value.assetId).slice(0,150);if(value.sourceRef)layer.sourceRef=true;
      if(strict&&value.lockAspect!=null&&typeof value.lockAspect!=='boolean')throw new Error('保持比例设置无效。');
      if(strict&&value.aspectRatio!=null&&(!Number.isFinite(value.aspectRatio)||value.aspectRatio<=0||value.aspectRatio>1000000))throw new Error('素材像素比例无效。');
      layer.lockAspect=value.kind==='region'?false:value.lockAspect==null?['portrait','emote','image'].includes(value.kind):value.lockAspect;
      if(strict&&value.followRegion!=null&&typeof value.followRegion!=='boolean')throw new Error('跟随区域尺寸设置无效。');
      if(value.followRegion!=null)layer.followRegion=!!value.followRegion;
      layer.aspectRatio=Number.isFinite(value.aspectRatio)&&value.aspectRatio>0?value.aspectRatio:pixelRatio(layer);
      if(layer.sourceRef&&!layer.builtin)throw new Error('只有内置素材可以引用预设资源。');
      if(layer.kind==='region'){if(!['sidebar-region','chat-region','composer-region'].includes(layer.id))throw new Error('未知布局区域。');if(strict&&(value.enabled===false||value.rotation!==0))throw new Error('真实区域不能隐藏或旋转。');layer.rotation=0;layer.source='';layer.builtin=true;layer.enabled=true;}
      const effect=value.effect||{};
      if(strict&&layer.kind==='effect'){
        if(!['leaf','bubble','custom'].includes(effect.preset)||!['up','down','left','right'].includes(effect.direction))throw new Error('特效预设或方向无效。');
        Object.entries({count:[1,64],size:[2,160],speed:[0.05,8],sway:[0,100]}).forEach(([key,[min,max]])=>{if(!Number.isFinite(effect[key])||effect[key]<min||effect[key]>max)throw new Error('特效参数越界：'+key);});
      }
      layer.effect={preset:['leaf','bubble','custom'].includes(effect.preset)?effect.preset:'bubble',count:Math.round(number(effect.count,1,64,30)),size:number(effect.size,2,160,22),speed:number(effect.speed,0.05,8,1),direction:['up','down','left','right'].includes(effect.direction)?effect.direction:'up',sway:number(effect.sway,0,100,30)};
      return layer;
    }
    function validateTypography(value) {
      if(value==null)return null;if(typeof value!=='object'||Array.isArray(value))throw new Error('字体设置无效。');
      const result={};['family','color','gradientStart','gradientEnd'].forEach(key=>{if(value[key]!=null){if(typeof value[key]!=='string'||value[key].length>(key==='family'?150:40))throw new Error('字体或颜色值无效。');if(key!=='family'&&value[key]&&!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value[key]))throw new Error('颜色请使用 #RGB 或 #RRGGBB 格式。');result[key]=value[key];}});
      ['fontSize','lineHeight'].forEach(key=>{if(value[key]!=null){const min=key==='fontSize'?10:1,max=key==='fontSize'?48:3;if(!Number.isFinite(value[key])||value[key]<min||value[key]>max)throw new Error('字体数值越界。');result[key]=value[key];}});result.gradientEnabled=!!value.gradientEnabled;return result;
    }
    async function validateState(value,strict) {
      if(!value||!Array.isArray(value.layers)||value.layers.length>200)throw new Error('工程图层结构无效或超过 200 层。');
      const layers=value.layers.map(item=>normalizeLayer(item,strict)),ids=new Set();
      for(const layer of layers){if(ids.has(layer.id))throw new Error('工程中有重复图层 ID。');ids.add(layer.id);if(layer.assetId&&!layer.source){const asset=assets.find(item=>item.id===layer.assetId);if(!asset)throw new Error('保存工程引用的素材缺失。');layer.source=asset.source;}if(layer.source){if(strict||!layer.builtin)await inspectImage(layer.source);}if(layer.kind==='effect'&&layer.effect.preset==='custom'&&!layer.source&&!layer.sourceRef)throw new Error('自定义粒子缺少纹理。');}
      return {layers,typography:validateTypography(value.typography),foreignLayouts:value.foreignLayouts&&typeof value.foreignLayouts==='object'?copy(value.foreignLayouts):{}};
    }
    async function exportProject() {
      if(pending)throw new Error('请先确认或取消新增预览，再导出工程。');
      const collect=async targetMode=>{const current=compactState(targetMode===mode?draft:stagedModes?stagedModes[targetMode]:((await readRecord(key(targetMode)))||{}).value||empty());const regions=current.layers.filter(layer=>layer.kind==='region'),shared=current.layers.filter(layer=>layer.kind!=='region');return {layers:shared,typography:current.typography,layouts:Object.assign({},current.foreignLayouts||{},{[platform]:regions})};};
      const modes={light:await collect('light'),dark:await collect('dark')};
      const project={schema:SCHEMA,version:VERSION,exportedAt:new Date().toISOString(),assets:copy(assets),modes};
      const json=JSON.stringify(project,null,2);if(json.length>MAX_JSON)throw new Error('工程超过导出 85 MiB 限额。');
      const blob=new win.Blob([json],{type:'application/json'}),url=win.URL.createObjectURL(blob),anchor=element('a',{href:url,download:'sunlit-tides-diy.json'});shadow.append(anchor);anchor.click();anchor.remove();win.setTimeout(()=>win.URL.revokeObjectURL(url),30000);notice('工程已导出，包含亮暗方案与素材；各宿主布局独立。');
    }
    async function importFile(file) {
      const epoch=operationEpoch,importWasEditing=editing;
      notice('正在校验工程与素材…');
      if(file.size<=0||file.size>MAX_JSON)throw new Error('工程为空或超过 85 MiB 限额。');
      let project;try{project=JSON.parse(await file.text());}catch(_){throw new Error('工程 JSON 损坏，当前方案未改变。');}
      if(!project||project.schema!==SCHEMA||project.version!==VERSION||!project.modes||!Array.isArray(project.assets)||project.assets.length>200)throw new Error('不支持的工程格式或版本；当前方案未改变。');
      const importedAssets=[],assetIds=new Set();let total=0;
      for(const value of project.assets){if(!value||typeof value.id!=='string'||assetIds.has(value.id))throw new Error('素材 ID 无效或重复。');const metadata=await inspectImage(value.source);if(value.bytes!==metadata.bytes||value.width!==metadata.width||value.height!==metadata.height||value.mime!==metadata.mime)throw new Error('素材声明与实际字节、MIME 或尺寸不符。');total+=metadata.bytes;if(total>MAX_TOTAL)throw new Error('工程素材超过 60 MiB 限额。');assetIds.add(value.id);importedAssets.push({id:value.id,name:String(value.name||'导入素材').slice(0,100),source:value.source,...metadata});}
      const imported={};
      for(const targetMode of ['light','dark']){
        const value=project.modes[targetMode];if(!value||!Array.isArray(value.layers)||!value.layouts||typeof value.layouts!=='object')throw new Error('工程缺少亮色或暗色方案。');
        const layouts={};for(const name of ['codex','dsh']){const list=value.layouts[name]||[];if(!Array.isArray(list)||list.some(layer=>layer.kind!=='region'))throw new Error('宿主布局格式无效。');layouts[name]=(await validateState({layers:list,typography:null},true)).layers;}
        if(value.layers.some(layer=>layer.kind==='region'))throw new Error('区域布局必须按宿主隔离。');
        const resolved=value.layers.map(layer=>{const result=copy(layer);if(result.assetId){const asset=importedAssets.find(item=>item.id===result.assetId);if(!asset)throw new Error('图层引用的素材缺失。');if(result.source&&result.source!==asset.source)throw new Error('图层与素材引用不一致。');result.source=asset.source;}return result;});
        const result=await validateState({layers:resolved.concat(layouts[platform]),typography:value.typography,foreignLayouts:layouts},true);
        for(const layer of result.layers){if(layer.assetId&&!assetIds.has(layer.assetId))throw new Error('图层引用的素材缺失。');if(layer.assetId&&importedAssets.find(item=>item.id===layer.assetId).source!==layer.source)throw new Error('图层与素材引用不一致。');}
        imported[targetMode]=result;
      }
      if(disposed||epoch!==operationEpoch)return;
      // All parsing and decoding completed before the atomic write. A bad import cannot replace a good project.
      const merged=new Map(assets.map(asset=>[asset.id,asset]));for(const asset of importedAssets){const existing=merged.get(asset.id);if(existing&&existing.source!==asset.source)throw new Error('导入素材 ID 与本地不同图片冲突；当前方案未改变。');merged.set(asset.id,asset);}
      if([...merged.values()].reduce((sum,item)=>sum+item.bytes,0)>MAX_TOTAL)throw new Error('合并后的素材库超过 60 MiB 限额。');
      win.clearTimeout(saveTimer);saveTimer=null;await storageQueue.catch(()=>{});
      const records=importWasEditing?[]:await Promise.all(['light','dark'].map(targetMode=>readRecord(key(targetMode))));if(disposed||epoch!==operationEpoch)return;const importAsDraft=importWasEditing;
      const importReservations=importedAssets.map(asset=>asset.id);importReservations.forEach(id=>reservations.add(id));
      try{await transaction(['assets','projects'],tx=>{
        importedAssets.forEach(asset=>tx.objectStore('assets').put(asset));
        tx.objectStore('projects').put(sessionRecord());
        if(!importAsDraft)['light','dark'].forEach((targetMode,index)=>tx.objectStore('projects').put({key:key(targetMode),schema:VERSION,value:compactState(imported[targetMode]),previous:records[index]?records[index].value:empty()}));
      },true);}catch(error){importReservations.forEach(id=>reservations.delete(id));syncPins();throw error;}
      if(disposed||epoch!==operationEpoch){importReservations.forEach(id=>reservations.delete(id));syncPins();return;}assets=[...merged.values()];if(importAsDraft){checkpoint();stagedModes=copy(imported);draft=copy(imported[mode]);}else{previous=copy(saved);saved=copy(imported[mode]);draft=copy(saved);undo=[];redo=[];}pending=null;selected=null;apply();render();importReservations.forEach(id=>reservations.delete(id));syncPins();notice(importAsDraft?'完整工程已导入草稿；保存后保留，取消可回到原方案。':'完整工程已导入并保存；可恢复上次保存。');
    }
    async function refresh() {
      if(disposed)return;await ready;if(disposed)return;const next=adapter.getMode()==='dark'?'dark':'light';
      if(next!==mode){win.clearTimeout(saveTimer);saveTimer=null;editing=false;await storageQueue.catch(()=>{});await loadMode(next);if(!disposed)notice('已切换'+(next==='dark'?'暗色':'亮色')+'保存方案；未保存的草稿已取消。');}else{apply();renderList();renderBoxes();syncGeometryInputs();}
    }
    const observer=new win.MutationObserver(()=>{if(!disposed&&(adapter.getMode()==='dark'?'dark':'light')!==mode)run(refresh);});
    observer.observe(doc.documentElement,{attributes:true,attributeFilter:['class','data-theme','data-color-mode','data-mode']});
    function dispose() {
      if(disposed)return;disposed=true;if(panelTransport)panelTransport.dispose();++loadSerial;win.clearTimeout(saveTimer);observer.disconnect();listeners.splice(0).forEach(remove=>remove());host.remove();
      if(db)Promise.all([storageQueue.catch(()=>{}),pinsQueue.catch(()=>{})]).then(()=>transaction(['projects'],tx=>tx.objectStore('projects').delete(sessionKey),true)).catch(()=>{}).finally(()=>{db.close();if(releaseSessionLock)releaseSessionLock();});else if(releaseSessionLock)releaseSessionLock();
      try{adapter.apply([],null,mode);}finally{if(win.__SUNLIT_DIY__===api)delete win.__SUNLIT_DIY__;}
    }
    const panelElements=()=>({host,shadow,panel,header:heading,handle:heading,style});
    const api={getPanelElements:panelElements,collapse(){if(disposed)return;opened=false;renderVisibility();},open(){if(disposed)return;activeTab='素材';opened=true;render();return ready;},startEditing,refresh,dispose,getState(){return copy({schema:VERSION,platform,mode,ready:!loading,open:opened,editing,layers:draft.layers,typography:draft.typography,pending,saved,assets:assets.map(({source,...metadata})=>metadata),selected});}};
    win.__SUNLIT_DIY__=api;
    if(typeof win.mountSunlitPanel==='function')panelTransport=win.mountSunlitPanel({window:win,document:doc,panel,handle:heading,styleText:style.textContent,theme:()=>adapter.getMode(),onClose:close,key:'theme'});
    if(typeof adapter.onPanelReady==='function')adapter.onPanelReady(panelElements(),api);
    return api;
  }
  global.mountSunlitDiy=mountSunlitDiy;
})(typeof window!=='undefined'?window:globalThis);
