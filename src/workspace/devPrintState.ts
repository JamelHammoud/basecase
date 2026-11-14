import type { WorkspaceCore } from './useWorkspaceCore';

export function printDevActions({ printing }: WorkspaceCore) {
  return {
    printState: () => ({
      open: !!printing.mode,
      printer: printing.printer.model.id,
      bed: printing.report?.plan.bed ?? null,
    }),
    printPlates: () => ({
      open: !!printing.mode,
      fitTest: !!printing.fitTest,
      plates: (printing.report?.plan.plates ?? []).map((p) => p.items.map((it) => it.id)),
    }),
  };
}
