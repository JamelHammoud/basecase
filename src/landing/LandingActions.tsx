import React from 'react';
import type { GlyphIcon } from '../design-system/glyph';
import { ArrowUpRightIcon, DownloadIcon } from '../design-system/glyphs/controls';
import { WebIcon } from '../design-system/toolIcons';
import { IS_WINDOWS } from '../utils/os';
import { DESKTOP_DOWNLOAD, GITHUB_URL, MAC_DOWNLOAD, WINDOWS_DOWNLOAD } from '../utils/platform/webDemo';
import { LandingLink } from './LandingLink';
import { hasSmallWindow } from './showsLanding';

interface Action {
  href: string;
  label: string;
  Icon: GlyphIcon;
  external?: boolean;
}

const download = ({ url, label }: { url: string; label: string }): Action => ({
  href: url,
  label,
  Icon: DownloadIcon,
});

const GITHUB: Action = { href: GITHUB_URL, label: 'View on GitHub', Icon: ArrowUpRightIcon, external: true };

function actionsFor(browserApp: string | undefined): Action[] {
  if (browserApp && !hasSmallWindow()) {
    return [{ href: browserApp, label: 'Open in Browser', Icon: WebIcon }, download(DESKTOP_DOWNLOAD), GITHUB];
  }

  const downloads = IS_WINDOWS ? [WINDOWS_DOWNLOAD, MAC_DOWNLOAD] : [MAC_DOWNLOAD, WINDOWS_DOWNLOAD];

  return [...downloads.map(download), GITHUB];
}

export const LandingActions: React.FC<{ browserApp?: string }> = ({ browserApp }) => (
  <section className="mt-[36px] sm:mt-[48px] px-[24px] w-full max-w-[480px] mx-auto flex flex-col gap-[10px]">
    {actionsFor(browserApp).map(({ href, label, Icon, external }, index) => (
      <LandingLink
        key={href}
        href={href}
        external={external}
        variant={index === 0 ? 'primary' : 'secondary'}
        icon={<Icon className="w-[18px] h-[18px]" />}
      >
        {label}
      </LandingLink>
    ))}
  </section>
);
