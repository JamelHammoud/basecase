export interface WorldChange {
  at: number;
  fact: string;
  value: boolean | number | string;
}

export type MockValue =
  boolean | number | string | { value?: boolean | number | string; name?: string | null; score?: number; ms?: number };

export type FaultKind = 'hang' | 'fail' | 'garbage' | 'slow';

export interface Fault {
  node: string;
  at: number;
  kind: FaultKind;
}

export interface Window {
  from?: number;
  until?: number;
}

export interface EventMatch extends Window {
  event: string;
  node?: string;
  reaction?: string;
  fact?: string;
  why?: string;
  count?: number;
}

export type Expectation =
  | ({ always: { skill: string } } & Window)
  | ({ never: { said?: string; skill?: string } } & Window)
  | ({ said: string } & Window)
  | { saidExactly: string[] }
  | { skills: string[] }
  | { visits: string[] }
  | { elapsed: { node: string; ms: number; tolerance?: number } }
  | EventMatch;

export interface Scenario {
  covers: string;
  world: WorldChange[];
  mocks: Record<string, MockValue>;
  faults: Fault[];
  seconds: number;
  expect: Expectation[];
}

export interface TraceEvent {
  t: number;
  kind: string;
  node?: string;
  reaction?: string;
  by?: string;
  skill?: string | null;
  head?: string | null;
  fact?: string;
  value?: number;
  name?: string | null;
  outcome?: string;
  taken?: boolean;
  why?: string;
  text?: string;
  token?: number;
  enabled?: boolean;
  count?: number;
}

export interface ScenarioResult {
  passed: boolean;
  trace: TraceEvent[];
  said: string[];
  maxControlGapMs: number;
  controlTicks: number;
  failures: string[];
}
