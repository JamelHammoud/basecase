import type { Case } from '../schema';
import type { CaseConsole } from './format';

const panelForAgent = (p: CaseConsole['panels'][number]) =>
  p.kind === 'code'
    ? {
        id: p.id,
        kind: p.kind,
        ...(p.title ? { title: p.title } : {}),
        bytes: new TextEncoder().encode(p.source).length,
      }
    : p;

export const caseConsoles = (cases: readonly Case[]) =>
  cases.flatMap((kase) =>
    kase.console
      ? [
          {
            case: kase.id,
            name: kase.name,
            console: { ...kase.console, panels: kase.console.panels.map(panelForAgent) },
          },
        ]
      : [],
  );
