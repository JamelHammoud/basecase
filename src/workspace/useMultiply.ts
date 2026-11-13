import { useRef, useState } from 'react';
import { stageCase, stagedEffectors } from '../cases/caseCast';
import { canReplay, MULTIPLY_COUNT, multiplySeeds, type MultiplyJob, type Variation } from '../cases/multiply';
import { startMultiply, type MultiplyRun } from '../cases/multiplyClient';
import type { Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import { canMultiply, generatedTry, lastSeed, sha256, withSources, type TryRecord } from '../cases/tries';
import { deleteRecording, loadRecording, saveRecording } from '../cases/tryStore';
import { rigForWorker } from '../sim/drive';
import type { Simulation } from '../sim/useSimulation';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import type { Setter, ShowToast } from './types';
import { EARLIER_DESIGN } from './useDatasetExport';

interface MultiplyOptions {
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  active: Case | null;
  partners: () => SlotRobot[];
  tries: TryRecord[];
  setProject: Setter<ProjectSettings>;
  showToast: ShowToast;
}

export interface Multiply {
  running: string | null;
  latest: TryRecord | null;
  multiply: (record: TryRecord) => void;
  stop: () => void;
  drop: (gone: (record: TryRecord) => boolean) => void;
  setCount: (count: number) => void;
}

const generatedText = (made: number) => `${made} generated`;

const newestFirst = (tries: TryRecord[]) => [...tries].sort((a, b) => b.at.localeCompare(a.at));

interface Current {
  source: TryRecord;
  added: string[];
  dropped: boolean;
}

export function useMultiply(options: MultiplyOptions): Multiply {
  const { sim, rig, parts, active, partners, tries, setProject, showToast } = options;
  const addTries = (records: TryRecord[]) =>
    setProject((p) => ({ ...p, tries: [...(p.tries ?? []), ...withSources(p.tries ?? [], records)] }));
  const markTried = (source: TryRecord, seed: number) =>
    setProject((p) => ({
      ...p,
      tries: (p.tries ?? []).map((t) =>
        t.id === source.id ? { ...t, multiplied: Math.max(t.multiplied ?? 0, seed) } : t,
      ),
    }));
  const [running, setRunning] = useState<string | null>(null);
  const run = useRef<MultiplyRun | null>(null);
  const busy = useRef(false);
  const count = useRef(MULTIPLY_COUNT);
  const current = useRef<Current | null>(null);

  const stop = () => run.current?.stop();

  const drop = (gone: (record: TryRecord) => boolean) => {
    const now = current.current;

    if (!now || !gone(now.source)) return;

    now.dropped = true;
    now.added.forEach((id) => void deleteRecording(id));
    stop();
  };

  const jobFor = async (kase: Case, record: TryRecord): Promise<MultiplyJob | null> => {
    const model = sim.model ?? (await sim.buildModel());
    const matches = record.manifest.modelHash === (await sha256(model.xml));
    const source = matches ? await loadRecording(record.id) : null;

    if (!source || !canReplay(source)) return null;

    const staged = stageCase(kase, { rig, parts }, partners());

    return { model, kase: staged.kase, source, rig: rigForWorker(rig), ...stagedEffectors(staged, { rig, parts }) };
  };

  const runFrom = async (kase: Case, now: Current) => {
    const record = now.source;
    const job = await jobFor(kase, record);

    if (now.dropped) return;

    if (!job) return showToast(EARLIER_DESIGN, { tone: 'error' });

    const used = lastSeed(tries, record);
    let tried = used;
    let made = 0;
    let saving = Promise.resolve();
    const progress = () =>
      showToast(generatedText(made), { tone: 'progress', action: { label: 'Stop', onClick: stop } });
    const keep = async (kept: Variation[], seeds: number[]) => {
      const records = kept.map((v) => generatedTry(record, v));

      tried = Math.max(tried, ...seeds);
      await Promise.all(records.map((r, i) => saveRecording(r.id, kept[i].recording)));

      if (now.dropped) return records.forEach((r) => void deleteRecording(r.id));

      now.added.push(...records.map((r) => r.id));
      made += records.length;

      if (records.length) addTries(records);

      if (run.current) progress();
    };

    run.current = startMultiply(job, multiplySeeds(used, count.current), {
      onKept: (kept, seeds) => (saving = saving.then(() => keep(kept, seeds))),
    });
    progress();
    await run.current.done;
    run.current = null;
    await saving;

    if (now.dropped) return showToast(generatedText(0));

    markTried(record, tried);
    showToast(generatedText(made));
  };

  const multiply = async (record: TryRecord) => {
    if (busy.current || !active || !canMultiply(record)) return;

    const now = { source: record, added: [], dropped: false };

    busy.current = true;
    current.current = now;
    setRunning(record.id);

    try {
      await runFrom(active, now);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), { tone: 'error' });
    } finally {
      busy.current = false;
      current.current = null;
      run.current = null;
      setRunning(null);
    }
  };

  return {
    running,
    latest: newestFirst(tries).find(canMultiply) ?? null,
    multiply: (record) => void multiply(record),
    stop,
    drop,
    setCount: (n) => {
      count.current = Math.max(1, Math.round(n));
    },
  };
}
