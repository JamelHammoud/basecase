import type { PanelSpec } from '../../../cases/console/panelKinds';
import { logEntries } from '../../../topics/logs';
import { recordingTopics } from '../../../topics/recordingTopics';
import type { TopicIndex } from '../../../topics/topicIndex';
import type { Studio } from '../types';

function panelReport(panel: PanelSpec, index: TopicIndex) {
  if (panel.kind === 'plot') {
    const ids = panel.signals.flatMap((s) => index.expand(s));

    return { id: panel.id, kind: panel.kind, ids, samples: ids.map((id) => index.series(id).t.length) };
  }

  if (panel.kind === 'log') {
    const entries = logEntries(index, { topics: panel.topics, level: panel.level });

    return { id: panel.id, kind: panel.kind, entries: entries.map((e) => ({ level: e.level, text: e.text })) };
  }

  return { id: panel.id, kind: panel.kind };
}

export default function topicsStudio(studio: Studio) {
  return {
    recordingPanels: () => {
      const { caseRun, simTraining } = studio().core;
      const index = recordingTopics(simTraining.cases.timeline.recording);

      return index ? caseRun.caseConsole.panels.map((p) => panelReport(p, index)) : null;
    },
  };
}
