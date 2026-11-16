export interface LocalFacilityFile {
  name: string;
  base64: string;
}

export function checkedPackage(files: LocalFacilityFile[]): { name: string; bytes: Uint8Array }[];
export function localFacilityEnvironment(): string;
export function convertLocalFacility(
  files: LocalFacilityFile[],
  options?: { envDir?: string; root?: string },
): Promise<{
  base64: string;
  sourceFrame: { metersPerUnit: number; up: string; authoredUnits: boolean };
}>;
