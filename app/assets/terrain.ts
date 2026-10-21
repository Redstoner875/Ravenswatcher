// Decode terrain from the player's installation; no game artwork ships in the app.
import * as fs from 'fs';
import * as path from 'path';
import { readCooked } from './tables';
import { parseTexture } from './texture';
import { encodePng } from './png';

export interface TerrainMap {
  image: string;
  bounds: { x: number; y: number; width: number; height: number };
  projection: 'diagonal-half-v1';
  source: string;
}
export interface TerrainTables {
  TERRAIN_MAPS?: Record<string, TerrainMap>;
  TERRAIN_ERRORS?: Record<string, string>;
}
const LEVELS: readonly [string, string][] = [
  ['Dark Hills', 'Ot/DarkHills/Map_Dark_Hills_Gameplay.level.ot.GameStream.gen'],
  ['Storm Island', 'Ot/Storm_Island/Map_Storm_Island_Gameplay.level.ot.GameStream.gen'],
  ['Avalon', 'Ot/Avalon/Map_Avalon_Gameplay_Update3.level.ot.GameStream.gen'],
];

/** Recognise the measured serialized component layout, rather than searching for plausible floats. */
export function parseMinimap(blob: Buffer) {
  if (!blob.includes(Buffer.from('oCDtEntityCpntMinimapSettings'))) throw new Error('Minimap settings type missing');
  const name = Buffer.from('\x07\0\0\0Minimap', 'latin1');
  const magic = Buffer.from([0x22, 0x22, 0xbb, 0xaa]);
  const flags = Buffer.from('010100000000000000000100000000', 'hex');
  const matches: { bounds: TerrainMap['bounds']; base: string; front: string }[] = [];
  for (let at = blob.indexOf(name); at >= 0; at = blob.indexOf(name, at + name.length)) {
    if (at < 20 || at + 46 > blob.length || !blob.subarray(at - 20, at - 16).equals(magic) ||
        !blob.subarray(at + 11, at + 26).equals(flags)) continue;
    const [x, y, width, height] = [0, 1, 2, 3].map(i => blob.readFloatLE(at + 26 + i * 4));
    if (x === undefined || y === undefined || width === undefined || height === undefined ||
        ![x, y, width, height].every(Number.isFinite) || Math.abs(x) > 10000 || Math.abs(y) > 10000 ||
        width < 10 || height < 10 || width > 10000 || height > 10000 || blob.readUInt32LE(at + 42) !== 2) continue;
    // The Big view is followed by exactly two length-prefixed Ui resource paths.
    const end = Math.min(blob.length, at + 430), big = blob.indexOf(Buffer.from('\x03\0\0\0Big', 'latin1'), at + 46);
    if (big < 0 || big >= end) continue;
    const refs: string[] = [];
    const tag = Buffer.from([2, 0, 0, 0, 0x55, 0x69]);
    let next = big + 7;
    for (let i = 0; i < 2; i++) {
      const ref = blob.indexOf(tag, next);
      if (ref < 0 || ref + 10 > end) break;
      const n = blob.readUInt32LE(ref + 6);
      if (n < 10 || n > 200 || ref + 10 + n > end) break;
      const p = blob.toString('latin1', ref + 10, ref + 10 + n);
      if (!/^MiniMap\\[A-Za-z0-9_]+\.png$/i.test(p)) break;
      refs.push(p.replace(/\\/g, '/')); next = ref + 10 + n;
    }
    if (refs[0] && refs[1]) matches.push({ bounds: { x, y, width, height }, base: refs[0], front: refs[1] });
  }
  if (matches.length !== 1) throw new Error(`Unsupported or ambiguous minimap layout (${matches.length} settings)`);
  return matches[0]!;
}

export function buildTerrainAssets(cookingDir: string, iconsDir: string): Required<TerrainTables> {
  const TERRAIN_MAPS: Record<string, TerrainMap> = {}, TERRAIN_ERRORS: Record<string, string> = {};
  for (const [chapter, source] of LEVELS) {
    try {
      const settings = parseMinimap(readCooked(cookingDir, source));
      const load = (p: string) => parseTexture(readCooked(cookingDir, `Ui/${p}.Texture.dxt`), p);
      const base = load(settings.base), front = load(settings.front);
      if (base.width !== front.width || base.height !== front.height) throw new Error('Terrain and front sizes differ');
      // Composite only the supplied alpha. Transparent RGB in the front texture
      // is unspecified and must not be interpreted as a terrain or exploration mask.
      for (let i = 0; i < base.rgba.length; i += 4) {
        const a = (front.rgba[i + 3] ?? 0) / 255;
        const ba = (base.rgba[i + 3] ?? 0) / 255, oa = a + ba * (1 - a);
        for (let k = 0; k < 3; k++) base.rgba[i + k] = oa ? Math.round(((front.rgba[i + k] ?? 0) * a + (base.rgba[i + k] ?? 0) * ba * (1 - a)) / oa) : 0;
        base.rgba[i + 3] = Math.round(oa * 255);
      }
      const image = `terrain_${chapter.toLowerCase().replace(/ /g, '_')}.png`;
      fs.writeFileSync(path.join(iconsDir, image), encodePng(base.width, base.height, base.rgba));
      TERRAIN_MAPS[chapter] = { image, bounds: settings.bounds, projection: 'diagonal-half-v1', source };
    } catch (e) {
      // Optional terrain must never disable existing icons, item tables or the POI-only map.
      TERRAIN_ERRORS[chapter] = (e as Error).message;
    }
  }
  return { TERRAIN_MAPS, TERRAIN_ERRORS };
}
