import type { Studio } from '../types';

export default function lightenStudio(studio: Studio) {
  return {
    lightenChecks: async () => {
      const report = await studio().core.readiness.checkNow();

      return (
        report?.rows.filter((row) =>
          ['Weight', 'Servo torque', 'Strength', 'Assembly', 'Printability'].includes(row.check),
        ) ?? []
      );
    },
    lightenState: () => {
      const { partId, busy, problem } = studio().actions.lighten;

      return { partId, busy, problem };
    },
  };
}
