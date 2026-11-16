export function recoveryCommand(
  url: string,
  command: string,
  org: string,
  input?: unknown,
): Promise<{ code: number; stdout: string; stderr: string }>;
