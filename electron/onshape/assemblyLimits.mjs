import { mateLimits } from './mates.mjs';
import { pathKey } from './occurrences.mjs';

const elementKey = (i) => JSON.stringify([i.documentId, i.documentMicroversion, i.elementId, i.configuration ?? '']);

export async function assemblyLimits(client, rootFeatures, assemblies) {
  const limits = mateLimits(rootFeatures);
  const fetched = new Map();

  for (const { instance, prefix } of assemblies) {
    const key = elementKey(instance);
    const { documentId, documentMicroversion, elementId } = instance;

    if (!fetched.has(key)) {
      const path = `/api/v10/assemblies/d/${documentId}/m/${documentMicroversion}/e/${elementId}/features`;
      const features = await client.json(path, { query: { configuration: instance.configuration ?? '' } });

      fetched.set(key, mateLimits(features));
    }

    for (const [id, range] of fetched.get(key)) limits.set(pathKey([...prefix, id]), range);
  }

  return limits;
}
