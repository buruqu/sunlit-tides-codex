function createFusionPalette({ document, initialState, mode, title, companionsEnabled, avatarsEnabled, sidebarEnabled, xixiEmoteEnabled, sceneEffectsEnabled, continuousReading, sceneReading, version, onChange, onReset, onExport, onImport }) {
  let state = FusionSettings.normalize(initialState);
  let activeMode = mode === 'dark' ? 'dark' : 'light';
  let destroyed = false;
  let expanded = false;
  const cleanups = [];
  const controls = [];
  const win = document.defaultView;
  const host = document.createElement('div');
  host.dataset.fusionUi = 'palette';
  host.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host{font:13px/1.5 system-ui,"Microsoft YaHei",sans-serif;color:#293245;color-scheme:light}
    *{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}
    button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid #628ce8;outline-offset:3px}
    .toggle{position:absolute;right:12px;top:12px;border:1px solid #d3d9e7;border-radius:20px;padding:7px 13px;background:#fff9;backdrop-filter:blur(16px);color:inherit;pointer-events:auto;box-shadow:0 3px 12px #16223618}
    .panel{position:absolute;right:12px;top:54px;width:min(340px,calc(100% - 24px));max-height:min(600px,calc(100% - 66px));overflow:auto;overscroll-behavior:contain;pointer-events:auto;border:1px solid #d3d9e7;border-radius:16px;padding:16px;background:#f8fafdf5;box-shadow:0 10px 40px #17223730;backdrop-filter:blur(20px)}
    [hidden]{display:none!important}h2{font-size:15px;margin:0 0 3px}.subtitle{font-size:11px;color:#6a7384;margin:0 0 12px}.note{font-size:11px;color:#667186;margin:10px 0 0}details{border-top:1px solid #8997b42b;padding:9px 0}summary{cursor:pointer;font-weight:600;list-style-position:inside}.control{display:block;margin:10px 0}.line{display:flex;align-items:center;justify-content:space-between;gap:8px}.value{font-variant-numeric:tabular-nums;color:#667186;font-size:11px}input[type=range]{display:block;width:100%;margin:7px 0 0;accent-color:#6f8cd6}input[type=checkbox]{width:16px;height:16px;accent-color:#6f8cd6;flex:none}.check{display:flex;gap:10px;align-items:center;justify-content:space-between;margin:10px 0}.slot{padding:2px 0 6px;margin-top:9px;border-top:1px dashed #8997b430}.slot h3{font-size:12px;margin:8px 0 0}.actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.actions button{border:1px solid #cbd3e1;border-radius:8px;background:#fff8;color:inherit;padding:6px 9px}.status{font-size:11px;color:#476440;min-height:17px;margin-top:8px;overflow-wrap:anywhere}.status.error{color:#b54343}
    :host([data-mode=dark]){color:#e0e6f1;color-scheme:dark}:host([data-mode=dark]) .toggle,:host([data-mode=dark]) .panel{background:#202737f5;border-color:#4a556b}:host([data-mode=dark]) .actions button{background:#33405a;border-color:#56627a}:host([data-mode=dark]) .note,:host([data-mode=dark]) .subtitle,:host([data-mode=dark]) .value{color:#b0bbcf}:host([data-mode=dark]) .status{color:#a7d29c}:host([data-mode=dark]) .status.error{color:#ffadad}
    @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
  `;
  shadow.appendChild(style);
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function listen(target, event, callback, options) {
    target.addEventListener(event, callback, options);
    cleanups.push(() => target.removeEventListener(event, callback, options));
  }
  const toggle = element('button', 'toggle', '调色板');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'fusion-palette-panel');
  const panel = element('section', 'panel');
  panel.id = 'fusion-palette-panel';
  panel.setAttribute('aria-label', '功能融合调色板');
  panel.hidden = true;
  const heading = element('h2', '', title || '功能融合 0.1.0');
  const subtitle = element('p', 'subtitle');
  const header=element('header','palette-header');
  const close=element('button','palette-close','×');close.type='button';close.setAttribute('aria-label','关闭调色板');
  header.append(heading,close);panel.append(header,subtitle);
  function setExpanded(value) {
    if(value)win?.__SUNLIT_DIY__?.collapse?.();
    expanded = value;
    panel.hidden = !value;
    toggle.setAttribute('aria-expanded', String(value));
  }
  listen(toggle, 'click', () => setExpanded(!expanded));
  listen(close,'click',()=>setExpanded(false));
  for (const event of ['keydown', 'keyup', 'keypress']) {
    listen(shadow, event, (e) => {
      e.stopPropagation();
      if (event === 'keydown' && e.key === 'Escape' && expanded) {
        e.preventDefault(); setExpanded(false); toggle.focus();
      }
    });
  }
  for (const event of ['click', 'dblclick', 'pointerdown', 'pointerup', 'input', 'change']) {
    listen(shadow, event, (e) => e.stopPropagation());
  }
  listen(panel, 'wheel', (e) => e.stopPropagation(), { passive: true });
  function group(label, open = false) {
    const section = element('details');
    section.open = open;
    section.appendChild(element('summary', '', label));
    panel.appendChild(section);
    return section;
  }
  function target(scope) { return scope === 'common' ? state.common : state.modes[activeMode]; }
  function get(scope, key, slot) { return slot ? target(scope)[slot][key] : target(scope)[key]; }
  function change(scope, key, slot, value) {
    const next = FusionSettings.normalize(state);
    const part = scope === 'common' ? next.common : next.modes[activeMode];
    (slot ? part[slot] : part)[key] = value;
    state = FusionSettings.normalize(next);
    sync();
    if (typeof onChange === 'function') onChange(FusionSettings.normalize(state));
  }
  function range(parent, label, scope, key, min, max, unit = '', slot) {
    const wrapper = element('label', 'control');
    const line = element('span', 'line');
    const output = element('span', 'value');
    line.append(element('span', '', label), output);
    const input = element('input');
    input.type = 'range'; input.max = String(max); input.step = '1';
    wrapper.append(line, input); parent.appendChild(wrapper);
    controls.push(() => { const lower = typeof min === 'function' ? min() : min; input.min = String(lower); const value = Math.max(lower,Math.min(max,get(scope, key, slot))); input.value = String(value); output.textContent = `${value}${unit}`; input.setAttribute('aria-valuetext', `${value}${unit}`); });
    listen(input, 'input', () => change(scope, key, slot, Number(input.value)));
  }
  function check(parent, label, scope, key, slot) {
    const wrapper = element('label', 'check');
    const input = element('input'); input.type = 'checkbox';
    wrapper.append(element('span', '', label), input); parent.appendChild(wrapper);
    controls.push(() => { input.checked = get(scope, key, slot); });
    listen(input, 'change', () => change(scope, key, slot, input.checked));
  }
  const reading = group('阅读', true);
  range(reading, '聊天最大宽度', 'common', 'chatWidth', 480, 1440, ' px');
  if (!continuousReading) check(reading, '消息阅读底板', 'mode', 'messagePanel');
  range(reading, sceneReading ? '背景柔光' : continuousReading ? '阅读面板不透明度' : '消息底板不透明度', 'mode', 'messageOpacity', sceneReading ? () => activeMode === 'dark' ? 64 : 60 : continuousReading ? 97 : 20, sceneReading ? 82 : 100, '%');
  if (continuousReading) reading.appendChild(element('p','note',sceneReading ? '调低可看见更多背景，调高让文字更突出；亮暗模式分别保存。' : '连续阅读面板保护正文、运行状态和命令文字。'));
  const characters = group('角色');
  function decorationOpacity(label, key, resetLabel) {
    const wrapper = element('label', 'control'), line = element('span', 'line'), output = element('span', 'value');
    const input = element('input'); input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '1'; input.setAttribute('aria-label', label);
    line.append(element('span', '', label), output); wrapper.append(line, input); characters.append(wrapper);
    const reset = element('button', '', resetLabel); reset.type = 'button';
    const actions = element('div', 'actions'); actions.append(reset); characters.append(actions);
    controls.push(() => {
      const current = state.modes[activeMode], manual = current[key] !== null;
      const veil = Math.min(.82, Math.max(activeMode === 'dark' ? .64 : .60, current.messageOpacity / 100));
      const automatic = state.common.layout === 'panorama' ? Math.round(current.backgroundStrength * (1 - veil)) : 100;
      const value = manual ? current[key] : automatic;
      input.value = String(value); input.setAttribute('aria-valuetext', `${value}%${manual ? '' : '（跟随背景）'}`);
      output.textContent = `${value}%${manual ? '' : ' · 跟随背景'}`; reset.disabled = !manual;
    });
    listen(input, 'input', () => change('mode', key, null, Number(input.value)));
    listen(reset, 'click', () => change('mode', key, null, null));
  }
  decorationOpacity('立绘透明度', 'portraitOpacity', '立绘跟随背景');
  decorationOpacity('表情包透明度', 'emoteOpacity', '表情包跟随背景');
  characters.append(element('p', 'note', '0% 隐藏，100% 完全显示。拖动后独立控制，亮暗分别保存；点击跟随背景可恢复原来的融合效果。'));
  for (const [slot, label] of [['left', '左侧角色'], ['primary', '右侧主角色'], ['secondary', '右侧副角色']]) {
    const container = element('div', 'slot'); container.appendChild(element('h3', '', avatarsEnabled&&slot==='secondary'?'西西 / 娅娅对话头像':label)); characters.appendChild(container);
    check(container, '显示', 'mode', 'visible', slot);
    range(container, '大小', 'mode', 'size', 40, 160, '%', slot);
    if (!(avatarsEnabled&&slot==='secondary')) {
      range(container, '水平偏移', 'mode', 'x', -100, 100, ' px', slot);
      range(container, '垂直偏移', 'mode', 'y', -200, 200, ' px', slot);
    }
  }
  const background = group('背景');
  const layoutLabel = element('label', 'control', '背景布局（亮暗通用）');
  const layoutSelect = element('select');
  layoutSelect.setAttribute('aria-label', '背景布局（亮暗通用）');
  layoutSelect.style.cssText = 'display:block;width:100%;margin-top:7px;padding:7px;border:1px solid #8997b460;border-radius:8px;background:transparent;color:inherit';
  for (const [value, label] of [['panorama', '背景贯穿'], ['sidebar', '独立侧栏']]) {
    const option = element('option', '', label); option.value = value; layoutSelect.append(option);
  }
  layoutLabel.append(layoutSelect); background.append(layoutLabel);
  controls.push(() => { layoutSelect.value = state.common.layout; });
  listen(layoutSelect, 'change', () => change('common', 'layout', null, layoutSelect.value));
  const galleryActions = element('div', 'actions');
  const galleryButton = element('button', '', '选择背景');
  galleryButton.type = 'button';
  galleryButton.setAttribute('aria-haspopup', 'dialog');
  galleryButton.setAttribute('aria-controls', 'sgk-background-gallery');
  listen(galleryButton, 'click', () => win?.__SUNLIT_GALLERY__?.open(galleryButton));
  galleryActions.append(galleryButton);
  background.append(galleryActions, element('p', 'note', '果园午后为亮色默认，夜色相依为暗色默认；相册选择按亮暗模式分别保存。'));
  range(background, '背景强度', 'mode', 'backgroundStrength', 0, 100, '%');
  if (sidebarEnabled) check(background, '独立侧栏人物背景', 'common', 'sidebarArt');
  if (sidebarEnabled) check(background, '正文与导航渐变字', 'common', 'gradientText');
  const motion = group('动效');
  if (companionsEnabled) check(motion, '动态 Q 版伙伴（总开关）', 'common', 'companions');
  if (xixiEmoteEnabled) check(motion, '西西动态表情', 'common', 'sidebarEmote');
  if (sceneEffectsEnabled) check(motion, '场景光影与氛围', 'common', 'sceneEffects');
  if (sceneEffectsEnabled) check(motion, '背景动态（总开关）', 'common', 'wallpaperMotion');
  if (sceneEffectsEnabled) check(motion, '主背景人物眨眼', 'common', 'livingScene');
  if (sceneEffectsEnabled) check(motion, '主背景头发与衣摆摆动', 'common', 'layeredScene');
  check(motion, '场景粒子（果园落叶 / 其他原有特效）', 'common', 'bubbles');
  range(motion, '粒子数量', 'common', 'bubbleCount', 5, 40);
  range(motion, '粒子速度', 'common', 'bubbleSpeed', 30, 200, '%');
  check(motion, '减少动效', 'common', 'reduceMotion');
  const startup = group('启动动画');
  const startupLabel = element('label', 'check');
  const startupInput = element('input'); startupInput.type = 'checkbox'; startupInput.disabled = true;
  startupLabel.append(element('span', '', '以后启动 Codex 时播放龙娘动画'), startupInput);
  const startupHelp = element('p', 'note', '需要通过晴光与泡影启动器连接 Codex 后设置启动动画。');
  startup.append(startupLabel, element('p', 'note', '正常启动时自动播放，可随时按 Esc 跳过。'), startupHelp);
  const startupKey = 'sunlit-tides.startup.enabled';
  function saveStartup(value) {
    try { win.localStorage.setItem(startupKey, String(value)); } catch (_) { /* Native preference remains available if browser storage is blocked. */ }
  }
  function syncStartup(value) {
    const available = value?.available === true && typeof value.enabled === 'boolean';
    startupInput.disabled = !available;
    startupHelp.hidden = available;
    if (available) { startupInput.checked = value.enabled; saveStartup(value.enabled); }
  }
  try { startupInput.checked = win.localStorage.getItem(startupKey) === 'true'; } catch (_) { /* No browser preference yet. */ }
  syncStartup(win?.__sunlitTidesStartup);
  if (win) listen(win, 'sunlit-tides:startup-state', event => syncStartup(event.detail));
  listen(startupInput, 'change', () => {
    if (startupInput.disabled) return;
    saveStartup(startupInput.checked);
    win.dispatchEvent(new win.CustomEvent('sunlit-tides:startup-change', { detail: { enabled: startupInput.checked } }));
  });
  const layout = group('避让与专注');
  check(layout, '避让右侧面板', 'common', 'avoidPanels');
  check(layout, '专注模式', 'common', 'focusMode');
  panel.appendChild(element('p', 'note', '背景与参数跟随 Codex 当前外观，亮暗模式分别保存。调色板参数可导出备份；启动动画由启动器单独保存。'));
  const actions = element('div', 'actions');
  const file = element('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
  const status = element('p', 'status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  function setStatus(text, isError = false) { if (destroyed) return; status.textContent = String(text || ''); status.classList.toggle('error', Boolean(isError)); }
  function action(label, callback) {
    const button = element('button', '', label); button.type = 'button'; actions.appendChild(button);
    listen(button, 'click', () => {
      try { Promise.resolve(callback?.()).catch((error) => setStatus(error?.message || '操作失败。', true)); }
      catch (error) { setStatus(error?.message || '操作失败。', true); }
    });
  }
  action('导入 JSON', () => file.click());
  action('导出备份', onExport);
  action('恢复默认', onReset);
  action('开启编辑',()=>{setExpanded(false);win?.__SUNLIT_CODEX_DIY__?.startEditing?.();});
  actions.lastElementChild.classList.add('edit-primary');
  listen(file, 'change', async () => {
    const selected = file.files?.[0];
    if (!selected) return;
    try {
      if (selected.size > 100 * 1024) throw new Error('配置文件超过 100 KB。');
      const text = await selected.text();
      if (!destroyed && typeof onImport === 'function') await onImport(text);
    } catch (error) { setStatus(error?.message || '导入失败，配置未更改。', true); }
    finally { file.value = ''; }
  });
  panel.append(actions, file, status);
  if(version)panel.appendChild(element('p','note','晴光与泡影 · '+version));
  const scroll=element('div','palette-scroll');
  for(const child of [...panel.children])if(child!==header&&child!==actions)scroll.append(child);
  panel.append(scroll,actions);
  style.textContent+=`.panel{padding:0;display:flex;flex-direction:column;overflow:hidden;background:#f8fafd}.palette-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 16px;border-bottom:1px solid #8997b42b;flex:none}.palette-header h2{margin:0}.palette-close{color:inherit;background:transparent;border:0;font-size:22px;line-height:1;padding:0 4px}.palette-scroll{padding:12px 16px;overflow:auto;min-height:0;overscroll-behavior:contain}.panel>.actions{padding:12px 16px;border-top:1px solid #8997b42b;margin:0;flex:none;display:grid;grid-template-columns:1fr 1fr}.actions .edit-primary{background:#6f86bf;color:#fff;border-color:#6f86bf}:host([data-mode=dark]) .panel{background:#202737}:host([data-mode=dark]) .actions .edit-primary{background:#ad99d1;color:#211a2d}`;
  shadow.append(toggle, panel);
  function sync() {
    host.dataset.mode = activeMode;
    subtitle.textContent = `${activeMode === 'dark' ? '暗色' : '亮色'}参数 · 跟随 Codex 外观`;
    controls.forEach((update) => update());
  }
  function update(nextState, nextMode) {
    if (destroyed) return;
    state = FusionSettings.normalize(nextState);
    activeMode = nextMode === 'dark' ? 'dark' : 'light';
    sync();
  }
  function setBounds(rect) {
    if (destroyed) return;
    const viewportWidth = win?.innerWidth || 480;
    const viewportHeight = win?.innerHeight || 600;
    const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
    const left = Math.max(0, Math.min(finite(rect?.left, 0), Math.max(0, viewportWidth - 160)));
    const top = Math.max(0, Math.min(finite(rect?.top, 0), Math.max(0, viewportHeight - 120)));
    const width = Math.max(160, Math.min(finite(rect?.width, viewportWidth), viewportWidth - left));
    const height = Math.max(120, Math.min(finite(rect?.height, viewportHeight), viewportHeight - top));
    host.style.left = `${left}px`; host.style.top = `${top}px`;
    host.style.width = `${width}px`; host.style.height = `${height}px`;
  }
  sync();
  setBounds();
  document.body.appendChild(host);
  const panelDrag=win?.mountSunlitPanel?.({window:win,document,panel,handle:header,styleText:()=>style.textContent,theme:()=>activeMode,key:'theme'});
  return { host, update, setStatus, setBounds, destroy() {
    if (destroyed) return;
    destroyed = true;
    panelDrag?.dispose();
    cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
    host.remove();
  } };
}
