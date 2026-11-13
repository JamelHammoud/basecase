import React from 'react';
import { Button, Section, Switch } from '../../design-system';
import { SKELETON_TEMPLATES } from '../../agent/skeletonTemplates';
import { prettyJointName } from '../../utils/jointNames';
import { marginColor, marginPercent } from '../../workspace/skeletonView';
import type { SkeletonEdit } from '../../workspace/useSkeletonEdit';

const Templates: React.FC<{ skeleton: SkeletonEdit }> = ({ skeleton }) => (
  <div className="grid grid-cols-2 gap-2">
    {SKELETON_TEMPLATES.map((t) => (
      <Button key={t.id} variant="secondary" size="sm" onClick={() => skeleton.start(t.id)}>
        {t.name}
      </Button>
    ))}
  </div>
);

const Joints: React.FC<{ skeleton: SkeletonEdit }> = ({ skeleton }) =>
  skeleton.skeleton?.joints.map((j) => {
    const m = skeleton.margins.get(j.id);
    const open = skeleton.menu?.id === j.id;

    return (
      <button
        key={j.id}
        type="button"
        data-skeleton-joint={j.id}
        data-margin={m ? m.margin.toFixed(3) : undefined}
        onClick={(e) => skeleton.openMenu(j.id, { x: e.clientX, y: e.clientY })}
        className={`-mx-[6px] px-[6px] w-[calc(100%+12px)] h-[32px] rounded-lg flex items-center gap-2.5 text-left cursor-default ${open ? 'bg-[#0d99ff]/[0.12]' : 'hover:bg-white/[0.04]'}`}
      >
        <span className="flex-1 min-w-0 truncate text-[13px] text-white/85">{prettyJointName(j.name ?? j.id)}</span>
        {m && (
          <span className="text-[12.5px] tabular-nums" style={{ color: marginColor(m) }}>
            {marginPercent(m)}
          </span>
        )}
      </button>
    );
  }) ?? null;

export const SkeletonSection: React.FC<{ skeleton: SkeletonEdit }> = ({ skeleton }) => (
  <Section
    title="Skeleton"
    actions={<Switch aria-label="Edit Skeleton" checked={skeleton.editing} onChange={skeleton.setEditing} />}
  >
    {skeleton.editing && (skeleton.skeleton ? <Joints skeleton={skeleton} /> : <Templates skeleton={skeleton} />)}
  </Section>
);
