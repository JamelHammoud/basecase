import { confirmAction } from '../design-system/confirmStore';
import { surfaceOperands } from '../booleans/operands';
import { parameterDependents } from '../utils/designParameters/mutations';
import type { ParameterEdit } from '../utils/designParameters/edits';
import type { SceneDocument } from './useSceneDocument';
import type { ShowToast } from './types';

interface Options {
  docs: SceneDocument;
  apply: (edit: ParameterEdit) => Promise<boolean>;
  showToast: ShowToast;
}

export function requestParameterDeletion(name: string, { docs, apply, showToast }: Options) {
  const source = docs.docRef.current;
  const parameters = docs.projectRef.current.designParameters;
  const dependents = parameterDependents({ parts: source.parts, parameters: parameters ?? [] }, name);

  const parts = surfaceOperands(source.parts);
  const labels = dependents.map((dependent) => {
    const part = parts.find((candidate) => dependent.startsWith(`${candidate.id}:`));

    return part ? `${part.name}: ${dependent.slice(part.id.length + 1)}` : dependent.replace(/^parameter:/, '');
  });

  confirmAction({
    title: `Delete ${name}?`,
    body: dependents.length ? `Keep current dimensions for ${labels.join(', ')}.` : undefined,
    confirmLabel: dependents.length ? 'Freeze and Delete' : 'Delete',
    onConfirm: () => {
      if (docs.docRef.current !== source || docs.projectRef.current.designParameters !== parameters) {
        showToast('The design changed during dimension preparation.', { tone: 'error' });

        return;
      }

      void apply({ op: 'delete', name, resolution: 'freeze' });
    },
  });
}
