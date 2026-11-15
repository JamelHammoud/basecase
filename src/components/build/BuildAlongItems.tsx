import type { BuildAlongStep } from '../../guide/buildAlong';

const chip = 'glass rounded-full h-[28px] px-3.5 flex items-center text-[13px] text-white/90 tabular-nums whitespace-nowrap';

export function BuildAlongItems({ step }: { step: BuildAlongStep | null }) {
  if (!step || (step.callout.length === 0 && step.tools.length === 0)) return null;

  return (
    <ul className="flex flex-wrap justify-center gap-2 max-w-[720px]">
      {step.callout.map((item) => (
        <li key={`${item.qty}|${item.name}`} className={chip}>
          {item.qty} × {item.name}
        </li>
      ))}
      {step.tools.map((tool) => (
        <li key={tool} className={chip}>
          {tool}
        </li>
      ))}
    </ul>
  );
}
