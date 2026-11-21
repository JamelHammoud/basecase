import type { SimEngine } from './engine';
import type { SimRequest } from './simMessages';

export function liveGrab(engine: SimEngine | null, msg: Extract<SimRequest, { type: 'grab' }>) {
  if (msg.phase === 'start') engine?.grabStart(msg.body, msg.point);
  else if (msg.phase === 'move') engine?.grabMove(msg.point, msg.turn);
  else engine?.grabEnd();
}
