import { useState } from 'react';
import { FieldRow, Modal, NumberInput, PhotoIcon, ProgressBar, Switch } from '../design-system';
import type { TrainingImages } from '../workspace/useTrainingImages';
import { imageClassKey } from '../vision/makeImagesPlan';
import type { VisionClass } from '../vision/frameSet';

const toggle = (values: string[], name: string) =>
  values.includes(name) ? values.filter((v) => v !== name) : [...values, name];

function classChoices(classes: VisionClass[]) {
  const names = new Map<string, number>();

  for (const kind of classes) names.set(kind.name, (names.get(kind.name) ?? 0) + 1);

  return classes.map((kind) => ({
    ...kind,
    label: names.get(kind.name)! > 1 ? `${kind.name} (${kind.kind})` : kind.name,
  }));
}

export function TrainingImagesSheet({ images }: { images: TrainingImages }) {
  const [count, setCount] = useState(20);
  const [cameras, setCameras] = useState(images.choices?.cameras.map((c) => c.key) ?? []);
  const [classes, setClasses] = useState(images.choices?.classes.map(imageClassKey) ?? []);
  const { choices, busy, progress, problem } = images;

  return (
    <Modal
      isOpen
      title="Make Training Images"
      subtitle={images.kase?.name}
      icon={<PhotoIcon />}
      onClose={images.close}
      maxWidth="max-w-[440px]"
      action={{
        label: 'Make Training Images',
        disabled: busy || !cameras.length || !classes.length,
        onClick: () => void images.make({ case: images.kase?.id, count, cameras, classes }),
      }}
    >
      <div className="space-y-4">
        <FieldRow label="Count">
          <NumberInput
            aria-label="Count"
            value={count}
            onChange={setCount}
            min={1}
            max={10000}
            precision={0}
            unit=""
            disabled={busy}
          />
        </FieldRow>
        <FieldRow label="Cameras" group>
          <div className="w-full">
            {choices?.cameras.map((c) => (
              <Switch
                key={c.key}
                label={c.label}
                aria-label={c.label}
                checked={cameras.includes(c.key)}
                onChange={() => setCameras(toggle(cameras, c.key))}
                disabled={busy}
              />
            ))}
          </div>
        </FieldRow>
        <FieldRow label="Classes" group>
          <div className="max-h-48 overflow-y-auto w-full">
            {classChoices(choices?.classes ?? []).map((c) => (
              <Switch
                key={c.id}
                label={c.label}
                aria-label={c.label}
                checked={classes.includes(imageClassKey(c))}
                onChange={() => setClasses(toggle(classes, imageClassKey(c)))}
                disabled={busy}
              />
            ))}
          </div>
        </FieldRow>
        {busy && (
          <div className="space-y-2" role="status">
            <ProgressBar share={progress.total ? progress.done / progress.total : 0} />
            <p className="text-[13px] text-white/50 tabular-nums">
              {progress.done} / {progress.total}
            </p>
          </div>
        )}
        {problem && (
          <p className="text-[13px] text-red-400" role="alert">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}
