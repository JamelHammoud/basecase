export interface CopperExclusion {
  min: [number, number];
  max: [number, number];
}
export function validCopperExclusions(value: unknown): value is CopperExclusion[];
export function copperViolatesExclusions(pcb: string, exclusions?: CopperExclusion[]): boolean;
