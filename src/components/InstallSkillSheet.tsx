import React, { useState } from 'react';
import { DownloadIcon, Modal, TextInput } from '../design-system';
import { hubLink } from '../utils/robotImport/hub';

const withScheme = (text: string) => (/^https?:\/\//i.test(text) ? text : `https://${text}`);

export const InstallSkillSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  onInstall: (link: string) => void;
}> = ({ open, onClose, onInstall }) => {
  const [url, setUrl] = useState('');
  const link = withScheme(url.trim());
  const ready = hubLink(link)?.kind === 'models';

  const submit = () => {
    if (!ready) return;

    onInstall(link);
    setUrl('');
    onClose();
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Install Skill"
      icon={<DownloadIcon className="w-4 h-4" />}
      maxWidth="max-w-[520px]"
      action={{ label: 'Install', disabled: !ready, onClick: submit }}
    >
      <TextInput
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        aria-label="Skill link"
        placeholder="e.g. huggingface.co/you/quad-stand"
      />
    </Modal>
  );
};
