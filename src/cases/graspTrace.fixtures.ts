import type { Trace } from '../skills/contract';

export function graspTransitions(trace: Trace) {
  const { grip, contact, lift, spot } = trace.signals;

  return grip.flatMap((value, index) =>
    index && value !== grip[index - 1]
      ? [
          {
            at: index * trace.dt,
            grip: value,
            contact: contact[index],
            liftMm: lift[index] - lift[0],
            spotMm: spot[index],
          },
        ]
      : [],
  );
}
