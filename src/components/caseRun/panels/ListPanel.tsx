import React from 'react';
import { Section } from '../../../design-system';
import { buildRig } from '../../../utils/kinematics';
import { ResultsSection } from '../../simulate/ResultsSection';
import { TrySection } from '../../simulate/CaseSections';
import { useBus, type PanelViewProps } from '../panelContext';
import { Titled } from './PanelTitle';

const Failures: React.FC<PanelViewProps<'list'>> = ({ panel, ctx }) => {
  useBus(ctx.bus);

  const failed = ctx.bus.read('goal.failed');

  if (!Array.isArray(failed) || !failed.length) return null;

  return (
    <Titled title={panel.title}>
      <ul className="flex flex-col gap-1 text-[13px] text-[#f87171]" aria-live="polite" data-testid="goal-failed">
        {failed.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
    </Titled>
  );
};

export const ListPanel: React.FC<PanelViewProps<'list'>> = (props) => {
  const { panel, ctx } = props;

  if (panel.of === 'failures') return <Failures {...props} />;

  const cases = ctx.studio?.cases;

  if (!cases) return null;

  const tries = (
    <>
      <TrySection cases={cases} teachWalk={null} cls={ctx.sim.drive.cls} />
      <ResultsSection
        cases={cases}
        rig={buildRig(ctx.joints, ctx.parts)}
        model={ctx.sim.model}
        parts={ctx.parts}
        world={ctx.sim.worldParts}
        run={null}
      />
    </>
  );

  return panel.title ? <Section title={panel.title}>{tries}</Section> : tries;
};
