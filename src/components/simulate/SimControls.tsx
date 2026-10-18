import React from 'react';
import { Pause, Play, RotateCcw, X } from 'lucide-react';
import { Button, IconButton, SegmentedControl } from '../../design-system';
import type { Simulation } from '../../sim/useSimulation';
import { fmtTime } from './format';

const SPEEDS = [
  { value: '0.25', label: '¼×' },
  { value: '0.5', label: '½×' },
  { value: '1', label: '1×' },
];

const RunningControls: React.FC<{ sim: Simulation }> = ({ sim }) => (
  <div className="flex items-center gap-1.5 h-9">
    <IconButton
      icon={sim.playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      title={sim.playing ? 'Pause' : 'Play'}
      size="sm"
      disabled={sim.status !== 'ready'}
      onClick={() => (sim.playing ? sim.pause() : sim.play())}
    />
    <IconButton
      icon={<RotateCcw className="w-4 h-4" />}
      title="Reset"
      size="sm"
      disabled={sim.status !== 'ready'}
      onClick={sim.reset}
    />
    <div className="flex-1 min-w-0 pl-1 text-[13px] tabular text-white/80">
      {sim.status === 'loading' ? <span className="text-white/50">Loading</span> : fmtTime(sim.stats?.time ?? 0)}
      {sim.playing && sim.stats && sim.stats.rtf < 0.9 && (
        <span className="ml-2 text-[12px] text-white/40">{sim.stats.rtf.toFixed(1)}× real time</span>
      )}
    </div>
    <SegmentedControl size="sm" value={String(sim.speed)} onChange={(v) => sim.setSpeed(Number(v))} options={SPEEDS} />
    <IconButton icon={<X className="w-4 h-4" />} title="End simulation" size="sm" onClick={sim.stop} />
  </div>
);

export const SimControls: React.FC<{ sim: Simulation; on: boolean }> = ({ sim, on }) => (
  <div className="shrink-0 px-[12px] pt-1 pb-3">
    {on ? (
      <RunningControls sim={sim} />
    ) : (
      <Button
        variant="primary"
        size="md"
        fullWidth
        icon={<Play className="w-4 h-4" />}
        onClick={() => void sim.start()}
      >
        Simulate
      </Button>
    )}
    {sim.error && <p className="mt-2 text-[12.5px] leading-snug text-[#f87171]">{sim.error}</p>}
  </div>
);
