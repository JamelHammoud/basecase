export interface QuarantineEntry {
  file: string;
  test: string;
  issue: number;
  until: string;
  reason: string;
  platform?: 'darwin' | 'linux' | 'win32';
}

export function quarantineExclude(entries?: QuarantineEntry[], day?: string, platform?: string): string[];
