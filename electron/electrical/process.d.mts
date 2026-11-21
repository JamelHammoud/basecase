export function boardExecutable(): Promise<string>;
export function boardProcess(options: {
  command: string;
  args: string[];
  cwd: string;
  signal?: AbortSignal;
  observe?: (pid: number, stop: (reason?: Error) => void) => () => Promise<void>;
}): Promise<string>;
