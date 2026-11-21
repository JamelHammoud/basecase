import { plural } from '../../../electron/plural.mjs';
import type { StudyVisibilityResult } from '../../study/visibility';
import { duration } from '../../utils/duration';

const STATES = { occluded: 'Occluded', outside: 'Outside view', below: 'Below minimum', unavailable: 'Unavailable' };

export function StudyVisibilityDetails({
  result,
  names,
}: {
  result: StudyVisibilityResult;
  names: Record<string, string>;
}) {
  const gaps = result.times.slice(1).map((at, i) => at - result.times[i]);
  const maxGap = Math.max(...gaps, result.end - result.times.at(-1)!);

  return (
    <div className="col-span-4 text-[12px] text-white/60 py-2" data-testid="study-visibility">
      <p>{`${result.width} × ${result.height}, ${plural(result.times.length, 'sample')}, ${duration(maxGap)} max gap`}</p>
      <p>Geometric visibility, not detector accuracy</p>
      <p>Intervals estimate time between samples</p>
      {result.error && <p>{result.error}</p>}
      {result.pairs.map((pair) => {
        const measured = pair.pixels.flatMap((sample) => (sample ? [sample.pixels] : []));
        const range = measured.length ? `${Math.min(...measured)}–${Math.max(...measured)} px` : 'Unavailable';

        return (
          <div key={`${pair.camera}/${pair.target}`} className="mt-2">
            <p>{`${names[pair.camera] ?? pair.camera} / ${names[pair.target] ?? pair.target}: ${range}, ${duration(pair.seconds)} ≥ ${pair.minPixels} px`}</p>
            {pair.intervals.map((interval) => (
              <p
                key={interval.from}
              >{`${STATES[interval.state]} ${duration(interval.from)}–${duration(interval.to)}`}</p>
            ))}
          </div>
        );
      })}
    </div>
  );
}
