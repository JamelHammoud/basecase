import { useEffect, type ReactNode } from 'react';
import { Button, ErrorBoundary } from '../design-system';
import { finishBoot } from './boot';

const REGION = 'Basecase';

function WindowFallback() {
  useEffect(finishBoot, []);

  return (
    <div
      role="alert"
      data-testid="region-error"
      data-region={REGION}
      className="window-chrome w-full h-full flex flex-col items-center justify-center gap-[12px] text-center select-none"
    >
      <div className="text-[15px] font-semibold text-white/90">{REGION} stopped working</div>
      <Button size="md" variant="primary" onClick={() => window.location.reload()}>
        Reload Window
      </Button>
    </div>
  );
}

export function WindowBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary region={REGION} fallback={() => <WindowFallback />}>
      {children}
    </ErrorBoundary>
  );
}
