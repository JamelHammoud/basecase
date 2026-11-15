import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export interface VisionTrainerEvent {
  type: 'progress' | 'done' | 'error' | 'status';
  [key: string]: unknown;
}

export function spawnVisionTrainer(options: {
  dir: string;
  envDir: string;
  onEvent: (event: VisionTrainerEvent) => void;
  uv?: string | null;
  spawnProcess?: (...args: unknown[]) => ChildProcessWithoutNullStreams;
}): { done: Promise<{ code: number | null }>; stop: () => Promise<void> };
