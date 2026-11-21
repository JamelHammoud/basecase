import { useEffect, useRef, useState } from 'react';
import { electricalClient } from '../../wiring/electricalClient';
import { electricalSnapshot } from '../../wiring/electricalSnapshot';
import { freshWalk } from '../../workspace/storedWalk';
import type { ElectricalInput } from '../../wiring/electricalTypes';
import type { ProjectSettings, ScenePart } from '../../types/robotics';
import type { ReplayDeclarations } from '../../wiring/powerReplayTypes';
import { errorMessage } from '../../utils/errorMessage';

type Inspection = ReturnType<typeof import('../../wiring/electricalInspection').inspectReplayInput>;

interface Loaded {
  inspection: Inspection;
  form: ReplayDeclarations;
  applicable: boolean;
  parts: ScenePart[];
  project: ProjectSettings;
}

interface Props {
  parts: ScenePart[];
  project: ProjectSettings;
  onChangeProject: (patch: Partial<ProjectSettings>) => void;
}

function initialDeclarations(inspection: Inspection): ReplayDeclarations {
  return {
    source: {
      volts: inspection.sourceVolts ?? NaN,
      ohms: NaN,
      evidence: '',
      temperatureC: NaN,
      maximumA: NaN,
      minimumV: NaN,
    },
    junctionEvidence: '',
    cables: inspection.cables.map((cable) => ({
      id: cable.id,
      outgoingOhms: NaN,
      returnOhms: NaN,
      temperatureC: NaN,
      evidence: '',
    })),
    fixedLoads: Object.fromEntries(inspection.loads.map((load) => [load.id, { amps: NaN, evidence: '' }])),
  };
}

export function usePowerReplay({ parts, project, onChangeProject }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const job = useRef<{
    client: ReturnType<typeof electricalClient>;
    input: ElectricalInput;
    cancelled: boolean;
    running: boolean;
  } | null>(null);
  const retained = project.powerReplay;

  useEffect(() => {
    const client = electricalClient();
    const input = { ...electricalSnapshot({ parts, project }), walk: freshWalk(parts, project) };
    const active = { client, input, cancelled: false, running: false };

    job.current = active;

    const load = async () => {
      const inspection = await client.call('inspectReplay', retained?.baseline.input ?? input);
      const evidence = retained
        ? await client.call('reopenReplay', { record: retained.baseline, current: input })
        : null;

      if (retained?.comparison)
        await client.call('reopenReplay', { record: retained.comparison, current: input, baseline: retained.baseline });

      if (active.cancelled) return;

      setError('');
      setRunning(false);
      setLoaded({
        parts,
        project,
        inspection,
        form: structuredClone(
          retained?.comparison?.declarations ?? retained?.baseline.declarations ?? initialDeclarations(inspection),
        ),
        applicable: evidence?.applicable ?? true,
      });
    };

    void load().catch((failure: unknown) => {
      if (!active.cancelled) setError(errorMessage(failure));
    });

    return () => {
      active.cancelled = true;
      client.dispose();
    };
  }, [parts, project, retained]);

  const run = async () => {
    const active = job.current;

    if (!loaded || !active || active.cancelled || active.running || !loaded.applicable) return;

    active.running = true;
    setRunning(true);
    setError('');

    try {
      const record = await active.client.call('replay', {
        input: active.input,
        trace: retained?.baseline.trace ?? loaded.inspection.trace,
        declarations: loaded.form,
      });

      if (active.cancelled) return;

      onChangeProject({
        powerReplay: retained ? { baseline: retained.baseline, comparison: record } : { baseline: record },
      });
    } catch (failure) {
      if (!active.cancelled) setError(errorMessage(failure));
    } finally {
      active.running = false;

      if (!active.cancelled) setRunning(false);
    }
  };
  const cancel = () => {
    const active = job.current;

    if (!active) return;

    active.cancelled = true;
    active.client.dispose();
    setRunning(false);
  };

  return {
    loaded: loaded?.parts === parts && loaded.project === project ? loaded : null,
    error,
    running,
    run,
    cancel,
    setForm: (form: ReplayDeclarations) => setLoaded((current) => current && { ...current, form }),
  };
}
