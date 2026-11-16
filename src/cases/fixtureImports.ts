import { parseCase, type Case } from './schema';

export function validateFixtureImports(cases: readonly Case[] | undefined) {
  for (const kase of cases ?? []) {
    const objects = kase?.world?.objects;

    if (objects?.some((object) => object?.joint !== undefined || object?.parent !== undefined)) parseCase(kase);
  }
}
