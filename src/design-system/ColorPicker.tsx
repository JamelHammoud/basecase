import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pipette } from 'lucide-react';
import { IconButton } from './IconButton';

export interface ColorFieldProps {
  value: string;
  /** `live` is true while dragging so callers can skip undo history until release */
  onChange: (hex: string, live?: boolean) => void;
  /** Colors already used nearby (e.g. in the scene) for one-click reuse */
  suggestions?: string[];
  /** Shows "Mixed" when a multi-selection has different colors */
  mixed?: boolean;
  className?: string;
}

/**
 * Figma-style color field: swatch + hex. Click opens a picker with a
 * saturation/brightness square, hue strip, hex input and eyedropper.
 */
export const ColorField: React.FC<ColorFieldProps> = ({
  value,
  onChange,
  suggestions = [],
  mixed = false,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);

  const commitHex = (raw: string) => {
    const hex = normalizeHex(raw);
    if (hex) onChange(hex);
    setDraft(null);
  };

  return (
    <div
      ref={setAnchorEl}
      className={`group flex items-center h-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.07] ring-1 ring-inset ring-transparent focus-within:ring-[#0d99ff] transition-colors ${className}`}
    >
      <button
        type="button"
        aria-label="Open color picker"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 shrink-0 flex items-center justify-center cursor-default"
      >
        <span
          className="w-[18px] h-[18px] rounded-[5px] ring-1 ring-inset ring-white/20"
          style={{
            background: mixed
              ? 'conic-gradient(#f87171, #fbbf24, #34d399, #60a5fa, #a78bfa, #f87171)'
              : value,
          }}
        />
      </button>
      <input
        value={draft ?? (mixed ? 'Mixed' : value.replace('#', '').toUpperCase())}
        spellCheck={false}
        aria-label="Hex color"
        onFocus={(e) => {
          setDraft(mixed ? '' : value.replace('#', '').toUpperCase());
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== null && commitHex(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={`flex-1 min-w-0 h-full bg-transparent pr-2 text-[13px] text-white/90 tabular outline-none ${mixed && draft === null ? 'text-white/50' : 'uppercase'}`}
      />
      {open && anchorEl && (
        <PickerPopover
          anchor={anchorEl}
          value={mixed ? '#ffffff' : value}
          onChange={onChange}
          suggestions={suggestions}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */

const PICKER_WIDTH = 248;

const PickerPopover: React.FC<{
  anchor: HTMLElement;
  value: string;
  onChange: (hex: string, live?: boolean) => void;
  suggestions: string[];
  onClose: () => void;
}> = ({ anchor, value, onChange, suggestions, onClose }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const hex = hsvToHex(hsv);

  // Keep in sync when the value changes from outside (e.g. undo)
  const lastEmitted = useRef(value);
  useEffect(() => {
    if (value.toLowerCase() !== lastEmitted.current.toLowerCase()) {
      lastEmitted.current = value;
      setHsv(hexToHsv(value));
    }
  }, [value]);

  // Open beside the inspector (to the left of the field), clamped to the window
  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect();
    const h = ref.current?.offsetHeight ?? 320;
    let left = a.left - PICKER_WIDTH - 12;
    if (left < 8) left = Math.min(window.innerWidth - PICKER_WIDTH - 8, a.right + 12);
    const top = Math.max(8, Math.min(window.innerHeight - h - 8, a.top - 8));
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [anchor, onClose]);

  const emit = (next: typeof hsv, live: boolean) => {
    setHsv(next);
    const out = hsvToHex(next);
    lastEmitted.current = out;
    onChange(out, live);
  };

  const dragArea = (
    e: React.PointerEvent<HTMLDivElement>,
    apply: (fx: number, fy: number, live: boolean) => void
  ) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const at = (ev: { clientX: number; clientY: number }, live: boolean) =>
      apply(
        clamp01((ev.clientX - rect.left) / rect.width),
        clamp01((ev.clientY - rect.top) / rect.height),
        live
      );
    at(e, true);
    const move = (ev: PointerEvent) => at(ev, true);
    const up = (ev: PointerEvent) => {
      at(ev, false);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const canEyedrop = typeof window !== 'undefined' && 'EyeDropper' in window;
  const uniqueSuggestions = Array.from(new Set(suggestions.map((c) => c.toLowerCase()))).slice(0, 10);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Color picker"
      className="glass-menu fixed z-[97] rounded-2xl p-3 space-y-3 animate-pop-in"
      style={
        {
          width: PICKER_WIDTH,
          left: pos?.left ?? -9999,
          top: pos?.top ?? -9999,
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties
      }
    >
      {/* Saturation × brightness */}
      <div
        className="relative h-40 rounded-xl cursor-crosshair touch-none overflow-hidden ring-1 ring-inset ring-white/10"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
        }}
        onPointerDown={(e) => dragArea(e, (fx, fy, live) => emit({ ...hsv, s: fx, v: 1 - fy }, live))}
      >
        <span
          className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full ring-2 ring-white shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_2px_6px_rgba(0,0,0,0.4)] pointer-events-none"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }}
        />
      </div>

      {/* Hue */}
      <div
        className="relative h-3 rounded-full cursor-pointer touch-none ring-1 ring-inset ring-white/10"
        style={{
          background:
            'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
        }}
        onPointerDown={(e) => dragArea(e, (fx, _fy, live) => emit({ ...hsv, h: fx * 360 }, live))}
      >
        <span
          className="absolute top-1/2 w-4 h-4 -ml-2 -mt-2 rounded-full ring-2 ring-white shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_2px_6px_rgba(0,0,0,0.4)] pointer-events-none"
          style={{ left: `${(hsv.h / 360) * 100}%`, background: hueColor }}
        />
      </div>

      <div className="flex items-center gap-1.5">
        {canEyedrop && (
          <IconButton
            icon={<Pipette className="w-4 h-4" />}
            title="Pick color from screen"
            tooltipSide="top"
            onClick={async () => {
              try {
                const dropper = new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper();
                const res = await dropper.open();
                const h = normalizeHex(res.sRGBHex);
                if (h) emit(hexToHsv(h), false);
              } catch {
                /* cancelled */
              }
            }}
          />
        )}
        <HexInput value={hex} onCommit={(h) => emit(hexToHsv(h), false)} />
      </div>

      {uniqueSuggestions.length > 0 && (
        <div>
          <div className="text-[12px] text-white/40 mb-1.5">In this scene</div>
          <div className="flex flex-wrap gap-1.5">
            {uniqueSuggestions.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use ${c}`}
                onClick={() => emit(hexToHsv(c), false)}
                className={`w-5 h-5 rounded-[5px] ring-1 ring-inset ring-white/20 cursor-default transition-transform hover:scale-110 ${
                  c === hex.toLowerCase() ? 'outline-2 outline-offset-1 outline-[#0d99ff]' : ''
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};

const HexInput: React.FC<{ value: string; onCommit: (hex: string) => void }> = ({ value, onCommit }) => {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="flex-1 flex items-center h-8 rounded-lg bg-white/[0.06] ring-1 ring-inset ring-transparent focus-within:ring-[#0d99ff]">
      <span className="pl-2.5 text-[13px] text-white/35">#</span>
      <input
        value={draft ?? value.replace('#', '').toUpperCase()}
        spellCheck={false}
        aria-label="Hex"
        onFocus={(e) => {
          setDraft(value.replace('#', '').toUpperCase());
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const h = draft !== null ? normalizeHex(draft) : null;
          if (h) onCommit(h);
          setDraft(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="flex-1 min-w-0 h-full bg-transparent px-1 text-[13px] text-white/90 tabular uppercase outline-none"
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Color math                                                          */
/* ------------------------------------------------------------------ */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function normalizeHex(raw: string): string | null {
  let h = raw.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toLowerCase()}` : null;
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const n = normalizeHex(hex) ?? '#ffffff';
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: { h: number; s: number; v: number }): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}
