export type BoardReconciliation =
  | { accepted: true; translationMm: [number, number]; segments: number; vias: number }
  | { accepted: false; code: string };
export function reconcileRoutedBoard(input: {
  expected: string;
  imported: string;
  sourceFingerprint: string;
}): BoardReconciliation;
