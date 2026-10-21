'use strict';
(function (root) {
  const doc = root.document;
  const tags = new Set(['svg', 'g', 'image', 'mask', 'rect', 'path', 'text', 'defs', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
  const attrs = new Set(['id', 'class', 'viewBox', 'x', 'y', 'width', 'height', 'transform', 'preserveAspectRatio', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd', 'points', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'x2', 'y1', 'y2', 'opacity', 'fill-opacity', 'stroke-opacity', 'mask', 'maskUnits', 'font-size', 'text-anchor', 'paint-order', 'visibility', 'href', 'data-player-id']);
  function safeSvg(text) {
    const parsed = new root.DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = parsed.documentElement;
    if (svg.localName !== 'svg' || parsed.querySelector('parsererror')) return null;
    for (const node of [svg, ...svg.querySelectorAll('*')]) {
      if (!tags.has(node.localName) || node.namespaceURI !== 'http://www.w3.org/2000/svg') { node.remove(); continue; }
      for (const a of [...node.attributes]) {
        if (!attrs.has(a.name) || a.name === 'href' && !/^asset:\/\/icons\/[A-Za-z0-9_.-]+\.png$/.test(a.value)
          || ['fill', 'stroke', 'mask'].includes(a.name) && /url\(/i.test(a.value) && !/^url\(#[A-Za-z0-9_-]+\)$/.test(a.value)) node.removeAttribute(a.name);
      }
    }
    return doc.importNode(svg, true);
  }
  let svg = null, playerNodes = new Map();
  const host = doc.getElementById('map');
  function receive(data) {
    if (data.kind === 'settings') { doc.body.classList.toggle('unlocked', data.locked === false); return; }
    if (data.kind === 'clear') { host.replaceChildren(); svg = null; playerNodes.clear(); return; }
    if (data.kind === 'scene') {
      const next = safeSvg(data.svg); if (!next) return;
      host.replaceChildren(next); svg = next; playerNodes.clear();
    } else if (data.kind === 'players' && svg) {
      const next = safeSvg(data.svg); if (!next) return;
      svg.querySelector('.poi-players')?.remove();
      const group = next.querySelector('.poi-players');
      playerNodes = new Map();
      if (group) {
        for (const node of group.querySelectorAll('[data-player-id]')) playerNodes.set(node.dataset.playerId, node);
        svg.append(group);
      }
    } else if (data.kind === 'positions') {
      for (const p of data.points || []) if (Number.isFinite(p.x) && Number.isFinite(p.y)) playerNodes.get(p.id)?.setAttribute('transform', `translate(${p.x} ${p.y})`);
    }
  }
  root.OverlayView = { receive, safeSvg };
  root.overlay?.subscribe(receive);
  const handle = doc.getElementById('resize');
  let drag = null;
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !doc.body.classList.contains('unlocked')) return;
    drag = { x: event.screenX, y: event.screenY, width: root.innerWidth, height: root.innerHeight };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', event => {
    if (drag) root.overlay?.resize({ width: drag.width + event.screenX - drag.x, height: drag.height + event.screenY - drag.y });
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(name, () => { drag = null; });
})(window);
