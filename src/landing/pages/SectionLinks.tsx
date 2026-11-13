import React from 'react';
import type { ContentKind, Section } from './sections';

export const SectionLinks: React.FC<{ sections: Section[]; current?: ContentKind }> = ({ sections, current }) => (
  <ul className="list-none m-0 p-0 flex items-center gap-[20px]">
    {sections.map(({ kind, label, path }) => (
      <li key={kind}>
        <a
          href={path}
          aria-current={kind === current ? 'page' : undefined}
          className="text-[15px] font-medium no-underline text-white/60 transition-colors duration-150 hover:text-white/90 aria-[current=page]:text-white/90"
        >
          {label}
        </a>
      </li>
    ))}
  </ul>
);
