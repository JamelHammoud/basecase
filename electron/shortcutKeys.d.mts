export interface Chord {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  mod: boolean;
  key: string;
}

export function parseChord(chord: string): Chord;
export function expandChord(chord: string): string[];
export function shortcutIds(): string[];
export function scopeOf(id: string): string | undefined;
export function keysOf(id: string): string[];
export function chordsOf(id: string): string[];
export function acceleratorOf(chord: string): string;
export function menuAccelerator(id: string): string | undefined;
export function tabChord(index: number, count: number): string | undefined;
