import { Button } from '../../design-system';
import type { AssemblyCradle } from '../../workspace/useAssemblyCradle';
import { CradleSheet } from './CradleSheet';

export function CradleBarActions({ cradle }: { cradle?: AssemblyCradle }) {
  if (!cradle) return null;

  return (
    <>
      {cradle.available && (
        <Button size="sm" variant="ghost" onClick={cradle.show}>
          Make Assembly Cradle
        </Button>
      )}
      {cradle.prepared && (
        <Button size="sm" variant="ghost" onClick={cradle.toggleRemoval}>
          {cradle.removing ? 'Use Cradle' : 'Show Removal'}
        </Button>
      )}
      <CradleSheet cradle={cradle} />
    </>
  );
}
