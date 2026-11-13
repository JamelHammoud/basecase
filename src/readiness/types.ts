import type { CheckRow, FindingFix } from '../utils/engineeringTypes';

export type { FindingFix } from '../utils/engineeringTypes';

export type FindingLevel = 'blocker' | 'note';

export type FindingArea = 'assembly' | 'design' | 'fit' | 'printing' | 'parts';

export interface Finding {
  key: string;
  level: FindingLevel;
  area: FindingArea;
  check: string;
  rule: string;
  ruleName: string;
  text: string;
  agentText: string;
  detail?: string;
  ids: string[];
  caseId?: string;
  fix?: FindingFix;
}

export interface FindingDispute {
  reason: string;
  signature: string;
  at: string;
}

export interface IgnoredRule {
  name: string;
  at: string;
}

export interface ReadinessDecisions {
  disputes?: Record<string, FindingDispute>;
  ignored?: Record<string, { at: string }>;
  ignoredRules?: Record<string, IgnoredRule>;
}

export type ReadinessStatus = 'ready' | 'blocked' | 'blockout' | 'empty';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'not run';

export interface CheckSummary {
  name: string;
  status: CheckStatus;
  detail: string;
  ids: string[];
  caseId?: string;
  hasDots?: boolean;
}

export interface ReadinessFinding extends Finding {
  dispute?: FindingDispute;
}

export interface IgnoredRuleSummary {
  rule: string;
  name: string;
  count: number;
}

export interface Readiness {
  status: ReadinessStatus;
  checks: CheckSummary[];
  blockers: ReadinessFinding[];
  notes: ReadinessFinding[];
  ignored: ReadinessFinding[];
  ignoredRules: IgnoredRuleSummary[];
  findings: Finding[];
  rows: CheckRow[];
  fingerprint: string;
  checkedAt: string;
}
