'use strict';
(function (root) {
  const GROUPS = {
    spawn: 'Spawn area',
    crystals: 'Crystals', teleporters: 'Teleporters', healing: 'Healing', chests: 'Chests', keys: 'Keys & blood rituals',
    bosses: 'Bosses', grimoires: 'Grimoires', cauldrons: 'Cauldrons', shrines: 'Shrines & altars',
    towers: 'Vision towers', harps: 'Harps', sacrifices: 'Sacrificial altars', stashes: 'Stashes & rooms', wells: 'Wishing wells', quests: 'Quests & NPCs',
    resources: 'Building materials', camps: 'Camp tiles', enemies: 'Enemy placements', scenery: 'Scenery', other: 'Other placements'
  };
  const HIDDEN = new Set(['teleporters', 'resources', 'camps', 'scenery', 'other']);
  function valid(p) {
    return p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]) && Math.abs(p[k]) <= 1e7);
  }
  function group(t) {
    const n = t.name || '', icon = t.icon || '';
    if (icon === 'map_spawn.png' || /(?:^|_)(?:Start_Update3|Starting_Tile_Update3)(?:_|$)/i.test(n)) return 'spawn';
    if (/_Camp(?:_|$)/i.test(n)) return 'camps';
    if (/^6x6_Ruin_01$/i.test(n) || /Harp/i.test(n) && !/Thieves/i.test(n)) return 'harps';
    if (/^6x6_Bleeding_01$/i.test(n)) return 'sacrifices';
    if (/Crystal/i.test(n)) return 'crystals';
    if (/Teleport/i.test(n)) return 'teleporters';
    if (/Healing|Fountain|(?:^|_)Heal(?:_|$)/i.test(n)) return 'healing';
    if (/Chest/i.test(n)) return 'chests';
    if (/Collectible_?Key|Key_?Keeper/i.test(n)) return 'keys';
    if (/Boss_?Shrine|Boss_?Den|Boss_(?:[A-Za-z0-9]+_)+Den|Map_?Boss|Final_?Boss/i.test(n)) return 'bosses';
    if (/Grimoire/i.test(n)) return 'grimoires';
    if (/Cauldron/i.test(n)) return 'cauldrons';
    if (/Astrolab|Altar/i.test(n)) return 'shrines';
    if (/Baba_?Yaga_?Eye/i.test(n)) return 'towers';
    if (/Thieves_?Stash|Mirror|Harp/i.test(n)) return 'stashes';
    if (/Wishing_?Well/i.test(n)) return 'wells';
    if (/3Pigs.*(?:Material|Crate)|Material|Reserve/i.test(n)) return 'resources';
    if (/Enemy|Wandering/i.test(n)) return 'enemies';
    if (/Blocker|Props|Bleeding|Ruin/i.test(n)) return 'scenery';
    if (icon || /Quest|Refugee|Sandman|Corpse|House|Tumor|Stingy/i.test(n)) return 'quests';
    return 'other';
  }
  const typeKey = t => `${group(t)}|${t.source}|${t.name}`;
  function defaultEnabled(t) {
    return !HIDDEN.has(group(t)) && (group(t) !== 'crystals' || /Dream_?Crystal_?Big|Crystal_?Field/i.test(t.name));
  }
  function enabled(t, prefs) {
    const k = typeKey(t), g = group(t);
    return prefs.types[k] ?? prefs.groups[g] ?? defaultEnabled(t);
  }
  function iconScale(t) {
    if (t.icon === 'map_side_quest.png') return .8;
    return 1;
  }
  // Rotation is clockwise in screen coordinates. Flip is applied before rotation.
  function rotationOptions(mode) {
    if (mode === 'game') return { rotation: 45, flipY: false }; // legacy saved preset
    if (!mode || mode === 'world') return { rotation: 0, flipY: true };
    return mode;
  }
  function orientation(p, mode = 'world') {
    const opts = rotationOptions(mode), a = opts.rotation * Math.PI / 180;
    const c = Math.cos(a), s = Math.sin(a), y = opts.flipY ? -p.y : p.y;
    return { x: p.x * c - y * s, y: p.x * s + y * c };
  }
  function inverseOrientation(p, mode = 'world') {
    const opts = rotationOptions(mode), a = opts.rotation * Math.PI / 180;
    const c = Math.cos(a), s = Math.sin(a), y = -p.x * s + p.y * c;
    return { x: p.x * c + p.y * s, y: opts.flipY ? -y : y };
  }
  function validTerrain(t) {
    return t?.projection === 'diagonal-half-v1' && /^[a-zA-Z0-9_-]+\.png$/.test(t.image) &&
      t.bounds && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(t.bounds[k])) && t.bounds.width > 0 && t.bounds.height > 0;
  }
  function terrainPoint(p, terrain) {
    const b = terrain.bounds;
    return { x: ((p.x - p.y) / 2 - b.x) / b.width, y: ((p.x + p.y) / 2 - b.y) / b.height };
  }
  function model(tiles, layer = 'surface', mode = 'world', terrain = null) {
    const rows = (tiles || []).filter(t => layer === 'all' || (t.source === 'sublevel') === (layer === 'sublevel'));
    const points = rows.filter(t => valid(t.position));
    if (layer === 'surface' && validTerrain(terrain)) {
      const projectUV = p => { const v = orientation({ x: p.x - .5, y: p.y - .5 }, mode); return { x: 400 + v.x * 520, y: 300 + v.y * 520 }; };
      return { rows, points, missing: rows.length - points.length, terrain, projectUV,
        project: p => projectUV(terrainPoint(p, terrain)),
        world: p => {
          const v = inverseOrientation({ x: (p.x - 400) / 520, y: (p.y - 300) / 520 }, mode), b = terrain.bounds;
          const x = (v.x + .5) * b.width + b.x, y = (v.y + .5) * b.height + b.y;
          return { x: x + y, y: y - x };
        } };
    }
    const rotated = points.map(t => orientation(t.position, mode));
    const xs = rotated.map(p => p.x), ys = rotated.map(p => p.y);
    const minX = points.length ? Math.min(...xs) : 0, maxX = points.length ? Math.max(...xs) : 0;
    const minY = points.length ? Math.min(...ys) : 0, maxY = points.length ? Math.max(...ys) : 0;
    const scale = Math.min(700 / Math.max(maxX - minX, 1), 500 / Math.max(maxY - minY, 1));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    return { rows, points, missing: rows.length - points.length,
      project: p => { const v = orientation(p, mode); return { x: 400 + (v.x - cx) * scale, y: 300 + (v.y - cy) * scale }; },
      world: p => inverseOrientation({ x: cx + (p.x - 400) / scale, y: cy + (p.y - 300) / scale }, mode) };
  }
  function heroIdentity(entity, icons = {}, entities = {}) {
    if (typeof entity !== 'string') return { code: '', icon: null };
    const owners = Object.keys(entities).sort((a, b) => b.length - a.length);
    const owner = owners.find(k => entity === k || entity.startsWith(k + '_'));
    const code = owner ? entities[owner] : Object.keys(icons).sort((a, b) => b.length - a.length)
      .find(k => entity === 'Hero_' + k || entity.startsWith('Hero_' + k + '_')) || '';
    const icon = icons[code];
    return { code, icon: typeof icon === 'string' && /^[A-Za-z0-9_.-]+\.png$/.test(icon) ? icon : null };
  }
  function motionPosition(m, now) {
    const t = Math.max(0, Math.min(1, (now - m.at) / 50));
    return Object.fromEntries(['x', 'y', 'z'].map(k => [k, m.from[k] + (m.to[k] - m.from[k]) * t]));
  }
  const api = { heroIdentity, motionPosition, model, orientation, inverseOrientation, terrainPoint, validTerrain, valid, group, typeKey, enabled, defaultEnabled, iconScale, GROUPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document) return;
  root.PoiMap = api;
  const doc = root.document, get = id => doc.getElementById(id), ns = 'http://www.w3.org/2000/svg';
  const STORE = 'ravenswatch:poi-map:v2';
  let saved = {};
  try { saved = JSON.parse(root.localStorage.getItem(STORE) || '{}') || {}; } catch { /* defaults */ }
  const bools = v => Object.fromEntries(Object.entries(v && typeof v === 'object' ? v : {}).filter(([, b]) => typeof b === 'boolean'));
  let prefs = { visibilityVersion: 3, groups: saved.visibilityVersion === 3 ? bools(saved.groups) : {}, types: saved.visibilityVersion === 3 ? bools(saved.types) : {},
    iconSizeVersion: 2, size: saved.iconSizeVersion === 2 ? Number(saved.size) || 75 : 75,
    rotation: Number.isFinite(saved.rotation) ? Math.max(-180, Math.min(180, saved.rotation)) : saved.orientation === 'game' ? 45 : 0,
    flipY: typeof saved.flipY === 'boolean' ? saved.flipY : saved.orientation !== 'game',
    player: typeof saved.player === 'string' ? saved.player : '', showPlayers: saved.showPlayers !== false, follow: saved.follow === true,
    terrain: saved.terrain !== false, terrainRotation: Number.isFinite(saved.terrainRotation) ? Math.max(-180, Math.min(180, saved.terrainRotation)) : 0,
    terrainFlipY: saved.terrainFlipY === true };
  prefs.size = Math.max(24, Math.min(150, prefs.size));
  const save = () => { try { root.localStorage.setItem(STORE, JSON.stringify(prefs)); } catch { /* private mode */ } };
  let state = null, key = '', filterKey = '', lastMap = null, view = [0, 0, 800, 600], drag = null;
  let projection = null, selectedId = null, selectedPlayerId = '', markerNodes = [], playersKey = '';
  let completionButtons = [];
  const svg = get('poi-map');
  let terrainMaps = {}, terrainErrors = {}, heroIcons = {}, heroEntities = {};
  const playerMotion = new Map(), failedPortraits = new Set();
  let animation = null;
  const clock = () => root.performance.now();
  function receivePlayers(ps) {
    const now = clock(), ids = new Set();
    for (const p of ps) {
      if (!valid(p.position)) continue;
      ids.add(p.id);
      const old = playerMotion.get(p.id);
      const snap = !old || now - old.received > 300 || Math.hypot(p.position.x - old.to.x, p.position.y - old.to.y) > 40;
      if (snap) playerMotion.set(p.id, { from: p.position, to: p.position, at: now, received: now });
      else {
        if (['x', 'y', 'z'].some(k => old.to[k] !== p.position[k])) {
          old.from = motionPosition(old, now); old.to = p.position; old.at = now;
        }
        old.received = now;
      }
    }
    for (const id of playerMotion.keys()) if (!ids.has(id)) playerMotion.delete(id);
  }
  function animatePlayers() {
    animation = null;
    if (!projection || !get('poi-map-panel').open) return;
    const now = clock();
    let moving = false;
    for (const m of markerNodes) {
      if (!m.player) continue;
      const motion = playerMotion.get(m.player);
      if (!motion) continue;
      m.p = projection.project(motionPosition(motion, now));
      if (now - motion.at < 50 && ['x', 'y', 'z'].some(k => motion.from[k] !== motion.to[k])) moving = true;
      if (prefs.follow && m.player === selectedPlayerId) {
        view[0] = m.p.x - view[2] / 2; view[1] = m.p.y - view[3] / 2;
      }
    }
    setView();
    if (moving && !doc.hidden && root.requestAnimationFrame) animation = root.requestAnimationFrame(animatePlayers);
  }
  function startPlayerAnimation() {
    if (animation !== null) root.cancelAnimationFrame?.(animation);
    animatePlayers();
  }
  const playerIdentity = p => heroIdentity(p.hero, heroIcons, heroEntities);
  const playerName = p => playerIdentity(p).code.replace(/_/g, ' ') || p.hero?.replace(/^Hero_/, '').replace(/_/g, ' ') || 'Unknown hero';
  function activeTerrain() {
    const p = terrainMaps[state?.map_name];
    return prefs.terrain && get('poi-map-layer').value === 'surface' && state?.no_run !== true && state?.map_id >= 0 && validTerrain(p) ? p : null;
  }
  const mapOrientation = () => activeTerrain() ? { rotation: prefs.terrainRotation, flipY: prefs.terrainFlipY } : prefs;
  api.setAssets = tables => {
    const before = activeTerrain();
    failedPortraits.clear();
    heroIcons = tables?.HERO_ICONS || {}; heroEntities = tables?.HERO_ENTITIES || {};
    playersKey = '';
    terrainMaps = tables?.TERRAIN_MAPS || {}; terrainErrors = tables?.TERRAIN_ERRORS || {};
    if (JSON.stringify(before) !== JSON.stringify(activeTerrain())) { syncRotation(); reset(); }
    updatePlayerSelect(); paintPois();
  };
  const completed = new Set();
  let completionScope = '';
  const poiId = t => t.id ?? `${t.source}|${t.name}|${t.position?.x}|${t.position?.y}|${t.position?.z}`;
  function node(tag, attrs = {}, text) {
    const n = doc.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function html(tag, text, className) {
    const n = doc.createElement(tag); if (text !== undefined) n.textContent = text;
    if (className) n.className = className; return n;
  }
  function setView() {
    svg.setAttribute('viewBox', view.join(' '));
    // Fixed apparent icon size while zooming; only the coordinates are magnified.
    for (const { n, p } of markerNodes) n.setAttribute('transform', `translate(${p.x} ${p.y}) scale(${view[2] / 800})`);
  }
  function reset() { view = [0, 0, 800, 600]; setView(); }
  function players() { return (state?.players || []).filter(p => valid(p.position)); }
  function selectedPlayer() { return players().find(p => p.id === selectedPlayerId); }
  function describe(t) {
    const own = selectedPlayer();
    const distance = own && t.source !== 'sublevel' && valid(t.position) ? ` · ${Math.hypot(t.position.x - own.position.x, t.position.y - own.position.y).toFixed(1)} units from you` : '';
    return `${t.label || t.name} — ${t.name}${t.tier ? ` · Tier ${t.tier}` : ''}${completed.has(poiId(t)) ? ' · Completed (click to undo)' : ''} · ${t.source} · ` +
      (valid(t.position) ? `X ${t.position.x}, Y ${t.position.y}, elevation ${t.position.z}${distance}` : 'Coordinates unavailable');
  }
  function updateSelection() {
    const t = state?.map_tiles?.find(t => poiId(t) === selectedId);
    get('poi-map-selection').textContent = t ? describe(t) : '';
  }
  function toggleCompletion(t) {
    selectedId = poiId(t);
    if (completed.has(selectedId)) completed.delete(selectedId); else completed.add(selectedId);
    updateCompletionMarkers(); updateSelection();
  }
  function updatePlayerSelect() {
    const ps = players(), select = get('poi-map-player');
    const next = ps.map(p => `${p.id}:${playerName(p)}`).join('|');
    if (next !== playersKey || !select.options.length) {
      playersKey = next; select.replaceChildren();
      select.append(new root.Option(ps.length ? 'Choose your character…' : 'Waiting for hero…', ''));
      ps.forEach((p, i) => select.append(new root.Option(`Player ${i + 1} · ${playerName(p)} (${p.id})`, p.id)));
    }
    selectedPlayerId = ps.some(p => p.id === prefs.player) ? prefs.player : ps.length === 1 ? ps[0].id : '';
    select.value = selectedPlayerId;
    // Keep the label useful when no local identity field is known.
    get('poi-map-player-status').textContent = !ps.length ? 'Player position unavailable — waiting for a live hero.' :
      !selectedPlayerId ? `${ps.length} heroes detected. Choose yours above; move to identify your marker.` :
      `Tracking your character · X ${selectedPlayer().position.x.toFixed(1)}, Y ${selectedPlayer().position.y.toFixed(1)}`;
  }
  function buildFilters() {
    const tiles = state?.map_tiles || [];
    const shape = JSON.stringify(tiles.map(t => [t.name, t.source]));
    if (shape === filterKey) return;
    filterKey = shape;
    const host = get('poi-map-filter-groups'); host.replaceChildren();
    for (const [id, label] of Object.entries(GROUPS)) {
      const types = new Map();
      for (const t of tiles.filter(t => group(t) === id)) {
        const k = typeKey(t), seen = types.get(k);
        types.set(k, { tile: t, count: (seen?.count || 0) + 1 });
      }
      const block = html('details'); block.dataset.group = id;
      const summary = html('summary'), groupLabel = html('label'), input = html('input'); input.type = 'checkbox'; input.dataset.groupToggle = id;
      input.setAttribute('aria-label', label); input.disabled = !types.size;
      groupLabel.append(input, doc.createTextNode(`${label} (${[...types.values()].reduce((n, v) => n + v.count, 0)})`));
      summary.append(groupLabel); block.append(summary);
      input.addEventListener('click', e => e.stopPropagation());
      input.addEventListener('change', () => {
        prefs.groups[id] = input.checked;
        for (const k of Object.keys(prefs.types)) if (k.startsWith(id + '|')) delete prefs.types[k];
        save(); updateFilterChecks(); paintPois();
      });
      for (const [k, { tile, count }] of types) {
        const labelNode = html('label', undefined, 'poi-filter-type'), check = html('input'); check.type = 'checkbox'; check.dataset.typeKey = k;
        check.setAttribute('aria-label', tile.name);
        labelNode.append(check, doc.createTextNode(`${tile.name} · ${tile.source} (${count})`));
        check.addEventListener('change', () => { prefs.types[k] = check.checked; save(); updateFilterChecks(); paintPois(); });
        block.append(labelNode);
      }
      host.append(block);
    }
    updateFilterChecks();
  }
  function updateFilterChecks() {
    const types = new Map((state?.map_tiles || []).map(t => [typeKey(t), t]));
    for (const check of get('poi-map-filter-groups').querySelectorAll('[data-type-key]')) check.checked = enabled(types.get(check.dataset.typeKey), prefs);
    for (const input of get('poi-map-filter-groups').querySelectorAll('[data-group-toggle]')) {
      const ts = [...types.values()].filter(t => group(t) === input.dataset.groupToggle), count = ts.filter(t => enabled(t, prefs)).length;
      input.checked = ts.length > 0 && count === ts.length; input.indeterminate = count > 0 && count < ts.length;
    }
  }
  const safeAsset = name => typeof name === 'string' && /^[a-zA-Z0-9_-]+\.png$/.test(name);
  function graphic(g, t, i) {
    const size = prefs.size * iconScale(t), a = -size / 2;
    if (safeAsset(t.icon)) {
      if (safeAsset(t.outline)) {
        const id = `poi-outline-${i}`;
        const mask = node('mask', { id, maskUnits: 'userSpaceOnUse', x: a, y: a, width: size, height: size, style: 'mask-type:alpha' });
        mask.append(node('image', { href: `asset://icons/${t.outline}`, x: a, y: a, width: size, height: size }));
        g.append(mask, node('rect', { x: a, y: a, width: size, height: size, fill: ['', '#1fff00', '#ffff00', '#ff0000'][t.tier] || '#bdcbd5', mask: `url(#${id})` }));
      }
      g.append(node('image', { href: `asset://icons/${t.icon}`, x: a, y: a, width: size, height: size, 'pointer-events': 'none' }));
    } else {
      // No guessed asset paths: unknown placements still have a selectable glyph.
      if (group(t) === 'quests') {
        g.append(node('path', { d: `M0 ${-size*.42}L${size*.4} 0L0 ${size*.42}L${-size*.4} 0Z`, fill: '#c26645', stroke: '#f2d78d', 'stroke-width': size*.045 }));
        g.append(node('text', { x: 0, y: size*.27, 'text-anchor': 'middle', 'font-size': size*.85, 'font-weight': 'bold', fill: '#fff1ad', stroke: '#312d1f', 'stroke-width': size*.025, 'paint-order': 'stroke' }, '!'));
      } else {
        const symbols = { teleporters: '⇄', healing: '✚', camps: '⚔', enemies: '⚔', resources: '▥', scenery: '◇', other: '?' };
        g.append(node('text', { x: 0, y: size * .33, 'text-anchor': 'middle', 'font-size': size, fill: group(t) === 'healing' ? '#9cde80' : '#d7c38e' }, symbols[group(t)] || '◆'));
      }
    }
  }
  function paintPois() {
    if (!state || !get('poi-map-panel').open) return;
    // Bounds depend on all placements on this layer, never on visibility filters or player motion.
    projection = model(state.map_tiles, get('poi-map-layer').value, mapOrientation(), activeTerrain());
    const m = projection, rows = m.rows.filter(t => enabled(t, prefs)), points = rows.filter(t => valid(t.position));
    svg.replaceChildren(); markerNodes = []; completionButtons = [];
    svg.classList.toggle('poi-with-terrain', !!m.terrain);
    get('poi-map-status').textContent = !state.map_tiles ? 'Waiting for map placements…' :
      `${points.length} visible · ${m.rows.length - rows.length} hidden · ${rows.length - points.length} unresolved · ${m.points.length} of ${m.rows.length} placements positioned`;
    get('poi-map-terrain-status').textContent = m.terrain ? `${state.map_name} terrain from your game · fully revealed · ${state.map_name === 'Dark Hills' ? 'alignment checked against your screenshots' : 'alignment needs an in-game check'} · POIs may use tile anchors` :
      !prefs.terrain ? 'POI-only view · manual orientation' : get('poi-map-layer').value !== 'surface' ? 'Terrain is available on the surface layer.' :
      terrainErrors[state?.map_name] ? `Terrain unavailable for ${state.map_name}; using the POI-only map. See the application log for details.` : 'Waiting for terrain from the game installation; using the POI-only map.';
    if (m.terrain) {
      const chapter = state.map_name;
      const o = m.projectUV({ x: 0, y: 0 }), x = m.projectUV({ x: 1, y: 0 }), y = m.projectUV({ x: 0, y: 1 });
      const im = node('image', { class: 'poi-terrain', href: `asset://icons/${m.terrain.image}`, width: 1, height: 1, preserveAspectRatio: 'none',
        transform: `matrix(${x.x - o.x} ${x.y - o.y} ${y.x - o.x} ${y.y - o.y} ${o.x} ${o.y})`, 'pointer-events': 'none' });
      im.addEventListener('error', () => {
        terrainErrors[chapter] = 'Decoded terrain image could not be loaded'; delete terrainMaps[chapter];
        syncRotation(); reset(); paintPois();
      }, { once: true });
      svg.append(im);
    }
    for (let i = 0; !m.terrain && i <= 4; i++) {
      const x = 50 + i * 175, y = 50 + i * 125;
      svg.append(node('path', { d: `M${x} 35V565 M35 ${y}H765`, stroke: '#344451', 'stroke-width': 1 }));
      if (prefs.rotation === 0 && prefs.flipY) svg.append(node('text', { x, y: 590, fill: '#bdcbd5', 'font-size': 12, 'text-anchor': 'middle' }, m.world({ x, y: 300 }).x.toFixed(1)));
      if (prefs.rotation === 0 && prefs.flipY) svg.append(node('text', { x: 4, y, fill: '#bdcbd5', 'font-size': 12 }, m.world({ x: 400, y }).y.toFixed(1)));
    }
    points.forEach((t, i) => {
      const p = m.project(t.position), g = node('g', { class: 'poi-marker', tabindex: 0, role: 'button', 'aria-label': describe(t) });
      const art = node('g', { class: 'poi-graphic', 'pointer-events': 'none' }); graphic(art, t, i);
      const hitSize = Math.max(24, prefs.size * iconScale(t));
      const hit = node('rect', { class: 'poi-hit-target', x: -hitSize / 2, y: -hitSize / 2, width: hitSize, height: hitSize, fill: 'transparent', 'pointer-events': 'all' });
      const d = prefs.size * iconScale(t) * .27;
      g.append(node('title', {}, describe(t)), hit, art, node('path', { class: 'poi-completed-x', d: `M${-d} ${-d}L${d} ${d}M${d} ${-d}L${-d} ${d}`, fill: 'none', stroke: '#dce2e8', 'stroke-width': 3, 'stroke-linecap': 'round', 'pointer-events': 'none' }));
      g.dataset.poiId = poiId(t);
      const select = () => toggleCompletion(t);
      g.addEventListener('click', select);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
      svg.append(g); markerNodes.push({ n: g, p, tile: t });
    });
    const table = get('poi-map-rows'); table.replaceChildren();
    for (const t of rows) {
      const tr = html('tr');
      for (const v of [t.label === t.name ? t.name : `${t.label || t.name} (${t.name})`, t.source, ...['x', 'y', 'z'].map(k => valid(t.position) ? String(t.position[k]) : 'Unresolved')]) tr.append(html('td', v));
      const cell = html('td'), button = html('button'); button.type = 'button'; button.dataset.completionId = poiId(t);
      button.addEventListener('click', () => toggleCompletion(t)); cell.append(button); tr.append(cell);
      completionButtons.push({ button, row: tr, tile: t });
      table.append(tr);
    }
    updateCompletionMarkers(); setView(); paintPlayers(); updateSelection();
  }
  function updateCompletionMarkers() {
    for (const { button, row, tile } of completionButtons) {
      const done = completed.has(poiId(tile));
      button.textContent = done ? 'Undo' : 'Mark complete'; button.setAttribute('aria-pressed', String(done));
      button.setAttribute('aria-label', `${done ? 'Undo completion for' : 'Mark complete:'} ${tile.label || tile.name} (${tile.name})`);
      row.classList.toggle('poi-row-completed', done);
    }
    for (const m of markerNodes.filter(m => m.tile)) {
      const done = completed.has(poiId(m.tile));
      m.n.classList.toggle('poi-completed', done);
      m.n.setAttribute('aria-pressed', String(done));
      m.n.querySelector('.poi-completed-x').style.display = done ? '' : 'none';
      m.n.querySelector('title').textContent = describe(m.tile);
      m.n.setAttribute('aria-label', describe(m.tile));
    }
    get('poi-map-completion-status').textContent = `${completed.size} marked complete · click a POI again to undo`;
  }
  function paintPlayers() {
    if (!projection || !get('poi-map-panel').open) return;
    svg.querySelector('.poi-players')?.remove();
    markerNodes = markerNodes.filter(m => m.tile);
    const own = selectedPlayer();
    const interiorOnly = get('poi-map-layer').value === 'sublevel';
    if (prefs.showPlayers && !interiorOnly) {
      const host = node('g', { class: 'poi-players' });
      players().forEach((p, i) => {
        const motion = playerMotion.get(p.id);
        const pos = projection.project(motion ? motionPosition(motion, clock()) : p.position), selected = p.id === selectedPlayerId;
        const name = playerName(p), asset = playerIdentity(p).icon;
        const portrait = failedPortraits.has(asset) ? null : asset;
        const color = selected ? '#98d66e' : ['#83bfff', '#edb1ee', '#ffc475', '#7ee0db'][i % 4];
        const label = `${selected ? 'You' : 'Player ' + (i + 1)} · ${name}`;
        const g = node('g', { class: 'poi-player', 'aria-label': `${label}: X ${p.position.x}, Y ${p.position.y}` });
        if (portrait) {
          // The pointer marks position, not facing direction (which is not read).
          const fallback = node('path', { d: 'M0 -17L12 0L0 17L-12 0Z', fill: color, stroke: '#10212d', 'stroke-width': 3, visibility: 'hidden' });
          const art = node('image', { href: 'asset://icons/' + portrait, x: -24, y: -57, width: 48, height: 48, preserveAspectRatio: 'xMidYMid meet' });
          const pointer = node('path', { d: 'M-10 -9L10 -9L0 8Z', fill: color, stroke: '#10212d', 'stroke-width': 2 });
          art.addEventListener('error', () => { failedPortraits.add(portrait); art.remove(); pointer.remove(); fallback.removeAttribute('visibility'); });
          g.append(fallback, pointer, art);
        } else {
          g.append(node('path', { d: 'M0 -17L12 0L0 17L-12 0Z', fill: color, stroke: '#10212d', 'stroke-width': 3 }));
        }
        g.append(node('text', { x: 0, y: portrait ? -62 : -23, fill: selected ? '#fff' : color, 'font-size': 14, 'text-anchor': 'middle', stroke: '#10212d', 'stroke-width': 3, 'paint-order': 'stroke' }, selected ? 'YOU' : `P${i + 1}`));
        g.append(node('title', {}, `${label} (${p.id})`));
        host.append(g); markerNodes.push({ n: g, p: pos, player: p.id });
      });
      svg.append(host);
    }
    if (prefs.follow && own && !interiorOnly) {
      const p = projection.project(own.position); view[0] = p.x - view[2] / 2; view[1] = p.y - view[3] / 2;
    }
    if (interiorOnly && players().length) get('poi-map-player-status').textContent = 'Player overlay hidden on interior layer: its coordinate frame has not been verified.';
    for (const m of markerNodes.filter(m => m.tile)) {
      m.n.querySelector('title').textContent = describe(m.tile); m.n.setAttribute('aria-label', describe(m.tile));
    }
    startPlayerAnimation(); updateSelection();
  }
  function paint() { updatePlayerSelect(); buildFilters(); paintPois(); }
  api.render = s => {
    if (s.no_run === true || s.map_id === -1) s = { ...s, map_tiles: null, players: [] };
    const scope = `${s.pid ?? ''}|${s.map_id}`;
    if (scope !== completionScope || s.no_run === true || s.map_id === -1) { completed.clear(); playerMotion.clear(); completionScope = scope; }
    state = s;
    receivePlayers(players());
    const next = JSON.stringify([s.map_id, s.map_name, s.map_tiles]);
    if (s.map_id !== lastMap) { lastMap = s.map_id; selectedId = null; syncRotation(); reset(); }
    updatePlayerSelect();
    if (next !== key) { key = next; buildFilters(); paintPois(); } else paintPlayers();
  };
  api.updatePlayers = frame => {
    if (!state || state.no_run || frame.pid !== state.pid || frame.map_id !== state.map_id) return;
    state = { ...state, players: Array.isArray(frame.players) ? frame.players : [] };
    receivePlayers(players()); updatePlayerSelect(); paintPlayers();
  };
  get('poi-map-panel').addEventListener('toggle', paint);
  const rotationSlider = get('poi-map-rotation'), rotationNumber = get('poi-map-rotation-number');
  function syncRotation(keepNumber = false) {
    const opts = mapOrientation();
    rotationSlider.value = opts.rotation; if (!keepNumber) rotationNumber.value = opts.rotation;
    get('poi-map-flip-y').checked = opts.flipY;
  }
  function applyRotation(value, keepNumber = false) {
    if (String(value).trim() === '' || !Number.isFinite(Number(value))) return;
    prefs[activeTerrain() ? 'terrainRotation' : 'rotation'] = Math.round(Math.max(-180, Math.min(180, Number(value))) * 10) / 10;
    syncRotation(keepNumber); save(); reset(); paintPois();
  }
  syncRotation();
  rotationSlider.addEventListener('input', e => applyRotation(e.target.value));
  rotationNumber.addEventListener('input', e => applyRotation(e.target.value, true));
  rotationNumber.addEventListener('change', () => syncRotation());
  get('poi-map-rotate-left').addEventListener('click', () => applyRotation(mapOrientation().rotation - 15));
  get('poi-map-rotate-right').addEventListener('click', () => applyRotation(mapOrientation().rotation + 15));
  get('poi-map-flip-y').addEventListener('change', e => { prefs[activeTerrain() ? 'terrainFlipY' : 'flipY'] = e.target.checked; save(); reset(); paintPois(); });
  get('poi-map-reset-rotation').addEventListener('click', () => { prefs[activeTerrain() ? 'terrainFlipY' : 'flipY'] = !activeTerrain(); applyRotation(0); });
  get('poi-map-layer').addEventListener('change', () => { syncRotation(); reset(); paint(); });
  get('poi-map-terrain').checked = prefs.terrain;
  get('poi-map-terrain').addEventListener('change', e => { prefs.terrain = e.target.checked; save(); syncRotation(); reset(); paintPois(); });
  get('poi-map-clear-completed').addEventListener('click', () => { completed.clear(); updateCompletionMarkers(); updateSelection(); });
  get('poi-map-fit').addEventListener('click', () => { prefs.follow = false; get('poi-map-follow').checked = false; save(); reset(); });
  for (const [id, value] of [['poi-map-show-all', true], ['poi-map-hide-all', false]]) get(id).addEventListener('click', () => {
    prefs.groups = Object.fromEntries(Object.keys(GROUPS).map(k => [k, value])); prefs.types = {}; save(); updateFilterChecks(); paintPois();
  });
  get('poi-map-defaults').addEventListener('click', () => { prefs.groups = {}; prefs.types = {}; save(); updateFilterChecks(); paintPois(); });
  const sizeInput = get('poi-map-icon-size'); sizeInput.value = prefs.size; get('poi-map-icon-size-value').textContent = prefs.size;
  sizeInput.addEventListener('input', () => { prefs.size = Number(sizeInput.value); get('poi-map-icon-size-value').textContent = prefs.size; save(); paintPois(); });
  get('poi-map-player').addEventListener('change', e => { prefs.player = e.target.value; save(); updatePlayerSelect(); paintPlayers(); });
  for (const [id, k] of [['poi-map-show-players', 'showPlayers'], ['poi-map-follow', 'follow']]) {
    get(id).checked = prefs[k]; get(id).addEventListener('change', e => { prefs[k] = e.target.checked; save(); paintPlayers(); });
  }
  get('poi-map-export').addEventListener('click', () => {
    if (!Array.isArray(state?.map_tiles)) return;
    const blob = new Blob([JSON.stringify({ captured_utc: new Date().toISOString(), map_id: state.map_id, map_name: state.map_name,
      axes: 'x,y horizontal; z elevation', terrain: activeTerrain(), placements: state.map_tiles, players: players() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = doc.createElement('a'); a.href = url; a.download = `ravenswatch-pois-${state.map_id}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  function local(e) {
    const point = svg.createSVGPoint(); point.x = e.clientX; point.y = e.clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  }
  function stopFollow() { if (prefs.follow) { prefs.follow = false; get('poi-map-follow').checked = false; save(); } }
  svg.addEventListener('wheel', e => {
    e.preventDefault(); const p = local(e), f = e.deltaY > 0 ? 1.2 : 1 / 1.2;
    if (view[2] * f < 20 || view[2] * f > 8000) return;
    view = [p.x + (view[0] - p.x) * f, p.y + (view[1] - p.y) * f, view[2] * f, view[3] * f]; setView();
  }, { passive: false });
  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.poi-marker')) return;
    stopFollow(); drag = local(e); svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', e => { if (drag) { const p = local(e); view[0] += drag.x - p.x; view[1] += drag.y - p.y; setView(); } });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) svg.addEventListener(event, () => { drag = null; });
})(typeof window === 'undefined' ? globalThis : window);
