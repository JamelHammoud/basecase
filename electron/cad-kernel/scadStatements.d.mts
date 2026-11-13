export interface ScadSpan {
  start: number;
  end: number;
}

export function skipBlank(code: string, from: number): number;
export function scadStatementSpans(code: string): ScadSpan[];
export function scadStatements(code: string): string[];
export function isScadDefinition(statement: string): boolean;
