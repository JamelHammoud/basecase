export function ownedPartsByJoint(owners: Map<string, string>): Map<string, string[]> {
  const parts = new Map<string, string[]>();

  for (const [part, owner] of owners) {
    const members = parts.get(owner) ?? [];

    members.push(part);
    parts.set(owner, members);
  }

  return parts;
}
