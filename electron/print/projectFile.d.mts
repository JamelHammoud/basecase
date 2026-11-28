import type { JobPrinter } from '../../src/print/printBridge';

export function prepareProject(file: string, slicer: { profiles: string }, printer: JobPrinter | null): Promise<void>;
