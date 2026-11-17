import { codePanelsOf } from '../../../cases/console/codeEdits';
import { codePanelKey, codeReport } from '../../../cases/console/codeReports';
import { parseCase } from '../../../cases/schema';
import { editTries, loadRecording } from '../../../cases/tryStore';
import type { Studio } from '../types';

export default function casesStudio(studio: Studio) {
  const cases = () => studio().core.simTraining.cases;

  return {
    caseTrails: () => studio().core.viewportRef.current?.caseTrailState() ?? [],
    addCase: (raw: unknown) => cases().add(parseCase(raw)).id,
    runCase: (id: string) => {
      cases().open(id);
      studio().core.caseRun.enterCase(id);
    },
    codeReports: () => {
      const kase = cases().active;

      return Object.fromEntries(
        codePanelsOf(kase?.console).map((p) => [p.id, codeReport(codePanelKey(kase!.id, p.id), p.source)]),
      );
    },
    caseRunSpeed: (speed: number) => studio().core.simTraining.sim.setSpeed(speed),
    fixtureTravel: () => cases().timeline.scene?.trace.signals['fixture-travel'] ?? [],
    referenceTry: () => cases().attempt.reference(),
    passTries: async () => {
      const { docs } = studio().core;
      const ids = (docs.projectRef.current.tries ?? []).map((record) => record.id);

      await editTries(ids, (stored) => ({
        ...stored,
        outcome: { verdict: 'passed', margin: stored.outcome.margin, by: 'person' },
      }));
      docs.setProject((p) => ({
        ...p,
        tries: (p.tries ?? []).map((t) => (ids.includes(t.id) ? { ...t, passed: true } : t)),
      }));
    },
    multiplyRuns: (runs: number) => cases().multiply.setRuns(runs),
    tryWorld: async () => {
      const newest = studio().core.docs.projectRef.current.tries?.at(-1);

      return (newest && (await loadRecording(newest.id))?.world) ?? [];
    },
    sharedLink: () => studio().core.simTraining.share.link,
    caseConsole: () => cases().active?.console ?? null,
    caseRunState: () => {
      const { open, live, playback } = studio().core.caseRun;

      return { open, live, playback };
    },
  };
}
