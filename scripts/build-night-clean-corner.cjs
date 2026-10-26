// Keep the original raster registered; use only the generated corner repair.
// This SVG composition prevents the image edit from changing faces or motion masks.
const fs = require('node:fs'), path = require('node:path');
const assets = path.resolve(__dirname, '../theme/assets');
const original = fs.readFileSync(path.join(assets, 'duo-night-companion.jpg')).toString('base64');
const repair = fs.readFileSync(path.join(assets, 'night-corner-repair-generated.png')).toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1272" height="847" viewBox="0 0 1272 847">
<defs>
  <filter id="corner-feather" filterUnits="userSpaceOnUse" x="0" y="780" width="300" height="67"><feGaussianBlur stdDeviation="1.5"/></filter>
  <mask id="corner-only" maskUnits="userSpaceOnUse" x="0" y="780" width="300" height="67"><rect x="8" y="787" width="282" height="47" fill="white" filter="url(#corner-feather)"/></mask>
</defs>
<image width="1272" height="847" href="data:image/jpeg;base64,${original}"/>
<image width="1272" height="847" preserveAspectRatio="none" mask="url(#corner-only)" href="data:image/png;base64,${repair}"/>
</svg>\n`;
fs.writeFileSync(path.join(assets, 'duo-night-companion-clean.svg'), svg);
console.log('Built registered corner-only repair: 1272x847; original retained.');
