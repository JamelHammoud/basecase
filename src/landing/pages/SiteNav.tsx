import React from 'react';
import { BasecaseLogo } from '../../design-system/BasecaseLogo';
import { SECTIONS, type ContentKind } from './siteContent';

export const SiteNav: React.FC<{ current: ContentKind }> = ({ current }) => (
  <nav className="flex items-center justify-between gap-[20px]">
    <a href="/" className="flex items-center rounded-[8px]" aria-label="Basecase">
      <BasecaseLogo className="w-[32px] h-[32px] text-white/90" />
    </a>
    <ul className="list-none m-0 p-0 flex items-center gap-[20px]">
      {SECTIONS.map(({ kind, label, path }) => (
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
  </nav>
);
