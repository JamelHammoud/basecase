export { readTryBranch } from '../../electron/library/tryBranch.mjs';

export interface TryBranch {
  version: 1;
  checkpoint: string;
  frame: number;
  time: number;
}
