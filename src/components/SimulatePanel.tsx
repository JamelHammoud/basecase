import React, { useMemo, useRef, useState } from 'react';
import { Hand, Pause, Play, RotateCcw, Square, Trash2, X } from 'lucide-react';
import {
  Button,
  ContextMenu,
  ContextMenuEntry,
  IconButton,
  NumberInput,
  Section,
  SegmentedControl,
  Select,
  useScrollFade,
} from '../design-system';
import type { PolicyRecord, RobotAnimation } from '../types/robotics';
import type { Controller } from '../sim/engine';
import type { Simulation } from '../sim/useSimulation';
import type { Training, TrainOptions } from '../sim/useTraining';
import type { TrainTask } from '../sim/policy';
import { prettyJointName, type Rig } from '../utils/kinematics';

interface SimulatePanelProps {
  sim: Simulation;
  training: Training;
  rig: Rig;
  animations: RobotAnimation[];
  policies: PolicyRecord[];
  /** Selects a joint's link on the canvas */
  onSelectParts: (ids: string[]) => void;
  onDeletePolicy: (id: string) => void;
}

const fmtTime = (t: number) => `${t.toFixed(1)} s`;
const pct = (u: number) => `${Math.round(Math.min(u, 1) * 100)}%`;
const fmtSteps = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

/** The Simulate tab: run the robot under MuJoCo physics, see what failed, and train policies */
export const SimulatePanel: React.FC<SimulatePanelProps> = ({ sim, training, rig, animations, policies, onSelectParts, onDeletePolicy }) => {
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();
  const on = sim.status !== 'off';
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);

  const controlKey = (c: Controller) =>
    c.kind === 'animation' ? `anim:${c.animation.id}` : c.kind === 'policy' ? `policy:${c.policy.createdAt}` : c.kind;
  const [policyKey, setPolicyKey] = useState<string | null>(null);
  const current = sim.controller.kind === 'policy' && policyKey ? `policy:${policyKey}` : sim.controller.kind === 'policy' ? '' : controlKey(sim.controller);
  const options = [
    { value: 'hold', label: 'Hold pose' },
    ...animations.map((a) => ({ value: `anim:${a.id}`, label: a.name })),
    ...policies.map((p) => ({ value: `policy:${p.id}`, label: p.name })),
    { value: 'limp', label: 'Limp' },
  ];
  const choose = async (value: string) => {
    if (value === 'hold' || value === 'limp') {
      setPolicyKey(null);
      sim.setController({ kind: value });
    } else if (value.startsWith('anim:')) {
      const a = animations.find((x) => `anim:${x.id}` === value);
      setPolicyKey(null);
      if (a) sim.setController({ kind: 'animation', animation: a });
    } else if (value.startsWith('policy:')) {
      const id = value.slice(7);
      const rec = policies.find((p) => p.id === id);
      const spec = rec ? await training.loadPolicy(id) : null;
      if (rec && spec) {
        setPolicyKey(id);
        sim.setController({ kind: 'policy', policy: spec, robot: rec.robot });
      }
    }
    if (on) sim.reset();
  };

  const worst = useMemo(
    () =>
      (sim.stats?.joints ?? [])
        .filter((j) => j.peak > 0.05)
        .sort((a, b) => b.peak - a.peak || b.saturatedS - a.saturatedS)
        .slice(0, 6),
    [sim.stats]
  );
  const linkOf = (jointId: string) => [...rig.ownerOf].filter(([, owner]) => owner === jointId).map(([p]) => p);
  const estimated = sim.model?.joints.filter((j) => j.effortSource === 'estimate').length ?? 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Transport: Simulate, then play/pause, reset, time and speed while it runs */}
      <div className="shrink-0 px-[12px] pt-1 pb-3">
        {!on ? (
          <Button variant="primary" size="md" fullWidth icon={<Play className="w-4 h-4" />} onClick={() => void sim.start()}>
            Simulate
          </Button>
        ) : (
          <div className="flex items-center gap-1.5 h-9">
            <IconButton
              icon={sim.playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              title={sim.playing ? 'Pause' : 'Play'}
              size="sm"
              disabled={sim.status !== 'ready'}
              onClick={() => (sim.playing ? sim.pause() : sim.play())}
            />
            <IconButton icon={<RotateCcw className="w-4 h-4" />} title="Reset" size="sm" disabled={sim.status !== 'ready'} onClick={sim.reset} />
            <div className="flex-1 min-w-0 pl-1 text-[13px] tabular text-white/80">
              {sim.status === 'loading' ? <span className="text-white/50">Loading</span> : fmtTime(sim.stats?.time ?? 0)}
              {sim.playing && sim.stats && sim.stats.rtf < 0.9 && <span className="ml-2 text-[12px] text-white/40">{sim.stats.rtf.toFixed(1)}× real time</span>}
            </div>
            <SegmentedControl
              size="sm"
              value={String(sim.speed)}
              onChange={(v) => sim.setSpeed(Number(v))}
              options={[
                { value: '0.25', label: '¼×' },
                { value: '0.5', label: '½×' },
                { value: '1', label: '1×' },
              ]}
            />
            <IconButton icon={<X className="w-4 h-4" />} title="End simulation" size="sm" onClick={sim.stop} />
          </div>
        )}
        {sim.error && <p className="mt-2 text-[12.5px] leading-snug text-[#f87171]">{sim.error}</p>}
      </div>

      <div ref={setFadeEl} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <Section title="Control">
          <div className="flex items-center gap-2">
            <Select aria-label="Controller" value={current} options={options} onChange={(e) => void choose(e.target.value)} />
            <Button variant="secondary" size="sm" icon={<Hand className="w-4 h-4" />} disabled={!sim.playing} title="Push the robot sideways" onClick={() => sim.push()}>
              Push
            </Button>
          </div>
        </Section>

        {on && sim.stats && sim.model && (
          <Section title="Result">
            {sim.stats.robots.map((r) => {
              const robot = sim.model!.robots.find((x) => x.key === r.key);
              if (!robot?.floating) return null;
              return (
                <div key={r.key} className="py-1">
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="text-white/85 truncate">{robot.name}</span>
                    <span className={r.fellAt !== null ? 'text-[#f87171]' : 'text-white/70'}>{r.fellAt !== null ? `Fell at ${fmtTime(r.fellAt)}` : 'Standing'}</span>
                  </div>
                  <div className="text-[12px] text-white/45 tabular">
                    Tilt {Math.round(r.tilt)}° · moved {(r.travelled * 100).toFixed(0)} cm
                  </div>
                </div>
              );
            })}
            {worst.length > 0 && (
              <div className="mt-2">
                <div className="text-[12px] text-white/45 mb-1">Peak torque</div>
                {worst.map((j) => {
                  const joint = rig.byId.get(j.id);
                  return (
                    <button
                      key={j.id}
                      type="button"
                      className="w-full h-8 -mx-[6px] px-[6px] rounded-md flex items-center gap-2 text-left hover:bg-white/[0.05] cursor-default"
                      onClick={() => onSelectParts(linkOf(j.id))}
                    >
                      <span className="flex-1 min-w-0 truncate text-[13px] text-white/80">{prettyJointName(joint?.name ?? j.id)}</span>
                      {j.saturatedS > 0.05 && <span className="text-[12px] text-white/40 tabular">{fmtTime(j.saturatedS)} at limit</span>}
                      <span className={`w-10 text-right text-[13px] tabular ${j.peak >= 0.98 ? 'text-[#f87171]' : 'text-white/70'}`}>{pct(j.peak)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Section>
        )}

        {sim.model && (
          <Section title="Model">
            <div className="text-[13px] text-white/70 tabular">
              {sim.model.joints.length} {sim.model.joints.length === 1 ? 'joint' : 'joints'} ·{' '}
              {Object.values(sim.model.massKg)
                .reduce((s, v) => s + v, 0)
                .toFixed(2)}{' '}
              kg
            </div>
            {estimated > 0 && (
              <p className="mt-1 text-[12.5px] leading-snug text-white/45">
                Torque for {estimated} {estimated === 1 ? 'joint is' : 'joints is'} estimated from weight. Assign servos for exact limits.
              </p>
            )}
            {sim.model.warnings.map((w) => (
              <p key={w} className="mt-1 text-[12.5px] leading-snug text-white/45">
                {w}
              </p>
            ))}
            {sim.version && <p className="mt-1 text-[12px] text-white/35">MuJoCo {sim.version}</p>}
          </Section>
        )}

        <TrainSection training={training} />

        {policies.length > 0 && (
          <Section title="Policies">
            {policies.map((p) => (
              <div
                key={p.id}
                className="h-9 flex items-center gap-2 -mx-[6px] px-[6px] rounded-md hover:bg-white/[0.04]"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, items: [{ label: 'Delete', tone: 'danger', onSelect: () => onDeletePolicy(p.id) }] });
                }}
              >
                <button type="button" className="flex-1 min-w-0 text-left text-[13px] text-white/85 truncate cursor-default" onClick={() => void choose(`policy:${p.id}`)}>
                  {p.name}
                </button>
                <span className="text-[12px] text-white/40 tabular shrink-0">{fmtSteps(p.trainedSteps)} steps</span>
                <IconButton icon={<Trash2 className="w-4 h-4" />} title="Delete policy" size="xs" variant="ghost" onClick={() => onDeletePolicy(p.id)} />
              </div>
            ))}
          </Section>
        )}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
};

const MINUTES = ['5', '20', '60'] as const;

/** Training: task, budget, Train; then live progress and a reward curve */
const TrainSection: React.FC<{ training: Training }> = ({ training }) => {
  const [task, setTask] = useState<TrainTask>('stand');
  const [speedMs, setSpeedMs] = useState(0.3);
  const [minutes, setMinutes] = useState<(typeof MINUTES)[number]>('20');
  const busy = training.status === 'setup' || training.status === 'running';
  const p = training.progress;
  const curveRef = useRef<SVGSVGElement | null>(null);
  const start = () => {
    const opts: TrainOptions = { task, minutes: Number(minutes), command: task === 'walk' ? [speedMs, 0, 0] : [0, 0, 0] };
    void training.start(opts);
  };
  const curve = training.curve;
  const path = useMemo(() => {
    if (curve.length < 2) return '';
    const lo = Math.min(...curve), hi = Math.max(...curve);
    const span = hi - lo || 1;
    return curve.map((v, i) => `${i ? 'L' : 'M'}${((i / (curve.length - 1)) * 100).toFixed(2)},${(36 - ((v - lo) / span) * 32 - 2).toFixed(2)}`).join(' ');
  }, [curve]);

  return (
    <Section title="Train">
      {!busy ? (
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
                <NumberInput value={speedMs} min={0.05} max={2} step={0.05} precision={2} unit="m/s" onChange={(v) => setSpeedMs(v)} />
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
          {training.status === 'error' && training.error && <p className="text-[12.5px] leading-snug text-[#f87171]">{training.error}</p>}
          {training.status === 'done' && training.message && <p className="text-[12.5px] leading-snug text-white/55">{training.message}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <span className="text-white/80 truncate">{training.message ?? 'Training'}</span>
            <IconButton icon={<Square className="w-3.5 h-3.5" />} title="Stop training" size="xs" onClick={training.stop} />
          </div>
          {p && (
            <>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full bg-[#0d99ff] transition-[width] duration-300" style={{ width: `${Math.min(100, (p.elapsedS / p.budgetS) * 100)}%` }} />
              </div>
              <div className="flex justify-between text-[12px] text-white/45 tabular">
                <span>{fmtSteps(p.steps)} steps · {fmtSteps(Math.round(p.fps))}/s</span>
                <span>Reward {p.reward.toFixed(2)}</span>
              </div>
            </>
          )}
          {path && (
            <svg ref={curveRef} viewBox="0 0 100 36" preserveAspectRatio="none" className="w-full h-12" aria-label="Reward over training">
              <path d={path} fill="none" stroke="#0d99ff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
        </div>
      )}
    </Section>
  );
};
