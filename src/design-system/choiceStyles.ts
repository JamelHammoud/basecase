export const choiceCellClass = (selected: boolean) =>
  `rounded-[8px] font-medium tabular cursor-default transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${
    selected
      ? 'bg-white/[0.12] text-white shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)]'
      : 'text-white/55 hover:text-white/85 hover:bg-white/[0.04]'
  }`;

export const CHOICE_TRACK = 'rounded-[10px] bg-white/[0.05] p-[2px] gap-[2px]';
