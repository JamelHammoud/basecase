import React, { useState } from 'react';

export const previewState = (src: string | undefined, failedSrc?: string) => {
  if (src === undefined) return 'loading';

  return src && src !== failedSrc ? 'image' : 'empty';
};

const ZOOM_ON_HOVER = 'transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)] group-hover:scale-[1.06]';

export const PreviewImage: React.FC<{
  src: string | undefined;
  className?: string;
  lazy?: boolean;
  zoom?: boolean;
  onError?: () => void;
}> = ({ src, className = '', lazy, zoom, onError }) => {
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
      className={`w-full h-full object-contain ${zoom ? ZOOM_ON_HOVER : ''} ${className}`}
    />
  );
};
