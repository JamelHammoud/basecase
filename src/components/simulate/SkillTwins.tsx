import type { TwinVerdict } from '../../fleet/twinArena';
import { MetaLine } from '../../design-system';

export function SkillTwins({ twins }: { twins?: Record<string, TwinVerdict> }) {
  const results = Object.values(twins ?? {}).sort((a, b) => a.unit.localeCompare(b.unit));

  if (!results.length) return null;

  return (
    <ul className="pt-1 text-[12px] text-white/50 tabular" data-testid="skill-twins">
      {results.map((result) => (
        <li key={result.unit} data-twin-unit={result.unit} data-passed={result.passed}>
          <MetaLine items={[result.unit, `${result.passes} of ${result.trials}`, !result.passed && result.line]} />
        </li>
      ))}
    </ul>
  );
}
