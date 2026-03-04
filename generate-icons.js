const fs = require('fs');
const zlib = require('zlib');

function crc32(buf) {
  let c = 0xffffffff;
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c2 = n;
    for (let k = 0; k < 8; k++) c2 = c2 & 1 ? 0xedb88320 ^ (c2 >>> 1) : c2 >>> 1;
    table[n] = c2;
  }
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type);
  const crcVal = crc32(Buffer.concat([typeB, data]));
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crcVal);
  return Buffer.concat([len, typeB, data, crcB]);
}

function createPNG(size, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const compressed = zlib.deflateSync(raw);

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4, 0);
  const cx = size / 2, cy = size / 2, r = size / 2 - 1;

  function setPixel(x, y, red, g, b, a) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    x = Math.round(x); y = Math.round(y);
    const i = (y * size + x) * 4;
    pixels[i] = red; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = a;
  }

  // Draw filled circle
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= r) {
        const alpha = Math.min(1, r - dist + 0.5);
        setPixel(x, y, 99, 102, 241, Math.round(alpha * 255));
      }
    }
  }

  // Draw $ sign in white
  const s = Math.max(1, Math.round(size * 0.08)); // stroke width

  function fillRect(x1, y1, x2, y2) {
    for (let y = Math.round(y1); y <= Math.round(y2); y++)
      for (let x = Math.round(x1); x <= Math.round(x2); x++)
        setPixel(x, y, 255, 255, 255, 255);
  }

  const l = size * 0.33, ri = size * 0.67;
  const t = size * 0.22, b = size * 0.78, m = size * 0.5;

  // Top bar
  fillRect(l, t, ri, t + s);
  // Middle bar
  fillRect(l, m - s/2, ri, m + s/2);
  // Bottom bar
  fillRect(l, b - s, ri, b);
  // Left side (top half)
  fillRect(l, t, l + s, m);
  // Right side (bottom half)
  fillRect(ri - s, m, ri, b);
  // Vertical center line
  fillRect(m - s/2, size * 0.17, m + s/2, size * 0.83);

  return pixels;
}

[16, 48, 128].forEach(size => {
  const pixels = drawIcon(size);
  const png = createPNG(size, pixels);
  fs.writeFileSync(`${__dirname}/icons/icon${size}.png`, png);
  console.log(`Created icon${size}.png (${png.length} bytes)`);
});
