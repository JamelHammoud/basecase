import React from 'react';
import { ChevronRightIcon } from '../../design-system/glyphs';

const LINK_CLASS = 'text-[14px] text-white/50 transition-colors duration-150 hover:text-white/90';

export const HelpBreadcrumb: React.FC<{ collection?: { title: string; href: string } }> = ({ collection }) => (
  <nav aria-label="Breadcrumb" className="mb-[14px]">
    <ol className="list-none m-0 p-0 flex items-center gap-[6px]">
      <li>
        <a href="/help" className={LINK_CLASS}>
          Help
        </a>
      </li>
      {collection && (
        <li className="flex items-center gap-[6px]">
          <ChevronRightIcon className="w-[14px] h-[14px] text-white/25" />
          <a href={collection.href} className={LINK_CLASS}>
            {collection.title}
          </a>
        </li>
      )}
    </ol>
  </nav>
);
