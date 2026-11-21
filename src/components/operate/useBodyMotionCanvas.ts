import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { bodyMotionRenderer } from '../../reality/bodyMotionRenderer';
import { errorMessage } from '../../utils/errorMessage';
import type { BodyMotionPreview } from '../../reality/bodyMotionTypes';

export function useBodyMotionCanvas(preview: BodyMotionPreview, frame: number) {
  const currentFrame = useEffectEvent(() => frame);
  const [problem, setProblem] = useState('');
  const [rendered, setRendered] = useState<number | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const renderer = useRef<ReturnType<typeof bodyMotionRenderer> | null>(null);

  useEffect(() => {
    const session = bodyMotionRenderer({
      preview,
      draw: (index, bitmap) => {
        const target = canvas.current;

        if (!target) {
          bitmap.close();

          return;
        }

        if (target.width !== bitmap.width || target.height !== bitmap.height) {
          target.width = bitmap.width;
          target.height = bitmap.height;
        }

        const context = target.getContext('bitmaprenderer');

        if (!context) {
          bitmap.close();

          throw new Error('Can’t tell.');
        }

        context.transferFromImageBitmap(bitmap);
        setRendered(index);
      },
      failed: (error) => setProblem(errorMessage(error)),
    });

    renderer.current = session;
    session.seek(currentFrame());

    return () => {
      session.dispose();
      renderer.current = null;
    };
  }, [preview]);

  useEffect(() => {
    renderer.current?.seek(frame);
  }, [frame]);

  return { canvas, problem, rendered };
}
