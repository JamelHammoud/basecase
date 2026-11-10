export interface ColorSwatchProps {
  name: string;
  fill: string;
  active?: boolean;
  expanded?: boolean;
  onClick: () => void;
}

export function ColorSwatch({ name, fill, active = false, expanded, onClick }: ColorSwatchProps) {
  return (
    <button
      type="button"
      aria-label={name}
      aria-pressed={active}
      aria-expanded={expanded}
      onClick={onClick}
      className="w-[28px] h-[28px] shrink-0 flex items-center justify-center rounded-full cursor-default"
    >
      <span
        className={`w-[18px] h-[18px] rounded-full transition-[box-shadow,transform] duration-150 active:scale-95 ${
          active
            ? 'shadow-[0_0_0_2px_#262626,0_0_0_4px_rgba(255,255,255,0.9)]'
            : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)] hover:scale-110'
        }`}
        style={{ background: fill }}
      />
    </button>
  );
}
