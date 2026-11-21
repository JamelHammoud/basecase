import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import type { FrozenKit } from './frozenKit';

export function frozenOutputSelection(kit: FrozenKit, ids: string[]) {
  const printed = kit.manifest.printed.filter((part) => ids.includes(part.id));

  return {
    printed,
    outputs: Object.fromEntries(
      printed.flatMap((part) => part.outputs.map((output) => [output.file, kit.outputs[`plates/${output.file}`]])),
    ),
  };
}

export function frozenPartOutput({ printed, outputs: retained }: ReturnType<typeof frozenOutputSelection>) {
  const outputs = printed.flatMap((part) => part.outputs);
  const files = Object.fromEntries(outputs.map((output) => [output.file, Uint8Array.from(retained[output.file])]));
  const names = Object.keys(files);

  if (!names.length) return null;

  if (names.length === 1) return { name: names[0], bytes: files[names[0]], type: 'model/3mf' };

  return { name: 'replacement-plates.zip', bytes: zipSync(files), type: 'application/zip' };
}
