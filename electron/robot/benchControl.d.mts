import type { ConnectReply, RobotControl, RobotEvent } from '../../src/robot/robotState';

export const UNDOCUMENTED: { ok: false; message: string };

export class BenchControl {
  constructor(options: { session: Record<string, unknown>; emit: (event: RobotEvent) => void; clock: () => number });
  held: boolean;
  paused: boolean;
  snapshot(): RobotControl;
  command(ask: Record<string, unknown>): ConnectReply | { command: Record<string, unknown> };
  revoke(stop?: boolean, completion?: string): void;
  flushCompletion(override?: string): void;
}
