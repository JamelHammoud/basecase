import { useEffect, useRef } from 'react';
import type { TrainingFrame } from '../../vision/frameSet';

export default function LabelFrameImage({ frame }: { frame: TrainingFrame }) {
  const image = useRef<SVGImageElement>(null);
  const bytes = frame.jpeg;

  useEffect(() => {
    const node = image.current;
    const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: 'image/jpeg' }));

    node?.setAttribute('href', url);

    return () => {
      node?.removeAttribute('href');
      URL.revokeObjectURL(url);
    };
  }, [bytes]);

  return <image ref={image} width={frame.width} height={frame.height} />;
}
