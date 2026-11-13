import type { PolicyRecord } from '../types/robotics';

export function walkPolicy(policies: PolicyRecord[]): PolicyRecord | undefined {
  const walks = policies.filter((p) => p.task === 'walk');

  return walks.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
