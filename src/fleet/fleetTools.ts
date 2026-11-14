export interface RollOutAsk {
  skill: string;
  canaries?: string[];
  units?: string[];
}

export interface FleetTools {
  select: (unit: string) => string | null;
  rollOut: (ask: RollOutAsk) => Promise<string>;
  rollBack: (unit: string) => Promise<string>;
}
