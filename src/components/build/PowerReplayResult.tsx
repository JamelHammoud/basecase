import { useState } from 'react';
import { Button, FieldRow, Select, TracePlot } from '../../design-system';
import type { PowerReplayRecord } from '../../wiring/powerReplayTypes';
import type { ScenePart } from '../../types/robotics';
import { ReplayResultControls } from './ReplayResultControls';
import { runClock } from '../../utils/duration';

interface Props {
  baseline: PowerReplayRecord;
  comparison?: PowerReplayRecord;
  parts: ScenePart[];
  onSelectParts: (ids: string[]) => void;
}

export function PowerReplayResult({ baseline, comparison, parts, onSelectParts }: Props) {
  const latest = comparison ?? baseline;
  const [selected, setSelected] = useState(latest.result.limiting.partId);
  const [sample, setSample] = useState(latest.result.limiting.sample);
  const endpoint = latest.result.endpoints.find((entry) => entry.partId === selected) ?? latest.result.endpoints[0];
  const channel = latest.trace.channels.find((entry) => entry.actuatorIds[0] === endpoint.partId);
  const previous = baseline.result.endpoints.find((entry) => entry.partId === endpoint.partId)!;
  const trace = baseline.traceFingerprint;
  const x = endpoint.volts.map((_, index) => index * baseline.trace.windowS);
  const names = new Map(parts.map((part) => [part.id, part.name]));
  const select = (id: string, time: number) => {
    setSelected(id);
    setSample(time);
    onSelectParts([id]);
  };
  const limit = latest.result.limiting;

  return (
    <div
      data-replay-selection={endpoint.partId}
      data-replay-time={sample * baseline.trace.windowS}
      className="space-y-3 text-[13px] text-white/90"
    >
      <FieldRow label="Baseline">
        <p
          data-replay-result
          data-part={baseline.result.limiting.partId}
          data-time={baseline.result.limiting.timeS}
          data-volts={baseline.result.limiting.volts}
          data-trace={trace}
          className="tabular-nums"
        >
          {baseline.result.limiting.volts.toFixed(3)} V
        </p>
      </FieldRow>
      {comparison && (
        <FieldRow label="Comparison">
          <p
            data-replay-comparison
            data-volts={limit.volts}
            data-trace={comparison.traceFingerprint}
            className="tabular-nums text-figma-blue"
          >
            {limit.volts.toFixed(3)} V
          </p>
        </FieldRow>
      )}
      {latest.result.limit && (
        <p role="alert" className="text-white/60">
          Model limit at {runClock(latest.result.limit.sample * latest.trace.windowS)}: {latest.result.limit.reason}
        </p>
      )}
      <Button variant="secondary" onClick={() => select(limit.partId, limit.sample)}>
        Select Lowest Voltage
      </Button>
      <FieldRow label="Endpoint">
        <Select
          aria-label="Endpoint"
          value={endpoint.partId}
          options={latest.result.endpoints.map((entry) => ({
            value: entry.partId,
            label: names.get(entry.partId) ?? entry.partId,
          }))}
          onChange={(e) => select(e.target.value, sample)}
        />
      </FieldRow>
      <p className="tabular-nums">
        {endpoint.volts[sample]?.toFixed(3)} V at {runClock(sample * latest.trace.windowS)}
      </p>
      {channel && (
        <TracePlot
          traces={[{ id: channel.jointId, values: channel.amps, x, tone: 'primary' }]}
          units={{ x: 's', y: 'A' }}
          playhead={sample}
          onSeek={setSample}
        />
      )}
      <TracePlot
        traces={[
          { id: 'baseline', values: previous.volts, x, tone: 'muted' },
          { id: 'current', values: endpoint.volts, x, tone: 'accent' },
        ]}
        units={{ x: 's', y: 'V' }}
        playhead={sample}
        onSeek={(index) => setSample(index)}
      />
      <FieldRow label="Resistive loss">
        <p className="text-white/60 tabular-nums">{latest.result.lossW[sample]?.toFixed(3)} W</p>
      </FieldRow>
      <ReplayResultControls record={latest} sample={sample} onSelectParts={onSelectParts} />
    </div>
  );
}
