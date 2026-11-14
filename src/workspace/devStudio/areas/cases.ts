import { codePanelsOf } from '../../../cases/console/codeEdits';
import { codePanelKey, codeReport } from '../../../cases/console/codeReports';
import { parseCase } from '../../../cases/schema';
import { loadRecording } from '../../../cases/tryStore';
import type { Studio } from '../types';

export default function casesStudio(studio: Studio) {
  const cases = () => studio().core.simTraining.cases;

  return {
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
    referenceTry: () => cases().attempt.reference(),
    passTries: () =>
      studio().core.docs.setProject((p) => ({
        ...p,
        tries: (p.tries ?? []).map((t) => ({ ...t, passed: true })),
      })),
    multiplyRuns: (runs: number) => cases().multiply.setRuns(runs),
    tryWorld: async () => {
      const newest = studio().core.docs.projectRef.current.tries?.at(-1);

      return (newest && (await loadRecording(newest.id))?.world) ?? [];
    },
    sharedLink: () => studio().core.simTraining.share.link,
    caseRunState: () => {
      const { open, live, playback } = studio().core.caseRun;

      return { open, live, playback };
    },
  };
}
