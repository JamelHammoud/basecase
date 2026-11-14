import type { Components } from 'react-markdown';
import type { ArticleType } from './helpArticle';
import { remarkHelp } from './remarkHelp';

export const HELP_PLUGINS = [remarkHelp];

const STEP_TYPES = new Set<ArticleType>(['task', 'troubleshooting']);

const CALLOUTS: Record<string, { label: string; className: string; labelClass: string }> = {
  note: { label: 'Note', className: 'bg-white/[0.04]', labelClass: 'text-white/90' },
  warning: { label: 'Warning', className: 'bg-amber-500/10', labelClass: 'text-amber-400' },
};

const LIST_CLASS = 'mt-[14px] pl-[22px] list-decimal flex flex-col gap-[8px] marker:text-white/50';
const STEPS_CLASS = 'help-steps mt-[18px] flex flex-col gap-[14px]';

const calloutOf = (props: object) => CALLOUTS[(props as Record<string, string>)['data-callout']] ?? CALLOUTS.note;

const sharedComponents: Components = {
  h2: ({ id, children }) => (
    <h2 id={id} className="mt-[40px] scroll-mt-[24px] text-[20px] leading-[1.3] font-semibold text-white/90">
      {children}
    </h2>
  ),
  aside: ({ children, ...props }) => {
    const callout = calloutOf(props);

    return (
      <aside className={`mt-[18px] px-[16px] py-[14px] rounded-[12px] text-[15px] leading-[1.55] ${callout.className}`}>
        <p className={`text-[13px] font-semibold ${callout.labelClass}`}>{callout.label}</p>
        <div className="mt-[4px] text-white/60 [&>p:first-child]:mt-0">{children}</div>
      </aside>
    );
  },
  span: ({ children, ...props }) => (
    <span
      data-keys={(props as Record<string, string>)['data-keys']}
      className="inline-flex items-center gap-[3px] align-[1px]"
    >
      {children}
    </span>
  ),
  kbd: ({ children }) => (
    <kbd className="min-w-[22px] h-[22px] px-[6px] inline-flex items-center justify-center rounded-[6px] bg-white/[0.1] font-sans text-[13px] font-medium leading-none text-white/90">
      {children}
    </kbd>
  ),
  table: ({ children }) => (
    <div className="mt-[18px] overflow-x-auto">
      <table className="w-full border-collapse text-[14px] leading-[1.5]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="py-[8px] pr-[16px] text-left text-[13px] font-semibold text-white/90 border-b border-white/[0.06]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="py-[8px] pr-[16px] align-top text-white/60 border-b border-white/[0.06]">{children}</td>
  ),
};

const stepsList: Components['ol'] = ({ start, children }) => (
  <ol className={STEPS_CLASS} style={start && start > 1 ? { counterReset: `help-step ${start - 1}` } : undefined}>
    {children}
  </ol>
);

const plainList: Components['ol'] = ({ start, children }) => (
  <ol className={LIST_CLASS} start={start}>
    {children}
  </ol>
);

export const helpComponents = (type: ArticleType): Components => ({
  ...sharedComponents,
  ol: STEP_TYPES.has(type) ? stepsList : plainList,
});
