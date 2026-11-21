export function checkedHistoryHash(value: unknown): string;
export function splitSceneHistory(history: string): { blocks: [string, string][]; manifest: string };
export function historyManifest(json: string): { contentKeys: string[]; contentSizes: number[]; [key: string]: unknown };
export function assembleSceneHistory(manifest: { contentKeys: string[]; contentSizes: number[]; [key: string]: unknown }, blocks: [string, string][]): string;
