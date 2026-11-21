import type { boardProcess } from '../../electron/electrical/process.mjs';

export const routingExecute: typeof boardProcess;

export function nativeElectricalCli(args: string[], cwd: string, signal?: AbortSignal): Promise<string>;
