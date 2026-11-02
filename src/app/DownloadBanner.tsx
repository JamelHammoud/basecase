import { useState, type ReactNode } from 'react';
import { Button, CloseIcon, DownloadIcon, IconButton, LAYOUT } from '../design-system';
import { DESKTOP_DOWNLOAD, IS_WEB_DEMO } from '../utils/platform/webDemo';
import { readStored, writeStored } from './storedSettings';

const DISMISSED_KEY = 'download-banner-dismissed';
const BANNER_HEIGHT = 40;

function DownloadBannerFrame({ children }: { children: ReactNode }) {
  const [shown] = useState(() => readStored(DISMISSED_KEY) !== true);
  const [dismissed, setDismissed] = useState(!shown);

  const dismiss = () => {
    setDismissed(true);
    writeStored(DISMISSED_KEY, true);
  };

  return (
    <div className={`relative w-full h-full overflow-hidden ${shown ? 'bg-[#0d99ff]' : ''}`}>
      {shown && (
        <div
          className={`absolute inset-x-0 top-0 flex items-center justify-center gap-[12px] px-[48px] transition-opacity duration-150 ${dismissed ? 'opacity-0' : ''}`}
          style={{ height: BANNER_HEIGHT }}
          inert={dismissed}
          aria-hidden={dismissed}
        >
          <span className="text-[13px] font-medium text-white truncate">Build with the agent in the desktop app</span>
          <Button
            variant="contrast"
            size="xs"
            icon={<DownloadIcon className="w-[14px] h-[14px]" />}
            onClick={() => window.open(DESKTOP_DOWNLOAD.url, '_blank', 'noopener')}
          >
            {DESKTOP_DOWNLOAD.label}
          </Button>
          <div className="absolute top-[6px]" style={{ right: LAYOUT.sheetInset }}>
            <IconButton
              title="Close"
              size="xs"
              icon={<CloseIcon className="w-[14px] h-[14px] text-white" />}
              onClick={dismiss}
            />
          </div>
        </div>
      )}
      <div
        className="absolute inset-x-0 bottom-0 overflow-hidden transition-[top,border-radius] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
        style={{
          top: dismissed ? 0 : BANNER_HEIGHT,
          borderTopLeftRadius: dismissed ? 0 : LAYOUT.cardRadius,
          borderTopRightRadius: dismissed ? 0 : LAYOUT.cardRadius,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function DownloadBanner({ children }: { children: ReactNode }) {
  if (!IS_WEB_DEMO) return children;

  return <DownloadBannerFrame>{children}</DownloadBannerFrame>;
}
