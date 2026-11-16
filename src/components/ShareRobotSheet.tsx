import { useState } from 'react';
import { Modal, ShareIcon, TextInput } from '../design-system';
import type { LeagueEntryControl } from '../workspace/useLeagueEntry';

export function ShareRobotSheet({ league, link }: { league: LeagueEntryControl; link: string | null }) {
  const [url, setUrl] = useState('');
  const sharedLink = league.receipt ?? link;

  return (
    <Modal
      isOpen={league.open}
      onClose={league.close}
      title="Share Robot"
      icon={<ShareIcon className="w-4 h-4" />}
      maxWidth="max-w-[520px]"
      action={{
        label: 'Enter League',
        disabled: !url.trim() || league.entering,
        onClick: () => league.enter(url.trim()),
      }}
    >
      {sharedLink && (
        <p className="text-[13px] text-white/60 break-all mb-4" data-user-content>
          {sharedLink}
        </p>
      )}
      <TextInput
        autoFocus
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        aria-label="League link"
        placeholder="e.g. app.basecase.so/l/rover-sprint"
      />
      {league.problem && (
        <p role="alert" className="text-[13px] text-red-400 mt-3">
          {league.problem}
        </p>
      )}
    </Modal>
  );
}
