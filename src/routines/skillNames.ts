const words = (id: string) => id.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');

export const skillLabel = (skill: string) => words(skill).replace(/\b\w/g, (c) => c.toUpperCase());

export const skillId = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
