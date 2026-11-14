import type { DriveCommand } from '../src/sim/driveTypes';

export interface SimState {
  status: string;
  drive: string;
  driveClass: string | null;
  offer: string;
  stats: { time: number; robots: Array<{ forward: number; travelled: number; fellAt: number | null }> } | null;
  world: string[];
  bodies: Array<{ parts: string[]; world: string[] }>;
  activeCase: string | null;
  effector: number[] | null;
  scanPoints: number;
  tries: Array<{ passed: boolean; margin: number; generated: boolean; real: boolean }>;
  multiplying: boolean;
}

export type Studio = {
  simState: () => SimState;
  load: (r: unknown) => void;
  passTries: () => void;
  referenceTry: () => Promise<void>;
  multiplyRuns: (runs: number) => void;
  drive: (c: DriveCommand) => void;
  worldAt: () => Record<string, number[]>;
  lastDownload: () => { name: string; base64: string } | null;
  caseMat: () => { sheets: number; tags: number } | null;
  feedMatFrames: (options?: { seconds?: number; hide?: [number, number] }) => boolean;
};
