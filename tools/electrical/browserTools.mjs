import { createVitest } from 'vitest/node';

export async function selectedBrowserTools(shard) {
  const context = await createVitest({ config: 'vitest.e2e.config.ts', watch: false, shard });

  try {
    const specifications = await context.getRelevantTestSpecifications();
    const sequencer = new context.config.sequence.sequencer(context);
    const selected = await sequencer.shard(specifications);
    const files = selected.map(({ moduleId }) => moduleId.replaceAll('\\', '/').split('/').at(-1));

    return {
      native: files.some((file) =>
        ['boardRouted.e2e.test.ts', 'boardRouting.e2e.test.ts', 'kitElectrical.e2e.test.ts'].includes(file),
      ),
      routing: files.includes('boardRouting.e2e.test.ts'),
    };
  } finally {
    await context.close();
  }
}
