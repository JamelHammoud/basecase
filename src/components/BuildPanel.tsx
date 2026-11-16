import React, { useState } from 'react';
import { useScrollFade } from '../design-system';
import type { PrintMaterial, ProjectSettings, PurchaseRecord, ScenePart } from '../types/robotics';
import { onHandOf, withOnHand, withPrice } from '../utils/onHand';
import type { ShowToast } from '../workspace/types';
import { type BomLine, buildBom, bomToCsv, bomToMarkdown } from '../utils/bom';
import { useMoney } from '../utils/useMoney';
import type { PrintReport } from '../utils/printReport';
import type { Printing } from '../workspace/usePrinting';
import { isBuilt } from '../guide/guidePlan';
import type { BuildGuide } from '../workspace/useBuildGuide';
import { BuyList } from './build/BuyList';
import { onHandAmount } from './build/buyLine';
import { CheckSheet } from './build/CheckSheet';
import { ChecksSection } from './build/ChecksSection';
import { GuideSection } from './build/GuideSection';
import { download } from './build/format';
import { PlatesSection } from './build/PlatesSection';
import type { ReadinessFinding } from '../readiness/types';
import { ignoreFinding, ignoreRule, restoreFinding, restoreRule } from '../readiness/readiness';
import type { ReadinessHandle } from '../workspace/useReadiness';
import { usePurchases } from './build/usePurchases';
import { sceneTether } from '../utils/powerSources';
import { currentWiring } from '../readiness/currentWiring';
import type { RefObject } from 'react';
import type { Viewport3DHandle } from './Viewport3D';
import { useBomWiring } from './build/useBomWiring';

interface BuildPanelProps {
  parts: ScenePart[];
  sceneName: string;
  project: ProjectSettings;
  onChangeProject: (patch: Partial<ProjectSettings>) => void;
  printing: Printing;
  onSelectParts: (ids: string[]) => void;
  onToast: ShowToast;
  onFixFinding?: (finding: ReadinessFinding) => void;
  onQuoteFinding?: (finding: ReadinessFinding) => void;
  onOpenCase?: (id: string) => void;
  onNewCase?: () => void;
  onCalibrate?: (jointIds: string[]) => void;
  onReplayFall?: (deg: number) => void;
  panScroll: boolean;
  guide: BuildGuide;
  readiness: ReadinessHandle;
  viewportRef: RefObject<Viewport3DHandle | null>;
}

function supportByMaterial(print: PrintReport | null) {
  const out: Partial<Record<PrintMaterial, number>> = {};

  for (const r of print?.parts ?? []) out[r.material] = (out[r.material] ?? 0) + r.supportG;

  return out;
}

const fileStem = (sceneName: string) => sceneName.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'robot';

export const BuildPanel: React.FC<BuildPanelProps> = ({
  parts,
  sceneName,
  project,
  onChangeProject,
  printing,
  onSelectParts,
  onToast,
  onFixFinding,
  onQuoteFinding,
  onOpenCase,
  onNewCase,
  onCalibrate,
  onReplayFall,
  panScroll,
  guide,
  readiness,
  viewportRef,
}) => {
  const [purchases, savePurchase] = usePurchases();
  const { measures, report: print } = printing;
  const [checking, setChecking] = useState<BomLine | null>(null);
  const { ref: setScroller, style: fadeStyle } = useScrollFade();
  const measuredWiring = useBomWiring({ parts, project }, viewportRef, onToast);
  const wiring = measuredWiring ?? currentWiring(readiness);
  const bom = buildBom({ parts, project, purchases, measures, supportG: supportByMaterial(print), wiring });
  const file = fileStem(sceneName);
  const money = useMoney();
  const tether = sceneTether({ parts, project });

  const exportCsv = () => {
    const names = Object.fromEntries(parts.map((p) => [p.id, p.name]));

    download(`${file}-bom.csv`, bomToCsv(bom, names, money), 'text/csv');
  };
  const exportMarkdown = () => {
    download(`${file}-bom.md`, bomToMarkdown(bom, sceneName, money), 'text/markdown');
  };
  const savePrice = async (line: BomLine, record: PurchaseRecord | null) => {
    await savePurchase(line.key, withPrice(purchases[line.key], record));
    setChecking(null);
  };
  const saveOnHand = async (line: BomLine, count: number) => {
    const before = purchases[line.key];

    await savePurchase(line.key, withOnHand(before, count));
    onToast(`Saved ${onHandAmount(count, line.unit)} for ${line.name}`, {
      action: { label: 'Undo', onClick: () => void savePurchase(line.key, before ?? null) },
    });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div ref={setScroller} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <ChecksSection
          readiness={readiness.current}
          checking={readiness.checking}
          context={{
            focusedCheck: project.assignment?.inspection?.check,
            parts,
            panScroll,
            actions: {
              onFix: onFixFinding,
              onApplyFix: {
                'print-face': ({ fix }) =>
                  fix?.kind === 'print-face' &&
                  printing.setPartPrint([fix.part], { down: fix.down, at: undefined, turned: undefined }),
                ...(onNewCase && { 'new-case': onNewCase }),
                ...(onCalibrate && {
                  calibrate: ({ fix, ids }: ReadinessFinding) => {
                    onSelectParts(ids);

                    if (fix?.kind === 'calibrate') onCalibrate(fix.joints);
                  },
                }),
                ...(onReplayFall && {
                  'replay-fall': ({ fix, ids }: ReadinessFinding) => {
                    onSelectParts(ids);

                    if (fix?.kind === 'replay-fall') onReplayFall(fix.deg);
                  },
                }),
              },
              onQuote: onQuoteFinding,
              onIgnore: (finding) => onChangeProject({ readiness: ignoreFinding(project.readiness, finding) }),
              onIgnoreRule: (finding) => onChangeProject({ readiness: ignoreRule(project.readiness, finding) }),
              onSelectParts,
            },
            tether: tether && { tether, onChange: (next) => onChangeProject({ tether: next }) },
            onOpenCase,
            showDots: readiness.showDots,
          }}
          restore={{
            onRestore: (finding) => onChangeProject({ readiness: restoreFinding(project.readiness, finding) }),
            onRestoreRule: (rule) => onChangeProject({ readiness: restoreRule(project.readiness, rule) }),
          }}
        />
        <BuyList
          bom={bom}
          measuring={!wiring}
          parts={parts}
          panScroll={panScroll}
          project={project}
          onChangeProject={onChangeProject}
          onCheck={setChecking}
          onHandOf={(key) => onHandOf(purchases[key])}
          onOnHand={saveOnHand}
          onSelectParts={onSelectParts}
          onExportCsv={exportCsv}
          onExportMarkdown={exportMarkdown}
        />
        <GuideSection guide={guide} sceneName={sceneName} canGenerate={parts.some(isBuilt)} />
        <PlatesSection printing={printing} />
      </div>
      {checking && (
        <CheckSheet
          line={checking}
          onClose={() => setChecking(null)}
          onSave={(record) => savePrice(checking, record)}
        />
      )}
    </div>
  );
};
