import { useState } from 'react';
import { Button, IconButton, DeleteIcon, CloseIcon, confirmAction } from '../../design-system';
import type { BuildPhotos } from '../../workspace/useBuildPhotos';
import { BuildPhotoImage } from './BuildPhotoImage';

export function BuildPhotosPanel({ photos, onError }: { photos: BuildPhotos; onError: (error: unknown) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const photo = photos.records.find((item) => item.id === selected);

  if (!photos.records.length) return null;

  return (
    <aside className="w-[38%] min-w-[240px] max-w-[520px] flex flex-col gap-3 p-3 pt-28 bg-[#242424]" data-build-photos>
      <div className="flex flex-wrap gap-2 overflow-y-auto max-h-[180px] shrink-0">
        {photos.records.map((item) => (
          <Button
            key={item.id}
            title={item.name}
            aria-label={item.name}
            aria-pressed={photo?.id === item.id}
            variant={photo?.id === item.id ? 'active' : 'ghost'}
            className="w-24 h-20 p-1"
            onClick={() => setSelected(item.id)}
          >
            <BuildPhotoImage hash={item.hash} onError={onError} />
          </Button>
        ))}
      </div>
      {photo && (
        <div className="flex flex-1 min-h-0 flex-col gap-2" data-build-photo-enlarged={photo.id}>
          <div className="flex-1 min-h-0">
            <BuildPhotoImage hash={photo.hash} enlarged onError={onError} />
          </div>
          <div className="flex justify-end gap-2">
            <IconButton
              title="Delete"
              variant="danger"
              icon={<DeleteIcon />}
              onClick={() =>
                confirmAction({
                  title: `Delete ${photo.name}?`,
                  onConfirm: () => void photos.remove(photo),
                })
              }
            />
            <IconButton title="Close" icon={<CloseIcon />} onClick={() => setSelected(null)} />
          </div>
        </div>
      )}
    </aside>
  );
}
