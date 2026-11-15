import { useState } from 'react';
import { FieldRow, Modal, NumberInput, SegmentedControl, Switch } from '../../design-system';
import type { FrameLabels } from '../../workspace/useFrameLabels';
import { frameLabelSelection, toggleFrameCamera } from '../../workspace/frameLabelOptions';
import type { TryFrameSelection } from '../../vision/tryFramesTypes';

export function AddFramesSheet({ labels }: { labels: FrameLabels }) {
  const adding = labels.adding!;
  const frames = Math.min(...adding.sources.map((source) => source.recording?.frames ?? source.stored.frames));
  const [kind, setKind] = useState<TryFrameSelection['kind']>(adding.sources.length === 1 ? 'frame' : 'sample');
  const [step, setStep] = useState(10);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(Math.max(0, frames - 1));
  const [count, setCount] = useState(
    Math.min(
      50,
      adding.sources.reduce((sum, source) => sum + source.stored.frames, 0),
    ),
  );
  const [cameras, setCameras] = useState(adding.cameras);
  const busy = !!labels.running;
  const selection = frameLabelSelection(kind, { frame: adding.frame, from, to, step, count });
  const choices = [
    ...(adding.sources.length === 1 ? [{ value: 'frame' as const, label: 'Playhead' }] : []),
    { value: 'every' as const, label: 'Every Nth' },
    { value: 'range' as const, label: 'Range' },
    { value: 'sample' as const, label: 'Sample' },
  ];

  return (
    <Modal
      isOpen
      onClose={labels.cancel}
      title="Add frames"
      maxWidth="max-w-lg"
      action={{
        label: 'Add Frames',
        disabled: busy || !cameras.length || to < from,
        onClick: () => labels.extract(selection, cameras),
      }}
    >
      <div className="flex flex-col gap-3 px-5 py-4" data-testid="add-frames-sheet">
        <SegmentedControl aria-label="Frame selection" options={choices} value={kind} onChange={setKind} />
        {kind === 'range' && (
          <>
            <FieldRow label="First frame">
              <NumberInput
                aria-label="First frame"
                value={from}
                onChange={setFrom}
                min={0}
                max={frames - 1}
                precision={0}
                unit=""
              />
            </FieldRow>
            <FieldRow label="Last frame">
              <NumberInput
                aria-label="Last frame"
                value={to}
                onChange={setTo}
                min={0}
                max={frames - 1}
                precision={0}
                unit=""
              />
            </FieldRow>
          </>
        )}
        {(kind === 'every' || kind === 'range') && (
          <FieldRow label="Every">
            <NumberInput
              aria-label="Frame interval"
              value={step}
              onChange={setStep}
              min={1}
              max={frames}
              precision={0}
              unit="frames"
            />
          </FieldRow>
        )}
        {kind === 'sample' && (
          <FieldRow label="Frames">
            <NumberInput
              aria-label="Sample count"
              value={count}
              onChange={setCount}
              min={1}
              max={1000}
              precision={0}
              unit=""
            />
          </FieldRow>
        )}
        <div>
          <p className="text-[12px] text-white/50">Cameras</p>
          {adding.cameras.map((camera) => (
            <Switch
              key={camera}
              label={camera}
              aria-label={`Camera ${camera}`}
              checked={cameras.includes(camera)}
              onChange={() => setCameras(toggleFrameCamera(cameras, camera))}
            />
          ))}
        </div>
        {labels.running && (
          <p role="status" className="text-[13px] text-white/60">
            {labels.running.done} of {labels.running.total}
          </p>
        )}
        {labels.problem && (
          <p role="alert" className="text-[13px] text-red-400">
            {labels.problem}
          </p>
        )}
      </div>
    </Modal>
  );
}
