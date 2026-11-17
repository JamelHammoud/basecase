export function boardExecutable(): Promise<string>;
export function boardProcess(options: {
  command: string;
  args: string[];
  cwd: string;
  signal?: AbortSignal;
}): Promise<string>;
