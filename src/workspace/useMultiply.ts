import { useRef, useState } from 'react';
import { stageCase, stagedEffectors } from '../cases/caseCast';
import { canReplay, MULTIPLY_COUNT, multiplySeeds, type MultiplyJob } from '../cases/multiply';
import { startMultiply } from '../cases/multiplyClient';
import { multiplySession, type MultiplySession } from '../cases/multiplySession';
import type { Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import { canMultiply, lastSeed, sha256, withSources, type TryRecord } from '../cases/tries';
import { deleteRecording, loadRecording, saveRecording } from '../cases/tryStore';
import { rigForWorker } from '../sim/drive';
import type { Simulation } from '../sim/useSimulation';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { errorMessage } from '../utils/errorMessage';
import { plural } from './helpers';
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
  dismissToast: () => void;
}

export interface Multiply {
  running: string | null;
  latest: TryRecord | null;
  multiply: (record: TryRecord) => void;
  stop: () => void;
  drop: (gone: (record: TryRecord) => boolean) => void;
  setCount: (count: number) => void;
}

const newestFirst = (tries: TryRecord[]) => [...tries].sort((a, b) => b.at.localeCompare(a.at));

const RECORDINGS = { save: saveRecording, remove: deleteRecording };

interface Current {
  source: TryRecord;
  session: MultiplySession | null;
  dropped: boolean;
}

export function useMultiply(options: MultiplyOptions): Multiply {
  const { sim, rig, parts, active, partners, tries, setProject, showToast, dismissToast } = options;
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
  const busy = useRef(false);
  const count = useRef(MULTIPLY_COUNT);
  const current = useRef<Current | null>(null);

  const stop = () => current.current?.session?.stop();

  const drop = (gone: (record: TryRecord) => boolean) => {
    const now = current.current;

    if (!now || !gone(now.source)) return;

    now.dropped = true;
    now.session?.drop();
    dismissToast();
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

    const after = lastSeed(tries, record);
    const total = count.current;
    const progress = (ran: number) =>
      showToast(`Running ${ran} of ${total}…`, { tone: 'progress', action: { label: 'Stop', onClick: stop } });

    now.session = multiplySession({
      source: record,
      job,
      batches: multiplySeeds(after, total),
      after,
      start: startMultiply,
      store: RECORDINGS,
      onTries: addTries,
      onProgress: progress,
    });
    progress(0);

    const { made, tried, dropped } = await now.session.done;

    if (dropped) return;

    markTried(record, tried);
    showToast(`Generated ${plural(made, 'try', 'tries')}`);
  };

  const multiply = async (record: TryRecord) => {
    if (busy.current || !active || !canMultiply(record)) return;

    const now: Current = { source: record, session: null, dropped: false };

    busy.current = true;
    current.current = now;
    setRunning(record.id);

    try {
      await runFrom(active, now);
    } catch (err) {
      showToast(errorMessage(err), { tone: 'error' });
    } finally {
      busy.current = false;
      current.current = null;
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
