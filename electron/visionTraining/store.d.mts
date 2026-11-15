import type { VisionTrainerEvent } from '../visionTrainer/index.mjs';

export interface VisionTrainingStatus {
  id: string;
  state: 'starting' | 'running' | 'stopping' | 'stopped' | 'complete' | 'failed';
  jobHash?: string;
  progress?: Record<string, unknown>;
  error?: string;
}

export interface VisionTrainingOptions {
  libraryDir: string;
  stage?: (
    options: { libraryDir: string; id: string; images: Array<{ id: string; content: string; packed: boolean }> },
    signal: { signal: AbortSignal },
  ) => Promise<unknown>;
  launch?: (options: {
    dir: string;
    envDir: string;
    onEvent: (event: VisionTrainerEvent) => void;
  }) =>
    | { stop: () => Promise<void>; done: Promise<{ code: number | null }> }
    | Promise<{ stop: () => Promise<void>; done: Promise<{ code: number | null }> }>;
}

export class VisionTrainingStore {
  constructor(options: VisionTrainingOptions);
  start(payload: unknown): Promise<VisionTrainingStatus>;
  status(id: string): Promise<VisionTrainingStatus | null>;
  stop(id: string): Promise<VisionTrainingStatus | null>;
  artifact(id: string): Promise<Record<string, unknown>>;
  saveRun(run: unknown): Promise<Record<string, unknown>>;
  runs(datasetId: string): Promise<Array<Record<string, unknown>>>;
  settled(): Promise<unknown[]>;
  dispose(): Promise<void>;
}
