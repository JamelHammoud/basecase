import React from 'react';
import { BotIcon, Button, DownloadIcon } from '../../design-system';
import { DESKTOP_DOWNLOAD } from '../../utils/platform/webDemo';

export const DesktopDownload: React.FC = () => (
  <div className="h-full flex flex-col items-center justify-center gap-[16px] px-[24px] text-center">
    <span className="w-[44px] h-[44px] rounded-full bg-white/[0.06] flex items-center justify-center text-white/70">
      <BotIcon className="w-[22px] h-[22px]" />
    </span>
    <div className="flex flex-col gap-[6px] max-w-[260px]">
      <h2 className="text-[15px] font-semibold text-white/90">Use the agent in the desktop app</h2>
      <p className="text-[13px] leading-[1.45] text-white/60">
        It designs, checks and prices your robot with Claude Code, Codex or Gemini, signed in with your own account.
      </p>
    </div>
    <Button
      variant="primary"
      icon={<DownloadIcon className="w-4 h-4" />}
      onClick={() => window.open(DESKTOP_DOWNLOAD.url, '_blank', 'noopener')}
    >
      {DESKTOP_DOWNLOAD.label}
    </Button>
  </div>
);
