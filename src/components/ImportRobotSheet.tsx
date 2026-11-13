import React, { useRef, useState } from 'react';
import { Button, ChoiceGrid, Modal, TextInput, FolderImportIcon } from '../design-system';
import { isRobotLink, pickedFiles } from '../utils/robotImport';
import type { RobotChoice, RobotSource } from '../workspace/useRobotInsert';

type ImportSource = Exclude<RobotSource, { kind: 'simready' }>;

function commonDir(paths: string[]): string {
  const dirs = paths.map((p) => p.split('/').slice(0, -1));
  const first = dirs[0] ?? [];
  let n = 0;

  while (n < first.length && dirs.every((d) => d[n] === first[n])) n++;

  return first.slice(0, n).join('/');
}

function choiceOptions(choices: string[]) {
  const dir = commonDir(choices);

  return choices.map((c) => ({ value: c, label: dir ? c.slice(dir.length + 1) : c }));
}

export const ImportRobotSheet: React.FC<{
  open: boolean;
  choice: RobotChoice | null;
  onClose: () => void;
  onImport: (source: ImportSource, at?: RobotChoice['at']) => void;
}> = ({ open, choice, onClose, onImport }) => {
  const [url, setUrl] = useState('');
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const folderRef = useRef<HTMLInputElement | null>(null);
  const link = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  const ready = choice ? !!picked && choice.choices.includes(picked) : isRobotLink(link);

  const submit = () => {
    if (!ready) return;

    if (choice) onImport({ ...choice.source, entry: picked }, choice.at);
    else onImport({ kind: 'url', url: link });

    onClose();
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Import Robot"
      icon={<FolderImportIcon className="w-4 h-4" />}
      maxWidth="max-w-[520px]"
      footer={
        <div className="flex items-center justify-between w-full">
          {choice ? (
            <span />
          ) : (
            <Button variant="secondary" size="sm" onClick={() => folderRef.current?.click()}>
              Choose Folder
            </Button>
          )}
          <div className="flex gap-[8px]">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" disabled={!ready} onClick={submit}>
              Import
            </Button>
          </div>
        </div>
      }
    >
      {choice ? (
        <ChoiceGrid
          label="Robots"
          columns={1}
          options={choiceOptions(choice.choices)}
          value={picked}
          onChange={setPicked}
          className="max-h-[320px] overflow-y-auto"
        />
      ) : (
        <TextInput
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="GitHub, URDF, MJCF or zip link"
        />
      )}
      <input
        ref={folderRef}
        type="file"
        className="hidden"
        webkitdirectory=""
        multiple
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];

          e.target.value = '';

          if (!files.length) return;

          onImport({ kind: 'files', files: pickedFiles(files) });
          onClose();
        }}
      />
    </Modal>
  );
};
