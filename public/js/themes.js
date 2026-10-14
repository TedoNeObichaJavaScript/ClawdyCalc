// Themes. Colors live in css/themes.css; this file knows the list, swaps them, and runs
// the extras (sakura petals, samurai mode, the monospace "code" look).
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // swatch = [background, card, accent] for the picker
  const THEMES = [
    { id: 'claude', name: 'Claude', note: 'follows your system', swatch: ['#F3F0E8', '#1C1B19', '#D97757'] },
    { id: 'terminal', name: 'Terminal', note: 'green phosphor CRT', mono: true, swatch: ['#050a06', '#0b140d', '#3dff6e'] },
    { id: 'dracula', name: 'Dracula', mono: true, swatch: ['#21222c', '#282a36', '#bd93f9'] },
    { id: 'tokyo', name: 'Tokyo Night', mono: true, swatch: ['#16161e', '#1a1b26', '#7aa2f7'] },
    { id: 'catppuccin', name: 'Catppuccin', note: 'mocha', mono: true, swatch: ['#11111b', '#1e1e2e', '#cba6f7'] },
    { id: 'gruvbox', name: 'Gruvbox', mono: true, swatch: ['#1d2021', '#282828', '#fe8019'] },
    { id: 'nord', name: 'Nord', mono: true, swatch: ['#2e3440', '#3b4252', '#88c0d0'] },
    { id: 'synthwave', name: 'Synthwave', note: "'84 neon", mono: true, swatch: ['#1a1326', '#2b1055', '#ff7edb'] },
    { id: 'sakura', name: 'Sakura', note: 'petals + samurai', samurai: true, petals: true, swatch: ['#fdf2f4', '#fffafb', '#e0709a'] },
  ];

  let petalsEl = null;

  function startPetals() {
    if (petalsEl || reduceMotion) return;
    petalsEl = document.createElement('div');
    petalsEl.className = 'petals';
    petalsEl.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 22; i++) {
      const p = document.createElement('i');
      const size = 7 + Math.random() * 8;
      const dur = 9 + Math.random() * 10;
      p.style.cssText = `left:${Math.random() * 100}%;--s:${size}px;--d:${dur}s;--delay:${-Math.random() * dur}s;`
        + `--sway:${20 + Math.random() * 50}px;--spin:${Math.random() < 0.5 ? -1 : 1};opacity:${0.55 + Math.random() * 0.4}`;
      petalsEl.append(p);
    }
    document.body.append(petalsEl);
  }

  function stopPetals() {
    if (petalsEl) { petalsEl.remove(); petalsEl = null; }
  }

  function get(id) { return THEMES.find((t) => t.id === id) || THEMES[0]; }

  // onChange(theme) lets the app re-render things that depend on the theme
  function apply(id, onChange) {
    const t = get(id);
    const root = document.documentElement;
    root.dataset.theme = t.id;
    if (t.mono) root.dataset.mono = ''; else delete root.dataset.mono;
    if (t.petals) startPetals(); else stopPetals();
    // tint the app window's title bar to match
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (onChange) onChange(t);
    return t;
  }

  function buildPicker(pop, current, onPick) {
    pop.innerHTML = THEMES.map((t) => `
      <button type="button" role="menuitemradio" aria-checked="${t.id === current}" data-theme-id="${t.id}">
        <span class="swatch" style="--a:${t.swatch[0]};--b:${t.swatch[1]};--c:${t.swatch[2]}"></span>
        <span class="tname">${t.name}${t.note ? `<small>${t.note}</small>` : ''}</span>
      </button>`).join('');
    pop.onclick = (e) => {
      const b = e.target.closest('[data-theme-id]');
      if (b) onPick(b.dataset.themeId);
    };
  }

  window.Themes = { list: THEMES, get, apply, buildPicker };
})();
