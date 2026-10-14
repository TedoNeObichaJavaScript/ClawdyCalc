#!/usr/bin/env node
// Builds the animated README art from the same pixel sprites the app uses.
//   docs/clawds-walking.svg   the parade at the top of the README
//   docs/clawds/<name>.svg    one idle Clawd per model, for the cast table
// Run with: npm run art
const fs = require('fs');
const path = require('path');
const Sprites = require('../public/js/sprites.js');

const OUT = path.join(__dirname, '..', 'docs');
fs.mkdirSync(path.join(OUT, 'clawds'), { recursive: true });

// strip the outer <svg> so a sprite can be nested inside a bigger drawing
function inner(model, px) {
  const s = Sprites.svg(model, px, { tight: true });
  const w = +s.match(/width="(\d+)"/)[1];
  const h = +s.match(/height="(\d+)"/)[1];
  const viewBox = s.match(/viewBox="([^"]+)"/)[1];
  const body = s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return { w, h, svg: `<svg width="${w}" height="${h}" viewBox="${viewBox}" shape-rendering="crispEdges">${body}</svg>` };
}

const SPRITE_CSS = `
  .legs-b, .eyes-shut, .eyes-happy { opacity: 0; }
  .legs-a { animation: legsA .36s steps(1) infinite; }
  .legs-b { animation: legsB .36s steps(1) infinite; }
  .eyes-open { animation: eyesOpen 4.2s steps(1) infinite; }
  .eyes-shut { animation: eyesShut 4.2s steps(1) infinite; }
  @keyframes legsA { 0% { opacity: 1; } 50% { opacity: 0; } }
  @keyframes legsB { 0% { opacity: 0; } 50% { opacity: 1; } }
  @keyframes eyesOpen { 0%, 94% { opacity: 1; } 95%, 98% { opacity: 0; } 99% { opacity: 1; } }
  @keyframes eyesShut { 0%, 94% { opacity: 0; } 95%, 98% { opacity: 1; } 99% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }`;

// ---------- the parade ----------
const W = 820, H = 160, GROUND = 128;
const cast = [
  // model, pixel size, walk from, walk to, seconds per lap, hop?
  ['claude-fable-5-1', 5, 20, 300, 7.0, 'hopBig'],
  ['claude-opus-5-5', 5, 140, 520, 9.0, 'hop'],
  ['claude-opus-5', 5, 330, 640, 8.0, null],
  ['claude-sonnet-5-5', 4, 480, 740, 6.5, 'hop'],
  ['claude-haiku-5-5', 4, 600, 760, 5.0, 'hopBig'],
  ['claude-opus-4-8', 4, 60, 420, 10.0, null],
];

let walkers = '';
let css = SPRITE_CSS;
cast.forEach(([model, px, from, to, secs, hop], i) => {
  const s = inner(model, px);
  const delay = -(i * 1.7).toFixed(1);
  css += `
  .w${i} { animation: walk${i} ${secs}s linear ${delay}s infinite alternate; }
  .f${i} { animation: flip ${secs * 2}s steps(1) ${delay}s infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes walk${i} { from { transform: translateX(${from}px); } to { transform: translateX(${to - s.w}px); } }`;
  if (hop) css += `\n  .h${i} { animation: ${hop} ${2.6 + i * 0.45}s ease-in-out ${-i}s infinite; }`;
  walkers += `
  <g class="w${i}"><g transform="translate(0 ${GROUND - s.h})"><g class="h${i}"><g class="f${i}">${s.svg}</g></g></g></g>`;
});
css += `
  @keyframes flip { 0% { transform: scaleX(1); } 50% { transform: scaleX(-1); } }
  @keyframes hop { 0%, 78%, 100% { transform: translateY(0); } 86% { transform: translateY(-16px); } 92% { transform: translateY(0); } 95% { transform: translateY(-4px); } }
  @keyframes hopBig { 0%, 70%, 100% { transform: translateY(0); } 80% { transform: translateY(-34px); } 90% { transform: translateY(0); } 94% { transform: translateY(-6px); } }
  .cloud { animation: drift 40s linear infinite; }
  .cloud.b { animation-duration: 60s; animation-delay: -25s; }
  @keyframes drift { from { transform: translateX(-80px); } to { transform: translateX(${W + 40}px); } }`;

const cloud = (y, cls, s = 6) =>
  `<g class="cloud ${cls}" fill="#FFFFFF" opacity=".95"><rect x="0" y="${y}" width="${s * 4}" height="${s}"/><rect x="${s}" y="${y - s}" width="${s * 2}" height="${s}"/><rect x="${s * 3}" y="${y - s * 2}" width="${s * 2}" height="${s * 2}"/><rect x="${s * 3}" y="${y}" width="${s * 3}" height="${s}"/></g>`;

const ground = Array.from({ length: Math.ceil(W / 16) }, (_, i) =>
  `<rect x="${i * 16 + 14}" y="${GROUND + 2}" width="2" height="${H - GROUND}" fill="#000" opacity=".04"/>`).join('');

const parade = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pixel Clawds walking and hopping">
<title>ClawdyCalc mascots</title>
<style>${css}
</style>
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7EEE4"/><stop offset="1" stop-color="#FBF6EF"/></linearGradient>
<clipPath id="r"><rect width="${W}" height="${H}" rx="18"/></clipPath></defs>
<g clip-path="url(#r)">
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${cloud(34, 'a')}${cloud(62, 'b', 4)}
  <rect y="${GROUND}" width="${W}" height="${H - GROUND}" fill="#E7DCC9"/>
  <rect y="${GROUND}" width="${W}" height="2" fill="#CDBDA3"/>
  ${ground}${walkers}
</g>
</svg>
`;
fs.writeFileSync(path.join(OUT, 'clawds-walking.svg'), parade);

// ---------- cast icons ----------
const icons = {
  'fable': 'claude-fable-5-1',
  'mythos': 'claude-mythos-5-1',
  'opus-5-5': 'claude-opus-5-5',
  'opus-5': 'claude-opus-5',
  'opus-4': 'claude-opus-4-8',
  'sonnet': 'claude-sonnet-5-5',
  'haiku': 'claude-haiku-5-5',
  'mystery': 'claude-unknown',
};
for (const [name, model] of Object.entries(icons)) {
  const s = inner(model, 4);
  const pad = 10;
  const iw = s.w + pad * 2, ih = s.h + pad + 4;
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}" viewBox="0 0 ${iw} ${ih}">
<style>${SPRITE_CSS}
  .bob { animation: bob 1.8s ease-in-out infinite; }
  @keyframes bob { 0%, 60%, 100% { transform: translateY(0); } 75% { transform: translateY(-6px); } }
</style>
<g class="bob"><g transform="translate(${pad} ${pad})">${s.svg}</g></g>
</svg>
`;
  fs.writeFileSync(path.join(OUT, 'clawds', `${name}.svg`), icon);
}

console.log('Wrote docs/clawds-walking.svg and docs/clawds/*.svg');
