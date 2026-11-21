import { Button, Spinner } from '../../design-system';
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
        aria-busy={photos.busy}
        icon={photos.busy ? <Spinner className="w-4 h-4" /> : undefined}
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
