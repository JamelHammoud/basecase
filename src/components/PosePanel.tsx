import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Footprints, FileUp, Pause, Play, Plus, RotateCcw, BookmarkPlus } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuEntry,
  IconButton,
  MenuItem,
  PopoverMenu,
  Section,
  useScrollFade,
} from '../design-system';
import type { RobotJoint } from '../types/robotics';
import { isRestPose, jointGroups, jointUnit, nameWords, prettyJointName, sideOf } from '../utils/kinematics';
import type { Posing } from '../utils/usePosing';

interface PosePanelProps {
  posing: Posing;
  /** Selects a joint's link on the canvas */
  onSelectParts: (ids: string[]) => void;
  onImportMotion: () => void;
  onWalkCycle: () => void;
  canWalk: boolean;
}

/** Joint label inside its group: "left_shoulder_pitch_joint" under Left Arm → "Shoulder pitch" */
function rowLabel(j: RobotJoint, group: string): string {
  const side = sideOf(j.name);
  const skip = new Set(['joint', 'left', 'right', ...(side ? ['l', 'r', 'll', 'lr', 'fl', 'fr', 'rl', 'rr'] : []), ...group.toLowerCase().split(' ').filter((w) => w !== 'leg' && w !== 'arm')]);
  const words = nameWords(j.name).filter((w) => !skip.has(w));
  const s = words.join(' ');
  return s ? s[0].toUpperCase() + s.slice(1) : prettyJointName(j.name);
}

const fmtTime = (t: number) => `${t.toFixed(t < 10 ? 1 : 0)} s`;

/** The Pose tab: animations, saved poses and every joint by limb. While it's open, clicking a part picks its joint. */
export const PosePanel: React.FC<PosePanelProps> = ({ posing, onSelectParts, onImportMotion, onWalkCycle, canWalk }) => {
  // Only the selected robot: other robots in the scene keep their poses
  const { activeJointId, playback } = posing;
  const rig = posing.robot?.rig ?? null;
  const pose = posing.robot?.pose;
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();
  const groups = useMemo(() => (rig ? jointGroups(rig) : []), [rig]);
  // Picking a joint (the ring on the canvas or its row) opens its limb and brings the row into view
  // A toggle by hand wins until another joint in that limb is picked; limbs a pick opened stay open
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
      listRef.current?.querySelector(`[data-joint="${CSS.escape(activeJointId)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    );
    return () => cancelAnimationFrame(raf);
  }, [activeJointId, activeGroup]);
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement | null>(null);

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
        <Section
          title="Animations"
          actions={
            <div ref={addRef} className="relative">
              <IconButton icon={<Plus className="w-4 h-4" />} title="New animation" size="xs" isToggled={addOpen} onClick={() => setAddOpen((v) => !v)} />
              <PopoverMenu isOpen={addOpen} onClose={() => setAddOpen(false)} position="bottom" align="end" ignoreRef={addRef} className="w-[210px]">
                <MenuItem
                  icon={<Footprints className="w-4 h-4" />}
                  label="Walk Cycle"
                  disabled={!canWalk}
                  onSelect={() => {
                    setAddOpen(false);
                    onWalkCycle();
                  }}
                />
                <MenuItem
                  icon={<FileUp className="w-4 h-4" />}
                  label="Import BVH…"
                  onSelect={() => {
                    setAddOpen(false);
                    onImportMotion();
                  }}
                />
              </PopoverMenu>
            </div>
          }
        >
          {posing.animations.map((a) => {
            const isCurrent = playback?.id === a.id;
            const playing = isCurrent && playback!.playing;
            const t = isCurrent ? playback!.t : 0;
            return (
              <div
                key={a.id}
                className={`-mx-[6px] px-[6px] rounded-lg ${isCurrent ? 'bg-white/[0.04] pb-2' : ''}`}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({
                    x: e.clientX,
                    y: e.clientY,
                    items: [
                      { label: playing ? 'Pause' : 'Play', onSelect: () => (playing ? posing.pause() : posing.play(a.id)) },
                      { label: 'Loop', checked: a.loop, onSelect: () => posing.setAnimationLoop(a.id, !a.loop) },
                      { divider: true },
                      { label: 'Rename', onSelect: () => setRenaming(a.id) },
                      { label: 'Delete', tone: 'danger', onSelect: () => posing.deleteAnimation(a.id) },
                    ],
                  });
                }}
              >
                <div className="h-9 flex items-center gap-1.5">
                  <IconButton
                    icon={playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    title={playing ? 'Pause' : 'Play'}
                    size="xs"
                    onClick={() => (playing ? posing.pause() : posing.play(a.id))}
                  />
                  {renaming === a.id ? (
                    <RenameField
                      name={a.name}
                      onDone={(name) => {
                        setRenaming(null);
                        if (name && name !== a.name) posing.renameAnimation(a.id, name);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="flex-1 min-w-0 text-left text-[13px] text-white/85 truncate cursor-default"
                      onClick={() => posing.scrub(a.id, t)}
                      onDoubleClick={() => setRenaming(a.id)}
                    >
                      {a.name}
                    </button>
                  )}
                  <span className="text-[12px] text-white/40 tabular shrink-0">{fmtTime(a.duration)}</span>
                </div>
                {isCurrent && (
                  <div className="flex items-center gap-2.5 pl-1">
                    <input
                      type="range"
                      className="slider flex-1"
                      min={0}
                      max={a.duration}
                      step={0.01}
                      value={t}
                      aria-label={`${a.name} time`}
                      style={{ '--fill': `${(t / a.duration) * 100}%` } as React.CSSProperties}
                      onChange={(e) => posing.scrub(a.id, Number(e.target.value))}
                    />
                    <span className="w-[44px] text-right text-[12px] text-white/50 tabular">{fmtTime(t)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </Section>

        <Section
          title="Poses"
          actions={
            <>
              <IconButton icon={<RotateCcw className="w-4 h-4" />} title="Rest pose" size="xs" disabled={!pose || isRestPose(pose)} onClick={() => posing.setRobotPose({ values: {} })} />
              <IconButton
                icon={<BookmarkPlus className="w-4 h-4" />}
                title="Save pose"
                size="xs"
                onClick={() => {
                  const p = posing.savePose(`Pose ${posing.poses.length + 1}`);
                  setRenaming(p.id);
                }}
              />
            </>
          }
        >
          {posing.poses.map((p) => (
            <div
              key={p.id}
              className="-mx-[6px] px-[6px] h-8 rounded-lg flex items-center hover:bg-white/[0.04]"
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({
                  x: e.clientX,
                  y: e.clientY,
                  items: [
                    { label: 'Apply', onSelect: () => posing.applySavedPose(p.id) },
                    { label: 'Rename', onSelect: () => setRenaming(p.id) },
                    { divider: true },
                    { label: 'Delete', tone: 'danger', onSelect: () => posing.deletePose(p.id) },
                  ],
                });
              }}
            >
              {renaming === p.id ? (
                <RenameField
                  name={p.name}
                  onDone={(name) => {
                    setRenaming(null);
                    if (name && name !== p.name) posing.renamePose(p.id, name);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="flex-1 min-w-0 h-8 text-left text-[13px] text-white/85 truncate cursor-default"
                  onClick={() => posing.applySavedPose(p.id)}
                  onDoubleClick={() => setRenaming(p.id)}
                >
                  {p.name}
                </button>
              )}
            </div>
          ))}
        </Section>

        {groups.map((g) => (
          <Section
            key={g.label}
            title={g.label}
            collapsible
            open={isOpen(g.label)}
            onOpenChange={(open) => setToggled((t) => ({ ...t, [g.label]: { open, joint: activeJointId } }))}
          >
            {g.joints.map((j) => (
              <JointRow
                key={j.id}
                joint={j}
                label={rowLabel(j, g.label)}
                value={pose?.values[j.id] ?? 0}
                active={j.id === activeJointId}
                onSelect={() => select(j)}
                onChange={(v) => posing.setJointValue(j.id, v)}
              />
            ))}
          </Section>
        ))}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
};

/** label · slider · value; the label selects the joint (its ring shows on the canvas) */
const JointRow: React.FC<{
  joint: RobotJoint;
  label: string;
  value: number;
  active: boolean;
  onSelect: () => void;
  onChange: (v: number) => void;
}> = ({ joint, label, value, active, onSelect, onChange }) => {
  const unit = jointUnit(joint);
  const [lo, hi] = joint.range ? [Math.min(...joint.range), Math.max(...joint.range)] : joint.type === 'prismatic' ? [-100, 100] : [-180, 180];
  const fill = ((value - lo) / Math.max(hi - lo, 1e-6)) * 100;
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.replace(/[^\d.+-]/g, ''));
    if (Number.isFinite(n)) onChange(n);
    setDraft(null);
  };
  return (
    <div
      data-joint={joint.id}
      className={`-mx-[6px] px-[6px] rounded-lg grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_52px] items-center gap-2.5 h-8 scroll-my-3 ${active ? 'bg-[#0d99ff]/[0.12]' : ''}`}
    >
      <button type="button" onClick={onSelect} className={`text-left text-[13px] truncate cursor-default ${active ? 'text-white' : 'text-white/60 hover:text-white/85'}`}>
        {label}
      </button>
      <input
        type="range"
        className="slider"
        min={lo}
        max={hi}
        step={joint.type === 'prismatic' ? 0.5 : 1}
        value={value}
        aria-label={label}
        style={{ '--fill': `${fill}%` } as React.CSSProperties}
        onPointerDown={onSelect}
        onDoubleClick={() => onChange(0)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        value={draft ?? `${Math.round(value * 10) / 10}${unit === '°' ? '°' : ''}`}
        onFocus={(e) => {
          setDraft(String(Math.round(value * 10) / 10));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label={`${label} ${unit === '°' ? 'degrees' : 'mm'}`}
        className="h-7 w-full rounded-md bg-white/[0.05] hover:bg-white/[0.07] focus:bg-black/20 px-1.5 text-right text-[13px] text-white/90 tabular outline-none ring-1 ring-inset ring-transparent focus:ring-[#0d99ff]"
      />
    </div>
  );
};

/** Inline rename: Enter or blur saves, Esc cancels */
const RenameField: React.FC<{ name: string; onDone: (name: string) => void }> = ({ name, onDone }) => {
  const [draft, setDraft] = useState(name);
  const done = useRef(false);
  const finish = (value: string) => {
    if (done.current) return;
    done.current = true;
    onDone(value.trim());
  };
  return (
    <input
      autoFocus
      value={draft}
      spellCheck={false}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(draft);
        if (e.key === 'Escape') finish(name);
      }}
      aria-label="Name"
      className="flex-1 min-w-0 h-7 px-1.5 rounded-md bg-black/30 ring-1 ring-[#0d99ff] outline-none text-[13px] text-white/95"
    />
  );
};
