import { Button, CameraIcon, ProgressBar, Spinner } from '../../design-system';
import type { TrainingImages } from '../../workspace/useTrainingImages';

export function TrainingImagesButton({ images }: { images: TrainingImages }) {
  if (images.running)
    return (
      <div className="flex flex-col gap-2 mt-2" data-testid="training-images-progress">
        <p className="flex items-center gap-2 text-[13px] text-white/60 tabular">
          <Spinner className="w-3 h-3" />
          {images.running.done} of {images.running.total}
        </p>
        <ProgressBar share={images.running.done / images.running.total} label="Training images" />
      </div>
    );

  if (!images.canMake) return null;

  return (
    <Button size="sm" fullWidth className="mt-2" icon={<CameraIcon className="w-4 h-4" />} onClick={images.start}>
      Make Training Images
    </Button>
  );
}
