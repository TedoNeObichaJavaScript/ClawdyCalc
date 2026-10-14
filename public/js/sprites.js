// Pixel-art Clawd mascots. Each model gets the same little body and its own hat.
// Grid is 16 wide; the body sits on rows 0..9 and hats go above it (negative rows).
(function () {
  const CLAY = '#D97757';
  const EYE = '#1F1E1C';
  const TOP = -7; // highest hat row
  const H = 10 - TOP; // total grid height

  const HATS = {
    wizard: {
      rows: [
        '........P.......',
        '.......PP.......',
        '......PPPP......',
        '......PSPP......',
        '.....PPPPPP.....',
        '.....PPPPPP.....',
        '..PPPPPPPPPPPP..',
      ],
      from: -7,
    },
    crown: {
      rows: [
        '...Y...YY...Y...',
        '...YY.YYYY.YY...',
        '...YYYYRRYYYY...',
      ],
      from: -3,
    },
    gradcap: {
      rows: [
        '.KKKKKKKKKKKKKK.',
        '....KKKKKKKK.T..',
        '....KKKKKKKK.T..',
      ],
      from: -3,
    },
    beanie: {
      rows: [
        '.......WW.......',
        '.....BBBBBB.....',
        '...BBBBBBBBBB...',
        '..WWWWWWWWWWWW..',
      ],
      from: -4,
    },
    headphones: {
      rows: [
        '....HHHHHHHH....',
        '...H........H...',
        '..H..........H..',
        '.CC..........CC.',
        '.CC..........CC.',
        '.CC..........CC.',
      ],
      from: -2,
    },
    sprout: {
      rows: [
        '.....GG...GG....',
        '......GG.GG.....',
        '........G.......',
      ],
      from: -3,
    },
    party: {
      rows: [
        '.......Y........',
        '......PYP.......',
        '.....YPYPY......',
        '....PYPYPYP.....',
      ],
      from: -4,
    },
  };

  function look(model) {
    const m = String(model || '');
    if (/fable-5-1/.test(m)) return { hat: 'wizard', colors: { P: '#6E5BD6', S: '#F2C94C' }, scale: 1 };
    if (/fable/.test(m)) return { hat: 'wizard', colors: { P: '#3F8F8A', S: '#F2C94C' }, scale: 1 };
    if (/mythos/.test(m)) return { hat: 'wizard', colors: { P: '#9C3B4A', S: '#F2C94C' }, scale: 1 };
    if (/opus-5-5/.test(m)) return { hat: 'crown', colors: { Y: '#E8B94A', R: '#C2413A' }, scale: 1 };
    if (/opus-5/.test(m)) return { hat: 'gradcap', colors: { K: '#34477A', T: '#E8B94A' }, scale: 1 };
    if (/opus/.test(m)) return { hat: 'beanie', colors: { B: '#3D5A80', W: '#F4F1EA' }, scale: 1 };
    if (/sonnet/.test(m)) return { hat: 'headphones', colors: { H: '#77726A', C: '#5C8FA8' }, scale: 0.9 };
    if (/haiku/.test(m)) return { hat: 'sprout', colors: { G: '#6FA35A' }, scale: 0.75 };
    return { hat: 'party', colors: { P: '#D96BA0', Y: '#F2C94C' }, scale: 0.9 };
  }

  // merge horizontal runs of the same color into one rect each
  function rowsToRects(rows, fromY, colors) {
    let out = '';
    rows.forEach((row, i) => {
      let x = 0;
      while (x < row.length) {
        const ch = row[x];
        if (ch === '.') { x++; continue; }
        let w = 1;
        while (row[x + w] === ch) w++;
        out += `<rect x="${x}" y="${fromY + i}" width="${w}" height="1" fill="${colors[ch] || ch}"/>`;
        x += w;
      }
    });
    return out;
  }

  const r = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

  const BODY = r(2, 0, 12, 8, CLAY) + r(0, 4, 16, 2, CLAY);
  const EYES_OPEN = r(4, 2, 1, 2, EYE) + r(11, 2, 1, 2, EYE);
  const EYES_SHUT = r(3, 3, 2, 1, EYE) + r(11, 3, 2, 1, EYE);
  const EYES_HAPPY = r(3, 3, 1, 1, EYE) + r(4, 2, 1, 1, EYE) + r(5, 3, 1, 1, EYE)
    + r(10, 3, 1, 1, EYE) + r(11, 2, 1, 1, EYE) + r(12, 3, 1, 1, EYE);
  const LEGS_A = [3, 5, 10, 12].map((x) => r(x, 8, 1, 2, CLAY)).join('');
  const LEGS_B = [3, 5, 10, 12].map((x) => r(x, 8, 1, 1, CLAY)).join('')
    + [2, 6, 9, 13].map((x) => r(x, 9, 1, 1, CLAY)).join('');

  // px = size of one pixel on screen
  function svg(model, px, opts = {}) {
    const l = look(model);
    const hat = HATS[l.hat];
    const top = opts.tight ? hat.from : TOP;
    const h = 10 - top;
    return `<svg width="${16 * px}" height="${h * px}" viewBox="0 ${top} 16 ${h}" aria-hidden="true">`
      + `<g class="legs-a">${LEGS_A}</g><g class="legs-b">${LEGS_B}</g>`
      + BODY
      + `<g class="eyes-open">${EYES_OPEN}</g><g class="eyes-shut">${EYES_SHUT}</g><g class="eyes-happy">${EYES_HAPPY}</g>`
      + rowsToRects(hat.rows, hat.from, l.colors)
      + `</svg>`;
  }

  const api = { svg, look, HATS, GRID_W: 16, GRID_H: H };
  if (typeof module === 'object' && module.exports) module.exports = api; // used by scripts/build-readme-art.js
  else window.Sprites = api;
})();
