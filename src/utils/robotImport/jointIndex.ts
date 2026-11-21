export function indexJoints<T extends { id: string }>(joints: readonly T[]): Map<string, T> {
  const byId = new Map<string, T>();

  for (const joint of joints) {
    const id = joint.id;

    if (!byId.has(id)) byId.set(id, joint);
  }

  return byId;
}
