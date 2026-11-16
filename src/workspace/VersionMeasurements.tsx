import type { Comparison } from '../cases/caseCompare';
import type { Readiness } from '../readiness/types';
import { useMoney } from '../utils/useMoney';
import { weight } from '../utils/weight';
import { plural } from '../../electron/plural.mjs';

interface Measured {
  name: string;
  design: string;
  readiness: Readiness | null;
  costUsd: number;
  massG: number;
}

export function VersionMeasurements({
  metrics,
  kase,
  caseName,
}: {
  metrics: Measured[];
  kase: Comparison | null;
  caseName: string;
}) {
  const money = useMoney();

  return (
    <div className="flex flex-col gap-3">
      {kase && <span className="text-[13px] text-white/90">{caseName}</span>}
      {metrics.map((metric, index) => (
        <div key={`${index}:${metric.design}`} className="flex flex-col gap-1 text-[13px] text-white/60">
          <span className="text-white/90">{metric.name}</span>
          <code className="text-[12px] break-all">{metric.design}</code>
          <div className="flex gap-3 tabular">
            <span>{money.format(metric.costUsd)}</span>
            <span>{weight(metric.massG)}</span>
            {metric.readiness && <span>{plural(metric.readiness.blockers.length, 'blocker')}</span>}
          </div>
          {metric.readiness?.blockers.map((finding) => (
            <span key={finding.key}>{finding.text}</span>
          ))}
          {kase?.robots[index] && (
            <span>
              {kase.robots[index].runs.refusal ??
                `${kase.robots[index].runs.passes} of ${kase.robots[index].runs.runs}`}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
