import React, { useState } from 'react';
import { useScrollFade } from '../design-system';
import type { MeshMeasure } from '../three/meshMeasure';
import type { PrintMaterial, ProjectSettings, ScenePart } from '../types/robotics';
import { type BomLine, buildBom, bomToCsv, bomToMarkdown } from '../utils/bom';
import type { EngineeringReport } from '../utils/engineering';
import type { PrintReport } from '../utils/printReport';
import { isBuilt } from '../guide/guidePlan';
import type { BuildGuide } from '../workspace/useBuildGuide';
import { BudgetSection } from './build/BudgetSection';
import { BuyList } from './build/BuyList';
import { CheckSheet } from './build/CheckSheet';
import { ChecksSection } from './build/ChecksSection';
import { ExtrasSection } from './build/ExtrasSection';
import { GuideSection } from './build/GuideSection';
import { download } from './build/format';
import { PrintedSection } from './build/PrintedSection';
import { useBuildReport } from './build/useBuildReport';
import { usePurchases } from './build/usePurchases';

interface BuildPanelProps {
  parts: ScenePart[];
  sceneName: string;
  project: ProjectSettings;
  onChangeProject: (patch: Partial<ProjectSettings>) => void;
  measure: (ids?: string[]) => Record<string, MeshMeasure>;
  getTriangles: (id: string) => Float32Array | null;
  onSelectParts: (ids: string[]) => void;
  onToast: (message: string) => void;
  onRunChecks: () => EngineeringReport;
  guide: BuildGuide;
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
  measure,
  getTriangles,
  onSelectParts,
  onToast,
  onRunChecks,
  guide,
}) => {
  const [purchases, savePurchase] = usePurchases();
  const { measures, print } = useBuildReport({ parts, project, measure, getTriangles });
  const [checking, setChecking] = useState<BomLine | null>(null);
  const { ref: setScroller, style: fadeStyle } = useScrollFade();
  const bom = buildBom({ parts, project, purchases, measures, supportG: supportByMaterial(print) });
  const file = fileStem(sceneName);

  const exportCsv = () => {
    const names = Object.fromEntries(parts.map((p) => [p.id, p.name]));

    download(`${file}-bom.csv`, bomToCsv(bom, names), 'text/csv');
    onToast('Exported BOM');
  };
  const exportMarkdown = () => {
    download(`${file}-bom.md`, bomToMarkdown(bom, sceneName), 'text/markdown');
    onToast('Exported BOM');
  };
  const savePrice = async (line: BomLine, record: Parameters<typeof savePurchase>[1]) => {
    await savePurchase(line.key, record);
    setChecking(null);
    onToast(record ? `Saved price for ${line.name}` : `Removed price for ${line.name}`);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div ref={setScroller} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <BudgetSection bom={bom} project={project} onChangeProject={onChangeProject} />
        <ChecksSection parts={parts} project={project} onRun={onRunChecks} onSelectParts={onSelectParts} />
        <GuideSection guide={guide} sceneName={sceneName} canGenerate={parts.some(isBuilt)} />
        <BuyList
          bom={bom}
          onCheck={setChecking}
          onSelectParts={onSelectParts}
          onExportCsv={exportCsv}
          onExportMarkdown={exportMarkdown}
        />
        <ExtrasSection project={project} onChangeProject={onChangeProject} />
        <PrintedSection
          report={print}
          project={project}
          onChangeProject={onChangeProject}
          onSelectParts={onSelectParts}
        />
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
