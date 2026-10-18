import React from 'react';
import { ChevronDown, ChevronLeft, Search, X } from 'lucide-react';
import { Kbd } from './Kbd';
import { Tooltip } from './Tooltip';

const fieldBase =
  'w-full rounded-lg bg-white/[0.05] hover:bg-white/[0.07] text-[13px] text-white/90 outline-none ring-1 ring-inset ring-transparent focus:ring-[#0d99ff] focus:bg-black/20 transition-colors';

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  /** Renders as plain text until hovered/focused (inline rename) */
  bare?: boolean;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ icon, bare = false, className = '', ...props }, ref) => (
    <div className="relative flex items-center w-full">
      {icon && (
        <span className="absolute left-2.5 text-white/40 pointer-events-none flex">{icon}</span>
      )}
      <input
        ref={ref}
        type="text"
        spellCheck={false}
        className={`${
          bare
            ? 'w-full rounded-md bg-transparent hover:bg-white/[0.05] text-white/90 outline-none ring-1 ring-inset ring-transparent focus:ring-[#0d99ff] focus:bg-black/20 transition-colors'
            : fieldBase
        } h-8 ${icon ? 'pl-8' : 'pl-2.5'} pr-2 ${className}`}
        {...props}
      />
    </div>
  )
);
TextInput.displayName = 'TextInput';

export interface SearchFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> {
  value: string;
  onChange: (value: string) => void;
  /** Shortcut hint shown on the right while the field is empty and unfocused */
  shortcut?: string;
  /** Inside a drilled-in view: a back button takes the glass icon's place */
  onBack?: () => void;
  className?: string;
}

/**
 * The search field at the top of a sidebar view: 40px, 14px text, a 16px glass icon,
 * a key-cap hint while idle and a round clear button once there's a query. With `onBack`
 * the icon becomes Back, so a drilled-in view needs no header row of its own.
 */
export const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(
  ({ value, onChange, shortcut, onBack, className = '', ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const setRef = (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    };
    return (
      <div
        className={`group relative flex items-center h-[40px] rounded-[10px] bg-white/[0.06] hover:bg-white/[0.08] has-[input:focus]:bg-black/25 has-[input:focus]:hover:bg-black/25 ring-1 ring-inset ring-transparent has-[input:focus]:ring-[#0d99ff] has-[input:focus]:shadow-[0_0_0_3px_rgba(13,153,255,0.16)] transition-[background-color,box-shadow] duration-150 ${className}`}
        onMouseDown={(e) => {
          // Clicking the padding or icon focuses the input (Back doesn't)
          if (e.target !== inputRef.current && !(e.target as HTMLElement).closest('[data-search-back]')) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        {onBack ? (
          <Tooltip label="Back" shortcut="Esc">
            <button
              type="button"
              data-search-back
              aria-label="Back"
              // Keep focus where it was, so a click doesn't flash the field's focus ring
              onMouseDown={(e) => e.preventDefault()}
              onClick={onBack}
              className="ml-[6px] w-[28px] h-[28px] shrink-0 rounded-[8px] flex items-center justify-center text-white/60 hover:text-white/90 hover:bg-white/[0.08] active:scale-95 cursor-default transition-[background-color,color,transform] duration-150 animate-pop-in"
            >
              <ChevronLeft className="w-[18px] h-[18px]" strokeWidth={2} />
            </button>
          </Tooltip>
        ) : (
          <Search
            className="ml-[12px] w-[16px] h-[16px] shrink-0 text-white/40 group-has-[input:focus]:text-white/70 transition-colors duration-150 pointer-events-none"
            strokeWidth={2}
          />
        )}
        <input
          ref={setRef}
          type="text"
          spellCheck={false}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`flex-1 min-w-0 h-full bg-transparent ${onBack ? 'pl-[2px]' : 'pl-[8px]'} pr-[8px] text-[14px] text-white/90 placeholder:text-white/35 outline-none focus-visible:outline-none`}
          {...props}
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
            className="mr-[11px] w-[18px] h-[18px] shrink-0 rounded-full bg-white/25 hover:bg-white/40 text-[#1f1f1f] flex items-center justify-center cursor-default transition-colors duration-150 active:scale-95"
          >
            <X className="w-2.5 h-2.5" strokeWidth={3.25} />
          </button>
        ) : (
          shortcut && (
            <Kbd className="mr-[11px] shrink-0 pointer-events-none transition-opacity duration-150 group-has-[input:focus]:opacity-0">
              {shortcut}
            </Kbd>
          )
        )}
      </div>
    );
  }
);
SearchField.displayName = 'SearchField';

export type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className = '', ...props }, ref) => (
    <textarea
      ref={ref}
      spellCheck={false}
      className={`${fieldBase} px-2.5 py-2 leading-relaxed resize-none ${className}`}
      {...props}
    />
  )
);
TextArea.displayName = 'TextArea';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<{ value: string; label: string }>;
}

export const Select: React.FC<SelectProps> = ({ options, className = '', ...props }) => (
  <div className="relative w-full">
    <select
      className={`${fieldBase} h-8 pl-2.5 pr-8 appearance-none cursor-default ${className}`}
      {...props}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-[#1e1e22] text-white">
          {o.label}
        </option>
      ))}
    </select>
    <ChevronDown className="w-3.5 h-3.5 text-white/40 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
  </div>
);
