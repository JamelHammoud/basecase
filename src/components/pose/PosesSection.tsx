import React from 'react';
import { BookmarkPlus, RotateCcw } from 'lucide-react';
import { IconButton, Section } from '../../design-system';
import { isRestPose } from '../../utils/kinematics';
import type { Posing } from '../../utils/usePosing';
import { RenameField } from './RenameField';
import type { OpenMenu } from './AnimationsSection';

export const PosesSection: React.FC<{
  posing: Posing;
  renaming: string | null;
  setRenaming: (id: string | null) => void;
  openMenu: OpenMenu;
}> = ({ posing, renaming, setRenaming, openMenu }) => {
  const pose = posing.robot?.pose;

  return (
    <Section
      title="Poses"
      actions={
        <>
          <IconButton
            icon={<RotateCcw className="w-4 h-4" />}
            title="Rest pose"
            size="xs"
            disabled={!pose || isRestPose(pose)}
            onClick={() => posing.setRobotPose({ values: {} })}
          />
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
          onContextMenu={(e) =>
            openMenu(e, [
              { label: 'Apply', onSelect: () => posing.applySavedPose(p.id) },
              { label: 'Rename', onSelect: () => setRenaming(p.id) },
              { divider: true },
              { label: 'Delete', tone: 'danger', onSelect: () => posing.deletePose(p.id) },
            ])
          }
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
  );
};
