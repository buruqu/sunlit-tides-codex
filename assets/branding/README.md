# 晴光与泡影 Studio 入口图标

金色暖阳与蓝紫泡泡对应主题的「晴光与泡影」意象。按用户后续要求，泡泡中央加入 GPT 标志。PNG 由内置 imagegen 在 2026-10-28 生成并编辑，保留透明背景。图标只用于专用主题入口；普通 Codex/ChatGPT 入口保留官方图标。GPT 标志参考已安装应用图标，仅用于识别对应启动入口；它不表示本主题由 OpenAI 官方制作或认可，原标志相关权利仍归其权利人。

- `sunlit-tides.png`：生成原稿，1254 × 1254，含透明通道。
- `sunlit-tides.ico`：Windows 多尺寸图标，包含 16、20、24、32、40、48、64、96、128、256 像素，32 位透明 PNG 帧。
- 复现格式转换：在仓库根目录运行 `powershell -NoProfile -File scripts/Build-Icon.ps1`。该脚本只缩放与封装，不修改图案。
- 宿主编译嵌入 ICO；安装包同时携带 `app/branding/sunlit-tides.ico`。安装器给专用入口使用 `data/entrypoints/sunlit-tides.ico`，旧包缺少新图标时兼容回退。

## 生成方式与完整提示

使用内置 imagegen，`transparent_background: true`。初稿没有参考图；后续编辑使用初稿和已安装应用的 GPT 图标作参考，没有使用 CLI。下面保留初稿提示，最终版本另应用下方编辑提示。

```text
Use case: logo-brand. Asset type: Windows desktop and Start menu application icon for the user's existing theme named Sunlit Tides Studio (晴光与泡影). Make one beautifully polished icon, not a presentation or mockup. A warm golden sun at the upper left merging gracefully with a single luminous blue-lilac soap bubble at the lower right, one small simple pearlescent sparkle. Compact bold silhouettes that remain recognizable at 16 and 32 pixels, generous thick rims, not tiny decorative details. Soft semi-flat premium illustrated material with gentle pearlescent highlights, cheerful and serene, warm apricot/gold and cool periwinkle/cyan. Dark midnight-indigo rounded-square tile behind the symbol, subtly shaded; tile fills about 90 percent of the square frame, outside tile genuinely transparent. Symbol fills most of tile with balanced margins. Front facing orthographic, perfectly centered, square 1024x1024. No words, no letters, no borders outside the tile, no drop shadow extending beyond the tile, no watermark, no Microsoft or OpenAI logo, no characters, no elaborate rays or thin strokes.
```

## 最终 GPT 图标编辑提示

```text
Edit target: Image 1 is the user's existing Sunlit Tides Studio Windows launcher icon. Supporting insert reference: Image 2 is the installed ChatGPT / OpenAI interwoven six-loop knot logo, use its recognizable geometry. Change only Image 1 by adding that GPT knot logo prominently in the center of the lower-right blue/lilac bubble, large enough to recognize in a 32px desktop icon (roughly 34 percent of total icon width). Render the knot as a crisp solid pearly-white emblem with subtle navy edge contrast, clean open gaps, faithful symmetric interwoven six-loop construction. Do not include the gray circular background from Image 2. Keep the sun, rays, bubble shape, sparkle, deep indigo rounded-square tile, composition and gold/blue/lilac colors exactly as Image 1. The white knot should feel like an emblem on the bubble surface but remain geometrically accurate and easily visible, not liquid-distorted. Preserve the existing real transparency outside the rounded-square tile. No text, no letters, no new objects besides this single GPT logo, no extra framing, no mockup. Output the complete finished icon.
```
