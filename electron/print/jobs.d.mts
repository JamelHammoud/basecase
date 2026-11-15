import type { JobPayload } from '../../src/print/printBridge';

interface WrittenJob {
  dir: string;
  job: {
    jobId: string;
    name: string;
    stem: string;
    printer: JobPayload['printer'];
    infillPct: number;
    labels: string;
    project: boolean;
    groups: Array<{ material: string; plates: JobPayload['groups'][number]['plates']; layout: string; base: string }>;
  };
}

export function writeJob(root: string, payload: JobPayload): WrittenJob;
export function openJob(
  written: WrittenJob,
  options: { material?: string; slicer?: string },
  open?: (file: string, app?: unknown) => Promise<unknown>,
): Promise<{ opened: string; file: string }>;
