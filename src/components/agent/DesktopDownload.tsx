import React from 'react';
import { BotIcon, Button, DownloadIcon, EmptyState } from '../../design-system';
import { DESKTOP_AGENT_LINE, DESKTOP_DOWNLOAD } from '../../utils/platform/webDemo';
import { openLink } from '../../utils/openLink';

export const DesktopDownload: React.FC = () => (
  <EmptyState
    className="h-full justify-center"
    icon={<BotIcon className="w-5 h-5" />}
    title={DESKTOP_AGENT_LINE}
    action={
      <Button
        variant="primary"
        size="sm"
        icon={<DownloadIcon className="w-4 h-4" />}
        onClick={() => openLink(DESKTOP_DOWNLOAD.url)}
      >
        {DESKTOP_DOWNLOAD.label}
      </Button>
    }
  />
);
