interface SceneRecord {
  name: string;
  parts: unknown[];
  project: Record<string, unknown>;
}

export interface CaseCodeTask {
  id: string;
  title: string;
  instruction: string;
  heldOut: boolean;
  startScene: () => Promise<SceneRecord>;
  solutionScene: () => Promise<SceneRecord>;
}

export const CASE_CODE_TASKS: CaseCodeTask[];
