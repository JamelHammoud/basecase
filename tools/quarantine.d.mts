export interface QuarantineEntry {
  file: string;
  test: string;
  issue: number;
  until: string;
  reason: string;
}

export function quarantineExclude(entries?: QuarantineEntry[], day?: string): string[];
