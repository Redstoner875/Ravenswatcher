'use strict';
import { readPosition, type WorldPosition } from './tiles';
import type { ByteSource } from './pe';
import { stringAt } from './runs';

export interface HeroTracking {
  addresses: readonly number[];
  vtable: number | null;
  mapId: number | null;
}
export interface PlayerPosition {
  id: string;
  position: WorldPosition;
  hero?: string;
}
interface PlayerSource extends ByteSource { readPtr(addr: number): number | null }

/** Revalidate each cached controller on every position frame; never scan in the poll loop. */
export function readPlayerPositions(proc: PlayerSource, tracking: HeroTracking | null, mapId: number | null): PlayerPosition[] {
  if (!tracking?.vtable || mapId === null || mapId < 0 || tracking.mapId !== mapId) return [];
  const out: PlayerPosition[] = [];
  for (const controller of new Set(tracking.addresses)) {
    if (!Number.isSafeInteger(controller) || controller < 0x10000) continue;
    if (proc.readPtr(controller) !== tracking.vtable) continue;
    const entity = proc.readPtr(controller + 0x08);
    if (!entity || entity < 0x10000 || !proc.readPtr(entity + 0x30)) continue;
    const position = readPosition(proc, entity + 0x2e0);
    if (position) {
      const player: PlayerPosition = { id: controller.toString(16), position };
      // Same settings/name chain used by runs.findHeroStatFields; skin suffixes are retained.
      try {
        const settings = proc.readPtr(entity + 0x28);
        const hero = settings ? stringAt(proc, settings + 8, 256) : '';
        if (/^Hero_[A-Za-z0-9_]+$/.test(hero)) player.hero = hero;
      } catch { /* Identity can be unavailable without losing the position. */ }
      out.push(player);
    }
  }
  return out;
}
