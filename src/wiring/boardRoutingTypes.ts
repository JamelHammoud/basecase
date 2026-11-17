export interface BoardFabricationRules {
  source: string;
  clearanceMm: number | null;
  trackWidthMm: number | null;
  drillMm: number | null;
}

export interface BoardNativeRequest {
  id: string;
  expected: string;
  pcb: string;
  schematic: string;
  footprints: Record<string, string>;
  key?: string;
  sourceFingerprint: string;
  boardHash: string;
  geometryFingerprint: string;
  rules: BoardFabricationRules | null;
  mechanicalIssues: string[];
  copperExclusions?: import('./boardCopperExclusions.mjs').CopperExclusion[];
}

export interface BoardNativeResult {
  key: string;
  version: string | null;
  issues: string[];
  report: string | null;
  files: Record<string, string>;
  metrics: { cliMs: number; outputBytes: number };
}

export interface BoardRoutedSource {
  schema: 1;
  provenance?: BoardRouteResult['provenance'];
  hash: string;
  pcb: string;
  sourceFingerprint: string;
  rules: BoardFabricationRules | null;
  evidence?: Omit<BoardNativeResult, 'files'>;
}

export interface BoardRouteResult {
  pcb: string;
  metrics: { routeMs: number; outputBytes: number; peakRssBytes: number };
  provenance: {
    engine: string;
    version: string;
    artifactHash: string;
    runtime: string;
    dsnHash: string;
    sesHash: string;
  };
}
