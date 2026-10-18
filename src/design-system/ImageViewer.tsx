import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Maximize, Minus, Plus, X } from 'lucide-react';
import { IconButton } from './IconButton';
import { IslandDivider } from './FloatingIsland';

export interface ImageViewerItem {
  src: string;
  name?: string;
}

export interface ImageViewerProps {
  images: ImageViewerItem[];
  /** Index to show; null closes the viewer */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

const MAX_ZOOM = 8;
const PAD = 72;

interface View {
  scale: number;
  x: number;
  y: number;
}

/**
 * Full-window image viewer. Pinch or ⌘-scroll zooms at the pointer, two-finger scroll and drag
 * pan, double-click toggles fit and 100%, ← → step through several images.
 */
export const ImageViewer: React.FC<ImageViewerProps> = ({ images, index, onIndexChange, onClose }) => {
  const isOpen = index !== null && images.length > 0;
  const current = isOpen ? images[Math.min(index!, images.length - 1)] : null;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState<{ src: string; w: number; h: number } | null>(null);
  const natural = loaded && loaded.src === current?.src ? loaded : null;
  const [fitS, setFitS] = useState(1);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);
  const dragRef = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean; onBackdrop: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  const computeFit = (w: number, h: number) => {
    const el = stageRef.current;
    return el ? Math.min(1, (el.clientWidth - PAD * 2) / w, (el.clientHeight - PAD * 2) / h) : 1;
  };

  const fit = useCallback(
    (smooth = true) => {
      setAnimate(smooth);
      setView({ scale: fitS, x: 0, y: 0 });
    },
    [fitS]
  );

  // Keep "fit" in step with the window
  useEffect(() => {
    if (!natural) return;
    const onResize = () => setFitS(computeFit(natural.w, natural.h));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [natural]);

  // Point (client coords) stays put while the scale changes
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
    [fitS]
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!isOpen || images.length < 2) return;
      onIndexChange((index! + dir + images.length) % images.length);
    },
    [isOpen, images.length, index, onIndexChange]
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === '=' || e.key === '+') zoomAt(1.5, undefined, undefined, true);
      else if (e.key === '-') zoomAt(1 / 1.5, undefined, undefined, true);
      else if (e.key === '0') fit();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, onClose, step, zoomAt, fit]);

  // Wheel needs a non-passive listener so pinch doesn't zoom the whole page
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !isOpen) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
      } else {
        setAnimate(false);
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isOpen, zoomAt]);

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
        className={`absolute inset-0 overflow-hidden ${dragging ? 'cursor-grabbing' : zoomed ? 'cursor-grab' : 'cursor-default'}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          // Pointer capture retargets later events to the stage, so note what was pressed now
          dragRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, onBackdrop: e.target === e.currentTarget };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.hypot(dx, dy) < 3) return;
          d.moved = true;
          setDragging(true);
          setAnimate(false);
          setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
        }}
        onPointerUp={() => {
          const d = dragRef.current;
          dragRef.current = null;
          setDragging(false);
          // A plain click on the backdrop closes
          if (d && !d.moved && d.onBackdrop) onClose();
        }}
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

      {/* Top bar */}
      <div className="absolute top-3 left-3 right-3 flex items-start justify-end gap-3 pointer-events-none">
        <div className="glass rounded-[16px] h-10 px-1 flex items-center gap-0.5 pointer-events-auto">
          <IconButton
            icon={<Minus className="w-4 h-4" />}
            title="Zoom out"
            shortcut="−"
            size="sm"
            tooltipSide="bottom"
            onClick={() => zoomAt(1 / 1.5, undefined, undefined, true)}
          />
          <button
            type="button"
            onClick={() => fit()}
            className="h-8 min-w-14 px-1.5 rounded-lg text-[13px] text-white/80 tabular hover:bg-white/[0.07] cursor-default"
            aria-label="Zoom to fit"
          >
            {percent}%
          </button>
          <IconButton
            icon={<Plus className="w-4 h-4" />}
            title="Zoom in"
            shortcut="+"
            size="sm"
            tooltipSide="bottom"
            onClick={() => zoomAt(1.5, undefined, undefined, true)}
          />
          <IconButton
            icon={<Maximize className="w-4 h-4" />}
            title="Zoom to fit"
            shortcut="0"
            size="sm"
            tooltipSide="bottom"
            onClick={() => fit()}
          />
          <IslandDivider />
          <IconButton icon={<X className="w-4 h-4" />} title="Close" shortcut="Esc" size="sm" tooltipSide="bottom" onClick={onClose} />
        </div>
      </div>

      {images.length > 1 && (
        <>
          <div className="absolute left-3 top-1/2 -translate-y-1/2 glass rounded-full p-1">
            <IconButton
              icon={<ChevronLeft className="w-5 h-5" />}
              title="Previous"
              shortcut="←"
              size="md"
              tooltipSide="right"
              className="rounded-full"
              onClick={() => step(-1)}
            />
          </div>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 glass rounded-full p-1">
            <IconButton
              icon={<ChevronRight className="w-5 h-5" />}
              title="Next"
              shortcut="→"
              size="md"
              tooltipSide="left"
              className="rounded-full"
              onClick={() => step(1)}
            />
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[calc(100%-32px)] glass rounded-[16px] p-1.5 flex gap-1.5 overflow-x-auto no-scrollbar">
            {images.map((img, i) => (
              <button
                key={i}
                type="button"
                aria-label={img.name || `Image ${i + 1}`}
                onClick={() => onIndexChange(i)}
                className={`w-11 h-11 shrink-0 rounded-[9px] overflow-hidden cursor-default transition-[opacity,box-shadow] duration-150 ${
                  i === index ? 'ring-2 ring-[#0d99ff]' : 'opacity-55 hover:opacity-100'
                }`}
              >
                <img src={img.src} alt="" draggable={false} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>,
    document.body
  );
};
