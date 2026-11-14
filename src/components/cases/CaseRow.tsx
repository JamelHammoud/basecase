import React from 'react';
import { RenameField } from '../../design-system';
import { TILE_RENAME } from '../library/Tile';

interface CaseRowProps {
  name: string;
  brief: string;
  selected?: boolean;
  renaming?: boolean;
  onClick: () => void;
  onRename: (name: string | null) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export const CaseRow: React.FC<CaseRowProps> = ({
  name,
  brief,
  selected,
  renaming,
  onClick,
  onRename,
  onContextMenu,
}) => {
  const className = `w-full min-h-[52px] px-[8px] py-2 rounded-[8px] flex items-start gap-2 text-left cursor-default transition-colors ${
    selected ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]'
  }`;
  const body = (
    <span className="min-w-0 flex-1">
      {renaming ? (
        <RenameField name={name} onDone={onRename} className={TILE_RENAME} />
      ) : (
        <span className="block text-[13px] font-medium text-white/90 truncate">{name}</span>
      )}
      <span className="block text-[12px] text-white/50 leading-snug">{brief}</span>
    </span>
  );

  if (renaming) return <div className={className}>{body}</div>;

  return (
    <button type="button" aria-pressed={selected} onClick={onClick} onContextMenu={onContextMenu} className={className}>
      {body}
    </button>
  );
};
