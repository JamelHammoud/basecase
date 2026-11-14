import { useState } from 'react';
import { FieldRow, Modal, NumberInput, Switch } from '../../design-system';
import type { TrainingImages } from '../../workspace/useTrainingImages';
import { MAX_TRAINING_IMAGES } from '../../workspace/trainingImageInput';

function toggle(values: string[], key: string) {
  return values.includes(key) ? values.filter((value) => value !== key) : [...values, key];
}

export function TrainingImagesSheet({ images }: { images: TrainingImages }) {
  const [count, setCount] = useState(20);
  const [cameras, setCameras] = useState(images.views.map((view) => view.key));
  const [classes, setClasses] = useState(images.classes.map((item) => item.name));

  return (
    <Modal
      isOpen={images.open}
      onClose={images.close}
      title="Training images"
      maxWidth="max-w-md"
      action={{
        label: 'Make Training Images',
        disabled: !!images.running || !cameras.length || !classes.length,
        onClick: () => images.submit({ count, cameras, classes, seed: 1 }),
      }}
    >
      <div className="flex flex-col gap-3 px-5 py-4">
        <FieldRow label="Images">
          <NumberInput
            aria-label="Image count"
            value={count}
            onChange={setCount}
            min={1}
            max={MAX_TRAINING_IMAGES}
            precision={0}
            unit=""
          />
        </FieldRow>
        <div>
          <p className="text-[12px] text-white/40">Cameras</p>
          {images.views.map((view) => (
            <Switch
              key={view.key}
              label={view.label}
              aria-label={`Camera ${view.label}`}
              checked={cameras.includes(view.key)}
              onChange={() => setCameras(toggle(cameras, view.key))}
            />
          ))}
        </div>
        <div>
          <p className="text-[12px] text-white/40">Classes</p>
          {images.classes.map((item) => (
            <Switch
              key={item.id}
              label={item.name}
              aria-label={`Class ${item.name}`}
              checked={classes.includes(item.name)}
              onChange={() => setClasses(toggle(classes, item.name))}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}
