import React, { useMemo, useRef, useState } from 'react';
import { Square } from 'lucide-react';
import { Button, IconButton, NumberInput, Section, SegmentedControl } from '../../design-system';
import type { Training, TrainOptions } from '../../sim/useTraining';
import type { TrainTask } from '../../sim/policy';
import { fmtSteps, rewardPath } from './format';

const MINUTES = ['5', '20', '60'] as const;

type Minutes = (typeof MINUTES)[number];

interface TrainSettings {
  task: TrainTask;
  setTask: (task: TrainTask) => void;
  speedMs: number;
  setSpeedMs: (speed: number) => void;
  minutes: Minutes;
  setMinutes: (minutes: Minutes) => void;
}

const TrainSetup: React.FC<{ training: Training; settings: TrainSettings }> = ({ training, settings }) => {
  const { task, setTask, speedMs, setSpeedMs, minutes, setMinutes } = settings;
  const start = () => {
    const opts: TrainOptions = {
      task,
      minutes: Number(minutes),
      command: task === 'walk' ? [speedMs, 0, 0] : [0, 0, 0],
    };

    void training.start(opts);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <SegmentedControl<TrainTask>
        value={task}
        onChange={setTask}
        options={[
          { value: 'stand', label: 'Stand' },
          { value: 'walk', label: 'Walk' },
        ]}
      />
      {task === 'walk' && (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[13px] text-white/70">Speed</span>
          <div className="w-[120px]">
            <NumberInput
              value={speedMs}
              min={0.05}
              max={2}
              step={0.05}
              precision={2}
              unit="m/s"
              onChange={(v) => setSpeedMs(v)}
            />
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[13px] text-white/70">Time</span>
        <SegmentedControl
          size="sm"
          value={minutes}
          onChange={setMinutes}
          options={MINUTES.map((m) => ({ value: m, label: m === '60' ? '1 h' : `${m} min` }))}
        />
      </div>
      <Button variant="secondary" size="md" fullWidth onClick={start} disabled={!training.canTrain}>
        Train {task === 'walk' ? 'Walking' : 'Standing'}
      </Button>
      {training.blocker && <p className="text-[12.5px] leading-snug text-white/45">{training.blocker}</p>}
      {training.status === 'error' && training.error && (
        <p className="text-[12.5px] leading-snug text-[#f87171]">{training.error}</p>
      )}
      {training.status === 'done' && training.message && (
        <p className="text-[12.5px] leading-snug text-white/55">{training.message}</p>
      )}
    </div>
  );
};

const TrainProgress: React.FC<{ training: Training }> = ({ training }) => {
  const p = training.progress;
  const curveRef = useRef<SVGSVGElement | null>(null);
  const curve = training.curve;
  const path = useMemo(() => rewardPath(curve), [curve]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <span className="text-white/80 truncate">{training.message ?? 'Training'}</span>
        <IconButton icon={<Square className="w-3.5 h-3.5" />} title="Stop training" size="xs" onClick={training.stop} />
      </div>
      {p && (
        <>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full bg-[#0d99ff] transition-[width] duration-300"
              style={{ width: `${Math.min(100, (p.elapsedS / p.budgetS) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[12px] text-white/45 tabular">
            <span>
              {fmtSteps(p.steps)} steps · {fmtSteps(Math.round(p.fps))}/s
            </span>
            <span>Reward {p.reward.toFixed(2)}</span>
          </div>
        </>
      )}
      {path && (
        <svg
          ref={curveRef}
          viewBox="0 0 100 36"
          preserveAspectRatio="none"
          className="w-full h-12"
          aria-label="Reward over training"
        >
          <path d={path} fill="none" stroke="#0d99ff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
};

export const TrainSection: React.FC<{ training: Training }> = ({ training }) => {
  const [task, setTask] = useState<TrainTask>('stand');
  const [speedMs, setSpeedMs] = useState(0.3);
  const [minutes, setMinutes] = useState<Minutes>('20');
  const settings = { task, setTask, speedMs, setSpeedMs, minutes, setMinutes };
  const busy = training.status === 'setup' || training.status === 'running';

  return (
    <Section title="Train">
      {busy ? <TrainProgress training={training} /> : <TrainSetup training={training} settings={settings} />}
    </Section>
  );
};
