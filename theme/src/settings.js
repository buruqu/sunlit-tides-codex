const FusionSettings = (() => {
  const slotDefaults = () => ({ visible: true, size: 100, x: 0, y: 0 });
  const modeDefaults = (messageOpacity) => ({
    backgroundStrength: 100, messagePanel: true, messageOpacity, portraitOpacity: null, emoteOpacity: null,
    left: slotDefaults(), primary: slotDefaults(), secondary: slotDefaults()
  });
  const defaults = () => ({
    schemaVersion: 1,
    common: {
      layout: 'panorama', chatWidth: 820, avoidPanels: true, focusMode: false, bubbles: true, companions: true,
      bubbleCount: 16, bubbleSpeed: 100, reduceMotion: false,
      sidebarArt: true, sidebarEmote: true, sceneEffects: true, wallpaperMotion: true,
      gradientText: true, livingScene: true, layeredScene: true
    },
    modes: { light: modeDefaults(92), dark: modeDefaults(82) }
  });
  const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const number = (value, fallback, min, max) => typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value)) : fallback;
  const bool = (value, fallback) => typeof value === 'boolean' ? value : fallback;
  function normalize(input) {
    const result = defaults();
    if (!record(input) || (input.schemaVersion !== undefined && input.schemaVersion !== 1)) return result;
    const common = record(input.common) ? input.common : {};
    for (const key of ['avoidPanels', 'focusMode', 'bubbles', 'companions', 'reduceMotion', 'sidebarArt', 'sidebarEmote', 'sceneEffects', 'wallpaperMotion', 'gradientText', 'livingScene', 'layeredScene']) {
      result.common[key] = bool(common[key], result.common[key]);
    }
    result.common.layout = ['panorama', 'sidebar'].includes(common.layout) ? common.layout : 'panorama';
    result.common.chatWidth = number(common.chatWidth, 820, 480, 1440);
    result.common.bubbleCount = Math.round(number(common.bubbleCount, 16, 5, 40));
    result.common.bubbleSpeed = number(common.bubbleSpeed, 100, 30, 200);
    for (const name of ['light', 'dark']) {
      const source = record(input.modes) && record(input.modes[name]) ? input.modes[name] : {};
      const target = result.modes[name];
      target.backgroundStrength = number(source.backgroundStrength, 100, 0, 100);
      target.messagePanel = bool(source.messagePanel, true);
      target.messageOpacity = number(source.messageOpacity, target.messageOpacity, 20, 100);
      for (const key of ['portraitOpacity', 'emoteOpacity']) target[key] = number(source[key], null, 0, 100);
      for (const slot of ['left', 'primary', 'secondary']) {
        const values = record(source[slot]) ? source[slot] : {};
        target[slot] = {
          visible: bool(values.visible, true), size: number(values.size, 100, 40, 160),
          x: number(values.x, 0, -100, 100), y: number(values.y, 0, -200, 200)
        };
      }
    }
    return result;
  }
  function parse(jsonText) {
    if (typeof jsonText !== 'string') throw new Error('请选择 JSON 配置文件。');
    if (new TextEncoder().encode(jsonText).byteLength > 100 * 1024) {
      throw new Error('配置文件超过 100 KB，请使用调色板导出的配置。');
    }
    let value;
    try { value = JSON.parse(jsonText); } catch { throw new Error('JSON 格式无效，配置未更改。'); }
    if (!record(value) || value.schemaVersion !== 1) throw new Error('配置版本不兼容，需要 schemaVersion: 1。');
    if (!record(value.common) || !record(value.modes) ||
        !record(value.modes.light) || !record(value.modes.dark)) {
      throw new Error('配置结构不完整，需要 common 与 modes.light / modes.dark。');
    }
    const numberKeys = new Set(['chatWidth', 'bubbleCount', 'bubbleSpeed', 'backgroundStrength', 'messageOpacity', 'size', 'x', 'y']);
    const boolKeys = new Set(['avoidPanels', 'focusMode', 'bubbles', 'companions', 'reduceMotion', 'sidebarArt', 'sidebarEmote', 'sceneEffects', 'wallpaperMotion', 'gradientText', 'livingScene', 'layeredScene', 'messagePanel', 'visible']);
    function validateFields(object, allowed, path) {
      for (const key of allowed) {
        if (!(key in object)) continue;
        if (numberKeys.has(key) && (typeof object[key] !== 'number' || !Number.isFinite(object[key]))) {
          throw new Error(`${path}.${key} 必须是有限数字。`);
        }
        if (boolKeys.has(key) && typeof object[key] !== 'boolean') throw new Error(`${path}.${key} 必须是布尔值。`);
      }
    }
    if ('layout' in value.common && !['panorama', 'sidebar'].includes(value.common.layout)) throw new Error('common.layout 必须是 panorama 或 sidebar。');
    validateFields(value.common, Object.keys(defaults().common), 'common');
    for (const name of ['light', 'dark']) {
      const source = value.modes[name];
      for (const key of ['portraitOpacity', 'emoteOpacity']) {
        if (key in source && source[key] !== null && (typeof source[key] !== 'number' || !Number.isFinite(source[key]))) throw new Error(`modes.${name}.${key} 必须是有限数字或 null。`);
      }
      validateFields(source, ['backgroundStrength', 'messagePanel', 'messageOpacity'], `modes.${name}`);
      for (const slot of ['left', 'primary', 'secondary']) {
        if (slot in source && !record(source[slot])) throw new Error(`modes.${name}.${slot} 必须是对象。`);
        if (record(source[slot])) validateFields(source[slot], ['visible', 'size', 'x', 'y'], `modes.${name}.${slot}`);
      }
    }
    return normalize(value);
  }
  return Object.freeze({ version: '0.1.0', defaults, normalize, parse, serialize: (state) => JSON.stringify(normalize(state), null, 2) });
})();
