import type { ByteSource, PeSection } from './pe';
export const RTTI_NAMES: { oCGlobalEntityValueSettings: string; oCEntityValueUnion: string };
export const SCAN_CHUNK: number;
export function scanSection(source: ByteSource, base: number, section: PeSection, pattern: Buffer): number[];
export function sectionsOf(source: ByteSource, base: number): {
  secs: PeSection[]; data: PeSection | undefined; rdata: PeSection | undefined; search: PeSection[] | null;
};
export function resolveOneVtable(source: ByteSource, base: number, data: PeSection, search: PeSection[], name: string): number | null;
export function resolveVtableRvas<T extends Record<string, string> = typeof RTTI_NAMES>(source: ByteSource, base: number, names?: T): { [K in keyof T]: number | null };
export function resolveAllVtableRvas(source: ByteSource, base: number, name: string): number[];
export function classOfVtable(source: ByteSource, base: number, size: number, vt: number): string | null;
