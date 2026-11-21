import type { ArmSetup } from './drive';
import type { Controller } from './engine';
import type { LiveCaseInput } from '../cases/liveCase';
import type { ActionOwner } from './teaching';
import type { SimRequest, SimResponse } from './sim.worker';

export type TeachingReply = Extract<SimResponse, { type: 'teaching' }>;
export interface TeachingStart {
  controller: Extract<Controller, { kind: 'policy' }>;
  setup: ArmSetup;
  skill: string;
  input: LiveCaseInput;
}

type TeachingRequest = ({ phase: 'start' } & TeachingStart) | { phase: 'handoff'; owner: ActionOwner };

export class TeachingLink {
  private next = 0;
  private endings = new Set<(id: number) => void>();
  private waiting = new Map<number, (reply: TeachingReply) => void>();

  private send: ((message: SimRequest) => void) | null = null;

  connect(send: (message: SimRequest) => void) {
    this.send = send;
  }

  start = (input: TeachingStart) => this.request({ phase: 'start', ...input });
  handoff = (owner: ActionOwner) => this.request({ phase: 'handoff', owner });

  reply = (reply: TeachingReply) => {
    this.waiting.get(reply.id)?.(reply);
    this.waiting.delete(reply.id);
  };

  subscribeEnd = (listener: (id: number) => void) => {
    this.endings.add(listener);

    return () => {
      this.endings.delete(listener);
    };
  };

  completed = (id: number) => this.endings.forEach((listener) => listener(id));

  cancel = () => {
    this.waiting.forEach((resolve, id) => resolve({ type: 'teaching', id, owner: null, startedAt: 0, problem: null }));
    this.waiting.clear();
  };

  private request(input: TeachingRequest) {
    const id = ++this.next;

    if (!this.send)
      return Promise.resolve<TeachingReply>({ type: 'teaching', id, owner: null, startedAt: 0, problem: null });

    return new Promise<TeachingReply>((resolve) => {
      this.waiting.set(id, resolve);
      this.send?.({ type: 'teaching', id, ...input });
    });
  }
}
