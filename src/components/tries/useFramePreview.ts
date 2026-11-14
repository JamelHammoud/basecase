import { useEffect, useState, type RefObject } from 'react';
import type { VisionFrame } from '../../vision/frameSet';
import { loadFrame } from '../../vision/frameSetStore';

interface Preview {
  id: string;
  frame: VisionFrame | null;
  url: string;
}

export function useFramePreview(id: string, ref: RefObject<Element | null>) {
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    let revision = 0;
    let url = '';

    const clear = () => {
      revision++;
      URL.revokeObjectURL(url);
      url = '';
    };
    const show = async (visible: boolean) => {
      clear();

      if (!visible) {
        setPreview(null);

        return;
      }

      const current = revision;
      const frame = await loadFrame(id);

      if (current !== revision) return;

      url = frame ? URL.createObjectURL(new Blob([frame.image as BlobPart], { type: 'image/jpeg' })) : '';
      setPreview({ id, frame, url });
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => void show(entries.some((entry) => entry.isIntersecting)), {
            rootMargin: '400px',
          });

    if (observer && ref.current) observer.observe(ref.current);
    else void show(true);

    return () => {
      observer?.disconnect();
      clear();
    };
  }, [id, ref]);

  return preview?.id === id ? preview : null;
}
