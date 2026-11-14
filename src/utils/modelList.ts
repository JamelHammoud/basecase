import type { CustomModelDefinition } from '../types/robotics';

export const newestModelFirst = (a: CustomModelDefinition, b: CustomModelDefinition) =>
  (b.createdAt || '').localeCompare(a.createdAt || '');

export const withModel = (models: CustomModelDefinition[], model: CustomModelDefinition) =>
  [model, ...models.filter((m) => m.id !== model.id)].sort(newestModelFirst);

export const withoutModel = (models: CustomModelDefinition[], id: string) => models.filter((m) => m.id !== id);
