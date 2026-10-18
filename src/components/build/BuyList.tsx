import React, { useRef, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { IconButton, MenuItem, PopoverMenu, Section } from '../../design-system';
import type { Bom, BomCategory, BomLine } from '../../utils/bom';
import { BuyRow } from './BuyRow';
import { plural } from './format';
import { Notice } from './Notice';

interface BuyListProps {
  bom: Bom;
  onCheck: (line: BomLine) => void;
  onSelectParts: (ids: string[]) => void;
  onExportCsv: () => void;
  onExportMarkdown: () => void;
}

const CATEGORIES: BomCategory[] = ['Components', 'Hardware', 'Supplies', 'Filament'];

const ExportBomMenu: React.FC<Pick<BuyListProps, 'onExportCsv' | 'onExportMarkdown'>> = ({
  onExportCsv,
  onExportMarkdown,
}) => {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  return (
    <div className="relative" ref={ref}>
      <IconButton
        icon={<FileSpreadsheet className="w-4 h-4" />}
        title="Export BOM"
        size="xs"
        onClick={() => setMenu((v) => !v)}
      />
      <PopoverMenu
        isOpen={menu}
        onClose={() => setMenu(false)}
        ignoreRef={ref}
        position="bottom"
        align="end"
        className="w-48"
      >
        <MenuItem label="CSV Spreadsheet" onSelect={() => (setMenu(false), onExportCsv())} />
        <MenuItem label="Markdown" onSelect={() => (setMenu(false), onExportMarkdown())} />
      </PopoverMenu>
    </div>
  );
};

const SourceNotices: React.FC<Pick<BuyListProps, 'bom' | 'onSelectParts'>> = ({ bom, onSelectParts }) => {
  const standIns = bom.standIns.length;
  const elsewhere = bom.madeElsewhere.length;
  const processes = [...new Set(bom.madeElsewhere.map((m) => m.process))].join(', ');

  return (
    <>
      {standIns > 0 && (
        <Notice
          tone="amber"
          text={`Replace ${standIns} ${plural(standIns, 'stand-in', 'stand-ins')} with real parts`}
          onClick={() => onSelectParts(bom.standIns.map((s) => s.id))}
        />
      )}
      {elsewhere > 0 && (
        <Notice
          tone="default"
          text={`Find a source for ${elsewhere} ${plural(elsewhere, 'part', 'parts')} (${processes})`}
          onClick={() => onSelectParts(bom.madeElsewhere.map((s) => s.id))}
        />
      )}
    </>
  );
};

export const BuyList: React.FC<BuyListProps> = ({ bom, onCheck, onSelectParts, onExportCsv, onExportMarkdown }) => {
  const groups = CATEGORIES.map((c) => [c, bom.lines.filter((l) => l.category === c)] as const).filter(
    ([, ls]) => ls.length,
  );

  return (
    <Section
      title="Parts to buy"
      actions={
        bom.lines.length > 0 && <ExportBomMenu onExportCsv={onExportCsv} onExportMarkdown={onExportMarkdown} />
      }
    >
      {!groups.length && <span className="text-[13px] text-white/45">No parts</span>}
      {groups.map(([cat, ls]) => (
        <div key={cat}>
          <div className="text-[12px] font-medium text-white/40 mb-1">{cat}</div>
          <ul className="-mx-[7px]">
            {ls.map((l) => (
              <BuyRow
                key={l.key}
                line={l}
                onCheck={() => onCheck(l)}
                onSelect={() => l.partIds.length && onSelectParts(l.partIds)}
              />
            ))}
          </ul>
        </div>
      ))}
      <SourceNotices bom={bom} onSelectParts={onSelectParts} />
    </Section>
  );
};
