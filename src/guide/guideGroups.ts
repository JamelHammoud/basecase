export function appendGroup<T>(groups: Map<string, T[]>, key: string, value: T): void {
  const members = groups.get(key);

  if (members) {
    members.push(value);

    return;
  }

  groups.set(key, [value]);
}
