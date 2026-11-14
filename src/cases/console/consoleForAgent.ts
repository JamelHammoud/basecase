import type { Case } from '../schema';
import type { PanelSpec } from './panelKinds';

const withoutSource = (panel: PanelSpec) =>
  panel.kind === 'code'
    ? {
        id: panel.id,
        kind: panel.kind,
        ...(panel.title === undefined ? {} : { title: panel.title }),
        bytes: new TextEncoder().encode(panel.source).length,
      }
    : panel;

export const consolesForAgent = (cases: readonly Case[] | undefined) =>
  (cases ?? []).flatMap((kase) =>
    kase.console
      ? [
          {
            case: kase.id,
            name: kase.name,
            console: { ...kase.console, panels: kase.console.panels.map(withoutSource) },
          },
        ]
      : [],
  );
