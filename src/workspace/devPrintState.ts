import type { WorkspaceCore } from './useWorkspaceCore';

export function printDevActions({ printing, project }: WorkspaceCore) {
  return {
    printState: () => ({
      open: !!printing.mode,
      printer: printing.printer.model.id,
      madeBy: project.madeBy ?? null,
      bed: printing.report?.plan.bed ?? null,
    }),
    chooseService: () => printing.service.choose(),
    printPlates: () => ({
      open: !!printing.mode,
      fitTest: !!printing.fitTest,
      plates: (printing.report?.plan.plates ?? []).map((p) => p.items.map((it) => it.id)),
    }),
  };
}
