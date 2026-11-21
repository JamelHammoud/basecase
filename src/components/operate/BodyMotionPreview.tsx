import { useState } from 'react';
import { Slider, Spinner, TracePlot } from '../../design-system';
import type { BodyMotionOutcome } from '../../reality/bodyMotionTypes';
import { useBodyMotionCanvas } from './useBodyMotionCanvas';
import { duration } from '../../utils/duration';

export function BodyMotionPreview({ motion }: { motion: Extract<BodyMotionOutcome, { kind: 'recommended' }> }) {
  const [frame, setFrame] = useState(0);
  const { canvas, problem, rendered } = useBodyMotionCanvas(motion.preview, frame);
  const joint = motion.plan.run.joints.indexOf(motion.plan.joint);
  const traces = [
    {
      id: 'predicted',
      x: motion.preview.times,
      values: motion.preview.positions.map((row) => row[joint]),
      tone: 'accent' as const,
    },
    {
      id: 'command',
      x: motion.preview.times,
      values: motion.plan.run.intents.map((intent) => intent.joints[joint]),
      tone: 'muted' as const,
    },
  ];

  return (
    <div
      className="flex flex-col gap-2"
      data-testid="body-motion-preview"
      data-frame={rendered ?? undefined}
      data-ready={rendered !== null}
    >
      <p className="flex justify-between text-[13px] text-white/60">
        <span>Predicted</span>
        <span>{duration(motion.plan.seconds)}</span>
      </p>
      {problem && <p className="text-[13px] text-amber-400">{problem}</p>}
      <div className="relative h-[180px] rounded-xl bg-[#1b1b1b]">
        {rendered === null && !problem && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Spinner />
          </div>
        )}
        <canvas ref={canvas} className="h-[180px] w-full rounded-xl object-contain" />
      </div>
      <TracePlot
        traces={traces}
        playhead={frame}
        onSeek={setFrame}
        units={{ x: 's', y: motion.preview.units[joint] }}
      />
      <Slider
        label="Time"
        value={frame}
        min={0}
        max={motion.preview.times.length - 1}
        onChange={setFrame}
        format={(index) => duration(motion.preview.times[index])}
        stacked
      />
    </div>
  );
}
