// Synthetic UI only. Structure follows R7o + fHn in Codex 26.1021.3705.0.
// Native caption controls are represented separately from the zoomed web UI.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'theme-browser.cjs'),'utf8');
let html=vm.runInNewContext(source.match(/const fixture = (`[\s\S]+?`);\r?\n\r?\nasync function main/)[1]);
html=html.replace('<html lang="zh-CN"','<html data-codex-os="win32" data-codex-window-type="electron" lang="zh-CN"');
html=html.replace('</head>',`<style>
:root{--codex-window-zoom:1;--spacing:4px}
.fixture-caption{position:fixed;right:0;top:0;height:44px;z-index:2147483640;display:flex;background:#262334;color:#eee}
.fixture-caption button{width:46px;border:0;background:transparent;color:inherit;font-size:18px}
.viewer-fixture-tools{position:fixed;left:20px;top:52px;-webkit-app-region:no-drag;z-index:60;display:flex;gap:7px;align-items:center;font-size:12px}
.viewer-fixture-tools button{padding:3px 9px}
/* Electron resizes its web viewport with app zoom; compensate our CSS-only
   zoom simulation so the test dialog still fills the actual viewport. */
.fixture-image-dialog{position:fixed;inset:0;width:calc(100vw / var(--codex-window-zoom));height:calc(100dvh / var(--codex-window-zoom));max-width:none;border:0;margin:0;padding:0;z-index:1000;background:#f3eff7;color:#3c314a}
html[data-theme=dark] .fixture-image-dialog{background:#19182b;color:#e8e4f3}
.image-window{position:relative;width:100%;height:100%;display:flex;flex-direction:column;min-height:0}
[data-testid=viewer-header]{position:relative;display:flex;align-items:center;justify-content:space-between;flex:none;min-height:48px;padding:8px 12px;gap:8px}
[data-testid=viewer-header] .trailing{display:flex;align-items:center;gap:8px}
.fixture-image-dialog button,.fixture-image-dialog select{background:#8882;color:inherit;border:1px solid #8885;border-radius:22px;padding:8px 12px;min-height:34px}
.image-window>[data-testid=image-preview-dismiss-area],.image-viewport{display:flex;flex:1;min-height:0;overflow:auto;align-items:center;justify-content:center;padding:18px}
[data-testid=image-preview-dismiss-area] img{object-fit:contain;max-height:100%;max-width:100%}
._WindowContent_fd04d_3{padding:48px 32px 32px;align-items:center}
._WindowActions_fd04d_7{position:absolute;right:12px;top:12px;display:flex;gap:8px;z-index:10}
.fixture-image-label{position:absolute;bottom:12px;left:18px;font-size:12px;opacity:.7;pointer-events:none}
</style></head>`);
html=html.replace('</body>',`<div class="fixture-caption" aria-label="模拟窗口标题栏"><button aria-label="模拟最小化">−</button><button aria-label="模拟最大化">□</button><button aria-label="模拟关闭窗口" id="native-window-close">×</button></div>
<div class="viewer-fixture-tools"><button id="open-image">打开图片</button><button id="mode-toggle">切换明暗</button><label>预览样式 <select id="viewer-kind"><option value="overlay">新版</option><option value="classic">经典</option></select></label><label>界面缩放 <select id="app-zoom"><option value="1">100%</option><option value="0.8">80%</option><option value="1.5">150%</option></select></label></div>
<script>
fixture.setView('chat');fixture.setMode('dark');
window.fixtureWindowCloseClicks=0;document.getElementById('native-window-close').onclick=()=>fixtureWindowCloseClicks++;
document.getElementById('mode-toggle').onclick=()=>fixture.setMode(document.documentElement.dataset.theme==='dark'?'light':'dark');
document.getElementById('app-zoom').onchange=e=>fixture.setZoom(Number(e.target.value));
fixture.setZoom=z=>{document.documentElement.style.setProperty('--codex-window-zoom',z);document.body.style.zoom=z;document.querySelector('.fixture-caption').style.zoom=1/z};
fixture.closeImage=()=>{document.querySelector('.fixture-image-dialog')?.remove();document.getElementById('open-image').focus()};
fixture.openImage=(kind=document.getElementById('viewer-kind').value)=>{
 fixture.closeImage();const dialog=document.createElement('div');dialog.className='fixture-image-dialog';dialog.role='dialog';dialog.setAttribute('aria-label','图片预览');dialog.dataset.state='open';
 const zoom='<select aria-label="图片缩放" data-testid="image-preview-zoom-trigger"><option>100%</option><option>150%</option></select>';
 const buttons='<button type="button" aria-label="下载图片">↓</button><button type="button" aria-label="关闭图片预览">×</button>';
 const image='<div class="image-viewport"><div data-testid="image-preview-dismiss-area"><img src="/scene.jpg" alt="果园午后 · 测试图片"></div></div>';
 dialog.innerHTML=kind==='classic'?'<div class="image-window _WindowContent_fd04d_3" data-right-window-controls="true"><div class="_WindowActions_fd04d_7">'+buttons+'</div>'+image+zoom+'</div>':'<div class="image-window"><header class="_header_1oxlz_1" data-testid="viewer-header" data-viewer-density="surface"><button>图像 ▾</button><div class="trailing">'+zoom+buttons+'</div></header>'+image+'</div>';
 dialog.insertAdjacentHTML('beforeend','<span class="fixture-image-label">合成预览 · 窗口按钮与图片工具栏分行</span>');
 dialog.querySelector('[aria-label="关闭图片预览"]').onclick=fixture.closeImage;
 dialog.querySelector('[aria-label="下载图片"]').onclick=()=>{dialog.dataset.downloadClicked='true'};
 dialog.querySelector('select').onchange=e=>{dialog.querySelector('img').style.width=e.target.value==='150%'?'150%':'auto'};
 document.body.appendChild(dialog);dialog.querySelector('[aria-label="关闭图片预览"]').focus();
};
document.getElementById('open-image').onclick=()=>fixture.openImage();
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.querySelector('.fixture-image-dialog'))fixture.closeImage()});
</script></body>`);
module.exports=html;
