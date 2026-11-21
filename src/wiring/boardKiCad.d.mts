export type KiCadNode = string | KiCadNode[];
export const KICAD_BOARD_LIMITS: { bytes: number; depth: number; nodes: number; atoms: number };
export class BoardImportError extends Error {
  readonly code: string;
  constructor(code: string);
}
export function readKiCadBoard(text: string): KiCadNode[];
export function kiCadChildren(node: KiCadNode[], key: string): KiCadNode[][];
export function kiCadChild(node: KiCadNode[], key: string): KiCadNode[];
export function kiCadNumber(value: KiCadNode | undefined): number;

export function readKiCadDocument(text: string, rootName: string): KiCadNode[];
