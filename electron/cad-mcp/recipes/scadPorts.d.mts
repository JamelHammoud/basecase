export interface EchoedPort {
  name: string;
  pos: [number, number, number];
  axis: [number, number, number];
  kind: string;
  d?: number;
}

export function parsePorts(echoText: string): EchoedPort[];

export function scadPortsParallel(
  codes: string[],
  workers?: number,
): Promise<{ ports: EchoedPort[][]; logs: string[] }>;
