import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const ACCENT = '#5C6AC4';

const OUTPUTS = [
  { size: 512, path: 'public/icons/icon-512.png', type: 'any' },
  { size: 192, path: 'public/icons/icon-192.png', type: 'any' },
  { size: 180, path: 'public/icons/apple-touch-icon.png', type: 'any' },
  { size: 512, path: 'public/icons/icon-512-maskable.png', type: 'maskable' },
  { size: 192, path: 'public/icons/icon-192-maskable.png', type: 'maskable' },
];

function createIco(pngEntries) {
  const count = pngEntries.length;
  const header = Buffer.alloc(6 + count * 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // icon type
  header.writeUInt16LE(count, 4); // number of images

  let offset = header.length;

  pngEntries.forEach((entry, index) => {
    const pos = 6 + index * 16;
    header.writeUInt8(entry.size >= 256 ? 0 : entry.size, pos);
    header.writeUInt8(entry.size >= 256 ? 0 : entry.size, pos + 1);
    header.writeUInt8(0, pos + 2); // palette colors
    header.writeUInt8(0, pos + 3); // reserved
    header.writeUInt16LE(1, pos + 4); // color planes
    header.writeUInt16LE(32, pos + 6); // bits per pixel
    header.writeUInt32LE(entry.buffer.length, pos + 8);
    header.writeUInt32LE(offset, pos + 12);
    offset += entry.buffer.length;
  });

  return Buffer.concat([header, ...pngEntries.map((entry) => entry.buffer)]);
}

function iconSvg(size, type) {
  const isMaskable = type === 'maskable';
  const monogramSize = Math.round(size * (isMaskable ? 0.565 : 0.535));

  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="tulis icon">
  <rect x="0" y="0" width="${size}" height="${size}" fill="${ACCENT}"/>
  <text
    x="50%"
    y="51%"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="Geist, Inter, Helvetica Neue, Arial, sans-serif"
    font-size="${monogramSize}"
    font-weight="600"
    fill="#FFFFFF"
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

const faviconSizes = [16, 32, 48];
const faviconPngs = [];
for (const size of faviconSizes) {
  const png = await sharp(Buffer.from(iconSvg(size, 'any')), { density: 384 })
    .resize(size, size)
    .png()
    .toBuffer();
  faviconPngs.push({ size, buffer: png });
}
await writeFile('src/app/favicon.ico', createIco(faviconPngs));

console.log('Generated icons:', [...OUTPUTS.map((output) => output.path), 'src/app/favicon.ico'].join(', '));
