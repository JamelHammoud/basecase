import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ContextMenu, ContextMenuEntry, Section, deleteEntry, useScrollFade } from '../design-system';
import type { RobotJoint } from '../types/robotics';
import { jointGroups, nameWords, prettyJointName, sideOf } from '../utils/kinematics';
import type { Posing } from '../utils/usePosing';
import { AnimationsSection } from './pose/AnimationsSection';
import { JointRangeFields } from './pose/JointRangeFields';
import { JointRow } from './pose/JointRow';
import { PosesSection } from './pose/PosesSection';
import { SkeletonSection } from './pose/SkeletonSection';
import type { SkeletonEdit } from '../workspace/useSkeletonEdit';

export interface JointEdits {
  remove: (id: string) => void;
  setRange: (id: string, range: [number, number], live?: boolean) => void;
}

interface PosePanelProps {
  posing: Posing;
  jointEdits: JointEdits;
  skeleton: SkeletonEdit;
  onSelectParts: (ids: string[]) => void;
  onImportMotion: () => void;
  onWalkCycle: () => void;
  canWalk: boolean;
  measured: ReadonlySet<string>;
}

function rowLabel(j: RobotJoint, group: string): string {
  const side = sideOf(j.name);
  const skip = new Set([
    'joint',
    'left',
    'right',
    ...(side ? ['l', 'r', 'll', 'lr', 'fl', 'fr', 'rl', 'rr'] : []),
    ...group
      .toLowerCase()
      .split(' ')
      .filter((w) => w !== 'leg' && w !== 'arm'),
  ]);
  const words = nameWords(j.name).filter((w) => !skip.has(w));
  const s = words.join(' ');

  return s ? s[0].toUpperCase() + s.slice(1) : prettyJointName(j.name);
}

const jointMenu = (j: RobotJoint, edits: JointEdits): ContextMenuEntry[] => [
  {
    label: 'Range',
    submenu: () => <JointRangeFields joint={j} onChange={(range, live) => edits.setRange(j.id, range, live)} />,
  },
  deleteEntry(() => edits.remove(j.id)),
];

export const PosePanel: React.FC<PosePanelProps> = ({
  posing,
  jointEdits,
  skeleton,
  onSelectParts,
  onImportMotion,
  onWalkCycle,
  canWalk,
  measured,
}) => {
  const { activeJointId } = posing;
  const rig = posing.robot?.rig ?? null;
  const pose = posing.robot?.pose;
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();
  const groups = useMemo(() => (rig ? jointGroups(rig) : []), [rig]);
  const [toggled, setToggled] = useState<Record<string, { open: boolean; joint: string | null }>>({});
  const [revealed, setRevealed] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const activeGroup = groups.find((g) => g.joints.some((j) => j.id === activeJointId))?.label;

  if (activeGroup && !revealed.includes(activeGroup)) setRevealed([...revealed, activeGroup]);

  const isOpen = (label: string) => {
    const t = toggled[label];

    if (label === activeGroup && t?.joint !== activeJointId) return true;

    return t ? t.open : revealed.includes(label) || groups.length <= 4;
  };

  useEffect(() => {
    if (!activeJointId || !activeGroup) return;

    const raf = requestAnimationFrame(() =>
      listRef.current
        ?.querySelector(`[data-joint="${CSS.escape(activeJointId)}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
    );

    return () => cancelAnimationFrame(raf);
  }, [activeJointId, activeGroup]);

  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const openMenu = (e: React.MouseEvent, items: ContextMenuEntry[]) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const select = (j: RobotJoint) => {
    posing.selectJoint(j.id);

    const ids = rig ? [...rig.ownerOf].filter(([, owner]) => owner === j.id).map(([p]) => p) : [];

    if (ids.length) onSelectParts(ids);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={(el) => {
          listRef.current = el;
          setFadeEl(el);
        }}
        style={fadeStyle}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
      >
        <SkeletonSection skeleton={skeleton} />

        {posing.robot && (
          <>
            <AnimationsSection
              posing={posing}
              renaming={renaming}
              setRenaming={setRenaming}
              openMenu={openMenu}
              canWalk={canWalk}
              onWalkCycle={onWalkCycle}
              onImportMotion={onImportMotion}
            />
            <PosesSection posing={posing} renaming={renaming} setRenaming={setRenaming} openMenu={openMenu} />
          </>
        )}

        {groups.map((g) => (
          <Section
            key={g.label}
            title={g.label}
            collapsible
            open={isOpen(g.label)}
            onOpenChange={(open) => setToggled((t) => ({ ...t, [g.label]: { open, joint: activeJointId } }))}
          >
            <div className="grid grid-cols-[fit-content(60%)_minmax(0,1fr)_52px] gap-2.5">
              {g.joints.map((j) => (
                <JointRow
                  key={j.id}
                  joint={j}
                  label={rowLabel(j, g.label)}
                  value={pose?.values[j.id] ?? 0}
                  active={j.id === activeJointId}
                  measured={measured.has(j.id)}
                  onSelect={() => select(j)}
                  onChange={(v) => posing.setJointValue(j.id, v)}
                  onContextMenu={(e) => openMenu(e, jointMenu(j, jointEdits))}
                />
              ))}
            </div>
          </Section>
        ))}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
};
