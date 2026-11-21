import { useLayoutEffect, useRef, useState } from 'react';
import { editAppearance, type Appearance } from '../../appearance/model';
import { importTexture } from '../../appearance/textures';
import { sceneTextureAssets } from '../../cases/worldAssets';
import type { ScenePart } from '../../types/robotics';
import { sameTextureRequest, type TextureImportRequest as Request } from './textureImportRequest';
import { errorMessage } from '../../utils/errorMessage';

export function useTextureImport({ parts, sceneParts, baselineParts }: Request) {
  const [pending, setPending] = useState<Request | null>(null);
  const [failure, setFailure] = useState<{ parts: ScenePart[]; message: string } | null>(null);
  const generation = useRef({ value: 0, source: null as Request | null });
  const request = { parts, sceneParts, baselineParts };

  useLayoutEffect(() => {
    if (sameTextureRequest(generation.current.source, request)) return;

    generation.current.value++;
    generation.current.source = request;
  });

  useLayoutEffect(() => {
    const token = generation.current;

    return () => {
      token.value++;
    };
  }, []);

  const load = async (slot: keyof NonNullable<Appearance['textures']>, file: File, apply: (hash: string) => void) => {
    const ticket = ++generation.current.value;

    setPending({ parts, sceneParts, baselineParts });
    setFailure(null);

    try {
      const hash = await importTexture(
        file,
        () => generation.current.value === ticket,
        ({ hash, asset }) => {
          const selected = new Set(parts.map((part) => part.id));
          const changed = sceneParts.map((part) =>
            selected.has(part.id)
              ? { ...part, appearance: editAppearance(part, { textures: { [slot]: hash } }) }
              : part,
          );

          sceneTextureAssets([...changed, ...(baselineParts ?? [])], { [hash]: asset });
        },
      );

      if (!hash || generation.current.value !== ticket) return;

      apply(hash);
    } catch (error) {
      if (generation.current.value === ticket) setFailure({ parts, message: errorMessage(error) });
    } finally {
      if (generation.current.value === ticket) setPending(null);
    }
  };

  return {
    loading: sameTextureRequest(pending, request),
    error: failure && sameTextureRequest({ ...request, parts: failure.parts }, request) ? failure.message : '',
    load,
    cancel: () => {
      generation.current.value++;
      setPending(null);
    },
  };
}
