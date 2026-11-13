import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { castSlots, stageCase, type StagedCase } from '../cases/caseCast';
import { driveFor, slotIndexOf, toCommand } from '../cases/runCase';
import { worldItem, type Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import { scoreTry, tryManifest, type TryRecord } from '../cases/tries';
import { saveRecording } from '../cases/tryStore';
import type { RobotDrive } from '../sim/drive';
import type { DriveTeam } from '../sim/useDrive';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import { buildRig, type Rig } from '../utils/kinematics';

export type TryPhase = 'idle' | 'starting' | 'running' | 'scoring';

interface TryOptions {
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  active: Case | null;
  partners: () => SlotRobot[];
  onTry: (record: TryRecord) => void;
}

export interface CaseTry {
  phase: TryPhase;
  elapsed: number;
  start: () => Promise<void>;
  reference: () => Promise<void>;
  end: () => void;
}

const newTryId = () => `try-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function castOf(staged: StagedCase, scene: { rig: Rig; parts: ScenePart[] }) {
  const parts = [...scene.parts, ...staged.joined.parts];
  const rig = staged.guests.length ? buildRig([...scene.rig.joints, ...staged.joined.joints], parts) : scene.rig;

  return { rig, parts, slots: castSlots(staged.slots, { rig, parts, guests: staged.guests }) };
}

function teamFor(staged: StagedCase, scene: { rig: Rig; parts: ScenePart[] }, all: boolean): DriveTeam {
  const { rig, parts, slots } = castOf(staged, scene);
  const members = staged.slots.flatMap((slot, i) => {
    const setup: RobotDrive | null = i ? driveFor({ slot, cast: slots[i], rig, parts }) : null;

    return setup ? [{ slot: i, setup }] : [];
  });
  const driven = new Set([...(all ? [0] : []), ...members.map((m) => m.slot)]);
  const script = staged.kase.reference.timeline.flatMap((c) => {
    const slot = slotIndexOf(staged.kase, c);

    return driven.has(slot) ? [{ at: c.at, command: toCommand(c, slot) }] : [];
  });

  return { members, script };
}

export function useCaseTry({ sim, rig, parts, active, partners, onTry }: TryOptions): CaseTry {
  const [phase, setPhase] = useState<TryPhase>('idle');
  const [startedAt, setStartedAt] = useState(0);
  const finishing = useRef(false);
  const time = sim.stats?.time ?? 0;
  const elapsed = phase === 'running' ? Math.max(0, time - startedAt) : 0;

  const finish = async () => {
    if (finishing.current) return;

    finishing.current = true;

    const kase = active;
    const model = sim.model;
    const recording = await sim.stopRecording();

    setPhase('scoring');

    if (!kase || !model || !recording) {
      setPhase('idle');
      finishing.current = false;

      return;
    }

    const staged = stageCase(kase, { rig, parts }, partners());
    const cast = castOf(staged, { rig, parts });
    const effectors = Object.fromEntries(cast.slots.map((s) => [s.id, s.effector]));
    const scoring = { kase: staged.kase, model, recording, rig, effectors };
    const verdict = await scoreTry({ ...scoring, effector: cast.slots[0].effector });
    const id = newTryId();

    await saveRecording(id, recording);
    onTry({
      id,
      caseId: kase.id,
      robot: rig.robots[0]?.name ?? 'Robot',
      at: new Date().toISOString(),
      passed: verdict.passed,
      margin: verdict.margin,
      seconds: recording.frames * recording.dt,
      manifest: await tryManifest(staged.kase, model, recording),
    });
    sim.drive.stop();
    setPhase('idle');
    finishing.current = false;
  };

  const finishFromEffect = useEffectEvent(() => {
    void finish();
  });

  const running = phase === 'running';
  const outOfTime = running && !!active && elapsed >= active.task.seconds;
  const leftDrive = running && !sim.drive.active;

  useEffect(() => {
    if (!outOfTime && !leftDrive) return;

    const soon = setTimeout(finishFromEffect, 0);

    return () => clearTimeout(soon);
  }, [outOfTime, leftDrive]);

  const begin = async (all: boolean) => {
    if (!active || phase !== 'idle') return;

    setPhase('starting');

    const staged = stageCase(active, { rig, parts }, partners());

    if (staged.slots.length > 1) sim.setWorld(staged.kase.world.objects.map(worldItem), staged.joined);

    if (!(await sim.drive.start(teamFor(staged, { rig, parts }, all)))) {
      setPhase('idle');

      return;
    }

    setStartedAt(sim.stats?.time ?? 0);
    sim.record();
    setPhase('running');
  };

  return { phase, elapsed, start: () => begin(false), reference: () => begin(true), end: () => void finish() };
}
