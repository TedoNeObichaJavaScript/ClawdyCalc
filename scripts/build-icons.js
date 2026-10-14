#!/usr/bin/env node
// Draws the pixel-calculator app icon as PNG + ICO, with no image libraries.
//   desktop/icons/icon.png   256×256, window + installer icon
//   desktop/icons/icon.ico   16–256 px, taskbar, tray and shortcuts
// Run with: node scripts/build-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const GRID = [
  '.BBBBBBBB.',
  'BBBBBBBBBB',
  'BSSSSSSSSB',
  'BSSSSSSDSB',
  'BSSSSSSSSB',
  'BBBBBBBBBB',
  'BKKBKKBKKB',
  'BBBBBBBBBB',
  'BKKBKKBKKB',
  'BBBBBBBBBB',
  'BKKBKKBEEB',
  '.BBBBBBBB.',
];
const COLORS = { B: [0xD9, 0x77, 0x57], S: [0xFB, 0xFA, 0xF6], K: [0xF3, 0xED, 0xE7], D: [0xB9, 0x5E, 0x3F], E: [0xB9, 0x5E, 0x3F] };

// biggest whole-pixel scale that fits, centered on a transparent square
function render(size) {
  const scale = Math.max(1, Math.floor(size / GRID.length));
  const w = GRID[0].length * scale, h = GRID.length * scale;
  const ox = Math.floor((size - w) / 2), oy = Math.floor((size - h) / 2);
  const rgba = Buffer.alloc(size * size * 4);
  GRID.forEach((row, gy) => [...row].forEach((ch, gx) => {
    const c = COLORS[ch];
    if (!c) return;
    for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
      const px = ox + gx * scale + x, py = oy + gy * scale + y;
      if (px >= size || py >= size) continue;
      const i = (py * size + px) * 4;
      rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
    }
  }));
  return png(size, size, rgba);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ICO with PNG-compressed entries (supported since Windows Vista)
function ico(sizes) {
  const images = sizes.map(render);
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    header[e] = s >= 256 ? 0 : s; header[e + 1] = s >= 256 ? 0 : s;
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(images[i].length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  return Buffer.concat([header, ...images]);
}

const out = path.join(__dirname, '..', 'desktop', 'icons');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.png'), render(256));
fs.writeFileSync(path.join(out, 'icon.ico'), ico([16, 24, 32, 48, 64, 128, 256]));
console.log('Wrote desktop/icons/icon.png and icon.ico');
