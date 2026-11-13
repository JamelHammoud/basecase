import React from 'react';
import type { JointField } from '../../../cases/console/signalNames';
import { CaseRunJoints } from '../CaseRunJoints';
import { useBus, type PanelViewProps } from '../panelContext';
import { Titled } from './PanelTitle';
import { signalText } from './signalText';

const COLUMN_TITLES: Record<JointField, string> = { target: 'Target', position: 'Position', effort: 'Effort' };
const ALL_COLUMNS: JointField[] = ['target', 'position', 'effort'];

const cell = 'w-[72px] shrink-0 text-right tabular-nums';

const JointsTable: React.FC<PanelViewProps<'table'>> = ({ panel, ctx }) => {
  useBus(ctx.bus);

  const columns = ('columns' in panel && panel.columns) || ALL_COLUMNS;
  const names = new Map(ctx.joints.map((j) => [j.id, j.name]));
  const ids = ctx.bus.expand('joint.*.position').map((id) => id.split('.')[1]);

  return (
    <Titled title={panel.title}>
      <div className="flex flex-col text-[13px]" data-testid="joint-table">
        <div className="h-8 flex items-center gap-2 text-white/50">
          <span className="flex-1" />
          {columns.map((c) => (
            <span key={c} className={cell}>
              {COLUMN_TITLES[c]}
            </span>
          ))}
        </div>
        {ids.map((id) => (
          <div key={id} className="h-8 flex items-center gap-2" data-joint={id}>
            <span className="flex-1 min-w-0 truncate text-white/80">{names.get(id) ?? id}</span>
            {columns.map((c) => (
              <span key={c} className={`${cell} text-white/90`}>
                {signalText(`joint.${id}.${c}`, ctx.bus.read(`joint.${id}.${c}`), ctx.signals)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </Titled>
  );
};

const SignalsTable: React.FC<PanelViewProps<'table'>> = ({ panel, ctx }) => {
  useBus(ctx.bus);

  const ids = ('signals' in panel ? (panel.signals ?? []) : []).flatMap((s) => ctx.bus.expand(s));

  return (
    <Titled title={panel.title}>
      <div className="flex flex-col text-[13px]">
        {ids.map((id) => (
          <div key={id} className="h-8 flex items-center justify-between gap-3" data-signal={id}>
            <span className="min-w-0 truncate text-white/80">{id}</span>
            <span className="tabular-nums text-white/90">{signalText(id, ctx.bus.read(id), ctx.signals)}</span>
          </div>
        ))}
      </div>
    </Titled>
  );
};

export const TablePanel: React.FC<PanelViewProps<'table'>> = (props) => {
  const { panel, ctx } = props;

  if (panel.of === 'servos')
    return (
      ctx.studio && <CaseRunJoints joints={ctx.joints} parts={ctx.parts} onBrowseRobots={ctx.studio.onBrowseRobots} />
    );

  return panel.of === 'joints' ? <JointsTable {...props} /> : <SignalsTable {...props} />;
};
