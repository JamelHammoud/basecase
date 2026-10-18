import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageViewerNav } from './ImageViewerNav';
import { ImageViewerZoomBar } from './ImageViewerZoomBar';
import { ImageView, useImagePan, useImageViewerKeys, useImageWheel } from './useImageViewerInput';

export interface ImageViewerItem {
  src: string;
  name?: string;
}

export interface ImageViewerProps {
  images: ImageViewerItem[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

const MAX_ZOOM = 8;
const PAD = 72;

type View = ImageView;

const stageCursor = (dragging: boolean, zoomed: boolean) => {
  if (dragging) return 'cursor-grabbing';

  return zoomed ? 'cursor-grab' : 'cursor-default';
};

export const ImageViewer: React.FC<ImageViewerProps> = ({ images, index, onIndexChange, onClose }) => {
  const isOpen = index !== null && images.length > 0;
  const current = isOpen ? images[Math.min(index!, images.length - 1)] : null;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState<{ src: string; w: number; h: number } | null>(null);
  const natural = loaded && loaded.src === current?.src ? loaded : null;
  const [fitS, setFitS] = useState(1);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);
  const { dragging, handlers: panHandlers } = useImagePan({ view, setView, setAnimate, onClose });

  const computeFit = (w: number, h: number) => {
    const el = stageRef.current;

    return el ? Math.min(1, (el.clientWidth - PAD * 2) / w, (el.clientHeight - PAD * 2) / h) : 1;
  };

  const fit = useCallback(
    (smooth = true) => {
      setAnimate(smooth);
      setView({ scale: fitS, x: 0, y: 0 });
    },
    [fitS],
  );

  useEffect(() => {
    if (!natural) return;

    const onResize = () => setFitS(computeFit(natural.w, natural.h));

    window.addEventListener('resize', onResize);

    return () => window.removeEventListener('resize', onResize);
  }, [natural]);

  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number, smooth = false) => {
      const el = stageRef.current;

      if (!el) return;

      const rect = el.getBoundingClientRect();
      const cx = (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2;
      const cy = (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2;

      setAnimate(smooth);
      setView((v) => {
        const s = Math.min(MAX_ZOOM, Math.max(fitS * 0.5, v.scale * factor));
        const k = s / v.scale;

        return { scale: s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
      });
    },
    [fitS],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!isOpen || images.length < 2) return;

      onIndexChange((index! + dir + images.length) % images.length);
    },
    [isOpen, images.length, index, onIndexChange],
  );

  useImageViewerKeys({ isOpen, onClose, step, zoomAt, fit });

  useImageWheel({ stageRef, isOpen, zoomAt, setAnimate, setView });

  if (!isOpen || !current) return null;

  const zoomed = view.scale > fitS + 0.001;
  const percent = Math.round(view.scale * 100);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.name || 'Image'}
      className="fixed inset-0 z-[95] bg-black/90 animate-fade-in select-none"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div
        ref={stageRef}
        className={`absolute inset-0 overflow-hidden ${stageCursor(dragging, zoomed)}`}
        {...panHandlers}
        onDoubleClick={(e) => {
          if (zoomed) fit();
          else zoomAt(Math.max(1, fitS * 2) / view.scale, e.clientX, e.clientY, true);
        }}
      >
        <img
          key={current.src}
          src={current.src}
          alt={current.name || ''}
          draggable={false}
          onLoad={(e) => {
            const w = e.currentTarget.naturalWidth;
            const h = e.currentTarget.naturalHeight;
            const f = computeFit(w, h);

            setLoaded({ src: current.src, w, h });
            setFitS(f);
            setAnimate(false);
            setView({ scale: f, x: 0, y: 0 });
          }}
          className={`absolute left-1/2 top-1/2 max-w-none rounded-md shadow-[0_24px_64px_rgba(0,0,0,0.5)] ${natural ? '' : 'opacity-0'}`}
          style={{
            width: natural?.w,
            height: natural?.h,
            transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transition: animate ? 'transform 180ms cubic-bezier(0.2, 0, 0, 1)' : 'none',
          }}
        />
      </div>

      <ImageViewerZoomBar
        percent={percent}
        onZoomOut={() => zoomAt(1 / 1.5, undefined, undefined, true)}
        onZoomIn={() => zoomAt(1.5, undefined, undefined, true)}
        onFit={() => fit()}
        onClose={onClose}
      />

      {images.length > 1 && (
        <ImageViewerNav images={images} index={index} onIndexChange={onIndexChange} onStep={step} />
      )}
    </div>,
    document.body,
  );
};
