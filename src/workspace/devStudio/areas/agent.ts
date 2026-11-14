import { limitExplore } from '../../useCaseExplore';
import type { Studio } from '../types';

type Payload = Record<string, unknown>;

export default function agentStudio(studio: Studio) {
  return {
    agentRequest: (kind: string, payload: Payload) => studio().agent.requests.request(kind, payload),
    exploreLimit: (designs: number) => limitExplore(designs),
  };
}
