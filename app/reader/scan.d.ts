// Contracts for the unconverted JavaScript memory scanner.
export interface ScanSource {
  regions(writableOnly?: boolean): Iterable<readonly [number, number]>;
  readInto(addr: number, destination: unknown, size: number): number;
}
export interface ScanOptions { writableOnly?: boolean; withPrev?: readonly number[] }
export const CHUNK_SIZE: number;
export function iterChunks(proc: ScanSource, writableOnly?: boolean): Generator<[number, number]>;
export function scanPointers(proc: ScanSource, targets: readonly number[], opts?: ScanOptions): Map<number, unknown[]>;
export function scanPointerRanges(proc: ScanSource, ranges: readonly (readonly [number, number])[], opts?: ScanOptions): Map<number, number[]>;
export function scanStrings(proc: ScanSource, needles: readonly string[], opts?: ScanOptions): Map<string, number[]>;
