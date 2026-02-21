import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const OUTPUTS = [
  { size: 512, path: 'public/icons/icon-512.png', type: 'any' },
  { size: 192, path: 'public/icons/icon-192.png', type: 'any' },
  { size: 180, path: 'public/icons/apple-touch-icon.png', type: 'any' },
  { size: 512, path: 'public/icons/icon-512-maskable.png', type: 'maskable' },
  { size: 192, path: 'public/icons/icon-192-maskable.png', type: 'maskable' },
];

function iconSvg(size, type) {
  const isMaskable = type === 'maskable';
  const monogramSize = Math.round(size * (isMaskable ? 0.565 : 0.535));

  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="tulis icon">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5B57ED" />
      <stop offset="100%" stop-color="#4F46E5" />
    </linearGradient>
    <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${Math.max(1, Math.round(size * 0.007))}" stdDeviation="${Math.max(0.5, size * 0.004)}" flood-color="rgba(0,0,0,0.16)"/>
    </filter>
  </defs>
  <rect x="0" y="0" width="${size}" height="${size}" fill="url(#bg)"/>
  <text
    x="50%"
    y="51%"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="Geist, Inter, Helvetica Neue, Arial, sans-serif"
    font-size="${monogramSize}"
    font-weight="600"
    fill="#FFFFFF"
    style="filter:url(#soft-shadow)"
  >t</text>
</svg>`;
}

for (const output of OUTPUTS) {
  const svg = iconSvg(output.size, output.type);
  const png = await sharp(Buffer.from(svg), { density: 384 })
    .resize(output.size, output.size)
    .png()
    .toBuffer();
  await writeFile(output.path, png);
}

console.log('Generated icons:', OUTPUTS.map((output) => output.path).join(', '));
