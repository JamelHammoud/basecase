import { surfaceOperands } from '../booleans/operands';
import type { ParameterEdit } from '../utils/designParameters/edits';
import type { ScenePart } from '../types/robotics';
import type { WorkspaceCore } from './useWorkspaceCore';

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
    const affected = surfaceOperands(core.docs.partsRef.current).filter(
      (part) => part.dimensionBindings?.length || part.mates?.length || part.sketch?.support || targets.has(part.id),
    );

    for (const part of affected) {
      const refused = guard(part.id);

      if (refused) throw new Error(refused);

      touch(part);
    }

    const busy = current();

    const ok = await core.parameters.apply(edits, () => !busy || current());

    return ok || core.parameters.problem() || false;
  };
