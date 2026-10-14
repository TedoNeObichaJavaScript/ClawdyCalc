// Desktop-app extras. Only runs inside the Electron app, where preload.js provides window.clawdy.
// In a normal browser tab this file does nothing.
(function () {
  const api = window.clawdy;
  if (!api) return;
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  root.dataset.desktop = '';
  $('winControls').hidden = false;

  let state = { pinned: false, compact: false };

  function reflect(s) {
    if (!s) return;
    state = s;
    $('pinBtn').setAttribute('aria-pressed', String(s.pinned));
    $('pinBtn').title = s.pinned ? 'Unpin' : 'Pin on top';
    $('compactBtn').setAttribute('aria-pressed', String(s.compact));
    $('compactBtn').title = s.compact ? 'Full view' : 'Compact mode';
    if (s.compact) root.dataset.compact = ''; else delete root.dataset.compact;
    document.title = s.pinned ? 'ClawdyCalc (pinned)' : 'ClawdyCalc';
  }

  // Compact mode keeps the header, the Clawds and the big number. The window is sized to fit them.
  function toggleCompact() {
    const on = !state.compact;
    if (on) root.dataset.compact = ''; else delete root.dataset.compact;
    window.scrollTo(0, 0);
    requestAnimationFrame(() => {
      const height = on ? Math.ceil(document.querySelector('.hero').getBoundingClientRect().bottom + 14) : 0;
      api.setCompact(on, height).then(reflect);
    });
  }

  api.setBackground(getComputedStyle(root).getPropertyValue('--bg').trim());
  api.getState().then(reflect);
  api.onState(reflect);
  api.onToggleCompact(toggleCompact);

  $('pinBtn').addEventListener('click', () => api.setPinned(!state.pinned).then(reflect));
  $('compactBtn').addEventListener('click', toggleCompact);
  $('minBtn').addEventListener('click', () => api.minimize());
  $('closeBtn').addEventListener('click', () => api.hide());

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, select, textarea')) return;
    if (e.key === 'p' || e.key === 'P') api.setPinned(!state.pinned).then(reflect);
    if (e.key === 'c' || e.key === 'C') toggleCompact();
  });

  // app.js calls these so the tray tooltip and the window background stay in sync
  window.ClawdyDesktop = {
    summary: (text) => api.setSummary(text),
    background: (color) => api.setBackground(color),
  };
})();
