import type { CheckRow } from '../utils/engineeringTypes';
import type { StackResult } from '../utils/designParameters/tolerances';

export const TOLERANCE_CHECK = 'Dimensional tolerances';

export function toleranceRows(results: StackResult[]): CheckRow[] {
  if (!results.length) return [];

  return [
    {
      check: TOLERANCE_CHECK,
      status: results.some((result) => result.status !== 'pass') ? 'fail' : 'pass',
      detail: results
        .filter((result) => result.status === 'pass')
        .map(stackText)
        .join('\n'),
      items: results
        .filter((result) => result.status !== 'pass')
        .map((result) => ({
          text: stackText(result),
          subject: result.name,
          ids: [...new Set(result.dimensions.map((dimension) => dimension.part))],
          status: 'fail' as const,
          fix: { kind: 'parameters' as const },
        })),
    },
  ];
}

const shown = (value: number | null) => (value === null ? '' : Number(value.toPrecision(8)));

function stackText(result: StackResult) {
  return result.reason
    ? `${result.name}: ${result.reason}`
    : `${result.name}: ${shown(result.nominal)} mm nominal, ${shown(result.minimum)} to ${shown(result.maximum)} mm`;
}
