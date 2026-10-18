import React, { useRef, useState } from 'react';
import { FileUp, Footprints, Pause, Play, Plus } from 'lucide-react';
import { ContextMenuEntry, IconButton, MenuItem, PopoverMenu, Section } from '../../design-system';
import type { RobotAnimation } from '../../types/robotics';
import type { Posing } from '../../utils/usePosing';
import { RenameField } from './RenameField';

export type OpenMenu = (e: React.MouseEvent, items: ContextMenuEntry[]) => void;

const fmtTime = (t: number) => `${t.toFixed(t < 10 ? 1 : 0)} s`;

const AddAnimationMenu: React.FC<{ canWalk: boolean; onWalkCycle: () => void; onImportMotion: () => void }> = ({
  canWalk,
  onWalkCycle,
  onImportMotion,
}) => {
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement | null>(null);

  return (
    <div ref={addRef} className="relative">
      <IconButton
        icon={<Plus className="w-4 h-4" />}
        title="New animation"
        size="xs"
        isToggled={addOpen}
        onClick={() => setAddOpen((v) => !v)}
      />
      <PopoverMenu
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        position="bottom"
        align="end"
        ignoreRef={addRef}
        className="w-[210px]"
      >
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
  );
};

const AnimationRow: React.FC<{
  anim: RobotAnimation;
  posing: Posing;
  renaming: boolean;
  setRenaming: (id: string | null) => void;
  openMenu: OpenMenu;
}> = ({ anim: a, posing, renaming, setRenaming, openMenu }) => {
  const { playback } = posing;
  const isCurrent = playback?.id === a.id;
  const playing = isCurrent && playback!.playing;
  const t = isCurrent ? playback!.t : 0;

  return (
    <div
      className={`-mx-[6px] px-[6px] rounded-lg ${isCurrent ? 'bg-white/[0.04] pb-2' : ''}`}
      onContextMenu={(e) =>
        openMenu(e, [
          {
            label: playing ? 'Pause' : 'Play',
            onSelect: () => (playing ? posing.pause() : posing.play(a.id)),
          },
          { label: 'Loop', checked: a.loop, onSelect: () => posing.setAnimationLoop(a.id, !a.loop) },
          { divider: true },
          { label: 'Rename', onSelect: () => setRenaming(a.id) },
          { label: 'Delete', tone: 'danger', onSelect: () => posing.deleteAnimation(a.id) },
        ])
      }
    >
      <div className="h-9 flex items-center gap-1.5">
        <IconButton
          icon={playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          title={playing ? 'Pause' : 'Play'}
          size="xs"
          onClick={() => (playing ? posing.pause() : posing.play(a.id))}
        />
        {renaming ? (
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
};

export const AnimationsSection: React.FC<{
  posing: Posing;
  renaming: string | null;
  setRenaming: (id: string | null) => void;
  openMenu: OpenMenu;
  canWalk: boolean;
  onWalkCycle: () => void;
  onImportMotion: () => void;
}> = ({ posing, renaming, setRenaming, openMenu, canWalk, onWalkCycle, onImportMotion }) => (
  <Section
    title="Animations"
    actions={<AddAnimationMenu canWalk={canWalk} onWalkCycle={onWalkCycle} onImportMotion={onImportMotion} />}
  >
    {posing.animations.map((a) => (
      <AnimationRow
        key={a.id}
        anim={a}
        posing={posing}
        renaming={renaming === a.id}
        setRenaming={setRenaming}
        openMenu={openMenu}
      />
    ))}
  </Section>
);
