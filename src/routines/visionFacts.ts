import type { VisionResult } from '../vision/types';
import type { Plan, PlanOp, PlanWatcher } from './planTypes';
import type { FactValue } from './traceDecode';
import { findNode } from './nodes';
import { ROUTINE_VISION_MODELS, visionFact } from './vision';

export interface VisionReading extends FactValue {
  at: number;
}

export class RoutineVisionFacts {
  private readonly listeners = new Set<(at: number) => void>();
  private readonly latest = new Map<string, { result: VisionResult; at: number }>();

  private readonly plan: Plan;

  constructor(plan: Plan) {
    this.plan = plan;
  }

  accept(result: VisionResult, at: number) {
    const key = `${result.modelId}:${result.camera ?? ''}`;
    const previous = this.latest.get(key);

    if (previous && result.timestamp <= previous.result.timestamp) return false;

    this.latest.set(key, { result, at });

    for (const listener of this.listeners) listener(at);

    return true;
  }

  subscribe(listener: (at: number) => void): () => void {
    this.listeners.add(listener);

    for (const frame of this.latest.values()) listener(frame.at);

    return () => this.listeners.delete(listener);
  }

  handles(model: string): boolean {
    return findNode(model)?.inputs.includes('image') ?? false;
  }

  read(node: PlanWatcher | PlanOp, now: number): VisionReading | undefined {
    const model = node.model ?? '';
    const fact = this.plan.facts[node.fact ?? -1];

    if (!fact) return undefined;

    const frames = [...this.latest.values()].filter(
      (frame) =>
        frame.result.modelId === ROUTINE_VISION_MODELS[model] &&
        frame.at >= 0 &&
        frame.at <= now &&
        now - frame.at <= fact.maxAgeMs,
    );
    const readings = frames.flatMap((frame) => {
      try {
        return [{ ...visionFact(frame.result, { model, type: fact.type, label: node.label }), at: frame.at }];
      } catch {
        return [];
      }
    });

    if (!readings.length) return undefined;

    const positives = readings.filter((reading) => reading.num > 0);
    const selected = fact.type === 'boolean' && positives.length ? positives : readings;
    const value =
      model === 'obstacle-near'
        ? Math.max(...readings.map((reading) => reading.num))
        : readings.reduce((sum, reading) => sum + reading.num, 0);

    return {
      num: fact.type === 'boolean' ? Number(positives.length > 0) : value,
      name: null,
      at: Math.min(...selected.map((reading) => reading.at)),
    };
  }
}
