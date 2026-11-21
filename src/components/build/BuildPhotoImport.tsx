import { Button } from '../../design-system';
import type { BuildAlong } from '../../workspace/useBuildAlong';

export function BuildPhotoImport({ buildAlong }: { buildAlong: BuildAlong }) {
  if (!buildAlong.frozen) return null;

  const { photos } = buildAlong;

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={photos.busy || buildAlong.opening}
        onClick={() => void photos.importPhotos()}
      >
        Import Photos
      </Button>
      {photos.busy && (
        <Button size="sm" variant="ghost" onClick={photos.cancel}>
          Cancel
        </Button>
      )}
    </>
  );
}
