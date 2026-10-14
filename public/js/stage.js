// The playground: pixel Clawds that walk, hop, flip, high-five, and can be thrown around.
// createStage(el, { label(id, talking) -> string, aria(id) -> string })
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const G = 1500; // gravity, px/s²
  const GROUND_H = 22;
  const rand = (a, b) => a + Math.random() * (b - a);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function createStage(stage, opts) {
    const mascots = new Map();
    let W = stage.clientWidth, groundY = stage.clientHeight - GROUND_H;
    let last = performance.now();

    class Mascot {
      constructor(m, index, count) {
        this.id = m.id;
        const look = Sprites.look(m.id);
        this.px = Math.max(2, Math.round((3 + m.share * 2.5) * look.scale));
        this.el = document.createElement('button');
        this.el.className = 'mascot';
        this.el.type = 'button';
        this.el.innerHTML = `<span class="tag">${esc(m.name)}</span><span class="sprite">${Sprites.svg(m.id, this.px, { tight: true })}</span>`;
        this.sprite = this.el.querySelector('.sprite');
        this.svg = this.el.querySelector('svg');
        this.svg.style.transformOrigin = '50% 60%';
        this.tag = this.el.querySelector('.tag');
        this.shadow = document.createElement('div');
        this.shadow.className = 'shadow';
        stage.append(this.shadow, this.el);

        this.w = +this.svg.getAttribute('width');
        this.h = +this.svg.getAttribute('height');
        const slot = (W - this.w) / Math.max(count, 1);
        this.x = Math.min(W - this.w, Math.max(0, slot * index + slot / 2 + rand(-10, 10)));
        this.y = reduceMotion ? 0 : rand(80, 140) + index * 25; // staggered drop from the sky
        this.vx = 0; this.vy = 0;
        this.dir = Math.random() < 0.5 ? -1 : 1;
        this.mode = this.y > 0 ? 'air' : 'idle';
        this.timer = rand(0.5, 2);
        this.legT = 0; this.legs = 'a';
        this.blinkT = rand(1, 4);
        this.face = ''; this.faceT = 0;
        this.squash = 0;
        this.angle = 0; this.spin = 0;
        this.talkT = 0;
        this.bindPointer();
        this.el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.poke(); }
        });
        this.updateLabel();
      }

      get grounded() { return this.y <= 0 && this.vy === 0 && this.mode !== 'held'; }
      get canJump() { return this.grounded || this.mode === 'idle' || this.mode === 'walk'; }

      setFace(f, t) { this.face = f; this.faceT = t; }

      jump(vy, vx = 0, flip = false) {
        if (reduceMotion) { this.setFace('happy', 0.8); return; }
        this.vy = vy; this.vx = vx; this.mode = 'air';
        this.y = Math.max(this.y, 0.01);
        if (flip) this.spin = (vx >= 0 ? 1 : -1) * 360 / ((2 * vy) / G); // exactly one turn per jump
      }

      poke() {
        this.talkT = 2.6;
        this.el.classList.add('talking');
        this.updateLabel();
        this.setFace('happy', 1.2);
        if (this.canJump) this.jump(rand(480, 560), 0, Math.random() < 0.5);
      }

      updateLabel() {
        this.tag.textContent = opts.label(this.id, this.talkT > 0);
        this.el.setAttribute('aria-label', opts.aria(this.id));
      }

      bindPointer() {
        let start = null, hist = [];
        this.el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          this.el.setPointerCapture(e.pointerId);
          const r = this.el.getBoundingClientRect();
          start = { x: e.clientX, y: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, moved: false };
          hist = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
        });
        this.el.addEventListener('pointermove', (e) => {
          if (!start) return;
          if (!start.moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) {
            start.moved = true;
            this.mode = 'held';
            this.el.classList.add('held');
            this.setFace('happy', 99);
          }
          if (!start.moved) return;
          const sr = stage.getBoundingClientRect();
          const prevX = this.x;
          this.x = Math.min(W - this.w, Math.max(0, e.clientX - sr.left - start.ox));
          this.vx = (this.x - prevX) * 30;
          this.y = Math.min(Math.max(0, groundY - this.h - (e.clientY - sr.top - start.oy)), groundY - this.h);
          this.vy = 0; this.angle = 0; this.spin = 0;
          hist.push({ x: e.clientX, y: e.clientY, t: performance.now() });
          if (hist.length > 6) hist.shift();
        });
        const end = () => {
          if (!start) return;
          const wasDrag = start.moved;
          start = null;
          this.el.classList.remove('held');
          if (!wasDrag) { this.poke(); return; }
          const a = hist[0], b = hist[hist.length - 1];
          const dt = Math.max((b.t - a.t) / 1000, 0.016);
          this.vx = Math.max(-1400, Math.min(1400, (b.x - a.x) / dt));
          this.vy = Math.max(-1400, Math.min(1400, -(b.y - a.y) / dt));
          this.spin = this.vx * 0.6;
          this.mode = 'air';
          this.y = Math.max(this.y, 0.01);
          this.setFace('happy', 0.6);
        };
        this.el.addEventListener('pointerup', end);
        this.el.addEventListener('pointercancel', end);
      }

      think() {
        if (reduceMotion) { this.mode = 'idle'; this.timer = 9999; return; }
        const r = Math.random();
        if (r < 0.38) { this.mode = 'walk'; this.dir = Math.random() < 0.5 ? -1 : 1; this.speed = rand(28, 52); this.timer = rand(1.5, 4); }
        else if (r < 0.62) { this.mode = 'idle'; this.timer = rand(0.8, 2.8); }
        else if (r < 0.86) { this.jump(rand(280, 400), this.dir * rand(20, 70)); }
        else if (r < 0.95) { this.jump(rand(520, 580), this.dir * rand(30, 80), true); }
        else { this.mode = 'idle'; this.timer = 1.2; this.setFace('happy', 1.2); this.jump(220); }
      }

      step(dt) {
        if (this.faceT > 0) { this.faceT -= dt; if (this.faceT <= 0) this.face = ''; }
        this.blinkT -= dt;
        if (this.blinkT <= 0) { if (!this.face) this.setFace('blink', 0.13); this.blinkT = rand(2, 6); }
        if (this.talkT > 0) {
          this.talkT -= dt;
          if (this.talkT <= 0) { this.el.classList.remove('talking'); this.updateLabel(); }
        }
        if (this.squash > 0) this.squash = Math.max(0, this.squash - dt);

        const maxY = groundY - this.h;
        if (this.mode === 'held') {
          this.legT += dt;
          if (this.legT > 0.07) { this.legT = 0; this.legs = this.legs === 'a' ? 'b' : 'a'; }
        } else if (this.mode === 'air') {
          this.vy -= G * dt;
          this.y += this.vy * dt;
          this.x += this.vx * dt;
          this.angle += this.spin * dt;
          this.legs = 'b';
          if (this.x < 0) { this.x = 0; this.vx = -this.vx * 0.6; this.spin = -this.spin * 0.6; }
          if (this.x > W - this.w) { this.x = W - this.w; this.vx = -this.vx * 0.6; this.spin = -this.spin * 0.6; }
          if (this.y > maxY) { this.y = maxY; this.vy = -Math.abs(this.vy) * 0.4; }
          if (this.y <= 0 && this.vy < 0) {
            this.y = 0;
            if (this.vy < -520) {
              this.vy = -this.vy * 0.38; this.vx *= 0.7; this.spin *= 0.4;
              this.squash = 0.16;
            } else {
              this.vy = 0; this.vx = 0; this.spin = 0; this.angle = 0;
              this.squash = 0.18;
              this.mode = 'idle'; this.timer = rand(0.4, 1.6); this.legs = 'a';
              if (this.face === 'happy' && this.faceT > 5) this.faceT = 0.5;
            }
          }
        } else {
          this.timer -= dt;
          if (this.mode === 'walk') {
            this.x += this.dir * this.speed * dt;
            if (this.x <= 0) { this.x = 0; this.dir = 1; }
            if (this.x >= W - this.w) { this.x = W - this.w; this.dir = -1; }
            this.legT += dt;
            if (this.legT > 0.14) { this.legT = 0; this.legs = this.legs === 'a' ? 'b' : 'a'; }
          } else {
            this.legs = 'a';
          }
          if (this.timer <= 0) this.think();
        }
        this.x = Math.min(Math.max(this.x, 0), Math.max(0, W - this.w));
      }

      draw() {
        this.el.style.transform = `translate(${this.x}px, ${groundY - this.h - this.y}px)`;
        let sx = 1, sy = 1;
        if (this.squash > 0) { const k = this.squash / 0.18; sx = 1 + 0.16 * k; sy = 1 - 0.2 * k; }
        else if (this.mode === 'air' && this.vy > 150) { sx = 0.94; sy = 1.07; }
        this.sprite.style.transform = `scale(${sx}, ${sy})`;
        const tilt = this.mode === 'held' ? Math.max(-14, Math.min(14, this.vx * 0.02)) : 0;
        this.svg.style.transform = `rotate(${this.angle + tilt}deg) scaleX(${this.dir})`;
        this.el.dataset.legs = this.legs;
        this.el.dataset.face = this.face;
        const lift = Math.min(this.y / 140, 0.7);
        const sw = this.w * 0.78 * (1 - lift * 0.6);
        this.shadow.style.width = sw + 'px';
        this.shadow.style.transform = `translate(${this.x + (this.w - sw) / 2}px, ${groundY - 3}px)`;
        this.shadow.style.opacity = String(1 - lift);
      }

      destroy() { this.el.remove(); this.shadow.remove(); }
    }

    // little high-five hop when two walkers bump into each other
    function friends(dt) {
      const list = [...mascots.values()];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (a.mode !== 'walk' && b.mode !== 'walk') continue;
          if (a.y !== 0 || b.y !== 0) continue;
          const gap = Math.abs((a.x + a.w / 2) - (b.x + b.w / 2));
          if (gap < (a.w + b.w) * 0.42 && Math.random() < 1.2 * dt) {
            const dir = a.x < b.x ? -1 : 1;
            a.dir = dir; b.dir = -dir;
            a.jump(rand(300, 360), dir * 40); b.jump(rand(300, 360), -dir * 40);
            a.setFace('happy', 0.9); b.setFace('happy', 0.9);
          }
        }
      }
    }

    function frame(now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      for (const m of mascots.values()) m.step(dt);
      if (!reduceMotion) friends(dt);
      for (const m of mascots.values()) m.draw();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    new ResizeObserver(() => { W = stage.clientWidth; groundY = stage.clientHeight - GROUND_H; }).observe(stage);

    return {
      // list: [{ id, name, share }] — the cast, biggest spender first
      sync(list) {
        const empty = !list.length;
        if (empty) list = [{ id: 'claude', name: 'Claude', share: 0.4 }];
        const ids = new Set(list.map((m) => m.id));
        for (const [id, m] of mascots) if (!ids.has(id)) { m.destroy(); mascots.delete(id); }
        list.forEach((m, i) => { if (!mascots.has(m.id)) mascots.set(m.id, new Mascot(m, i, list.length)); });
        let note = stage.querySelector('.empty-note');
        if (empty && !note) {
          note = document.createElement('div');
          note.className = 'empty-note';
          note.textContent = 'No usage yet. Go build something!';
          stage.append(note);
        } else if (!empty && note) {
          note.remove();
        }
      },
      celebrate(id, text) {
        const m = mascots.get(id);
        if (!m) return;
        if (m.canJump) m.jump(rand(420, 500));
        m.setFace('happy', 1.2);
        const coin = document.createElement('div');
        coin.className = 'coin';
        coin.textContent = text;
        coin.style.left = Math.min(m.x, W - 70) + 'px';
        coin.style.top = Math.max(4, groundY - m.h - m.y - 26) + 'px';
        stage.append(coin);
        setTimeout(() => coin.remove(), 1700);
      },
      poke(id) { const m = mascots.get(id); if (m) m.poke(); },
      relabel() { for (const m of mascots.values()) m.updateLabel(); },
    };
  }

  window.createStage = createStage;
})();
