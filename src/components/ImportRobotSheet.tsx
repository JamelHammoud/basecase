import React, { useRef, useState } from 'react';
import { Button, ChoiceGrid, Modal, TextInput, FolderImportIcon, ProgressBar, Spinner } from '../design-system';
import { canImportLink } from '../workspace/importLink';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { pickedFiles } from '../utils/robotImport';
import { isRoboflowLink } from '../roboflow/roboflowLink';
import { useRoboflowPreparation, type PrepareRoboflow } from './useRoboflowPreparation';
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
  prepareRoboflow: PrepareRoboflow;
  onImport: (source: ImportSource, at?: RobotChoice['at']) => void;
}> = ({ open, choice, onClose, onImport, prepareRoboflow }) => {
  const preparation = useRoboflowPreparation(prepareRoboflow, onClose);
  const [url, setUrl] = useState('');
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const folderRef = useRef<HTMLInputElement | null>(null);
  const link = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  const ready = choice ? !!picked && choice.choices.includes(picked) : canImportLink(link, !IS_WEB_DEMO);

  const submit = () => {
    if (!ready || preparation.busy) return;

    if (!choice && isRoboflowLink(link)) {
      void preparation.submit(link);

      return;
    }

    if (choice) onImport({ ...choice.source, entry: picked }, choice.at);
    else onImport({ kind: 'url', url: link });

    onClose();
  };

  return (
    <Modal
      isOpen={open}
      onClose={preparation.close}
      title="Import Robot"
      icon={<FolderImportIcon className="w-4 h-4" />}
      maxWidth="max-w-[520px]"
      headerActions={
        <span hidden={!preparation.busy} aria-busy={preparation.busy}>
          <Spinner className="w-4 h-4 text-white/60" />
        </span>
      }
      action={{
        label: preparation.pending ? 'Continue' : 'Import',
        disabled: !ready || preparation.busy,
        onClick: submit,
      }}
      footerStart={
        !choice &&
        !preparation.pending &&
        !preparation.busy && (
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
      {!choice && (
        <TextInput
          autoFocus
          disabled={preparation.busy || !!preparation.pending}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Robot link"
          placeholder="e.g. github.com/unitreerobotics/unitree_ros"
        />
      )}
      {preparation.pending && (
        <p role="status" className="mt-[12px] text-[13px] text-white/60">
          {`Roboflow is preparing version ${preparation.pending.continuation.version}.`}
        </p>
      )}
      {preparation.pending?.progress !== undefined && (
        <ProgressBar className="mt-[12px]" share={preparation.pending.progress / 100} />
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

          onImport({ kind: 'files', files: pickedFiles(files), name: files[0].webkitRelativePath.split('/')[0] });
          onClose();
        }}
      />
    </Modal>
  );
};
