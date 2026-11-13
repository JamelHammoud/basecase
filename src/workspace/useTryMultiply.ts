import { useRef, useState } from 'react';
import { stageCase, stagedEffectors } from '../cases/caseCast';
import { multiplyPool } from '../cases/caseChecksClient';
import type { Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import { generatedFrom, generatedTry, multipliable, sha256, type TryRecord, type TryScoring } from '../cases/tries';
import { loadRecording, saveRecording } from '../cases/tryStore';
import type { Variation } from '../cases/tryReplay';
import { rigForWorker } from '../sim/drive';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import { errorMessage } from '../utils/errorMessage';
import type { Rig } from '../utils/kinematics';
import type { ShowToast } from './types';
import { EARLIER_DESIGN } from './useDatasetExport';

export const MULTIPLY_RUNS = 50;

const BATCH = 5;
const TAG = 'multiply';

interface MultiplyOptions {
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  active: Case | null;
  tries: TryRecord[];
  partners: () => SlotRobot[];
  onTries: (records: TryRecord[]) => void;
  showToast: ShowToast;
}

export interface MultiplyProgress {
  source: string;
  done: number;
  total: number;
}

export interface TryMultiply {
  running: MultiplyProgress | null;
  latest: TryRecord | null;
  can: (record: TryRecord) => boolean;
  multiply: (record: TryRecord) => void;
  stop: () => void;
  setRuns: (runs: number) => void;
}

const batchesOf = (seeds: number[]) =>
  Array.from({ length: Math.ceil(seeds.length / BATCH) }, (_, i) => seeds.slice(i * BATCH, (i + 1) * BATCH));

const nextSeed = (tries: TryRecord[], source: TryRecord) =>
  Math.max(0, ...generatedFrom(tries, source).map((t) => t.manifest.seed)) + 1;

const keptText = (kept: number, tried: number) => `Kept ${kept} of ${tried} variations`;

export function useTryMultiply(options: MultiplyOptions): TryMultiply {
  const { sim, rig, parts, active, tries, partners, onTries, showToast } = options;
  const [running, setRunning] = useState<MultiplyProgress | null>(null);
  const [runs, setRuns] = useState(MULTIPLY_RUNS);
  const stopped = useRef(true);
  const sources = tries.filter(multipliable);
  const latest = running ? null : ([...sources].sort((a, b) => b.at.localeCompare(a.at))[0] ?? null);

  const sourceOf = async (record: TryRecord, kase: Case): Promise<TryScoring | null> => {
    const model = sim.model ?? (await sim.buildModel());
    const recording = (await sha256(model.xml)) === record.manifest.modelHash ? await loadRecording(record.id) : null;

    if (!recording?.commands) return null;

    const staged = stageCase(kase, { rig, parts }, partners());

    return {
      kase: staged.kase,
      model,
      recording,
      rig: rigForWorker(rig),
      ...stagedEffectors(staged, { rig, parts }),
    };
  };

  const keep = async (record: TryRecord, kept: Variation[]) => {
    const made = kept.map((v) =>
      generatedTry({
        source: record,
        manifest: record.manifest,
        seed: v.seed ?? 0,
        margin: v.margin,
        recording: v.recording,
      }),
    );

    await Promise.all(made.map((t, i) => saveRecording(t.id, kept[i].recording)));

    if (made.length) onTries(made);
  };

  const run = async (record: TryRecord, kase: Case) => {
    if (!stopped.current) return;

    stopped.current = false;

    const source = await sourceOf(record, kase).catch((err: unknown) => errorMessage(err));

    if (!source || typeof source === 'string') {
      stopped.current = true;
      showToast(source || EARLIER_DESIGN, { tone: 'error' });

      return;
    }

    const first = nextSeed(tries, record);
    const seeds = Array.from({ length: runs }, (_, i) => first + i);
    let done = 0;
    let kept = 0;

    setRunning({ source: record.id, done, total: runs });
    showToast('Multiplying…', { tone: 'progress', action: { label: 'Stop', onClick: stop } });

    try {
      await Promise.all(
        batchesOf(seeds).map(async (batch, i) => {
          const reply = await multiplyPool.run(i, { type: 'multiply', source, seeds: batch }, { tag: TAG });

          if (stopped.current) return;

          await keep(record, reply.result.kept);
          done += reply.result.tried;
          kept += reply.result.kept.length;
          setRunning({ source: record.id, done, total: runs });
        }),
      );
      showToast(keptText(kept, done));
    } catch (err) {
      if (!stopped.current) showToast(errorMessage(err), { tone: 'error' });
      else showToast(keptText(kept, done));
    } finally {
      stopped.current = true;
      setRunning(null);
    }
  };

  function stop() {
    if (stopped.current) return;

    stopped.current = true;
    multiplyPool.keepOnly(new Set());
  }

  return {
    running,
    latest,
    can: (record) => !running && multipliable(record),
    multiply: (record) => {
      if (active && !running && multipliable(record)) void run(record, active);
    },
    stop,
    setRuns: (n) => setRuns(Math.max(1, Math.round(n))),
  };
}
