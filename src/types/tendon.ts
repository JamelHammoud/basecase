export interface TendonTerm {
  joint: string;
  coefficient: number;
  unit: 'mm/rad' | 'mm/mm';
}

export type TendonLaw =
  | { kind: 'fixed'; lengthMm: number }
  | { kind: 'elastic'; restLengthMm: number; stiffnessNPerMm: number; dampingNsPerMm: number };

export interface IdealTendon {
  spool: { coefficient: number; unit: 'mm/rad' };
  terms: TendonTerm[];
  law: TendonLaw;
}
