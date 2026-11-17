import type { ScenePart } from '../../types/robotics';
import { operandsOf } from '../../booleans/parts';
import { validSupport, supportFingerprint } from './support';

export function copiedSketchSupports(originals: ScenePart[], copies: ScenePart[]): ScenePart[] {
  const ids = new Map<string, ScenePart>();
  const pair = (before: ScenePart[], after: ScenePart[]) => {
    before.forEach((part, i) => {
      ids.set(part.id, after[i]);
      pair(operandsOf(part), operandsOf(after[i]));
    });
  };

  pair(originals, copies);

  const rewrite = (part: ScenePart): ScenePart => {
    const support = part.sketch?.support;
    const source = validSupport(support) ? ids.get(support.partId) : undefined;
    const sketch = part.sketch && {
      ...part.sketch,
      support:
        source && validSupport(support)
          ? {
              ...support,
              partId: source.id,
              fingerprint: supportFingerprint(source),
              issue: undefined,
              attempt: undefined,
            }
          : undefined,
    };
    const operands = operandsOf(part).map(rewrite);

    return {
      ...part,
      ...(part.sketch ? { sketch } : {}),
      ...(part.boolean ? { boolean: { ...part.boolean, operands } } : {}),
    };
  };

  return copies.map(rewrite);
}
