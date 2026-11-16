export function checkedFleetOrigin(value: string): string;
export class StudioPublisher {
  constructor(options: { origin: string; org: string; token: string; units: Record<string, string> });
  active: Map<string, Promise<void>>;
  publish(event: Record<string, unknown>): Promise<void>;
  dispose(): void;
}
