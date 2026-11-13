import React, { useState } from 'react';

export const previewState = (src: string | undefined, failedSrc?: string) => {
  if (src === undefined) return 'loading';

  return src && src !== failedSrc ? 'image' : 'empty';
};

export const PreviewImage: React.FC<{
  src: string | undefined;
  className?: string;
  lazy?: boolean;
  onError?: () => void;
}> = ({ src, className = '', lazy, onError }) => {
  const [failedSrc, setFailedSrc] = useState<string>();
  const state = previewState(src, failedSrc);

  if (state === 'loading') return <span className="block w-full h-full shimmer" />;

  if (state === 'empty') return null;

  return (
    <img
      src={src}
      alt=""
      loading={lazy ? 'lazy' : undefined}
      draggable={false}
      onError={() => {
        setFailedSrc(src);
        onError?.();
      }}
      className={`w-full h-full object-contain ${className}`}
    />
  );
};
