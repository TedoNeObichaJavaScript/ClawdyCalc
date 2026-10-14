// The big dollar counter. Every theme has its own count-up animation, ticking every 10ms.
//   const c = createCounter(el);
//   c.set(12.34, { approx: false });   // animates from whatever it shows now
//   c.replay();                        // counts up from $0 again (used when the theme changes)
(function (root) {
  const TICK_MS = 10;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const outCubic = (t) => 1 - (1 - t) ** 3;
  const outQuart = (t) => 1 - (1 - t) ** 4;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[(Math.random() * list.length) | 0];

  // "$1,234" or "$12.34", split into one token per character. Digits know their place value
  // (cents are places -1 and -2) so the odometer can roll each one like a real counter.
  function tokenize(v, approx) {
    const out = [];
    if (approx) out.push({ ch: '≈', cls: 'approx' });
    out.push({ ch: '$' });
    const [d, c] = Math.max(0, v).toFixed(2).split('.');
    const big = v >= 1000;
    let place = d.length - 1;
    for (const ch of big ? Number(d).toLocaleString('en-US') : d) {
      out.push(ch === ',' ? { ch } : { ch, d: true, place: place-- });
    }
    if (!big) {
      out.push({ ch: '.', cls: 'cents' });
      out.push({ ch: c[0], d: true, place: -1, cls: 'cents' });
      out.push({ ch: c[1], d: true, place: -2, cls: 'cents' });
    }
    return out;
  }
  const shapeOf = (tokens) => tokens.map((t) => (t.d ? 'd' : t.ch) + (t.cls || '')).join('');
  const textOf = (tokens) => tokens.map((t) => t.ch).join('');

  // ---------- little effects shared by several themes ----------

  // position of a cell relative to the counter, for particles
  function spot(f, cell) {
    const a = f.el.getBoundingClientRect();
    const b = cell.getBoundingClientRect();
    return { x: b.left - a.left + b.width / 2, top: b.top - a.top, bottom: b.bottom - a.top };
  }

  function particle(f, cls, x, y, style) {
    const p = document.createElement('span');
    p.className = 'cc-p ' + cls;
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    Object.assign(p.style, style);
    f.el.append(p);
    p.addEventListener('animationend', () => p.remove());
    setTimeout(() => p.remove(), 3000); // in case the animation never runs (hidden window)
    return p;
  }

  function burst(f, { n, colors, cls }) {
    const digits = f.cells.filter((c) => c.t.d);
    for (let i = 0; i < n; i++) {
      const s = spot(f, pick(digits).el);
      const angle = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const dist = rand(30, 80);
      particle(f, cls, s.x, (s.top + s.bottom) / 2, {
        background: pick(colors),
        '--dx': Math.cos(angle) * dist + 'px',
        '--dy': Math.sin(angle) * dist + 'px',
        animationDelay: rand(0, 120) + 'ms',
      });
    }
  }

  // runs a one-shot CSS class on the digits (shimmer sweeps)
  function sweep(run, cls) {
    run.classList.remove(cls);
    void run.offsetWidth;
    run.classList.add(cls);
    run.addEventListener('animationend', () => run.classList.remove(cls), { once: true });
  }

  // ---------- one style per theme ----------
  // dur/ease   tween length and curve
  // target     show the final number from the start (scramble, split-flap) instead of the tween
  // steps      quantize the tween into chunky steps
  // clip       every character gets a fixed-height box (odometer, split-flap)
  // build      custom markup for a character cell; return true if handled
  // change     a character changed during the count
  // frame      called every tick with the frame state; return true when finished (target styles)
  // end        finale once the count lands

  const PASTEL = ['#f5c2e7', '#cba6f7', '#fab387', '#a6e3a1', '#89dceb', '#f9e2af'];
  const GLYPHS = '0123456789#%&@$?/<>*';

  const STYLES = {
    // mechanical odometer: every digit is a rolling strip, carries tick over like a real counter
    claude: {
      dur: 1400, ease: outQuart, clip: true,
      build(c) {
        if (!c.t.d) return false;
        c.el.classList.add('cc-odo');
        c.strip = document.createElement('span');
        c.strip.className = 'cc-strip';
        c.strip.innerHTML = '01234567890'.split('').map((d) => `<span>${d}</span>`).join('');
        c.el.append(c.strip);
        return true;
      },
      frame(f) {
        const cents = f.v * 100;
        for (const c of f.cells) {
          if (!c.strip) continue;
          const x = cents / 10 ** (c.t.place + 2) + 1e-7;
          const whole = Math.floor(x);
          const frac = x - whole;
          const pos = (whole % 10) + (c.t.place === f.minPlace ? frac : Math.max(0, frac * 10 - 9));
          c.strip.style.transform = `translateY(${(-pos / 11) * 100}%)`;
        }
      },
      end(f) { f.run.animate([{ transform: 'none' }, { transform: 'scale(1.05)' }, { transform: 'none' }], { duration: 300, easing: 'ease-out' }); },
    },

    // hacker decrypt: digits scramble, then lock in left to right
    terminal: {
      dur: 1000, target: true,
      frame(f) {
        const lockUpTo = f.p * (f.cells.length + 2) - 1.5;
        f.cells.forEach((c, i) => {
          if (!c.t.d) return;
          if (i < lockUpTo) {
            if (c.locked) return;
            c.locked = true;
            c.el.textContent = c.t.ch;
            c.el.animate([{ color: '#ffffff', textShadow: '0 0 14px currentColor' }, {}], { duration: 260 });
          } else {
            c.el.textContent = pick(GLYPHS);
          }
        });
        return f.p >= 1;
      },
    },

    // digits drop in blood-pink, then the number drips
    dracula: {
      dur: 1100, changeGap: 150,
      change(c) {
        c.el.animate([{ transform: 'translateY(-45%)', opacity: 0, color: '#ff79c6' }, { transform: 'none', opacity: 1 }],
          { duration: 170, easing: 'ease-out' });
      },
      end(f) {
        const digits = f.cells.filter((c) => c.t.d && !c.t.cls);
        for (let i = 0; i < Math.min(3, digits.length); i++) {
          const s = spot(f, digits.splice((Math.random() * digits.length) | 0, 1)[0].el);
          particle(f, 'cc-drip', s.x + rand(-4, 4), s.bottom - 10, { animationDelay: i * 160 + 'ms' });
        }
      },
    },

    // failing neon sign that buzzes on
    tokyo: {
      dur: 1100,
      frame(f) {
        for (const c of f.cells) c.el.style.opacity = f.p < 1 && Math.random() < 0.3 ? rand(0.15, 0.7).toFixed(2) : '';
      },
      end(f) { f.run.animate({ opacity: [0.15, 1, 0.3, 1, 0.6, 1] }, { duration: 650, easing: 'steps(6)' }); },
    },

    // springy pastel pops and confetti
    catppuccin: {
      dur: 1000, changeGap: 120,
      change(c) {
        c.el.animate([{ transform: 'scale(1.5) translateY(-10%)', color: PASTEL[Number(c.t.ch) % PASTEL.length] }, { transform: 'none' }],
          { duration: 340, easing: 'cubic-bezier(.3,1.8,.5,1)' });
      },
      end(f) { burst(f, { n: 14, colors: PASTEL, cls: 'cc-dot' }); },
    },

    // retro split-flap board: each tile flips one digit at a time until it lands
    gruvbox: {
      target: true, clip: true,
      build(c, i, f, fromRight) {
        if (!c.t.d) return false;
        c.el.classList.add('cc-flap');
        c.cur = f.prevDigit(fromRight) ?? '0';
        c.el.textContent = c.cur;
        c.next = f.now + i * 45; // tiles start one after another
        return true;
      },
      frame(f) {
        let done = true;
        for (const c of f.cells) {
          if (!c.t.d || c.cur === c.t.ch) continue;
          done = false;
          if (f.now < c.next) continue;
          c.cur = String((Number(c.cur) + 1) % 10);
          c.el.textContent = c.cur;
          c.el.animate([{ transform: 'perspective(200px) rotateX(-85deg)', filter: 'brightness(.6)' }, { transform: 'none' }],
            { duration: 60, easing: 'ease-out' });
          c.next = f.now + 60;
        }
        return done;
      },
    },

    // motion blur that thaws as it slows, then an icy shimmer
    nord: {
      dur: 1400, ease: outQuart,
      frame(f) {
        const blur = f.p < 1 ? Math.min(5, f.speed * 300) : 0;
        f.run.style.filter = blur > 0.15 ? `blur(${blur.toFixed(2)}px)` : '';
      },
      end(f) { sweep(f.run, 'cc-frost'); },
    },

    // RGB split glitch, then a sunset sweep
    synthwave: {
      dur: 1000,
      frame(f) {
        if (f.p >= 1) return;
        const a = (1 - f.p) * 7;
        const dx = rand(-a, a).toFixed(1);
        f.run.style.textShadow = `${dx}px 0 #ff2a6d, ${-dx}px 0 #05d9e8`;
        f.run.style.transform = Math.random() < 0.12 ? `skewX(${rand(-10, 10).toFixed(1)}deg) translateX(${rand(-4, 4).toFixed(1)}px)` : '';
      },
      end(f) { sweep(f.run, 'cc-sunset'); },
    },

    // chunky pixel steps, a katana slash and a petal burst
    sakura: {
      dur: 900, steps: 8,
      step(f) { f.run.animate([{ transform: 'none' }, { transform: 'translateY(-7%)' }, { transform: 'none' }], { duration: 110, easing: 'steps(2)' }); },
      end(f) {
        particle(f, 'cc-slash', 0, f.run.offsetTop + f.run.offsetHeight * 0.5, { left: f.run.offsetLeft - 10 + 'px', width: f.run.offsetWidth + 20 + 'px' });
        burst(f, { n: 14, colors: ['#f9cada', '#f4a6c0', '#ffffff', '#e57fa3'], cls: 'cc-px' });
      },
    },
  };

  function createCounter(el) {
    el.innerHTML = '<span class="sr-only"></span><span class="cc-run" aria-hidden="true"></span>';
    const sr = el.firstChild;
    const run = el.lastChild;
    let cells = [];
    let shape = '';
    let shown = 0; // the value on screen right now
    let target = null;
    let approx = false;
    let anim = null;
    let timer = null;

    const styleFor = () => STYLES[document.documentElement.dataset.theme] || STYLES.claude;

    function clean() {
      run.removeAttribute('style');
      run.classList.remove('cc-frost', 'cc-sunset');
      for (const c of cells) c.el.removeAttribute('style');
    }

    function build(tokens, fx, f) {
      run.className = 'cc-run' + (fx.clip ? ' cc-clip' : '');
      run.textContent = '';
      let fromRight = tokens.filter((t) => t.d).length;
      cells = tokens.map((t, i) => {
        const c = { t, el: document.createElement('span') };
        c.el.className = 'cc-c' + (t.d ? ' cc-d' : '') + (t.cls ? ' ' + t.cls : '');
        if (t.d) fromRight--;
        if (!(fx.build && fx.build(c, i, f, fromRight))) c.el.textContent = t.ch;
        run.append(c.el);
        return c;
      });
      shape = shapeOf(tokens);
    }

    // update the characters in place, rebuilding only if the layout changed (e.g. $99.99 -> $100.00)
    function paint(tokens, fx, f) {
      if (shapeOf(tokens) !== shape) { build(tokens, fx, f); return; }
      tokens.forEach((t, i) => {
        const c = cells[i];
        if (c.strip || c.t.ch === t.ch) { c.t = t; return; }
        c.t = t;
        c.el.textContent = t.ch;
        // at 10ms a digit changes faster than its effect can play; let each effect finish before restarting it
        if (fx.change && f.now - (c.changedAt || 0) >= (fx.changeGap || 0)) { c.changedAt = f.now; fx.change(c); }
      });
    }

    function frameState(fx, now, p, v, prevDigits) {
      return {
        el, run, cells, now, p, v, approx,
        minPlace: v >= 1000 ? 0 : -2,
        speed: 0,
        // the digit a split-flap tile showed before, matched from the right
        prevDigit: (fromRight) => prevDigits[prevDigits.length - 1 - fromRight],
      };
    }

    function finish(fx, f) {
      clearInterval(timer);
      timer = null;
      anim = null;
      shown = target;
      clean();
      if (!fx.target) paint(tokenize(target, approx), fx, f);
      if (fx.frame && !fx.target) fx.frame({ ...f, p: 1, v: target, cells, speed: 0 });
      if (fx.end) fx.end({ ...f, cells });
    }

    function start(from) {
      const fx = styleFor();
      clearInterval(timer);
      clean();
      el.dataset.fx = document.documentElement.dataset.theme || 'claude';
      sr.textContent = textOf(tokenize(target, approx));
      const prevDigits = cells.filter((c) => c.t.d).map((c) => (c.cur ?? c.t.ch));
      const t0 = performance.now();
      const f0 = frameState(fx, t0, 0, from, prevDigits);

      if (reduceMotion) {
        build(tokenize(target, approx), fx, f0);
        for (const c of cells) if (c.cur != null) { c.cur = c.t.ch; c.el.textContent = c.t.ch; }
        finish({ ...fx, end: null }, f0);
        return;
      }

      shape = ''; // force a rebuild so per-style markup is fresh
      build(tokenize(fx.target ? target : from, approx), fx, f0);
      anim = { from, to: target, t0, last: from, step: -1 };

      const tick = () => {
        const now = performance.now();
        const p = fx.dur ? Math.min(1, (now - anim.t0) / fx.dur) : 1;
        let e = (fx.ease || outCubic)(p);
        if (fx.steps) {
          const step = Math.floor(p * fx.steps);
          e = step / fx.steps;
          if (step !== anim.step) { anim.step = step; if (fx.step && p < 1) fx.step({ run }); }
        }
        const v = anim.from + (anim.to - anim.from) * e;
        const f = frameState(fx, now, p, v, prevDigits);
        f.speed = Math.abs(v - anim.last) / Math.max(Math.abs(anim.to), 0.01);
        anim.last = v;
        shown = v; // so an interrupted count carries on from what's on screen
        if (!fx.target) paint(tokenize(v, approx), fx, f);
        f.cells = cells;
        const done = fx.frame ? fx.frame(f) : false;
        if (fx.target ? done : p >= 1) finish(fx, f);
      };
      timer = setInterval(tick, TICK_MS);
      tick();
    }

    return {
      set(value, opts = {}) {
        value = Math.round(value * 100) / 100; // the odometer would stop mid-roll on fractions of a cent
        const a = !!opts.approx;
        if (value === target && a === approx) return;
        approx = a;
        target = value;
        start(shown);
      },
      // count up from $0 again in the current theme's style
      replay() {
        if (target == null) return;
        shown = 0;
        start(0);
      },
    };
  }

  root.createCounter = createCounter;
})(window);
