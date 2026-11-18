import { surfaceOperands } from '../booleans/operands';
import type { ParameterEdit } from '../utils/designParameters/edits';
import type { ScenePart } from '../types/robotics';
import type { WorkspaceCore } from './useWorkspaceCore';
import { connectedParameterIds } from '../utils/designParameters/scope';

interface Options {
  core: WorkspaceCore;
  guard: (id: string) => string | null;
  touch: (part: ScenePart) => void;
  current: () => boolean;
}

export const parameterEditor =
  ({ core, guard, touch, current }: Options) =>
  async (edits: ParameterEdit[]) => {
    const targets = new Set(edits.flatMap((edit) => (edit.op === 'bind' || edit.op === 'unbind' ? [edit.part] : [])));
    const parts = surfaceOperands(core.docs.partsRef.current);

    for (const part of parts.filter((part) => part.dimensionBindings?.length)) targets.add(part.id);

    const connected = connectedParameterIds(core.docs.partsRef.current, targets);
    const affected = parts.filter((part) => connected.has(part.id));

    for (const part of affected) {
      const refused = guard(part.id);

      if (refused) throw new Error(refused);

      touch(part);
    }

    const busy = current();

    const ok = await core.parameters.apply(edits, () => !busy || current());

    return ok || core.parameters.problem() || false;
  };
