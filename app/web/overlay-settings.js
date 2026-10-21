'use strict';
(function (root) {
  const get = id => root.document.getElementById(id), bridge = root.ravenswatch;
  const enabled = get('overlay-enabled'), locked = get('overlay-locked'), borderless = get('game-borderless');
  const status = get('overlay-status'), reset = get('overlay-reset'), restore = get('game-window-restore');
  function render(state) {
    if (!state) return;
    enabled.checked = state.enabled; locked.checked = state.locked; borderless.checked = state.borderless;
    locked.disabled = reset.disabled = !state.enabled; restore.disabled = !state.borderless;
    const notes = [state.enabled ? (state.locked ? 'Overlay locked · clicks pass through.' : 'Overlay unlocked · drag its top bar and resize from the corner.') : 'Overlay off.'];
    if (state.enabled && !state.hasMap) notes.push('Waiting for a game map.');
    if (state.borderlessError) notes.push(state.borderlessError);
    else if (state.borderless) notes.push(state.borderlessActive ? 'Game window is borderless.' : 'Waiting for Ravenswatch.');
    status.textContent = notes.join(' ');
    root.PoiMap?.setOverlay(state);
  }
  async function change(input) {
    try {
      const result = await bridge.overlaySettings(input);
      render(result.state);
      if (!result.ok) status.textContent = result.error || 'Could not change overlay settings.';
    } catch (error) { status.textContent = error.message; }
  }
  if (!bridge?.overlaySettings) {
    for (const control of [enabled, locked, borderless, reset, restore]) control.disabled = true;
    status.textContent = 'Overlay settings are available in the desktop app.';
    return;
  }
  bridge.onOverlay?.(render);
  enabled.addEventListener('change', () => change({ enabled: enabled.checked }));
  locked.addEventListener('change', () => change({ locked: locked.checked }));
  borderless.addEventListener('change', () => change({ borderless: borderless.checked }));
  reset.addEventListener('click', () => change({ reset: true }));
  restore.addEventListener('click', () => change({ borderless: false }));
  void change();
})(window);
