import React from 'react';

interface ColorSuggestionsProps {
  colors: string[];
  current: string;
  onPick: (hex: string) => void;
}

export const ColorSuggestions: React.FC<ColorSuggestionsProps> = ({ colors, current, onPick }) => (
  <div>
    <div className="text-[12px] text-white/40 mb-1.5">In this scene</div>
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Use ${c}`}
          onClick={() => onPick(c)}
          className={`w-5 h-5 rounded-[5px] ring-1 ring-inset ring-white/20 cursor-default transition-transform hover:scale-110 ${
            c === current.toLowerCase() ? 'outline-2 outline-offset-1 outline-[#0d99ff]' : ''
          }`}
          style={{ background: c }}
        />
      ))}
    </div>
  </div>
);
