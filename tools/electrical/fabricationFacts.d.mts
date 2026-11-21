export function drillFacts(text: string): Array<{ diameter: number | undefined; x: number; y: number }>;
export function gerberFacts(text: string): { function: string | undefined; nets: string[]; points: number[][] };
