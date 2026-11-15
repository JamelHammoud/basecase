import { FieldRow, Select, Tooltip } from '../../design-system';
import type { StudyRow } from '../../study/types';
import { useMoney } from '../../utils/useMoney';
import { metricText, metricValue, STUDY_METRICS, type StudyMetric } from './studyView';

interface StudyPlotProps {
  rows: StudyRow[];
  axes: [StudyMetric, StudyMetric, StudyMetric];
  onAxis: (axis: number, metric: StudyMetric) => void;
  compared: string[];
  frontier: string[];
  onPreview: (row: StudyRow | null) => void;
  onPick: (row: StudyRow, shift: boolean) => void;
}

const metricLabel = (metric: StudyMetric) => STUDY_METRICS.find((m) => m.value === metric)!.label;

const normalized = (value: number, values: number[]) => {
  const low = Math.min(...values);
  const span = Math.max(...values) - low;

  return span === 0 ? 0.5 : (value - low) / span;
};

export function StudyPlot({ rows, axes, onAxis, compared, frontier, onPreview, onPick }: StudyPlotProps) {
  const money = useMoney();
  const points = rows.flatMap((row) => {
    const x = metricValue(row, axes[0]);
    const y = metricValue(row, axes[1]);
    const color = metricValue(row, axes[2]);

    return x === undefined || y === undefined ? [] : [{ row, x, y, color }];
  });
  const colors = points.flatMap((p) => p.color ?? []);

  return (
    <div className="flex flex-col gap-2 mb-3" data-testid="study-plot">
      {(['Horizontal', 'Vertical', 'Color'] as const).map((label, i) => (
        <FieldRow key={label} label={label}>
          <Select
            aria-label={label}
            value={axes[i]}
            options={STUDY_METRICS.map((m) => ({ ...m }))}
            onChange={(e) => onAxis(i, e.target.value as StudyMetric)}
          />
        </FieldRow>
      ))}
      <div
        className="relative h-[192px] rounded-lg bg-black/15 mt-1"
        aria-label={`${metricLabel(axes[0])} against ${metricLabel(axes[1])}`}
      >
        <div className="absolute inset-5 border-l border-b border-white/15" />
        {points.map(({ row, x, y, color }) => {
          const shade = color === undefined ? 0.45 : 0.25 + normalized(color, colors) * 0.75;
          const pareto = frontier.includes(row.key);

          return (
            <div
              key={row.key}
              className="absolute -translate-x-1/2 translate-y-1/2"
              style={{
                left: `calc(20px + (100% - 40px) * ${normalized(
                  x,
                  points.map((p) => p.x),
                )})`,
                bottom: `calc(20px + (100% - 40px) * ${normalized(
                  y,
                  points.map((p) => p.y),
                )})`,
              }}
            >
              <Tooltip
                label={`${row.label}, ${metricText(x, axes[0], money.format)}, ${metricText(y, axes[1], money.format)}`}
              >
                <button
                  type="button"
                  aria-label={row.label}
                  aria-pressed={compared.includes(row.key)}
                  data-testid="study-point"
                  data-pareto={pareto}
                  className="w-[28px] h-[28px] grid place-items-center rounded-full cursor-default"
                  onMouseEnter={() => onPreview(row)}
                  onMouseLeave={() => onPreview(null)}
                  onFocus={() => onPreview(row)}
                  onBlur={() => onPreview(null)}
                  onClick={(e) => onPick(row, e.shiftKey)}
                >
                  <span
                    className={`w-4 h-4 rounded-full ${compared.includes(row.key) ? 'ring-2 ring-white' : ''}`}
                    style={{
                      backgroundColor: `rgba(13, 153, 255, ${shade})`,
                      border: pareto ? '2px solid white' : undefined,
                    }}
                  />
                </button>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </div>
  );
}
