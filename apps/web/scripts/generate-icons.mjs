// Generates the PWA icon set from an inline synthwave "broadcast" mark.
// Run: `bun run scripts/generate-icons.mjs` (also wired as a package script).
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

/** @param {number} scale @param {boolean} maskable */
function svg(scale, maskable) {
  // Tabler "broadcast" glyph (24-grid), scaled & centered on a 512 canvas.
  const glyphSize = 24 * scale;
  const offset = (512 - glyphSize) / 2;
  const radius = maskable ? 0 : 112; // maskable = full-bleed (system masks it)
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#18222d"/>
      <stop offset="1" stop-color="#0a0e12"/>
    </linearGradient>
    <linearGradient id="neon" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#00e8c6"/>
      <stop offset="0.5" stop-color="#64e882"/>
      <stop offset="1" stop-color="#00c6e8"/>
    </linearGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="7" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#bg)"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})"
     fill="none" stroke="url(#neon)" stroke-width="2"
     stroke-linecap="round" filter="url(#glow)">
    <path d="M18.364 19.364a9 9 0 1 0 -12.728 0"/>
    <path d="M15.536 16.536a5 5 0 1 0 -7.072 0"/>
    <circle cx="12" cy="12" r="1.4" fill="url(#neon)" stroke="none"/>
  </g>
</svg>`;
}

const standard = Buffer.from(svg(13, false));
const maskable = Buffer.from(svg(10, true));

const targets = [
  { buf: standard, size: 192, out: "pwa-192x192.png" },
  { buf: standard, size: 512, out: "pwa-512x512.png" },
  { buf: maskable, size: 512, out: "maskable-icon-512x512.png" },
  { buf: standard, size: 180, out: "apple-touch-icon-180x180.png" },
  { buf: standard, size: 64, out: "favicon-64.png" },
];

await Promise.all(
  targets.map(({ buf, size, out }) =>
    sharp(buf)
      .resize(size, size)
      .png()
      .toFile(join(publicDir, out))
      .then(() => console.log("wrote", out)),
  ),
);
console.log("PWA icons generated.");
