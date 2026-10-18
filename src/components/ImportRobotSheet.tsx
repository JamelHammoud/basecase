import React, { useRef, useState } from 'react';
import { FolderInput } from 'lucide-react';
import { Button, Modal, TextInput } from '../design-system';

/** Import Robot…: a URDF / MJCF link (GitHub file pages work) or a folder with the file and its meshes */
export const ImportRobotSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  onImport: (source: { kind: 'url'; url: string } | { kind: 'files'; files: File[] }) => void;
}> = ({ open, onClose, onImport }) => {
  const [url, setUrl] = useState('');
  const folderRef = useRef<HTMLInputElement | null>(null);
  const link = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  const valid = /^https?:\/\/[^\s/]+\.[^\s/]+\/\S+\.(urdf|xml|mjcf)(\?\S*)?$/i.test(link);
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Import Robot"
      icon={<FolderInput className="w-4 h-4" />}
      maxWidth="max-w-[520px]"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="secondary" size="sm" onClick={() => folderRef.current?.click()}>
            Choose Folder…
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!valid}
              onClick={() => {
                onImport({ kind: 'url', url: link });
                onClose();
              }}
            >
              Import
            </Button>
          </div>
        </div>
      }
    >
      <div className="px-5 pb-4 space-y-2">
        <label className="block text-[12.5px] font-medium text-white/60">Link to a URDF or MJCF file</label>
        <TextInput
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid) {
              onImport({ kind: 'url', url: link });
              onClose();
            }
          }}
          placeholder="e.g. github.com/…/g1_description/g1_29dof.urdf"
        />
        <p className="text-[12.5px] text-white/45">Meshes load from the same repository. For files on this Mac, choose the folder with the description and its meshes.</p>
      </div>
      <input
        ref={folderRef}
        type="file"
        className="hidden"
        // @ts-expect-error webkitdirectory is a non-standard folder picker
        webkitdirectory=""
        multiple
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (!files.length) return;
          onImport({ kind: 'files', files });
          onClose();
        }}
      />
    </Modal>
  );
};
