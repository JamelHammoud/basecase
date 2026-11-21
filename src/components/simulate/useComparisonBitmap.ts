import { useEffect, useRef, useState } from 'react';
import type { ComparisonConsumer } from '../../cases/comparison/comparisonClient';
import { errorMessage } from '../../utils/errorMessage';

interface BitmapMetadata {
  at: number | null;
  bytes: number;
  frame?: string;
  span?: number;
  missing?: string | null;
  clipped?: boolean;
}

interface BitmapOptions {
  consumer: ComparisonConsumer;
  operation: 'image' | 'spatial';
  topic: string;
  time: number;
  maxAge: number;
}

export function useComparisonBitmap({ consumer, operation, topic, time, maxAge }: BitmapOptions) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [shown, setShown] = useState<{ key: string; metadata: BitmapMetadata; error: string | null } | null>(null);
  const key = JSON.stringify([operation, topic, time, maxAge]);

  useEffect(() => {
    const node = canvas.current;

    return () => {
      if (node) {
        node.width = 0;
        node.height = 0;
      }
    };
  }, []);
  useEffect(() => {
    const node = canvas.current;
    const context = node?.getContext('bitmaprenderer');

    if (!topic || !node || !context) return;

    let current = true;
    const request =
      operation === 'image'
        ? consumer.call('image', { camera: topic, time, rule: { kind: 'previous', maxAge } })
        : consumer.call('spatial', { topic, time });

    void request
      .then(({ bitmap, ...metadata }) => {
        if (!current) return bitmap?.close();

        if (bitmap && (node.width !== bitmap.width || node.height !== bitmap.height)) {
          node.width = bitmap.width;
          node.height = bitmap.height;
        }

        context.transferFromImageBitmap(bitmap);
        node.dataset.retainedBytes = String(metadata.bytes);
        setShown({ key, metadata, error: null });
      })
      .catch((error: unknown) => {
        if (current) setShown({ key, metadata: { at: null, bytes: 0 }, error: errorMessage(error) });
      });

    return () => {
      current = false;
      context.transferFromImageBitmap(null);
      node.dataset.retainedBytes = '0';
    };
  }, [consumer, operation, topic, time, maxAge, key]);

  return { canvas, shown: shown?.key === key ? shown : null };
}
