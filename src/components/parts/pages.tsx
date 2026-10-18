import React from 'react';
import { ArrowUpRight, FileText, Plus, ShoppingCart } from 'lucide-react';
import { CATEGORY_LABELS, catalogItemFromKey, catalogRef } from '../../data/catalog';
import { COMPONENT_BY_ID, ComponentInfo } from '../../data/components';
import { HardwareSpec, hardwareName, hardwareShopUrl, hardwareSubtitle } from '../../data/hardware';
import type { CatalogItem, PartDimensions } from '../../types/robotics';
import { Button, Section, Tooltip } from '../../design-system';
import { Hero, LinkButton, SizeLine, SpecRow } from '../PartDetails';
import { HardwareConfigurator, HardwareSpecs } from '../HardwareConfigurator';
import { keySpecs } from '../../utils/keySpecs';
import { hardwareItem, type View } from './partsViews';
import { ResultRow, dragProps } from './rows';

const PAGE_HERO = 'preview !rounded-[14px] mx-[12px] h-[184px]';

const PageTitle: React.FC<{ title: string; subtitle: string; description?: string }> = ({
  title,
  subtitle,
  description,
}) => (
  <div className="px-[12px] pt-4 pb-4">
    <h2 className="text-[17px] font-semibold text-white/95 leading-tight">{title}</h2>
    <div className="mt-1 text-[13px] text-white/50 truncate">{subtitle}</div>
    {description && <p className="mt-2.5 text-[13px] text-white/70 leading-relaxed">{description}</p>}
  </div>
);

const modelOrigin = (c: ComponentInfo): string => {
  if (c.model.source === 'manufacturer') return `From ${c.model.by}'s CAD files`;

  if (c.model.source === 'checked') return `By ${c.model.by}, checked against the ${c.model.checkedAgainst} drawing`;

  return `Modeled from the ${c.model.by} drawing`;
};

const modelSourceText = (c: ComponentInfo) => modelOrigin(c) + (c.model.license ? ` · ${c.model.license}` : '');

const DetailBlock: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="text-[13px] leading-relaxed">
    <div className="text-white/50">{label}</div>
    <div className="mt-0.5 text-white/80">{children}</div>
  </div>
);

const SizeSpecRow: React.FC<{ d: PartDimensions }> = ({ d }) => (
  <SpecRow label="Size">
    <SizeLine w={d.width} h={d.height} d={d.depth} />
  </SpecRow>
);

const ComponentSpecs: React.FC<{ c: ComponentInfo; d: PartDimensions }> = ({ c, d }) => (
  <>
    <Section title="Key specs">
      <dl className="-my-[5px]">
        {keySpecs(c, d).map((k) => (
          <SpecRow key={k.label} label={k.label}>
            {k.value}
          </SpecRow>
        ))}
      </dl>
    </Section>
    <Section title="All specs" collapsible defaultOpen={false}>
      <dl className="-my-[5px]">
        <SizeSpecRow d={d} />
        {c.specs.map(([label, value]) => (
          <SpecRow key={label} label={label}>
            {value}
          </SpecRow>
        ))}
      </dl>
    </Section>
  </>
);

const ComponentDetails: React.FC<{ c: ComponentInfo }> = ({ c }) => (
  <Section title="Details" collapsible defaultOpen={false}>
    <dl className="-my-[5px]">
      <SpecRow label="Part number">{c.mpn}</SpecRow>
    </dl>
    <DetailBlock label="Mounting">{c.mounting}</DetailBlock>
    <DetailBlock label="3D model">{modelSourceText(c)}</DetailBlock>
    {(c.links.datasheet || c.links.product) && (
      <div className="flex gap-1.5 pt-0.5">
        {c.links.datasheet && (
          <LinkButton href={c.links.datasheet} icon={<FileText className="w-3.5 h-3.5" />}>
            Datasheet
          </LinkButton>
        )}
        {c.links.product && (
          <LinkButton href={c.links.product} icon={<ArrowUpRight className="w-3.5 h-3.5" />}>
            Product Page
          </LinkButton>
        )}
      </div>
    )}
  </Section>
);

export const ItemPage: React.FC<{
  ref_: string;
  onAdd: (i: CatalogItem) => void;
  onOpen: (i: CatalogItem) => void;
}> = ({ ref_, onAdd, onOpen }) => {
  const item = catalogItemFromKey(ref_);

  if (!item) return null;

  const c = item.componentId ? COMPONENT_BY_ID[item.componentId] : undefined;
  const d = item.defaultDimensions;
  const pairs = (c?.pairsWith ?? []).map((r) => catalogItemFromKey(r)).filter((i): i is CatalogItem => !!i);

  return (
    <div className="pb-2">
      <Hero item={item} className={PAGE_HERO} {...dragProps(item)} />
      <PageTitle
        title={item.name}
        subtitle={c ? c.manufacturer : CATEGORY_LABELS[item.category].label}
        description={item.description}
      />
      <div className="border-t border-white/[0.06]">
        {c ? (
          <ComponentSpecs c={c} d={d} />
        ) : (
          <Section title="Specs">
            <dl className="-my-[5px]">
              <SizeSpecRow d={d} />
            </dl>
          </Section>
        )}
        {c && <ComponentDetails c={c} />}
        {pairs.length > 0 && (
          <Section title="Goes with">
            <div className="-mx-[6px] !mt-0">
              {pairs.map((p) => (
                <ResultRow key={catalogRef(p)} item={p} onOpen={() => onOpen(p)} onAdd={() => onAdd(p)} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
};

export const HardwarePage: React.FC<{ spec: HardwareSpec; onChange: (s: HardwareSpec) => void }> = ({
  spec,
  onChange,
}) => {
  const item = hardwareItem(spec);

  return (
    <div className="pb-4">
      <Hero item={item} className={PAGE_HERO} {...dragProps(item)} />
      <PageTitle title={hardwareName(spec)} subtitle={hardwareSubtitle(spec)} />
      <div className="border-t border-white/[0.06]">
        <HardwareConfigurator spec={spec} onChange={(s) => onChange(s)} />
        <HardwareSpecs spec={spec} />
      </div>
    </div>
  );
};

const AddBar: React.FC<{ label: string; onAdd: () => void; children?: React.ReactNode }> = ({
  label,
  onAdd,
  children,
}) => (
  <div className="shrink-0 px-[12px] py-3 border-t border-white/[0.06] flex items-center gap-2">
    <div className="min-w-0 flex-1 text-[13px] text-white/60 truncate">{label}</div>
    {children}
    <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={onAdd}>
      Add
    </Button>
  </div>
);

const ItemFooter: React.FC<{ ref_: string; onAdd: (i: CatalogItem) => void }> = ({ ref_, onAdd }) => {
  const item = catalogItemFromKey(ref_);

  if (!item) return null;

  const amazon = item.componentId ? COMPONENT_BY_ID[item.componentId]?.links.amazon : undefined;
  const label = amazon?.kind === 'product' ? 'Buy on Amazon' : 'Find on Amazon';

  return (
    <AddBar label={item.name} onAdd={() => onAdd(item)}>
      {amazon && (
        <Tooltip label={label}>
          <LinkButton href={amazon.url} icon={<ShoppingCart className="w-3.5 h-3.5" />} label={label} />
        </Tooltip>
      )}
    </AddBar>
  );
};

const HardwareFooter: React.FC<{ spec: HardwareSpec; onAdd: (i: CatalogItem) => void }> = ({ spec, onAdd }) => {
  const item = hardwareItem(spec);

  return (
    <AddBar label={hardwareName(spec)} onAdd={() => onAdd(item)}>
      <Tooltip label="Find on Amazon">
        <LinkButton
          href={hardwareShopUrl(spec)}
          icon={<ShoppingCart className="w-3.5 h-3.5" />}
          label="Find on Amazon"
        />
      </Tooltip>
    </AddBar>
  );
};

export const PageFooter: React.FC<{ view: View; onAdd: (i: CatalogItem) => void }> = ({ view, onAdd }) => {
  if (view.kind === 'item') return <ItemFooter ref_={view.ref} onAdd={onAdd} />;

  if (view.kind !== 'hardware') return null;

  return <HardwareFooter spec={view.spec} onAdd={onAdd} />;
};
