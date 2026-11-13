import React, { useRef, useState } from 'react';
import { Button, ChoiceGrid, Modal, TextInput, FileImportIcon, FolderImportIcon } from '../design-system';
import { isOnshapeLink } from '../onshape/onshapeLink';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { isRobotLink, pickedFiles } from '../utils/robotImport';
import type { RobotChoice, RobotFiles, RobotSource } from '../workspace/useRobotInsert';

type ImportSource = Exclude<RobotSource, { kind: 'simready' }>;

function commonDir(paths: string[]): string {
  const dirs = paths.map((p) => p.split('/').slice(0, -1));
  const first = dirs[0] ?? [];
  let n = 0;

  while (n < first.length && dirs.every((d) => d[n] === first[n])) n++;

  return first.slice(0, n).join('/');
}

const LoadedFile: React.FC<{ name: string }> = ({ name }) => (
  <div className="h-[32px] px-[10px] flex items-center gap-[8px] rounded-lg bg-white/[0.06] text-[13.5px] text-white/90">
    <FileImportIcon className="w-4 h-4 text-white/50 shrink-0" />
    <span className="min-w-0 truncate">{name}</span>
  </div>
);

function choiceOptions(choices: string[]) {
  const dir = commonDir(choices);

  return choices.map((c) => ({ value: c, label: dir ? c.slice(dir.length + 1) : c }));
}

export const ImportRobotSheet: React.FC<{
  open: boolean;
  choice: RobotChoice | null;
  loaded: RobotFiles | null;
  onClose: () => void;
  onImport: (source: ImportSource, at?: RobotChoice['at']) => void;
}> = ({ open, choice, loaded, onClose, onImport }) => {
  const [url, setUrl] = useState('');
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const folderRef = useRef<HTMLInputElement | null>(null);
  const link = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  const ready = choice
    ? !!picked && choice.choices.includes(picked)
    : !!loaded || isRobotLink(link) || (!IS_WEB_DEMO && isOnshapeLink(link));

  const submit = () => {
    if (!ready) return;

    if (choice) onImport({ ...choice.source, entry: picked }, choice.at);
    else if (loaded) onImport({ kind: 'files', files: loaded.files }, loaded.at);
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
      action={{ label: 'Import', disabled: !ready, autoFocus: !!loaded, onClick: submit }}
      footerStart={
        !choice && (
          <Button variant="secondary" onClick={() => folderRef.current?.click()}>
            Choose Folder
          </Button>
        )
      }
    >
      {choice && (
        <ChoiceGrid
          label="Robots"
          columns={1}
          options={choiceOptions(choice.choices)}
          value={picked}
          onChange={setPicked}
          className="max-h-[320px] overflow-y-auto"
        />
      )}
      {!choice && loaded && <LoadedFile name={loaded.name} />}
      {!choice && !loaded && (
        <TextInput
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          aria-label="Robot link"
          placeholder="e.g. github.com/unitreerobotics/unitree_ros"
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
