import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { exposesTestHooks } from '../utils/platform/testHooks';
import { Button } from './Button';
import { CrashProbe } from './crashProbe';
import { Modal } from './Modal';

export interface ErrorBoundaryProps {
  region: string;
  children: ReactNode;
  className?: string;
  resetKey?: unknown;
  onClose?: () => void;
  fallback?: () => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  attempt: number;
  resetKey: unknown;
}

export const REGION_FILL = 'flex-1 min-h-0 flex-col';

const stoppedWorking = (region: string) => `${region} stopped working`;

const markers = (region: string) => ({ role: 'alert', 'data-testid': 'region-error', 'data-region': region });

function RegionFallback({ region, className, onRetry }: { region: string; className: string; onRetry: () => void }) {
  return (
    <div
      {...markers(region)}
      className={`flex items-center justify-center gap-[12px] px-[12px] text-center select-none ${className}`}
    >
      <div className="text-[14px] font-medium text-white/90">{stoppedWorking(region)}</div>
      <Button size="sm" onClick={onRetry}>
        Reload
      </Button>
    </div>
  );
}

function SheetFallback({ region, onClose, onRetry }: { region: string; onClose: () => void; onRetry: () => void }) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={stoppedWorking(region)}
      maxWidth="max-w-sm"
      action={{ label: 'Reload', onClick: onRetry, autoFocus: true }}
    >
      <div {...markers(region)} />
    </Modal>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, attempt: 0, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState) {
    if (Object.is(props.resetKey, state.resetKey)) return null;

    return { error: null, resetKey: props.resetKey };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(stoppedWorking(this.props.region), error, info.componentStack ?? '');
  }

  retry = () => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));

  render() {
    const { region, children, className = REGION_FILL, onClose, fallback } = this.props;

    if (this.state.error && fallback) return fallback();

    if (this.state.error && onClose) return <SheetFallback region={region} onClose={onClose} onRetry={this.retry} />;

    if (this.state.error) return <RegionFallback region={region} className={className} onRetry={this.retry} />;

    return (
      <Fragment key={this.state.attempt}>
        {exposesTestHooks() && <CrashProbe region={region} />}
        {children}
      </Fragment>
    );
  }
}
