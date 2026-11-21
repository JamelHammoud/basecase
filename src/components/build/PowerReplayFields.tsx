import { FieldRow, TextInput } from '../../design-system';
import type { ReplayCable, ReplayDeclarations } from '../../wiring/powerReplayTypes';
import { ReplayResistanceFields } from './ReplayResistanceFields';

interface Props {
  declarations: ReplayDeclarations;
  cables: ReplayCable[];
  loads: Array<{ id: string; name: string }>;
  onChange: (declarations: ReplayDeclarations) => void;
}

export function PowerReplayFields({ declarations: form, cables, loads, onChange }: Props) {
  const source = (patch: Partial<ReplayDeclarations['source']>) =>
    onChange({ ...form, source: { ...form.source, ...patch } });
  const number = (label: string, key: 'ohms' | 'temperatureC' | 'maximumA' | 'minimumV') => (
    <FieldRow group label={label}>
      <TextInput
        aria-label={label}
        type="number"
        step="any"
        inputMode="decimal"
        value={Number.isFinite(form.source[key]) ? form.source[key] : ''}
        onChange={(e) => source({ [key]: e.target.value.trim() ? Number(e.target.value) : NaN })}
      />
    </FieldRow>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-[13px] text-white/90 tabular-nums">{form.source.volts} V</p>
        {number('Source resistance (Ω)', 'ohms')}
        {number('Temperature (°C)', 'temperatureC')}
        {number('Maximum current (A)', 'maximumA')}
        {number('Minimum voltage (V)', 'minimumV')}
        <FieldRow group label="Source evidence">
          <TextInput
            aria-label="Source evidence"
            value={form.source.evidence}
            onChange={(e) => source({ evidence: e.target.value })}
          />
        </FieldRow>
        <FieldRow group label="Junction evidence">
          <TextInput
            aria-label="Junction evidence"
            value={form.junctionEvidence}
            onChange={(e) => onChange({ ...form, junctionEvidence: e.target.value })}
          />
        </FieldRow>
      </div>
      {cables.map((cable) => (
        <div key={cable.id} data-replay-cable={cable.id} className="space-y-2">
          <p className="text-[13px] text-white/90">{cable.name}</p>
          <ReplayResistanceFields
            value={form.cables.find((entry) => entry.id === cable.id)!}
            onChange={(patch) =>
              onChange({
                ...form,
                cables: form.cables.map((entry) => (entry.id === cable.id ? { ...entry, ...patch } : entry)),
              })
            }
          />
        </div>
      ))}
      {loads.map((load) => (
        <div key={load.id} className="space-y-2">
          <p className="text-[13px] text-white/90">{load.name}</p>
          <FieldRow group label="Load current (A)">
            <TextInput
              aria-label="Load current (A)"
              type="number"
              step="any"
              inputMode="decimal"
              value={Number.isFinite(form.fixedLoads[load.id]?.amps) ? form.fixedLoads[load.id].amps : ''}
              onChange={(e) =>
                onChange({
                  ...form,
                  fixedLoads: {
                    ...form.fixedLoads,
                    [load.id]: {
                      ...form.fixedLoads[load.id],
                      amps: e.target.value.trim() ? Number(e.target.value) : NaN,
                    },
                  },
                })
              }
            />
          </FieldRow>
          <FieldRow group label="Load evidence">
            <TextInput
              aria-label="Load evidence"
              value={form.fixedLoads[load.id]?.evidence ?? ''}
              onChange={(e) =>
                onChange({
                  ...form,
                  fixedLoads: {
                    ...form.fixedLoads,
                    [load.id]: { ...form.fixedLoads[load.id], evidence: e.target.value },
                  },
                })
              }
            />
          </FieldRow>
        </div>
      ))}
    </div>
  );
}
