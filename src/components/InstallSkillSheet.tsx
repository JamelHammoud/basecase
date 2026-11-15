import React, { useState } from 'react';
import { Button, DownloadIcon, Modal, Spinner, TextInput } from '../design-system';
import type { RankedSkill } from '../skills/skillRank';
import { hubLink } from '../utils/robotImport/hub';

const withScheme = (text: string) => (/^https?:\/\//i.test(text) ? text : `https://${text}`);

export const InstallSkillSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  onInstall: (link: string) => void;
  candidates: RankedSkill[];
  finding: boolean;
}> = ({ open, onClose, onInstall, candidates, finding }) => {
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
        aria-label="Skill link"
        placeholder="e.g. huggingface.co/you/quad-stand"
      />
      {finding && <Spinner className="w-4 h-4 mt-4" />}
      <ul className="flex flex-col mt-3">
        {candidates.map((candidate) => (
          <li
            key={candidate.repo}
            data-testid="published-skill"
            data-repo={candidate.repo}
            className="flex items-center gap-3 py-3"
          >
            <div className="flex-1 min-w-0" data-user-content>
              <div className="text-[13px] text-white/90">{candidate.name}</div>
              <div className="text-[12px] text-white/50 break-words">{candidate.repo}</div>
              {!candidate.fit.ok && <div className="text-[12px] text-white/60">{candidate.fit.problem}</div>}
            </div>
            <Button
              variant="secondary"
              size="sm"
              title="Install"
              disabled={!candidate.fit.ok}
              onClick={() => {
                onInstall(`https://huggingface.co/${candidate.repo}/tree/${candidate.revision}`);
                onClose();
              }}
            >
              Install
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  );
};
