export interface GradeCheck {
  name: string;
  pass: boolean | null;
  detail: string;
  adapter?: string;
}

export interface Grade {
  status: 'pass' | 'fail' | 'unavailable' | 'error';
  checks: GradeCheck[];
  needs?: string[];
  detail?: string;
}

export function gradeTask(task: unknown, context: Record<string, unknown>): Promise<Grade>;

export function gradeLine(task: unknown, grade: Grade): string;
